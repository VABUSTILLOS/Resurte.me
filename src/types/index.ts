export interface City {
  id: number
  name: string
  slug: string
  state: string
  lat: number
  lng: number
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

/**
 * Disponibilidad de un producto en una ciudad (migración 00065).
 * Un producto sin filas está disponible en todas las ciudades;
 * con filas, solo donde is_available = true.
 */
export interface ProductCityAvailability {
  id: number
  product_id: number
  city_id: number
  is_available: boolean
  created_at: string
  updated_at: string
}

/**
 * Proveedor (migración 00066). Datos de contacto y estatus comercial.
 * `whatsapp` se guarda solo con dígitos y código de país (wa.me).
 */
export interface Supplier {
  id: number
  name: string
  slug: string
  contact_name: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  status:
    | 'prospecto'
    | 'localizado'
    | 'verificado'
    | 'contactado'
    | 'cotizado'
    | 'aprobado'
    | 'activo'
  notes: string | null
  created_at: string
  updated_at: string
}

/**
 * Vínculo producto ↔ proveedor con costo de lista (migración 00066).
 * Los costos son confidenciales: RLS sin políticas públicas, solo se
 * leen vía rutas /api/admin/* con service role.
 */
export interface ProductSupplier {
  id: number
  product_id: number
  supplier_id: number
  supplier_sku: string | null
  presentation: string | null
  cost: number | null
  list_date: string | null
  is_primary: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface RestaurantCollection {
  id: number
  name: string
  slug: string
  description: string | null
  image_url: string | null
  tags: string[]
  display_order: number
  is_active: boolean
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
  price: number
  sale_price: number | null
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock'
  show_in_whatsapp: boolean
  whatsapp_product_id: string | null
  unit?: string
  tags?: string[]
  is_visible?: boolean
}

export interface CollectionRecipe {
  id: number
  collection_id: number
  name: string
  description: string
  ingredients: string[]
  prep_time: string
  servings: string
  image_url: string | null
  display_order: number
  is_active: boolean
}

export interface Address {
  id: number
  user_id: string | null
  guest_token: string | null
  label: string
  street: string
  number: string
  interior: string | null
  neighborhood: string
  city: string
  state: string
  zip_code: string
  references: string
  /** Dirección predeterminada del usuario (máx. una por user_id). */
  is_default: boolean
  /** Ciudad de entrega (cities.id); opcional en direcciones históricas. */
  city_id: number | null
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
  | 'processing'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'refunded'
  | 'amount_mismatch'

export interface OrderItem {
  id: number
  order_id: number
  product_id: number
  quantity: number
  unit_price: number
}

// --- WhatsApp Types ---

export interface WhatsAppMessage {
  id: number
  from_number: string
  message_type: string
  content: string
  product_id: number | null
  order_id: number | null
  direction: 'inbound' | 'outbound'
  created_at: string
}

type WhatsAppTemplateType =
  | 'broadcast'
  | 'payment_reminder'
  | 'birthday'
  | 'reactivation'
  | 'rating'
  | 'onboarding'

export type WhatsAppTemplateStatus = 'approved' | 'pending' | 'rejected'

export interface WhatsAppTemplate {
  id: number
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
  expires_at: string | null
  /** NULL = cupón público; UUID = cupón personal (recompra/reactivación). */
  user_id?: string | null
  origin?: 'post_purchase' | 'reactivation' | null
  created_at: string
}

// --- Cart Types ---

export interface CartItem {
  product_id: number
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
  items: CartItem[]
}

export interface AppliedCoupon {
  code: string
  discount_type: 'percentage' | 'fixed_amount'
  discount_value: number
  min_order: number
}

/** Cupón personal de recompra/reactivación emitido para un usuario. */
export interface RepurchaseCouponInfo {
  code: string
  discount_type: 'percentage' | 'fixed_amount'
  discount_value: number
  min_order: number
  expires_at: string
}

// --- Cashback & Wallet Types ---

export type CashbackTier = 'Verde' | 'Plata' | 'Oro' | 'Diamante'

export const CASHBACK_TIERS: Record<number, { name: CashbackTier; pct: number }> = {
  1: { name: 'Verde', pct: 5 },
  2: { name: 'Plata', pct: 10 },
  3: { name: 'Oro', pct: 15 },
  4: { name: 'Diamante', pct: 20 },
}

export interface Wallet {
  id: number
  user_id: string
  balance_credits: number
  created_at: string
  updated_at: string
}

export interface WalletTransaction {
  id: number
  wallet_id: number
  amount: number       // > 0 = abono (cashback), < 0 = canje (uso de créditos)
  concept: string
  order_id: number | null
  created_at: string
}

/** Orden enriquecida con metadata de cashback para el frontend */
export interface OrderWithCashback {
  id: number
  user_id: string
  city_id: number
  address_id: number | null
  status: OrderStatus
  subtotal: number
  delivery_fee: number
  discount?: number
  coupon_code?: string | null
  total: number
  payment_method: PaymentMethod | null
  payment_status: PaymentStatus
  stripe_payment_intent_id: string | null
  stripe_checkout_session_id: string | null
  scheduled_for: string | null
  source: 'web' | 'whatsapp'
  cashback_credits: number | null
  cashback_tier: CashbackTier | null
  week_of_month: number | null
  month_year: string | null
  created_at: string
}

/** Resultado paginado del historial de transacciones */
export interface WalletHistoryPage {
  transactions: WalletTransaction[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}
