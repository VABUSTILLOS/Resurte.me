"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { requireSellerOrAdminAction } from "@/lib/roles"
import { logger } from "@/lib/logger"
import { getWeekBounds } from "../dates"
import {
  PROSPECT_STATUSES,
  type AssistedOrderSummary,
  type CatalogProduct,
  type ClientAddress,
  type SellerClientSummary,
  type ProspectStatus,
  type LastOrderSummary,
  type WeeklyTrendsReport,
} from "../types"
import { escapeIlike } from "./helpers"

// ============================================================
// PEDIDOS ASISTIDOS
// ============================================================

export async function getSellerClients(): Promise<SellerClientSummary[]> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()

  const query = supabase
    .from("crm_prospects")
    .select("id, name, restaurant_name, user_id, status")
    .not("user_id", "is", null)
    .order("name")
  if (role !== "admin") query.eq("seller_id", userId)
  const { data, error } = await query

  if (error) {
    logger.error("[CRM] getSellerClients error:", error)
    throw new Error("Error al cargar los clientes")
  }

  const userIds = (data ?? []).map((c) => String(c.user_id)).filter(Boolean)
  let profilesById = new Map<string, { email: string | null; phone: string | null }>()
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, phone")
      .in("id", userIds)
    profilesById = new Map(
      (profiles ?? []).map((p) => [
        String(p.id),
        { email: (p.email as string | null) ?? null, phone: (p.phone as string | null) ?? null },
      ])
    )
  }

  return (data ?? []).map((c) => ({
    prospectId: Number(c.id),
    prospectName: String(c.name),
    userId: String(c.user_id),
    email: profilesById.get(String(c.user_id))?.email ?? null,
    phone: profilesById.get(String(c.user_id))?.phone ?? null,
    status: c.status as ProspectStatus,
  }))
}

export async function getClientAddresses(userId: string): Promise<ClientAddress[]> {
  await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from("addresses")
    .select("id, label, street, number, interior, neighborhood, city, state, zip_code, references")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })

  if (error) {
    logger.error("[CRM] getClientAddresses error:", error)
    throw new Error("Error al cargar las direcciones")
  }
  return (data ?? []).map((a) => ({
    id: Number(a.id),
    label: (a.label as string) ?? "Casa",
    street: String(a.street),
    number: String(a.number),
    interior: (a.interior as string | null) ?? null,
    neighborhood: String(a.neighborhood),
    city: String(a.city),
    state: String(a.state),
    zip_code: String(a.zip_code),
    references: (a.references as string | null) ?? null,
  }))
}

export async function searchCatalogProducts(query: string): Promise<CatalogProduct[]> {
  await requireSellerOrAdminAction()
  if (!query.trim()) return []
  const supabase = await createServiceClient()
  const q = escapeIlike(query.trim())

  const { data, error } = await supabase
    .from("products")
    .select("id, name, brand, unit, price, sale_price, stock_status, image_url")
    .eq("is_visible", true)
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(15)

  if (error) {
    logger.error("[CRM] searchCatalogProducts error:", error)
    throw new Error("Error al buscar productos")
  }
  return (data ?? []).map((p) => ({
    id: Number(p.id),
    name: String(p.name),
    brand: (p.brand as string | null) ?? null,
    unit: (p.unit as string | null) ?? null,
    price: Number(p.sale_price ?? p.price ?? 0),
    sale_price: p.sale_price != null ? Number(p.sale_price) : null,
    stock_status: (p.stock_status as string) ?? "in_stock",
    image_url: (p.image_url as string | null) ?? null,
  }))
}

export interface AssistedOrderItem {
  productId: number
  quantity: number
}

export async function getClientLastOrder(userId: string): Promise<LastOrderSummary | null> {
  await requireSellerOrAdminAction()
  const supabase = await createServiceClient()

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (orderErr) {
    logger.error("[CRM] getClientLastOrder error:", orderErr)
    throw new Error("Error al cargar el último pedido del cliente")
  }
  if (!order) return null

  const { data: items, error: itemsErr } = await supabase
    .from("order_items")
    .select("product_id, quantity, unit_price, products(name, price, sale_price, stock_status, is_visible)")
    .eq("order_id", order.id)

  if (itemsErr) {
    logger.error("[CRM] getClientLastOrder items error:", itemsErr)
    throw new Error("Error al cargar los productos del último pedido")
  }

  return {
    orderId: Number(order.id),
    createdAt: String(order.created_at),
    items: (items ?? []).map((i) => {
      const p = (Array.isArray(i.products) ? i.products[0] : i.products) as {
        name: string
        price: number | null
        sale_price: number | null
        stock_status: string | null
        is_visible: boolean | null
      } | null
      const currentPrice = p ? Number(p.sale_price ?? p.price ?? 0) : null
      return {
        productId: Number(i.product_id),
        name: p?.name ?? "Producto eliminado",
        quantity: Number(i.quantity),
        unitPrice: Number(i.unit_price),
        currentPrice,
        available: !!p && p.is_visible === true && p.stock_status === "in_stock",
      }
    }),
  }
}

