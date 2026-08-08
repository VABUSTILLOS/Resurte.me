import type { Order, OrderItem } from "@/types"

interface MockOrder extends Order {
  items: (OrderItem & {
    product_name: string
    product_image: string
  })[]
}

const PRODUCT_POOL = [
  { id: 1, name: "Aguacate Hass", image: "" },
  { id: 2, name: "Pechuga de pollo", image: "" },
  { id: 3, name: "Leche Lala entera 1L", image: "" },
  { id: 4, name: "Tortillas de maíz 1kg", image: "" },
  { id: 5, name: "Jitomate saladet", image: "" },
  { id: 6, name: "Pan Bimbo integral", image: "" },
  { id: 7, name: "Queso Oaxaca 400g", image: "" },
  { id: 8, name: "Huevo blanco 18pz", image: "" },
  { id: 9, name: "Arroz Morelos 1kg", image: "" },
  { id: 10, name: "Jabón Zote blanco", image: "" },
]

const STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const

const PAYMENT_METHODS = ["card", "spei", "oxxo", "cash_on_delivery", "mercado_pago"] as const

function randomFrom<T>(arr: readonly T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)]
  if (item === undefined) throw new Error("randomFrom: empty array")
  return item
}

function randomSubtotal(): number {
  return Math.round((150 + Math.random() * 850) * 100) / 100
}

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export function generateMockOrders(count = 8): MockOrder[] {
  return Array.from({ length: count }, (_, i) => {
    const subtotal = randomSubtotal()
    const deliveryFee = i % 3 === 0 ? 0 : 39
    const status = i === 0 ? "pending" : i === 1 ? "out_for_delivery" : randomFrom(STATUSES)
    const itemCount = 1 + Math.floor(Math.random() * 5)

    const items = Array.from({ length: itemCount }, (_, j) => {
      const product = PRODUCT_POOL[(i + j) % PRODUCT_POOL.length]!
      return {
        id: i * 10 + j + 1,
        order_id: i + 1,
        product_id: product.id,
        quantity: 1 + Math.floor(Math.random() * 3),
        unit_price: Math.round((20 + Math.random() * 150) * 100) / 100,
        product_name: product.name,
        product_image: product.image,
      }
    })

    return {
      id: i + 1,
      user_id: "user-1",
      city_id: 1,
      address_id: 1,
      status,
      subtotal,
      delivery_fee: deliveryFee,
      total: subtotal + deliveryFee,
      payment_method: randomFrom(PAYMENT_METHODS),
      payment_status: status === "cancelled" ? "failed" : status === "delivered" ? "paid" : "pending",
      stripe_payment_intent_id: null,
      stripe_checkout_session_id: null,
      scheduled_for: new Date(Date.now() + 86400000).toISOString(),
      source: i % 5 === 0 ? "whatsapp" : "web",
      created_at: daysAgo(i * 3),
      items,
    }
  })
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  preparing: "Preparando",
  out_for_delivery: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
}

export const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  preparing: "bg-purple-50 text-purple-700 border-purple-200",
  out_for_delivery: "bg-orange-50 text-orange-700 border-orange-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  failed: "Fallido",
  refunded: "Reembolsado",
  amount_mismatch: "Monto incorrecto",
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: "Tarjeta",
  stripe: "Stripe",
  spei: "SPEI",
  oxxo: "OXXO",
  cash_on_delivery: "Efectivo",
  mercado_pago: "Mercado Pago",
  codi: "CoDi",
}
