/**
 * Reglas de elegibilidad de un cupón, puras y compartidas.
 *
 * Antes vivían duplicadas en `POST /api/coupons/validate` (carrito) y en
 * `POST /api/orders` (creación del pedido): dos copias de la misma regla de
 * dinero divergen en el primer arreglo, y la que se queda atrás rechaza un
 * pedido que el cliente ya vio como válido. Aquí hay una sola implementación.
 *
 * **Las tres reglas aplican a todos los tipos, `free_shipping` incluido.** Lo
 * único especial del cupón de envío gratis es su *efecto* (pone la tarifa de
 * envío en 0 en vez de descontar subtotal): su pedido mínimo, su tope de usos y
 * su expiración se evalúan igual que los de un cupón porcentual. El guardián de
 * propiedad (`user_id`) no vive aquí porque es una regla de seguridad, y lo
 * aplican las rutas.
 */

/** Valor de `coupons.discount_type` que regala el envío a domicilio. */
export const FREE_SHIPPING_TYPE = "free_shipping"

/** Tipos de descuento que un cupón puede tener hoy. */
export const COUPON_DISCOUNT_TYPES = ["percentage", "fixed_amount", FREE_SHIPPING_TYPE] as const

export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number]

/** ¿Este cupón regala el envío? Acepta cualquier forma con `discount_type`. */
export function isFreeShippingCoupon(coupon: { discount_type: string } | null | undefined): boolean {
  return coupon?.discount_type === FREE_SHIPPING_TYPE
}

/** Subconjunto de columnas de `coupons` que necesitan las reglas de elegibilidad. */
export interface CouponEligibilityRow {
  discount_type: string
  min_order: number
  max_uses: number
  used_count: number
  expires_at: string | null
}

export type CouponEligibility =
  | { ok: true }
  | { ok: false; error: string }

/**
 * ¿Puede usarse este cupón con este subtotal?
 *
 * Los textos de error son los que ya publicaban las dos rutas: cambiarlos es un
 * cambio de producto, no un detalle de implementación. El tipo del cupón no
 * cambia la evaluación: `free_shipping` respeta las mismas reglas.
 */
export function validateCouponEligibility(
  coupon: CouponEligibilityRow,
  subtotal: number,
  now: Date = new Date()
): CouponEligibility {
  if (coupon.expires_at && new Date(coupon.expires_at) < now) {
    return { ok: false, error: "El cupón ha expirado" }
  }
  if (subtotal < Number(coupon.min_order)) {
    return {
      ok: false,
      error: `Este cupón requiere un pedido mínimo de $${Number(coupon.min_order).toFixed(2)}`,
    }
  }
  if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
    return { ok: false, error: "El cupón ya fue utilizado el máximo de veces" }
  }
  return { ok: true }
}

// ============================================================
// Descuentos automáticos sin código (migración 00231)
// ============================================================
// Reglas de la tabla `automatic_discount_rules` que se aplican
// solas cuando el carrito cumple la condición — sin que el
// cliente teclee un código. Viven aquí, junto a las reglas de
// cupones, porque son la misma clase de regla de dinero y comparten
// la invariante de la casa: UNA sola implementación que consumen
// la cotización del carrito (`POST /api/discounts/automatic`) y la
// creación del pedido (`POST /api/orders`, que RECALCULA contra la
// BD y nunca confía en el total del cliente).
//
// Semántica (deliberadamente simple y predecible):
// - Cada regla activa se evalúa una vez por pedido, en el orden en
//   que se reciben (el llamador las ordena por created_at).
// - bundle: si el carrito trae TODOS los productos del paquete con
//   al menos la cantidad pedida, descuenta sobre el valor de UNA
//   unidad de paquete (Σ precio × cantidad del paquete).
// - buy_x_get_y: por cada X unidades del producto A se descuentan
//   Y unidades del producto B (o del mismo A). Si A = B, los grupos
//   son de X + Y unidades (las Y regaladas salen del mismo pool).
// - El descuento total nunca excede el subtotal.
// - Los pedidos de WhatsApp NO participan (ese canal tampoco
//   acepta cupones con código): paridad de canales documentada.

export const AUTOMATIC_RULE_TYPES = ["bundle", "buy_x_get_y"] as const

export type AutomaticRuleType = (typeof AUTOMATIC_RULE_TYPES)[number]

export interface BundleRuleConfig {
  items: Array<{ product_id: number; qty: number }>
  discount_type: "percentage" | "fixed_amount"
  discount_value: number
}

export interface BuyXGetYRuleConfig {
  buy_product_id: number
  buy_qty: number
  get_product_id: number
  get_qty: number
  /** Porcentaje de descuento sobre las unidades regaladas (100 = gratis). */
  discount_pct: number
}

/** Fila de `automatic_discount_rules` tal como la lee el motor. */
export interface AutomaticDiscountRuleRow {
  id: string
  name: string
  rule_type: string
  is_active: boolean
  config: unknown
}

/** Línea de carrito/pedido con precio YA validado contra la BD. */
export interface AutomaticDiscountLine {
  product_id: number
  quantity: number
  unit_price: number
}

export interface AppliedAutomaticDiscount {
  rule_id: string
  name: string
  amount: number
}

