// ============================================================
// Precios especiales por cliente (Ola 5, migración 00234)
// ============================================================
// Una sola vía, a propósito: precio FIJO por (cliente, producto)
// en `customer_product_prices`. Es el dato que el panel asigna y
// el que el servidor aplica — nunca llega del cliente:
//
// - POST /api/orders lo recalcula desde esta tabla cuando el
//   pedido trae sesión: la línea estándar SIN presentación se
//   cobra al precio especial si existe (la presentación manda su
//   propio precio, 00232; el artículo especial/bump tampoco lo
//   usa: tiene su mecánica).
// - La web lo muestra solo con la sesión de ESE cliente
//   (GET /api/customer-prices → ficha, tarjeta y carrito).
// - En WhatsApp NO aplica: el catálogo de Meta publica un solo
//   precio. Un pedido recurrente (00234) SÍ lo respeta, porque
//   nace en el servidor ya ligado al cliente.
//
// El alta valida contra el costo: si `products.cost` existe, un
// precio especial por debajo sería vender a pérdida y se
// rechaza en la ruta admin (validateCustomerPriceInput). Sin
// costo conocido no se inventa la validación.
//
// Sin la migración todo degrada a «sin precios especiales»:
// las lecturas devuelven vacío/false y la tienda vende al
// precio público de siempre. Ninguna función de aquí lanza.

import { logger } from "@/lib/logger"
import { isMissingRelationError } from "@/lib/sale-window"
import type { createServiceClient } from "@/lib/supabase/service"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

const round2 = (n: number) => Math.round(n * 100) / 100

export interface CustomerPriceRow {
  id: string
  user_id: string
  product_id: number
  price: number
  created_at: string
  updated_at: string
}

/**
 * Mapa product_id → precio especial de UN cliente. Si se pasan
 * `productIds`, la lectura se acota a esos productos (el camino
 * del checkout); sin ellos, la lista completa del cliente.
 * Nunca lanza: tabla ausente u otro error → mapa vacío.
 */
export async function fetchCustomerPrices(
  supabase: ServiceClient,
  userId: string | null | undefined,
  productIds?: readonly number[]
): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  if (!userId) return out
  try {
    let query = supabase
      .from("customer_product_prices")
      .select("product_id, price")
      .eq("user_id", userId)
    if (productIds && productIds.length > 0) {
      query = query.in("product_id", [...new Set(productIds)])
    }
    const { data, error } = await query
    if (error) throw error
    for (const row of (data ?? []) as Array<{ product_id: number; price: number | string }>) {
      const price = Number(row.price)
      if (Number.isFinite(price) && price > 0) out.set(Number(row.product_id), price)
    }
  } catch (err) {
    if (!isMissingRelationError(err)) {
      logger.error("[customer-prices] error leyendo precios del cliente; se vende al precio público", err)
    }
  }
  return out
}

/** Una fila concreta (para la bitácora: valor anterior). Null si no hay o si la tabla no existe. */
export async function getCustomerPrice(
  supabase: ServiceClient,
  userId: string,
  productId: number
): Promise<CustomerPriceRow | null> {
  try {
    const { data, error } = await supabase
      .from("customer_product_prices")
      .select("id, user_id, product_id, price, created_at, updated_at")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .maybeSingle()
    if (error) throw error
    return (data as CustomerPriceRow | null) ?? null
  } catch (err) {
    if (!isMissingRelationError(err)) {
      logger.error("[customer-prices] error leyendo un precio especial", err)
    }
    return null
  }
}

export interface CustomerPriceListItem extends CustomerPriceRow {
  product_name: string | null
  /** Precio público vigente (`sale_price ?? price`), para comparar en el panel. */
  public_price: number | null
}

/**
 * Lista del panel: precios especiales del cliente con el nombre
 * y el precio público de cada producto. `available: false` =
 * la migración 00234 aún no se aplica (el panel lo declara).
 */
export async function listCustomerPrices(
  supabase: ServiceClient,
  userId: string
): Promise<{ available: boolean; rows: CustomerPriceListItem[] }> {
  try {
    const { data, error } = await supabase
      .from("customer_product_prices")
      .select("id, user_id, product_id, price, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
    if (error) throw error
    const rows = (data ?? []) as CustomerPriceRow[]
    if (rows.length === 0) return { available: true, rows: [] }

    const { data: products } = await supabase
      .from("products")
      .select("id, name, price, sale_price")
      .in("id", rows.map((r) => r.product_id))
    const byId = new Map(
      ((products ?? []) as Array<{ id: number; name: string; price: number; sale_price: number | null }>).map(
        (p) => [p.id, p]
      )
    )
    return {
      available: true,
      rows: rows.map((r) => {
        const p = byId.get(r.product_id)
        return {
          ...r,
          price: Number(r.price),
          product_name: p?.name ?? null,
          public_price: p ? (p.sale_price ?? p.price) : null,
        }
      }),
    }
  } catch (err) {
    if (!isMissingRelationError(err)) {
      logger.error("[customer-prices] error listando precios del cliente", err)
    }
    return { available: false, rows: [] }
  }
}

export type CustomerPriceInputResult =
  | { ok: true; price: number }
  | { ok: false; error: string }

/**
 * Valida el precio especial que el panel quiere guardar. Regla
 * de costo: si el producto tiene `cost` conocido, el especial
 * no puede quedar por debajo (vender a pérdida); sin costo no
 * hay validación que inventar y solo manda que sea positivo.
 */
export function validateCustomerPriceInput(input: {
  price: unknown
  cost: number | null | undefined
}): CustomerPriceInputResult {
  const price = typeof input.price === "number" ? input.price : Number(input.price)
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: "El precio especial debe ser un monto mayor a cero" }
  }
  const rounded = round2(price)
  if (input.cost !== null && input.cost !== undefined && Number.isFinite(input.cost)) {
    if (rounded < round2(input.cost)) {
      return {
        ok: false,
        error: `El precio especial ($${rounded.toFixed(2)}) queda por debajo del costo ($${round2(input.cost).toFixed(2)})`,
      }
    }
  }
  return { ok: true, price: rounded }
}
