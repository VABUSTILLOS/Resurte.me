/**
 * Reserva y liberación de inventario en el ciclo del pedido.
 *
 * Antes de esto, `products.stock_quantity` solo lo escribía el panel admin:
 * la tienda podía vender 100 piezas de un producto con 5 en existencia y el
 * inventario nunca bajaba. La migración 00143 añade dos RPC atómicas
 * (`reserve_order_stock` / `release_order_stock`) y este módulo es la única
 * puerta de entrada desde la app.
 *
 * Política de errores — importante:
 *   · Un conflicto REAL de existencia (`ok: false`) se reporta como fallo:
 *     el pedido debe rechazarse.
 *   · Un error de INFRAESTRUCTURA (la función aún no está desplegada, un
 *     timeout, permisos) devuelve `null` y se registra. NO se propaga como
 *     fallo: no se puede tumbar el checkout entero porque una migración
 *     vaya un paso detrás del código. La venta degrada a "sin control de
 *     inventario", que es exactamente como estaba antes de esta función.
 */

import { logger } from "@/lib/logger"

/** Conflicto de existencia de un producto del pedido. */
export interface StockConflict {
  product_id: number
  /** Suma de cantidades del pedido para ese producto. */
  requested: number
  /** Existencia disponible al momento de reservar. */
  available: number
}

export interface StockRpcResult {
  ok: boolean
  /** `reserved` | `released` | `already_reserved` | `not_reserved` | `insufficient_stock` | `order_not_found` */
  reason?: string
  reserved?: Array<{ product_id: number; quantity: number }>
  restored?: Array<{ product_id: number; quantity: number }>
  conflicts?: StockConflict[]
}

/** Solo lo que este módulo usa del cliente de Supabase (fácil de mockear). */
export interface SupabaseRpcLike {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>
}

export type StockRpcName = "reserve_order_stock" | "release_order_stock"

/**
 * Invoca una RPC de inventario y normaliza la respuesta.
 * Devuelve `null` cuando la RPC no está disponible o falla: la llamada decide
 * qué hacer en vez de recibir una excepción.
 */
export async function callStockRpc(
  supabase: SupabaseRpcLike,
  fn: StockRpcName,
  orderId: number
): Promise<StockRpcResult | null> {
  try {
    const { data, error } = await supabase.rpc(fn, { p_order_id: orderId })
    if (error) {
      logger.error(`${fn} no disponible; el inventario no se actualizó`, {
        orderId,
        code: error.code,
        message: error.message,
      })
      return null
    }
    return (data ?? {}) as StockRpcResult
  } catch (err) {
    logger.error(`${fn} lanzó una excepción; el inventario no se actualizó`, { orderId, err })
    return null
  }
}

/**
 * Mensaje legible para el cliente a partir de los conflictos reportados por
 * la RPC, usando el nombre que el carrito ya trae. Sin él, el comprador
 * vería un id de producto, que no le dice nada.
 */
export function describeStockConflicts(
  conflicts: StockConflict[],
  nameByProduct: ReadonlyMap<number, string | undefined>
): string {
  return conflicts
    .map((c) => {
      const name = nameByProduct.get(c.product_id) ?? `Producto ${c.product_id}`
      return `${name} (pediste ${c.requested}, hay ${c.available})`
    })
    .join("; ")
}