export interface AutomaticDiscountQuote {
  discountAmount: number
  applied: AppliedAutomaticDiscount[]
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0
}

function isPositiveNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0
}

/** Parsea el `config` jsonb de una regla bundle; null si no es válido. */
export function parseBundleRuleConfig(raw: unknown): BundleRuleConfig | null {
  if (typeof raw !== "object" || raw === null) return null
  const cfg = raw as Record<string, unknown>
  if (!Array.isArray(cfg.items) || cfg.items.length === 0) return null
  const items: BundleRuleConfig["items"] = []
  const seen = new Set<number>()
  for (const item of cfg.items) {
    if (typeof item !== "object" || item === null) return null
    const it = item as Record<string, unknown>
    if (!isPositiveInt(it.product_id) || !isPositiveInt(it.qty)) return null
    if (seen.has(it.product_id)) return null
    seen.add(it.product_id)
    items.push({ product_id: it.product_id, qty: it.qty })
  }
  if (cfg.discount_type !== "percentage" && cfg.discount_type !== "fixed_amount") return null
  if (!isPositiveNumber(cfg.discount_value)) return null
  if (cfg.discount_type === "percentage" && cfg.discount_value > 100) return null
  return {
    items,
    discount_type: cfg.discount_type,
    discount_value: cfg.discount_value,
  }
}

/** Parsea el `config` jsonb de una regla buy_x_get_y; null si no es válido. */
export function parseBuyXGetYRuleConfig(raw: unknown): BuyXGetYRuleConfig | null {
  if (typeof raw !== "object" || raw === null) return null
  const cfg = raw as Record<string, unknown>
  if (!isPositiveInt(cfg.buy_product_id) || !isPositiveInt(cfg.get_product_id)) return null
  if (!isPositiveInt(cfg.buy_qty) || !isPositiveInt(cfg.get_qty)) return null
  if (!isPositiveNumber(cfg.discount_pct) || cfg.discount_pct > 100) return null
  return {
    buy_product_id: cfg.buy_product_id,
    buy_qty: cfg.buy_qty,
    get_product_id: cfg.get_product_id,
    get_qty: cfg.get_qty,
    discount_pct: cfg.discount_pct,
  }
}

const roundCents = (n: number) => Math.round(n * 100) / 100

/**
 * Evalúa las reglas automáticas activas contra las líneas del
 * carrito. Pura: los precios llegan ya validados por el llamador.
 * Reglas inactivas o con `config` inválido se ignoran en silencio
 * (una regla mal capturada no debe tumbar el checkout; el panel la
 * sigue mostrando para corregirla).
 */
export function evaluateAutomaticDiscounts(
  rules: readonly AutomaticDiscountRuleRow[],
  lines: readonly AutomaticDiscountLine[]
): AutomaticDiscountQuote {
  const qtyByProduct = new Map<number, number>()
  const priceByProduct = new Map<number, number>()
  let subtotal = 0
  for (const line of lines) {
    qtyByProduct.set(line.product_id, (qtyByProduct.get(line.product_id) ?? 0) + line.quantity)
    priceByProduct.set(line.product_id, line.unit_price)
    subtotal += line.unit_price * line.quantity
  }

  const applied: AppliedAutomaticDiscount[] = []
  let total = 0

  for (const rule of rules) {
    if (!rule.is_active) continue
    let amount = 0

    if (rule.rule_type === "bundle") {
      const cfg = parseBundleRuleConfig(rule.config)
      if (!cfg) continue
      const complete = cfg.items.every(
        (item) => (qtyByProduct.get(item.product_id) ?? 0) >= item.qty
      )
      if (!complete) continue
      const bundleValue = cfg.items.reduce(
        (sum, item) => sum + (priceByProduct.get(item.product_id) ?? 0) * item.qty,
        0
      )
      amount =
        cfg.discount_type === "percentage"
          ? roundCents((bundleValue * cfg.discount_value) / 100)
          : Math.min(cfg.discount_value, bundleValue)
    } else if (rule.rule_type === "buy_x_get_y") {
      const cfg = parseBuyXGetYRuleConfig(rule.config)
      if (!cfg) continue
      const buyQtyInCart = qtyByProduct.get(cfg.buy_product_id) ?? 0
      let freeUnits = 0
      if (cfg.get_product_id === cfg.buy_product_id) {
        // Mismo producto: los grupos son de buy+get unidades y las
        // regaladas salen del mismo pool.
        freeUnits =
          Math.floor(buyQtyInCart / (cfg.buy_qty + cfg.get_qty)) * cfg.get_qty
      } else {
        const sets = Math.floor(buyQtyInCart / cfg.buy_qty)
        freeUnits = Math.min(sets * cfg.get_qty, qtyByProduct.get(cfg.get_product_id) ?? 0)
      }
      if (freeUnits <= 0) continue
      const getPrice = priceByProduct.get(cfg.get_product_id) ?? 0
      amount = roundCents(freeUnits * getPrice * (cfg.discount_pct / 100))
    } else {
      continue
    }

    if (amount > 0) {
      applied.push({ rule_id: rule.id, name: rule.name, amount })
      total += amount
    }
  }

  return { discountAmount: Math.min(roundCents(total), roundCents(subtotal)), applied }
}