export async function createAssistedOrder(input: {
  prospectId: number
  addressId: number
  items: AssistedOrderItem[]
  paymentMethod?: string
  scheduledFor?: string
  note?: string
}): Promise<{ orderId: number }> {
  const { userId, role } = await requireSellerOrAdminAction()
  if (!input.items || input.items.length === 0) {
    throw new Error("El pedido debe tener al menos un producto")
  }
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Las cantidades deben ser enteros mayores a 0")
    }
  }
  const supabase = await createServiceClient()

  // 1) Prospecto del vendedor, vinculado a una cuenta real
  const prospectQuery = supabase
    .from("crm_prospects")
    .select("id, name, user_id, city_id, whatsapp, phone, email, restaurant_name")
    .eq("id", input.prospectId)
  if (role !== "admin") prospectQuery.eq("seller_id", userId)
  const { data: prospect, error: prospectErr } = await prospectQuery.single()
  if (prospectErr || !prospect) throw new Error("Prospecto no encontrado")
  if (!prospect.user_id) {
    throw new Error("Este prospecto aún no está vinculado a una cuenta. Vincula su cuenta primero.")
  }
  const clientUserId = String(prospect.user_id)

  // 2) Precios reales del catálogo (source of truth)
  const productIds = input.items.map((i) => i.productId)
  const { data: products, error: productsErr } = await supabase
    .from("products")
    .select("id, name, price, sale_price, stock_status")
    .in("id", productIds)
  if (productsErr) throw new Error("Error al validar los productos")

  const productMap = new Map((products ?? []).map((p) => [Number(p.id), p]))
  const subtotal = input.items.reduce((sum, item) => {
    const p = productMap.get(item.productId)
    if (!p) throw new Error(`Producto inválido en el pedido (${item.productId})`)
    const unitPrice = Number(p.sale_price ?? p.price ?? 0)
    return sum + unitPrice * item.quantity
  }, 0)

  // 3) Dirección del cliente (addresses no tiene city_id; city/state son texto)
  const { data: address, error: addrErr } = await supabase
    .from("addresses")
    .select("id, city, state")
    .eq("id", input.addressId)
    .eq("user_id", clientUserId)
    .maybeSingle()
  if (addrErr || !address) throw new Error("La dirección seleccionada no pertenece al cliente")

  // Resolver city_id: primero el del prospecto; si no, por nombre/estado de la
  // dirección; si no, la primera ciudad activa.
  let cityId = prospect.city_id
  if (!cityId) {
    const { data: cityRow } = await supabase
      .from("cities")
      .select("id")
      .eq("name", address.city)
      .eq("state", address.state)
      .maybeSingle()
    cityId = cityRow?.id ?? null
  }
  if (!cityId) {
    const { data: fallbackCity } = await supabase
      .from("cities")
      .select("id")
      .limit(1)
      .maybeSingle()
    cityId = fallbackCity?.id ?? null
  }
  if (!cityId) throw new Error("No se pudo resolver la ciudad del pedido")

  // 4) Crear pedido (service_role; user_id = cliente, seller_id = vendedor)
  const scheduledFor = input.scheduledFor
    ? new Date(input.scheduledFor).toISOString()
    : new Date().toISOString()
  const total = Math.round(subtotal * 100) / 100

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      user_id: clientUserId,
      seller_id: userId,
      city_id: cityId,
      address_id: input.addressId,
      status: "pending",
      subtotal: total,
      delivery_fee: 0,
      total,
      payment_method: input.paymentMethod ?? "cash_on_delivery",
      payment_status: "pending",
      scheduled_for: scheduledFor,
      source: "web",
      customer_phone: prospect.whatsapp ?? prospect.phone,
      customer_email: prospect.email,
    })
    .select("id")
    .single()
  if (orderErr) {
    logger.error("[CRM] createAssistedOrder error:", orderErr)
    throw new Error("Error al crear el pedido")
  }

  // 5) Items
  const items = input.items.map((item) => {
    const p = productMap.get(item.productId)
    if (!p) throw new Error(`Producto ${item.productId} no disponible`)
    return {
      order_id: Number(order.id),
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: Number(p.sale_price ?? p.price ?? 0),
    }
  })
  const { error: itemsErr } = await supabase.from("order_items").insert(items)
  if (itemsErr) {
    logger.error("[CRM] createAssistedOrder items error:", itemsErr)
    throw new Error("Error al guardar los productos del pedido")
  }

  // 6) Bitácora: actividad tipo "pedido"
  await supabase.from("crm_activities").insert({
    prospect_id: input.prospectId,
    seller_id: userId,
    type: "pedido",
    direction: "saliente",
    outcome: "pedido_confirmado",
    summary:
      `Pedido asistido #${order.id} por ${input.note?.trim() || "web"} — $${total.toLocaleString("es-MX")}`.slice(0, 500),
  })

  return { orderId: Number(order.id) }
}

