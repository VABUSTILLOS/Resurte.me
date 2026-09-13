// ============================================================
// Tipos de FoodOS: sistema de pedidos y cross-selling gratuito
// para los clientes restauranteros de Resurte.me.
// Espejo de supabase/migrations/00023_foodos.sql
// ============================================================

export type FoodosRestaurantStatus = "draft" | "active" | "paused"

export interface FoodosRestaurant {
  id: string
  user_id: string
  name: string
  slug: string
  logo_url: string | null
  description: string | null
  collection_id: number | null
  status: FoodosRestaurantStatus
  currency: string
  timezone: string
  theme_color: string | null
  transfer_clabe: string | null
  transfer_bank: string | null
  transfer_beneficiary: string | null
  created_at: string
  updated_at: string
}

export interface FoodosBranch {
  id: string
  restaurant_id: string
  name: string
  city: string | null
  address: string | null
  lat: number | null
  lng: number | null
  phone: string | null
  pickup_active: boolean
  delivery_active: boolean
  dine_in_active: boolean
  delivery_fee: number
  min_order: number
  created_at: string
}

// --- Horarios de operación ---

export interface FoodosBranchHours {
  id: string
  branch_id: string
  day_of_week: number // 0=domingo … 6=sábado
  open_time: string | null  // "HH:MM:SS"
  close_time: string | null
  is_closed: boolean
  created_at: string
}

// --- Cupones por restaurante ---

export interface FoodosCoupon {
  id: string
  restaurant_id: string
  code: string
  type: "percent" | "fixed"
  value: number
  min_order: number
  max_uses: number | null
  usage_count: number
  is_active: boolean
  expires_at: string | null
  created_at: string
}

// --- Overrides de menú por sucursal ---

export interface FoodosBranchMenuOverride {
  id: string
  branch_id: string
  item_id: string
  price: number | null
  is_available: boolean | null
  created_at: string
}

// --- Modificadores de platillos (paridad take.app) ---

export interface FoodosItemOptionGroup {
  id: string
  restaurant_id: string
  item_id: string
  name: string
  is_required: boolean
  min_select: number
  max_select: number
  sort_order: number
  created_at: string
}

export interface FoodosItemOptionValue {
  id: string
  group_id: string
  restaurant_id: string
  name: string
  price_delta: number
  is_available: boolean
  sort_order: number
  created_at: string
}

export interface FoodosMenuCategory {
  id: string
  restaurant_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface FoodosMenuItem {
  id: string
  restaurant_id: string
  category_id: string | null
  name: string
  description: string | null
  price: number
  cost: number
  image_url: string | null
  is_featured: boolean
  is_available: boolean
  tags: string[]
  sort_order: number
  created_at: string
}

export interface FoodosCombo {
  id: string
  restaurant_id: string
  name: string
  price: number
  discount_pct: number
  item_ids: string[]
  is_active: boolean
  highlight: boolean
  created_at: string
}

export type FoodosRuleTriggerType = "product" | "category" | "min_ticket"

export interface FoodosUpsellRule {
  id: string
  restaurant_id: string
  name: string
  trigger_type: FoodosRuleTriggerType
  trigger_value: { item_id?: string; category_id?: string; min_ticket?: number }
  suggested_items: string[]
  offer_text: string | null
  boost_amount: number
  is_active: boolean
  created_at: string
}

export type FoodosCustomerSegment = "nuevo" | "recurrente" | "vip" | "inactivo"

export interface FoodosCustomer {
  id: string
  restaurant_id: string
  phone: string
  name: string | null
  email: string | null
  total_orders: number
  total_spend: number
  last_order_at: string | null
  segment: FoodosCustomerSegment
  loyalty_points: number
  store_credit: number
  created_at: string
  updated_at: string
}

export interface FoodosLoyaltyProgram {
  id: string
  restaurant_id: string
  points_per_100: number
  point_value: number
  is_active: boolean
  created_at: string
}

export interface FoodosReview {
  id: string
  restaurant_id: string
  order_id: string | null
  customer_name: string | null
  customer_phone: string | null
  item_id: string | null
  rating: number
  comment: string | null
  is_visible: boolean
  created_at: string
}

export type FoodosOrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"

export type FoodosOrderChannel = "web" | "qr" | "whatsapp"
export type FoodosFulfillment = "delivery" | "pickup" | "dine_in"
/**
 * `processing` = el cliente ya recibió las instrucciones de un método
 * asíncrono (OXXO/SPEI/CoDi) y el pago aún no se acredita.
 * `expired` = el voucher/CLABE caducó sin pago.
 */
export type FoodosPaymentStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "expired"
  | "refunded"

/** Modificador elegido en una línea de pedido (snapshot con precio server-side). */
export interface FoodosOrderItemModifier {
  group_id: string
  group_name: string
  value_id: string
  value_name: string
  price_delta: number
}

export interface FoodosOrderItem {
  item_id: string
  name: string
  /** Precio unitario final (base + modificadores), calculado en servidor. */
  price: number
  qty: number
  combo_id?: string | null
  modifiers?: FoodosOrderItemModifier[]
}

export interface FoodosOrder {
  id: string
  restaurant_id: string
  branch_id: string | null
  customer_id: string | null
  items: FoodosOrderItem[]
  subtotal: number
  discount: number
  delivery_fee: number
  total: number
  channel: FoodosOrderChannel
  fulfillment: FoodosFulfillment
  status: FoodosOrderStatus
  payment_method: string | null
  payment_status: FoodosPaymentStatus
  stripe_payment_intent_id: string | null
  slug: string | null
  customer_name: string | null
  customer_phone: string | null
  note: string | null
  table_number: string | null
  tip: number
  coupon_code: string | null
  loyalty_points_redeemed: number
  loyalty_points_earned: number
  created_at: string
}

/** Comprobante de pago manual (transferencia/OXXO/efectivo) subido por el comensal. */
export type FoodosPaymentProofMethod = "transfer" | "oxxo" | "efectivo" | "otro"
export type FoodosPaymentProofStatus = "pending" | "approved" | "rejected"

export interface FoodosOrderPayment {
  id: number
  order_id: string
  restaurant_id: string
  method: FoodosPaymentProofMethod
  amount: number | null
  proof_path: string
  reference: string | null
  status: FoodosPaymentProofStatus
  reviewed_by: string | null
  reviewed_at: string | null
  notes: string | null
  created_at: string
  /** URL firmada de corta vida, generada en el servidor al leer. */
  proof_url?: string | null
}

export type FoodosAutomationType =
  | "order_confirmation"
  | "thank_you"
  | "winback"
  | "season_promo"
  | "off_hours"
  | "new_product"

export interface FoodosAutomation {
  id: string
  restaurant_id: string
  type: FoodosAutomationType
  name: string
  trigger_config: {
    days_without_order?: number
    hours_after?: number
    season?: string
    target_segment?: FoodosCustomerSegment
  }
  message: string | null
  incentive_config: { discount_pct?: number; promo_code?: string }
  is_active: boolean
  created_at: string
}

export type FoodosCampaignStatus = "scheduled" | "sent" | "failed" | "cancelled"

export interface FoodosCampaign {
  id: string
  restaurant_id: string
  automation_id: string | null
  customer_id: string | null
  scheduled_for: string | null
  status: FoodosCampaignStatus
  channel: string
  error: string | null
  sent_at: string | null
  created_at: string
}
