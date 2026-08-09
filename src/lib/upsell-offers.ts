import { createServiceClient } from "@/lib/supabase/service"
import { bumpUnitPrice, type BumpRuleRow, type BumpProduct } from "@/lib/order-bumps"

/**
 * Ofertas 1-click post-compra (mecánica SamCart).
 *
 * El upsell se ofrece tras pagar la orden base y reutiliza el método de pago
 * guardado (stripe_payment_method_id). La oferta (producto + descuento) SIEMPRE
 * se deriva server-side de `bump_rules` + `products`; el cliente jamás envía
 * montos. El downsell es una alternativa de menor precio para el segundo
 * rechazo (o el único candidato restante).
 */

export type UpsellOfferProduct = BumpProduct

export interface UpsellOffer {
  /** id de la bump_rule que define el descuento de la oferta. */
  ruleId: number
  /** id del producto del catálogo a cobrar vía process-upsell. */
  productId: number
  title: string
  description: string
  discount_pct: number
  product: UpsellOfferProduct
  /** Precio efectivo unitario con descuento aplicado. */
  price: number
  /** Precio original (sale_price ?? price), antes del descuento. */
  original_price: number
  /** Cantidad sugerida (siempre 1 en esta iteración). */
  quantity: number
}

export interface UpsellOffersResult {
  upsell: UpsellOffer | null
  downsell: UpsellOffer | null
  /**
   * true cuando la orden base ya está pagada/confirmada en BD (el webhook
   * llegó). false significa que el webhook aún no ha confirmado el pago
   * principal — el cliente debe reintentar, NO caer a la confirmación.
   */
  orderConfirmed: boolean
  /** Total base de la orden (orders.total) — referencia server-side para el resumen consolidado. */
  orderTotal: number
}

export interface ResolveUpsellOffersParams {
  orderId: number
  /** user_id del usuario autenticado (null si es invitado). */
  userId?: string | null
  /** guest_token del navegador para validar propiedad en pedidos anónimos. */
  guestToken?: string | null
}

/** Redondea a 2 decimales (misma regla que el resto del checkout). */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function toOffer(rule: BumpRuleRow, product: BumpProduct): UpsellOffer {
  const base = product.sale_price ?? product.price
  return {
    ruleId: rule.id,
    productId: product.id,
    title: rule.title,
    description: rule.description,
    discount_pct: rule.discount_pct,
    product,
    price: bumpUnitPrice(base, rule.discount_pct),
    original_price: round2(base),
    quantity: 1,
  }
}

/**
 * Resuelve las ofertas de upsell/downsell elegibles para una orden pagada.
 *
 * Reglas:
 *  · Solo se consideran productos con bump_rule activa (el admin define ahí el
 *    descuento) y que NO estén ya en la orden base (order_items).
 *  · El upsell es el candidato de mayor valor; el downsell es una alternativa
 *    de menor precio (si existe y difiere del upsell).
 *  · Si la orden no está pagada/confirmada o no guardó método de pago, devuelve
 *    { upsell: null, downsell: null } con `orderConfirmed: false` cuando el
 *    webhook aún no llegó (el cliente reintenta) — el modal cae a la
 *    confirmación solo cuando el pago ya está confirmado.
 *  · Nunca falla por ofertas vacías: ante cualquier error de validación o de
 *    consulta, se devuelve sin ofertas (fail-open, la orden base no se toca).
 */
export async function resolveUpsellOffers(
  params: ResolveUpsellOffersParams
): Promise<UpsellOffersResult> {
  const base = (
    orderConfirmed: boolean,
    orderTotal = 0
  ): UpsellOffersResult => ({
    upsell: null,
    downsell: null,
    orderConfirmed,
    orderTotal,
  })
  const supabase = await createServiceClient()

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, user_id, payment_status, status, stripe_payment_method_id, address_id, total"
    )
    .eq("id", params.orderId)
    .maybeSingle()

  if (orderError || !order) return base(false)
  const orderTotal = Number(order.total ?? 0)
  if (order.payment_status !== "paid" || order.status !== "confirmed") {
    return base(false, orderTotal)
  }
  if (!order.stripe_payment_method_id) return base(true, orderTotal)

  // Propiedad del pedido (misma regla que processUpsellForOrder).
  if (order.user_id && params.userId && order.user_id !== params.userId) {
    return base(true, orderTotal)
  }
  if (!order.user_id && params.userId) return base(true, orderTotal)
  if (!order.user_id && params.guestToken && order.address_id) {
    const { data: addr } = await supabase
      .from("addresses")
      .select("guest_token")
      .eq("id", order.address_id)
      .maybeSingle()
    if (addr?.guest_token && addr.guest_token !== params.guestToken) {
      return base(true, orderTotal)
    }
  }

  // Productos que ya forman parte de la orden (base + bumps + upsells previos).
  const { data: existingItems, error: itemsError } = await supabase
    .from("order_items")
    .select("product_id")
    .eq("order_id", order.id)
  if (itemsError) return base(true, orderTotal)
  const existingIds = new Set((existingItems ?? []).map((i) => i.product_id))

  // Reglas de bump activas + su producto del catálogo.
  const { data: rules, error: rulesError } = await supabase
    .from("bump_rules")
    .select("*, product:products(*)")
    .eq("is_active", true)
    .order("display_order", { ascending: true })

  if (rulesError) return base(true, orderTotal)

  const candidates: UpsellOffer[] = []
  for (const row of rules ?? []) {
    const product = Array.isArray(row.product) ? row.product[0] : row.product
    if (!product) continue
    if (existingIds.has(product.id)) continue
    if (product.stock_status === "out_of_stock") continue
    candidates.push(
      toOffer(
        {
          id: row.id,
          trigger_type: row.trigger_type,
          category_slugs: row.category_slugs ?? [],
          subtotal_min: row.subtotal_min,
          product_id: row.product_id,
          title: row.title,
          description: row.description,
          discount_pct: row.discount_pct,
          is_active: row.is_active,
          display_order: row.display_order,
          collection_slug: row.collection_slug ?? null,
        },
        product
      )
    )
  }

  if (candidates.length === 0) return base(true, orderTotal)

  // El upsell es el de mayor valor; el downsell una alternativa más barata.
  const byPriceDesc = [...candidates].sort((a, b) => b.price - a.price)
  const upsell = byPriceDesc[0] ?? null
  if (!upsell) return base(true, orderTotal)
  const downsell =
    byPriceDesc.length > 1 ? (byPriceDesc[byPriceDesc.length - 1] ?? null) : null
  if (downsell && downsell.productId === upsell.productId) {
    return { upsell, downsell: null, orderConfirmed: true, orderTotal }
  }
  return { upsell, downsell, orderConfirmed: true, orderTotal }
}
