/**
 * Fuente única de verdad sobre qué integraciones externas están realmente
 * configuradas en el entorno actual.
 *
 * POR QUÉ EXISTE: varios subsistemas reportaban éxito sin haber actuado cuando
 * faltaba la credencial (p. ej. `sendEmail()` devolvía `ok: true` con id
 * "dev-logged"). El resultado era una bitácora que decía "enviado", un dedupe
 * que bloqueaba el reintento para siempre y cero errores en los logs. Este
 * módulo centraliza la pregunta "¿esto está encendido?" para que ningún
 * camino de código pueda simular éxito.
 *
 * SÓLO SERVIDOR: lee variables de entorno de forma dinámica, por lo que las
 * `NEXT_PUBLIC_*` no se inlinean en el bundle del cliente. No importar desde
 * componentes cliente.
 */

import { logger } from "@/lib/logger"

export type IntegrationId =
  | "email"
  | "whatsapp"
  | "push"
  | "stripe_connect"
  | "uber_direct"
  | "spei"
  | "oxxo"
  | "ai"

export interface IntegrationStatus {
  id: IntegrationId
  /** Nombre legible para el panel admin. */
  label: string
  /** Variables de entorno que la integración necesita. */
  requires: string[]
  /** `true` sólo si TODAS las variables requeridas están presentes. */
  configured: boolean
  /** Variables requeridas ausentes (vacío cuando está configurada). */
  missing: string[]
  /** Lo que el producto promete y no puede cumplir mientras falte. */
  impact: string
}

/** Lectura dinámica: en el servidor `process.env` siempre es real. */
function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() !== "" ? value : undefined
}

/**
 * `STRIPE_CONNECT_ENABLED` es un interruptor, no una credencial: exige valor
 * explícito ("true"/"1"), igual que `isConnectRoutingEnabled()`.
 */
function isTruthyFlag(name: string): boolean {
  const raw = readEnv(name)
  return raw === "true" || raw === "1"
}

const SPECS: {
  id: IntegrationId
  label: string
  requires: string[]
  impact: string
  /**
   * Cómo decidir si una variable está satisfecha. Por defecto: presente y no
   * vacía. Existe para que `missing` y `configured` no puedan discrepar.
   */
  satisfied?: (name: string) => boolean
}[] = [
  {
    id: "email",
    label: "Correo transaccional (Resend)",
    requires: ["RESEND_API_KEY"],
    impact:
      "Confirmaciones de pedido, cambios de estado, recordatorios de recompra, carritos abandonados y recordatorios de pago no se envían.",
  },
  {
    id: "whatsapp",
    label: "WhatsApp Business (envío)",
    requires: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
    impact:
      "Las notificaciones y la atención por WhatsApp no salen; el enlace de cotizaciones y el soporte quedan sin canal.",
  },
  {
    id: "push",
    label: "Notificaciones push (VAPID)",
    requires: ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"],
    impact:
      "El opt-in de push no puede suscribir a nadie, así que el dueño de FoodOS no recibe el aviso en el teléfono: solo lo ve en la campana del panel.",
  },
  {
    id: "stripe_connect",
    label: "Stripe Connect (pago al restaurante)",
    requires: ["STRIPE_CONNECT_ENABLED", "STRIPE_SECRET_KEY"],
    impact:
      "El dinero de los pedidos cae en la cuenta de Resurte.me y el pago al restaurante se hace a mano; la comisión de plataforma es 0.",
    // El flag no basta con existir: exige "true"/"1", igual que
    // `isConnectRoutingEnabled()`.
    satisfied: (name) =>
      name === "STRIPE_CONNECT_ENABLED" ? isTruthyFlag(name) : Boolean(readEnv(name)),
  },
  {
    id: "uber_direct",
    label: "Uber Direct (entrega bajo demanda)",
    requires: ["UBER_DIRECT_CLIENT_ID", "UBER_DIRECT_CLIENT_SECRET", "UBER_DIRECT_CUSTOMER_ID"],
    impact: "No se puede cotizar ni crear entregas con Uber Direct.",
  },
  {
    id: "spei",
    label: "Transferencia SPEI (CLABE de cobro)",
    requires: ["NEXT_PUBLIC_SPEI_CLABE", "NEXT_PUBLIC_SPEI_BENEFICIARIO"],
    impact:
      "El checkout promete entregar la CLABE y no hay CLABE que entregar; el cliente queda sin instrucciones de pago.",
  },
  {
    id: "oxxo",
    label: "Pago en OXXO (referencia)",
    requires: ["NEXT_PUBLIC_OXXO_REFERENCIA"],
    impact:
      "El checkout promete un código de barras de OXXO que no existe; el cliente queda sin forma de pagar en tienda.",
  },
  {
    id: "ai",
    label: "Asistente de IA (OpenAI-compatible)",
    requires: ["OPENAI_API_KEY"],
    impact: "Las funciones de IA del panel y de FoodOS no responden.",
  },
]

/** Estado de todas las integraciones conocidas. */
export function getIntegrationStatuses(): IntegrationStatus[] {
  return SPECS.map((spec) => {
    const isSatisfied = spec.satisfied ?? ((name: string) => Boolean(readEnv(name)))
    const missing = spec.requires.filter((name) => !isSatisfied(name))
    return {
      id: spec.id,
      label: spec.label,
      requires: spec.requires,
      configured: missing.length === 0,
      missing,
      impact: spec.impact,
    }
  })
}

/** `true` sólo si la integración puede operar de verdad. */
export function isIntegrationConfigured(id: IntegrationId): boolean {
  return getIntegrationStatuses().some((s) => s.id === id && s.configured)
}

/** Integraciones declaradas que hoy NO pueden operar. */
export function getUnconfiguredIntegrations(): IntegrationStatus[] {
  return getIntegrationStatuses().filter((s) => !s.configured)
}

/** Producción/preview en Vercel: aquí simular éxito es inaceptable. */
export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production"
}

/**
 * Registra en una sola línea qué está apagado. Pensado para arranques de
 * cron y tareas de fondo, donde el silencio es el problema.
 */
export function logUnconfiguredIntegrations(scope: string): void {
  const off = getUnconfiguredIntegrations()
  if (off.length === 0) return
  logger.warn("integrations.unconfigured", {
    scope,
    ids: off.map((s) => s.id),
    missing: off.flatMap((s) => s.missing),
  })
}
