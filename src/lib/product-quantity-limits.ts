// ============================================================
// Cantidad mínima / máxima por producto (migración 00229)
// ============================================================
// Regla única de forzado para TODOS los canales de venta: la
// comparten POST /api/orders (checkout web) y la conversión de
// pedidos de WhatsApp (src/lib/whatsapp-orders.ts), igual que
// coupon-rules.ts es la fuente única de los cupones.
//
// `min_order_qty` / `max_order_qty` viven en `products` como
// columnas PRIVADAS (solo service_role): null = sin límite.
// Las funciones de validación son puras; al final del archivo
// vive la única lectura de BD (con degradación si la migración
// 00229 aún no se aplica: la lectura falla con 42703 y el canal
// sigue vendiendo como antes, sin límites).

import { logger } from "@/lib/logger"
import { isMissingColumnError } from "@/lib/sale-window"
import type { createServiceClient } from "@/lib/supabase/service"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

/** Límites de un producto, tal como se leen de `products`. */
export interface ProductQuantityLimits {
  min_order_qty: number | null
  max_order_qty: number | null
}

/** Línea ya agrupada por producto (cantidad total del pedido). */
export interface QuantityLimitLine {
  product_id: number
  /** Nombre vigente del producto, para mensajes al cliente/staff. */
  name: string
  quantity: number
}

export type QuantityLimitViolationKind = "below_min" | "above_max"

export interface QuantityLimitViolation {
  product_id: number
  name: string
  quantity: number
  kind: QuantityLimitViolationKind
  /** El límite violado (mínimo o máximo según `kind`). */
  limit: number
}

/** Normaliza un valor crudo de BD a límite válido (entero ≥ 1) o null. */
export function normalizeQuantityLimit(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) return null
  return raw
}

/** Extrae los límites de una fila de producto (columnas opcionales). */
export function quantityLimitsOf(row: {
  min_order_qty?: unknown
  max_order_qty?: unknown
}): ProductQuantityLimits {
  return {
    min_order_qty: normalizeQuantityLimit(row.min_order_qty),
    max_order_qty: normalizeQuantityLimit(row.max_order_qty),
  }
}

/**
 * Valida las líneas agrupadas contra los límites por producto.
 * Devuelve TODAS las violaciones (el cliente corrige en un solo
 * viaje, mismo criterio que la validación de existencia).
 * Productos sin entrada en `limitsByProductId` = sin límites.
 */
export function validateQuantityLimits(
  lines: readonly QuantityLimitLine[],
  limitsByProductId: ReadonlyMap<number, ProductQuantityLimits>
): QuantityLimitViolation[] {
  const violations: QuantityLimitViolation[] = []
  for (const line of lines) {
    const limits = limitsByProductId.get(line.product_id)
    if (!limits) continue
    if (limits.min_order_qty !== null && line.quantity < limits.min_order_qty) {
      violations.push({
        product_id: line.product_id,
        name: line.name,
        quantity: line.quantity,
        kind: "below_min",
        limit: limits.min_order_qty,
      })
      continue
    }
    if (limits.max_order_qty !== null && line.quantity > limits.max_order_qty) {
      violations.push({
        product_id: line.product_id,
        name: line.name,
        quantity: line.quantity,
        kind: "above_max",
        limit: limits.max_order_qty,
      })
    }
  }
  return violations
}

/** Texto corto de una violación para mensajes al cliente (WhatsApp/web). */
export function describeQuantityViolation(v: QuantityLimitViolation): string {
  return v.kind === "below_min"
    ? `${v.name}: el mínimo por pedido es ${v.limit} y pediste ${v.quantity}`
    : `${v.name}: el máximo por pedido es ${v.limit} y pediste ${v.quantity}`
}

// ============================================================
// Lectura de límites desde la BD (solo servidor)
// ============================================================
// Las columnas son privadas (00192): esta lectura exige el cliente
// de servicio, que los llamadores construyen con
// `createServiceClient()`. Si la migración 00229 aún no se aplica,
// la consulta falla con 42703 y se degrada a «sin límites»: los
// canales siguen vendiendo como antes en vez de caerse.

const LIMITS_SELECT = "id, min_order_qty, max_order_qty"

/**
 * Lee los límites de los productos pedidos. Devuelve un mapa solo
 * con los productos que tienen AL MENOS un límite configurado.
 * Nunca lanza: ante cualquier error de esquema devuelve el mapa
 * vacío (degradación), y ante otro error lo registra y degrada
 * igual — un fallo leyendo límites no debe tumbar una venta.
 */
export async function fetchQuantityLimits(
  supabase: ServiceClient,
  productIds: readonly number[]
): Promise<Map<number, ProductQuantityLimits>> {
  const out = new Map<number, ProductQuantityLimits>()
  if (productIds.length === 0) return out
  const { data, error } = await supabase
    .from("products")
    .select(LIMITS_SELECT)
    .in("id", [...new Set(productIds)])
  if (error) {
    if (!isMissingColumnError(error)) {
      logger.error("[quantity-limits] error leyendo límites; se vende sin límites", error)
    }
    return out
  }
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const limits = quantityLimitsOf(row)
    if (limits.min_order_qty !== null || limits.max_order_qty !== null) {
      out.set(Number(row.id), limits)
    }
  }
  return out
}
