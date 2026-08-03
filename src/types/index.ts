export interface City {
  id: number
  name: string
  slug: string
  state: string
  lat: number
  lng: number
  is_active: boolean
}

export interface Store {
  id: number
  name: string
  slug: string
  description: string
  logo_url: string
  banner_url: string
  min_order: number
  delivery_fee: number
  avg_delivery_time: string
  whatsapp_number: string | null
  whatsapp_catalog_id: string | null
  whatsapp_waba_id: string | null
  is_active: boolean
}

export interface Category {
  id: number
  name: string
  slug: string
  icon: string
  parent_id: number | null
  description?: string
}

export interface Product {
  id: number
  name: string
  slug: string
  description: string
  image_url: string
  images?: string[]
  brand: string
  category_id: number
  show_in_whatsapp: boolean
  whatsapp_product_id: string | null
  unit?: string
}

export interface ProductStore {
  product_id: number
  store_id: number
  price: number
  sale_price: number | null
  is_available: boolean
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock'
}

export interface Profile {
  id: string
  full_name: string
  phone: string
  birthday: string | null
  avatar_url: string
  default_city_id: number | null
  marketing_consent: boolean
}

export interface Address {
  id: number
  user_id: string
  label: string
  street: string
  number: string
  interior: string | null
  neighborhood: string
  city: string
  state: string
  zip_code: string
  references: string
  lat: number
  lng: number
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'

export type PaymentMethod =
  | 'spei'
  | 'oxxo'
  | 'cash_on_delivery'
  | 'card'
  | 'stripe'
  | 'mercado_pago'
  | 'codi'

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string; description: string }[] = [
  { value: 'card', label: 'Tarjeta (Stripe)', icon: '💳', description: 'Crédito o débito. Procesado por Stripe.' },
  { value: 'spei', label: 'SPEI', icon: '🏦', description: 'Transferencia bancaria. Recibirás CLABE al confirmar.' },
  { value: 'oxxo', label: 'OXXO Pay', icon: '🏪', description: 'Paga en efectivo en cualquier OXXO con referencia.' },
  { value: 'mercado_pago', label: 'Mercado Pago', icon: '📱', description: 'Link de pago de Mercado Pago.' },
  { value: 'cash_on_delivery', label: 'Efectivo', icon: '💵', description: 'Paga al recibir tu pedido.' },
  { value: 'codi', label: 'CoDi', icon: '📲', description: 'Pago con QR del Banco de México.' },
]

export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'

export interface Order {
  id: number
  user_id: string
  store_id: number
  city_id: number
  address_id: number
  status: OrderStatus
  subtotal: number
  delivery_fee: number
  total: number
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  stripe_payment_intent_id: string | null
  stripe_checkout_session_id: string | null
  scheduled_for: string
  source: 'web' | 'whatsapp'
  created_at: string
}

export interface OrderItem {
  id: number
  order_id: number
  product_id: number
  quantity: number
  unit_price: number
}

export interface DeliveryZone {
  id: number
  city_id: number
  name: string
  polygon_coords: number[][] | null
  is_active: boolean
}

// --- WhatsApp Types ---

export interface WhatsAppMessage {
  id: number
  store_id: number
  from_number: string
  message_type: string
  content: string
  product_id: number | null
  order_id: number | null
  direction: 'inbound' | 'outbound'
  created_at: string
}

export type WhatsAppTemplateType =
  | 'broadcast'
  | 'payment_reminder'
  | 'birthday'
  | 'reactivation'
  | 'rating'
  | 'onboarding'

export type WhatsAppTemplateStatus = 'approved' | 'pending' | 'rejected'

export interface WhatsAppTemplate {
  id: number
  store_id: number
  template_name: string
  template_id: string
  template_type: WhatsAppTemplateType
  language: string
  status: WhatsAppTemplateStatus
}

export type AutomationType =
  | 'payment_recovery'
  | 'birthday'
  | 'cart_abandonment'
  | 'reactivation'
  | 'post_delivery_rating'
  | 'onboarding'

export interface WhatsAppAutomation {
  id: number
  store_id: number
  automation_type: AutomationType
  trigger_delay_hours: number
  template_id: number
  is_active: boolean
  config: Record<string, unknown>
}

export interface Coupon {
  id: number
  code: string
  discount_type: 'percentage' | 'fixed_amount'
  discount_value: number
  min_order: number
  max_uses: number
  used_count: number
  expires_at: string
  created_at: string
}

// --- Cart Types ---

export interface CartItem {
  product_id: number
  store_id?: number
  store_name?: string
  store_slug?: string
  name: string
  slug: string
  image_url: string
  brand: string
  price: number
  sale_price: number | null
  quantity: number
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock'
}

export interface Cart {
  store_id?: number | null
  store_name?: string | null
  store_slug?: string | null
  items: CartItem[]
}

export interface AppliedCoupon {
  code: string
  discount_type: 'percentage' | 'fixed_amount'
  discount_value: number
  min_order: number
}
