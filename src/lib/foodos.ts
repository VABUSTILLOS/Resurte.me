// ============================================================
// Helpers de FoodOS: segmentación, totales, motor de cross-sell
// y utilidades compartidas entre panel y micrositio público.
// La "IA" de cross-sell es determinista en v1 (reglas + heurísticas).
// ============================================================

import type {
  FoodosCombo,
  FoodosCustomerSegment,
  FoodosMenuItem,
  FoodosOrderItem,
  FoodosUpsellRule,
} from "@/types/foodos"

export function formatMoney(amount: number, currency = "MXN"): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
}

export function slugify(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function publicRestaurantUrl(slug: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/r/${slug}`
  }
  return `/r/${slug}`
}

export function computeOrderTotals(
  items: FoodosOrderItem[],
  deliveryFee: number,
  discount = 0
): { subtotal: number; discount: number; total: number } {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0)
  const cappedDiscount = Math.min(discount, subtotal)
  return {
    subtotal,
    discount: cappedDiscount,
    total: Math.max(0, subtotal - cappedDiscount + deliveryFee),
  }
}

function comboValue(combo: FoodosCombo): number {
  return combo.discount_pct > 0
    ? (combo.price * combo.discount_pct) / 100
    : 0
}

// --- Segmentación de clientes (espejo del trigger de la migración) ---

export function segmentCustomer(c: {
  total_orders: number
  total_spend: number
  last_order_at: string | null
}): FoodosCustomerSegment {
  if (!c.last_order_at) return "nuevo"
  const last = new Date(c.last_order_at).getTime()
  const daysInactive = (Date.now() - last) / 86_400_000
  if (daysInactive > 30) return "inactivo"
  if (c.total_orders >= 5 || c.total_spend >= 5000) return "vip"
  if (c.total_orders >= 2) return "recurrente"
  return "nuevo"
}

export const SEGMENT_META: Record<
  FoodosCustomerSegment,
  { label: string; badge: string }
> = {
  nuevo: { label: "Nuevo", badge: "bg-blue-100 text-blue-700" },
  recurrente: { label: "Recurrente", badge: "bg-emerald-100 text-emerald-700" },
  vip: { label: "VIP", badge: "bg-amber-100 text-amber-800" },
  inactivo: { label: "Inactivo", badge: "bg-slate-200 text-slate-600" },
}

// --- Motor de cross-sell / upsell (determinista, v1) ---

export interface Recommendation {
  kind: "combo" | "upsell"
  combo?: FoodosCombo
  item?: FoodosMenuItem
  offerText: string
  boost: number
}

const MAX_RECOMMENDATIONS = 3
const LOW_TICKET_THRESHOLD = 150

export function buildRecommendations(input: {
  cart: FoodosOrderItem[]
  menuItems: FoodosMenuItem[]
  combos: FoodosCombo[]
  rules: FoodosUpsellRule[]
  max?: number
}): Recommendation[] {
  const { cart, menuItems, combos, rules } = input
  const max = input.max ?? MAX_RECOMMENDATIONS
  const cartItemIds = new Set(cart.map((i) => i.item_id))
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const seen = new Set<string>()
  const recs: Recommendation[] = []

  const addUpsell = (
    itemId: string,
    offerText: string,
    boost: number
  ) => {
    const key = `item:${itemId}`
    if (seen.has(key) || cartItemIds.has(itemId)) return
    const item = menuItems.find((m) => m.id === itemId)
    if (!item || !item.is_available) return
    seen.add(key)
    recs.push({ kind: "upsell", item, offerText, boost })
  }

  const addCombo = (combo: FoodosCombo) => {
    const key = `combo:${combo.id}`
    if (seen.has(key)) return
    // solo sugerir si el comensal ya tiene al menos un elemento del combo
    const hasPart = combo.item_ids.some((id) => cartItemIds.has(id))
    if (!hasPart) return
    seen.add(key)
    recs.push({
      kind: "combo",
      combo,
      offerText: `Combo ${combo.name} por ${formatMoney(combo.price)}`,
      boost: comboValue(combo),
    })
  }

  // 1. Reglas explícitas del restaurador
  for (const rule of rules) {
    if (!rule.is_active) continue
    if (rule.trigger_type === "product") {
      const triggerId = rule.trigger_value?.item_id
      if (triggerId && cartItemIds.has(triggerId)) {
        for (const s of rule.suggested_items) {
          addUpsell(
            s,
            rule.offer_text ?? "Complementa tu orden",
            Number(rule.boost_amount) || 0
          )
        }
      }
    } else if (rule.trigger_type === "category") {
      const catId = rule.trigger_value?.category_id
      const hasFromCat = menuItems.some(
        (m) => m.category_id === catId && cartItemIds.has(m.id)
      )
      if (hasFromCat) {
        for (const s of rule.suggested_items) {
          addUpsell(
            s,
            rule.offer_text ?? "Te podría gustar también",
            Number(rule.boost_amount) || 0
          )
        }
      }
    } else if (rule.trigger_type === "min_ticket") {
      const min = Number(rule.trigger_value?.min_ticket) || 0
      if (cartTotal > 0 && cartTotal < min) {
        for (const s of rule.suggested_items) {
          addUpsell(
            s,
            rule.offer_text ?? "Completa tu pedido",
            Number(rule.boost_amount) || 0
          )
        }
      }
    }
  }

  // 2. Combos activos: si ya llevan un elemento, proponer el combo completo
  for (const combo of combos) {
    if (!combo.is_active) continue
    addCombo(combo)
  }

  // 3. Heurística: ticket bajo → destacar item "para compartir"/favorito
  if (recs.length < max && cartTotal < LOW_TICKET_THRESHOLD) {
    const featured = menuItems
      .filter(
        (m) =>
          m.is_available &&
          (m.is_featured || m.tags.includes("para compartir")) &&
          !cartItemIds.has(m.id) &&
          !seen.has(`item:${m.id}`)
      )
      .slice(0, max - recs.length)
    for (const m of featured) {
      seen.add(`item:${m.id}`)
      recs.push({
        kind: "upsell",
        item: m,
        offerText: "Más pedido con tu orden",
        boost: 0,
      })
    }
  }

  return recs.slice(0, max)
}

// --- Utilidades de negocio ---

export function itemMargin(item: FoodosMenuItem): number | null {
  if (item.price <= 0) return null
  return (item.price - item.cost) / item.price
}

export function normalizePhone(phone: string): string {
  return (phone ?? "").replace(/\D/g, "")
}
