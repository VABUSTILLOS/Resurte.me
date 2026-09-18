/**
 * Calificador digital de leads para restaurantes.
 *
 * Convierte las respuestas de un formulario corto en una prioridad comercial
 * (segmento A/B/C) y en la lista de capacidades de FoodOS que le sirven a ese
 * restaurante. Módulo puro: lo usan por igual la landing pública (para mostrar
 * el diagnóstico en el navegador) y la capa de servidor (para etiquetar el
 * lead antes de guardarlo).
 *
 * No inventa un nivel de FoodOS que el restaurante no haya ganado: devuelve el
 * nivel MÍNIMO que desbloquearía lo que necesita, y el panel de admin decide
 * si concede un override (`foodos_entitlement_overrides`).
 */

import {
  FEATURE_MIN_TIER,
  FOODOS_FEATURE_ORDER,
  TIER_RANK,
  type FoodosFeature,
} from "@/lib/foodos-entitlements"
import type { CashbackTier } from "@/types"

/** Canal por el que hoy entran los pedidos. */
export const LEAD_CHANNELS = [
  "mostrador",
  "telefono",
  "whatsapp",
  "apps_delivery",
  "redes",
  "propio",
] as const
export type LeadChannel = (typeof LEAD_CHANNELS)[number]

/** El problema que más le duele hoy. */
export const LEAD_PAINS = [
  "comisiones",
  "pedidos_perdidos",
  "reparto",
  "marketing",
  "operacion",
  "ninguno",
] as const
export type LeadPain = (typeof LEAD_PAINS)[number]

export const LEAD_SEGMENTS = ["A", "B", "C"] as const
export type LeadSegment = (typeof LEAD_SEGMENTS)[number]

export const LEAD_LIMITS = {
  weeklyOrders: { min: 0, max: 20_000 },
  averageTicket: { min: 0, max: 100_000 },
} as const

export interface LeadAnswers {
  /** Pedidos por semana, en todos los canales. */
  weeklyOrders: number
  /** Ticket promedio en MXN. */
  averageTicket: number
  channels: LeadChannel[]
  biggestPain: LeadPain
  /** ¿Hoy depende de una app de delivery? */
  usesDeliveryApp: boolean
}

export interface LeadDiagnosis {
  /** 0..100. Más alto = más urgente comercialmente. */
  score: number
  segment: LeadSegment
  /** Capacidades recomendadas, en orden de nivel y sin duplicados. */
  recommendedFeatures: FoodosFeature[]
  /** Nivel mínimo que desbloquearía la primera capacidad recomendada. */
  recommendedTier: CashbackTier
  /** Motivos legibles del puntaje (para mostrar en pantalla y en el CRM). */
  reasons: string[]
}

/** Motivo + puntos. Se mantiene como lista para poder auditar el puntaje. */
interface Signal {
  points: number
  reason: string
  feature?: FoodosFeature
}

/** Etiqueta del nivel más alto de una lista de capacidades. */
function highestTier(features: FoodosFeature[]): CashbackTier {
  let tier: CashbackTier = "Verde"
  for (const feature of features) {
    const candidate = FEATURE_MIN_TIER[feature]
    if (TIER_RANK[candidate] > TIER_RANK[tier]) tier = candidate
  }
  return tier
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(Math.max(Math.trunc(n), min), max)
}

/** Descarta valores desconocidos (vienen de un formulario). */
export function isLeadChannel(value: unknown): value is LeadChannel {
  return typeof value === "string" && (LEAD_CHANNELS as readonly string[]).includes(value)
}

export function isLeadPain(value: unknown): value is LeadPain {
  return typeof value === "string" && (LEAD_PAINS as readonly string[]).includes(value)
}

/** Normaliza respuestas parciales a un `LeadAnswers` válido. */
export function normalizeLeadAnswers(input: Partial<LeadAnswers> | null | undefined): LeadAnswers {
  const raw = input ?? {}
  const channels = Array.isArray(raw.channels) ? raw.channels.filter(isLeadChannel) : []
  const unique = [...new Set(channels)]
  return {
    weeklyOrders: clampInt(raw.weeklyOrders, 0, LEAD_LIMITS.weeklyOrders.max),
    averageTicket: clampInt(raw.averageTicket, 0, LEAD_LIMITS.averageTicket.max),
    channels: unique,
    biggestPain: isLeadPain(raw.biggestPain) ? raw.biggestPain : "ninguno",
    // "Vende por app de delivery" es exactamente "tiene ese canal". Se infiere
    // cuando el llamador no lo dice, para que el formulario del navegador y el
    // diagnóstico que guarda el servidor no puedan discrepar.
    usesDeliveryApp:
      typeof raw.usesDeliveryApp === "boolean"
        ? raw.usesDeliveryApp
        : unique.includes("apps_delivery"),
  }
}

/**
 * Diagnóstico. Nunca lanza: una entrada basura se normaliza a un lead frío.
 *
 * El puntaje mezcla volumen (capacidad de compra), dolor declarado y canal
 * actual. Es deliberadamente conservador: llegar a segmento A exige volumen
 * real, no solo marcar todas las casillas.
 */