export async function getAssistedOrders(): Promise<AssistedOrderSummary[]> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()

  const query = supabase
    .from("orders")
    .select("id, status, payment_status, total, created_at, profiles(full_name), order_items(id)")
    .order("created_at", { ascending: false })
    .limit(50)
  if (role !== "admin") query.eq("seller_id", userId)
  const { data, error } = await query

  if (error) {
    logger.error("[CRM] getAssistedOrders error:", error)
    throw new Error("Error al cargar los pedidos")
  }
  return (data ?? []).map((o) => ({
    id: Number(o.id),
    client_name: (o.profiles as { full_name?: string | null } | null)?.full_name ?? null,
    status: String(o.status),
    payment_status: String(o.payment_status),
    total: Number(o.total),
    item_count: Array.isArray(o.order_items) ? o.order_items.length : 0,
    created_at: String(o.created_at),
  }))
}

/**
 * Tendencias de las últimas 8 semanas: actividades registradas y ventas
 * pagadas de clientes vinculados, más la distribución actual del pipeline.
 */
export async function getWeeklyTrends(): Promise<WeeklyTrendsReport> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()

  // Límites de las últimas 8 semanas (la actual primero).
  const now = Date.now()
  const weekBounds: { startISO: string; endISO: string }[] = []
  for (let i = 0; i < 8; i++) {
    weekBounds.push(getWeekBounds(new Date(now - i * 7 * 86_400_000)))
  }
  const oldestStart = weekBounds[weekBounds.length - 1]?.startISO
  if (!oldestStart) throw new Error("Error al calcular las semanas")

  const activitiesQuery = supabase
    .from("crm_activities")
    .select("occurred_at")
    .gte("occurred_at", oldestStart)
  const prospectsQuery = supabase.from("crm_prospects").select("status, user_id")
  if (role !== "admin") {
    activitiesQuery.eq("seller_id", userId)
    prospectsQuery.eq("seller_id", userId)
  }

  const [activitiesRes, prospectsRes] = await Promise.all([activitiesQuery, prospectsQuery])
  if (activitiesRes.error || prospectsRes.error) {
    logger.error("[CRM] getWeeklyTrends error")
    throw new Error("Error al cargar las tendencias")
  }

  // Ventas de clientes vinculados en el mismo rango.
  const linked = (prospectsRes.data ?? [])
    .map((p) => p.user_id as string | null)
    .filter((v): v is string => !!v)
  let orders: { total: number; created_at: string }[] = []
  if (linked.length > 0) {
    const { data } = await supabase
      .from("orders")
      .select("total, created_at")
      .in("user_id", linked)
      .eq("payment_status", "paid")
      .neq("status", "cancelled")
      .gte("created_at", oldestStart)
    orders = (data ?? []) as { total: number; created_at: string }[]
  }

  const labelFmt = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "short",
  })

  // Orden cronológico ascendente para graficar.
  const weeks = weekBounds
    .slice()
    .reverse()
    .map((b) => {
      const activities = (activitiesRes.data ?? []).filter(
        (a) => a.occurred_at >= b.startISO && a.occurred_at <= b.endISO
      ).length
      const sales = orders
        .filter((o) => o.created_at >= b.startISO && o.created_at <= b.endISO)
        .reduce((sum, o) => sum + Number(o.total), 0)
      return {
        weekStart: b.startISO,
        label: labelFmt.format(new Date(b.startISO)),
        activities,
        sales,
      }
    })

  const pipeline = PROSPECT_STATUSES.map((status) => ({
    status,
    count: (prospectsRes.data ?? []).filter((p) => p.status === status).length,
  })).filter((p) => p.count > 0)

  return { weeks, pipeline }
}

