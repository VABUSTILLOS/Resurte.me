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
  created_at: string
  updated_at: string
}

export interface FoodosBranch {
  id: string
  restaurant_id: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  phone: string | null
  pickup_active: boolean
  delivery_active: boolean
  delivery_fee: number
  min_order: number
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
  created_at: string
  updated_at: string
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
export type FoodosPaymentStatus = "pending" | "paid" | "failed" | "refunded"

export interface FoodosOrderItem {
  item_id: string
  name: string
  price: number
  qty: number
  combo_id?: string | null
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
  created_at: string
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
  created_at: string
}