export function qualifyLead(input: Partial<LeadAnswers> | null | undefined): LeadDiagnosis {
  const answers = normalizeLeadAnswers(input)
  const signals: Signal[] = []
  const features = new Set<FoodosFeature>()

  // --- Volumen: lo que más pesa, porque mide capacidad real ---
  const monthlyGmv = answers.weeklyOrders * answers.averageTicket * 4.33
  if (answers.weeklyOrders >= 200) {
    signals.push({ points: 35, reason: "Más de 200 pedidos por semana: volumen de operación madura." })
  } else if (answers.weeklyOrders >= 80) {
    signals.push({ points: 26, reason: "Entre 80 y 200 pedidos por semana: operación consolidada." })
  } else if (answers.weeklyOrders >= 30) {
    signals.push({ points: 16, reason: "Entre 30 y 80 pedidos por semana: operación en marcha." })
  } else if (answers.weeklyOrders > 0) {
    signals.push({ points: 7, reason: "Menos de 30 pedidos por semana: operación pequeña o nueva." })
  } else {
    signals.push({ points: 0, reason: "Sin pedidos declarados por semana." })
  }

  if (monthlyGmv >= 150_000) {
    signals.push({ points: 20, reason: "GMV estimado por encima de $150,000 al mes." })
  } else if (monthlyGmv >= 60_000) {
    signals.push({ points: 12, reason: "GMV estimado entre $60,000 y $150,000 al mes." })
  } else if (monthlyGmv > 0) {
    signals.push({ points: 5, reason: "GMV estimado por debajo de $60,000 al mes." })
  }

  // --- Dolor declarado: define QUÉ capacidad le sirve ---
  switch (answers.biggestPain) {
    case "comisiones":
      signals.push({
        points: 15,
        reason: "Le duele la comisión que paga a la app de delivery.",
        feature: "app_marca",
      })
      features.add("app_marca")
      break
    case "pedidos_perdidos":
      signals.push({
        points: 15,
        reason: "Pierde pedidos por no contestar a tiempo.",
        feature: "mesero_ia",
      })
      features.add("mesero_ia")
      break
    case "reparto":
      signals.push({
        points: 12,
        reason: "El reparto propio es su cuello de botella.",
        feature: "flotilla",
      })
      features.add("flotilla")
      break
    case "marketing":
      signals.push({
        points: 10,
        reason: "No tiene forma de traer clientes de vuelta.",
        feature: "marketing_ia",
      })
      features.add("marketing_ia")
      break
    case "operacion":
      signals.push({
        points: 8,
        reason: "Su operación depende de libretas y hojas de cálculo.",
        feature: "pos_mostrador",
      })
      features.add("pos_mostrador")
      break
    case "ninguno":
      signals.push({ points: 0, reason: "No declaró un problema concreto." })
      break
  }

  // --- Canal actual ---
  if (answers.usesDeliveryApp || answers.channels.includes("apps_delivery")) {
    signals.push({
      points: 10,
      reason: "Ya vende por una app de delivery: el comparativo de comisión le aplica directo.",
      feature: "app_marca",
    })
    features.add("app_marca")
  }
  if (answers.channels.includes("whatsapp")) {
    signals.push({
      points: 6,
      reason: "Ya atiende por WhatsApp: Mesero IA entra sin cambiar de canal.",
      feature: "mesero_ia",
    })
    features.add("mesero_ia")
  }
  if (answers.channels.includes("telefono")) {
    signals.push({
      points: 4,
      reason: "Toma pedidos por teléfono: es donde más se pierden.",
      feature: "mesero_ia",
    })
    features.add("mesero_ia")
  }
  if (answers.channels.includes("propio")) {
    signals.push({ points: 6, reason: "Ya tiene canal propio: la app de marca lo consolida." })
    features.add("app_marca")
  }
  if (answers.channels.length === 0) {
    signals.push({ points: 0, reason: "No declaró canales de venta." })
  }

  // Sin ningún dolor y con volumen alto sigue siendo un buen lead: al menos
  // le sirve el sitio con SEO local, que es la entrada más barata.
  if (features.size === 0) {
    features.add("sitio_ia")
  }

  const score = Math.min(
    signals.reduce((sum, s) => sum + s.points, 0),
    100,
  )
  const segment: LeadSegment = score >= 70 ? "A" : score >= 40 ? "B" : "C"

  // Orden estable: por nivel ascendente y luego por el orden del catálogo.
  const recommendedFeatures = FOODOS_FEATURE_ORDER.filter((f) => features.has(f))

  return {
    score,
    segment,
    recommendedFeatures,
    recommendedTier: highestTier(recommendedFeatures),
    reasons: signals.filter((s) => s.points > 0).map((s) => s.reason),
  }
}

/** Resumen de una línea para la columna de notas del CRM. */
export function describeLeadDiagnosis(diagnosis: LeadDiagnosis): string {
  const features = diagnosis.recommendedFeatures.join(", ")
  return `Segmento ${diagnosis.segment} (${diagnosis.score}/100) · nivel ${diagnosis.recommendedTier} · ${features}`
}
