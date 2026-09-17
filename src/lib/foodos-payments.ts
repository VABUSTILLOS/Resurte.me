// ============================================================
// Cobro: vocabulario, desglose y derivación del estado de pago.
//
// Módulo puro (sin servidor ni React) porque lo consumen tres sitios que
// tienen que coincidir exactamente: el productor de pedidos, el arqueo de
// caja (`cashPartOfSale`) y el ticket impreso.
//
// La regla que importa: `payment_method` es un resumen, el desglose es la
// verdad. Un cobro combinado no se puede reconstruir desde su método, así que
// el arqueo lee las partes y no el resumen.
// ============================================================

import type { FoodosPaymentBreakdown, FoodosPaymentBreakdownPart } from "@/types/foodos"
import { fromCents, toCents } from "@/lib/foodos-cash"

/** Formas de pago aceptadas. Es el vocabulario canónico de FoodOS. */
export const FOODOS_PAYMENT_METHODS = [
  "cash",
  "card",
  "transfer",
  "branch",
  "whatsapp",
] as const

export type FoodosPaymentMethod = (typeof FOODOS_PAYMENT_METHODS)[number]

/**
 * Pseudo-método que se persiste cuando el cobro se partió en varias formas.
 * Nunca llega del cliente: lo deriva `derivePaymentMethod`.
 */
export const MIXED_PAYMENT_METHOD = "mixed"

/**
 * Métodos que un comensal puede elegir en línea sin haber pagado todavía.
 * En el mostrador no aplica: el cajero sólo cierra la venta cuando ya cobró.
 */
const PENDING_UNTIL_CONFIRMED: ReadonlySet<string> = new Set(["card", "transfer"])

export function isPaymentMethod(value: unknown): value is FoodosPaymentMethod {
  return typeof value === "string" && (FOODOS_PAYMENT_METHODS as readonly string[]).includes(value)
}

/** Suma de las partes, en centavos. */
export function breakdownTotalCents(breakdown: FoodosPaymentBreakdown): number {
  return breakdown.parts.reduce((sum, part) => sum + toCents(part.amount), 0)
}

/** Efectivo dentro del desglose, en centavos. */
export function breakdownCashCents(breakdown: FoodosPaymentBreakdown): number {
  return breakdown.parts
    .filter((part) => part.method === "cash")
    .reduce((sum, part) => sum + toCents(part.amount), 0)
}

export type PaymentBreakdownCheck = { ok: true } | { ok: false; error: string }

/**
 * Valida un desglose contra el total ya recalculado en servidor.
 *
 * Se comprueba en centavos enteros, no en flotantes: `0.1 + 0.2` no es `0.3` y
 * un cobro combinado que no cuadre por un centavo dejaría la venta sin cerrar.
 */
export function validatePaymentBreakdown(
  breakdown: FoodosPaymentBreakdown,
  total: number
): PaymentBreakdownCheck {
  if (!Array.isArray(breakdown.parts) || breakdown.parts.length === 0) {
    return { ok: false, error: "El cobro combinado necesita al menos una forma de pago" }
  }
  for (const part of breakdown.parts) {
    if (!isPaymentMethod(part.method)) {
      return { ok: false, error: `Forma de pago no válida: ${String(part.method)}` }
    }
    const cents = toCents(part.amount)
    if (!Number.isFinite(cents) || cents <= 0) {
      return { ok: false, error: "Cada forma de pago debe tener un monto mayor a cero" }
    }
  }

  const parts = breakdownTotalCents(breakdown)
  const expected = toCents(total)
  if (parts !== expected) {
    return {
      ok: false,
      error: `El desglose del cobro suma ${fromCents(parts)} y el total es ${fromCents(expected)}`,
    }
  }

  const cash = breakdownCashCents(breakdown)
  if (breakdown.received != null) {
    const received = toCents(breakdown.received)
    if (!Number.isFinite(received) || received < cash) {
      return { ok: false, error: "El efectivo recibido no cubre la parte en efectivo" }
    }
  }

  return { ok: true }
}

/**
 * Normaliza el desglose antes de persistirlo.
 *
 * El cambio lo recalcula el servidor a partir de lo recibido: el ticket no
 * puede imprimir un cambio que el navegador eligió. `received` sólo se guarda
 * si hubo efectivo, y `change` sólo si hubo algo que devolver.
 */
export function normalizePaymentBreakdown(
  breakdown: FoodosPaymentBreakdown
): FoodosPaymentBreakdown {
  const parts: FoodosPaymentBreakdownPart[] = breakdown.parts.map((part) => ({
    method: part.method,
    amount: fromCents(toCents(part.amount)),
  }))

  const cash = parts
    .filter((part) => part.method === "cash")
    .reduce((sum, part) => sum + toCents(part.amount), 0)
  const received = breakdown.received != null ? toCents(breakdown.received) : null
  const change = received != null ? Math.max(0, received - cash) : null

  return {
    parts,
    received: received != null ? fromCents(received) : null,
    change: change ? fromCents(change) : null,
  }
}

/**
 * Método que se persiste en `foodos_orders.payment_method`.
 *
 * Un cobro con varias formas se resume como `mixed`; con una sola se guarda esa
 * forma, para que los reportes por método sigan funcionando sin leer el JSON.
 */
export function derivePaymentMethod(
  breakdown: FoodosPaymentBreakdown | undefined,
  fallback: string | null | undefined
): string | null {
  const parts = breakdown?.parts ?? []
  if (parts.length) {
    const [first] = parts
    if (parts.length === 1) return first?.method ?? null
    return MIXED_PAYMENT_METHOD
  }
  return fallback || null
}

/**
 * Estado del cobro.
 *
 * `settled` viene del contexto del punto de venta: en el mostrador el cajero ya
 * cobró antes de cerrar la venta, así que todo queda `paid`. En línea, tarjeta y
 * transferencia siguen pendientes hasta que el restaurante confirme el abono.
 */
export function derivePaymentStatus(
  method: string | null,
  settled?: boolean
): "paid" | "pending" {
  if (settled !== undefined) return settled ? "paid" : "pending"
  if (method && PENDING_UNTIL_CONFIRMED.has(method)) return "pending"
  return "paid"
}
