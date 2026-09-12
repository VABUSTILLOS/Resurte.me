"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { requireAdmin } from "@/lib/admin-auth"
import { format } from "date-fns"

interface AdminOrderItem {
  id: number
  order_id: number
  product_id: number
  quantity: number
  unit_price: number
  product_name: string | null
  product_image: string | null
}

export interface AdminOrder {
  id: number
  user_id: string
  customer_name: string | null
  status: string
  subtotal: number
  delivery_fee: number
  discount?: number
  coupon_code?: string | null
  total: number
  payment_method: string | null
  payment_status: string
  source: string
  created_at: string
  driver_id?: number | null
  address: {
    street: string
    number: string
    interior: string | null
    neighborhood: string
    city: string
    state: string
    zip_code: string
    references: string | null
  } | null
  items: AdminOrderItem[]
}

/**
 * Server action para el panel admin de pedidos.
 * Requiere sesión de admin (requireAdmin) y usa service_role para leer
 * TODOS los pedidos (el RLS del client SDK solo devolvería los propios).
 *
 * Paginación por cursor: pasa `before` (ISO created_at del último pedido
 * visible) para obtener la página anterior; devuelve `hasMore` para saber
 * si existen pedidos más viejos.
 */
export interface AdminOrderFilters {
  status?: string
  search?: string
  /** ISO timestamptz inclusive (inicio del rango de fechas) */
  from?: string
  /** ISO timestamptz EXCLUSIVE (fin del rango; ver normalizeDateRange) */
  toExclusive?: string
}

/**
 * Server action para el panel admin de pedidos.
 * Requiere sesión de admin (requireAdmin) y usa service_role para leer
 * TODOS los pedidos (el RLS del client SDK solo devolvería los propios).
 *
 * Paginación por cursor: pasa `before` (ISO created_at del último pedido
 * visible) para obtener la página anterior; devuelve `hasMore` para saber
 * si existen pedidos más viejos.
 *
 * `filters.status` y `filters.search` (id o nombre de cliente) se aplican
 * en SQL para que la página devuelta cubra TODO el dataset, no solo los
 * últimos N pedidos cargados.
 */
export async function getAdminOrders(
  limit = 100,
  before?: string,
  filters?: AdminOrderFilters
): Promise<{ orders: AdminOrder[]; hasMore: boolean }> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()

  // Solo las columnas que el panel mapea (la tabla orders es ancha:
  // utm, tokens, ids de Stripe, etc. no se usan aquí).
  const SELECT_BASE =
    "id, user_id, status, subtotal, delivery_fee, discount, coupon_code, total, payment_method, payment_status, source, created_at, profiles(full_name), addresses(street, number, interior, neighborhood, city, state, zip_code, references)"
  const SELECT_WITH_DRIVER = `${SELECT_BASE}, driver_id`

  const buildQuery = <S extends string>(select: S) =>
    supabase.from("orders").select(select).order("created_at", { ascending: false })

  let query = buildQuery(SELECT_WITH_DRIVER)

  if (before) {
    // Pedidos creados ANTES del cursor (página anterior, de más viejo a más nuevo se
    // recorre hacia abajo: el cursor es la fila más antigua ya visible).
    query = query.lt("created_at", before)
  }

  const status = filters?.status
  if (status && status !== "all") {
    query = query.eq("status", status)
  }

  // Fase 9 — rango de fechas (día calendario; el límite superior ya viene
  // exclusivo desde normalizeDateRange).
  if (filters?.from) {
    query = query.gte("created_at", filters.from)
  }
  if (filters?.toExclusive) {
    query = query.lt("created_at", filters.toExclusive)
  }

  const search = filters?.search?.trim()
  if (search) {
    const conditions: string[] = []
    if (/^\d+$/.test(search)) {
      conditions.push(`id.eq.${search}`)
    }
    // Nombre o teléfono de cliente: resolver ids de profiles primero (un
    // join con filtro !inner excluiría pedidos de invitados).
    const { data: matchedProfiles } = await supabase
      .from("profiles")
      .select("id")
      .or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`)
      .limit(50)
    const matchedIds = (matchedProfiles ?? []).map((p) => p.id as string)
    if (matchedIds.length > 0) {
      conditions.push(`user_id.in.(${matchedIds.join(",")})`)
    }
    if (conditions.length === 0) {
      // Búsqueda de texto sin coincidencias de nombre ni id numérico.
      return { orders: [], hasMore: false }
    }
    query = query.or(conditions.join(","))
  }

  // Traer limit+1 para saber si hay más páginas
  let ordersResult = await query.limit(limit + 1)

  // 42703 = orders.driver_id aún no existe (migración 00076 sin aplicar):
  // reintenta sin la columna en lugar de romper el panel de pedidos.
  if (ordersResult.error?.code === "42703") {
    let fallback = buildQuery(SELECT_BASE)
    if (before) fallback = fallback.lt("created_at", before)
    if (status && status !== "all") fallback = fallback.eq("status", status)
    if (search) {
      const conditions: string[] = []
      if (/^\d+$/.test(search)) conditions.push(`id.eq.${search}`)
      const { data: matchedProfiles } = await supabase
        .from("profiles")
        .select("id")
        .ilike("full_name", `%${search}%`)
        .limit(50)
      const matchedIds = (matchedProfiles ?? []).map((p) => p.id as string)
      if (matchedIds.length > 0) conditions.push(`user_id.in.(${matchedIds.join(",")})`)
      if (conditions.length === 0) return { orders: [], hasMore: false }
      fallback = fallback.or(conditions.join(","))
    }
    ordersResult = (await fallback.limit(limit + 1)) as typeof ordersResult
  }

  const { data: orders, error } = ordersResult

  if (error) {
    logger.error("[ADMIN-ORDERS] Error fetching orders:", error)
    throw new Error("Error al cargar los pedidos")
  }

  const hasMore = (orders?.length ?? 0) > limit
  const pageOrders = (orders ?? []).slice(0, limit)

  // Cargar items y nombres de producto para todos los pedidos
  const orderIds = pageOrders.map((o) => o.id)
  const { data: items } = await supabase
    .from("order_items")
    .select("id, order_id, product_id, quantity, unit_price")
    .in("order_id", orderIds.length ? orderIds : [-1])

  const productIds = Array.from(
    new Set((items ?? []).map((i) => i.product_id))
  )
  const { data: products } = await supabase
    .from("products")
    .select("id, name, image_url")
    .in("id", productIds.length ? productIds : [-1])

  const productMap = new Map((products ?? []).map((p) => [p.id, p]))

  const itemsByOrder = new Map<number, AdminOrderItem[]>()
  for (const item of items ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? []
    list.push({
      id: item.id,
      order_id: item.order_id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
      product_name: productMap.get(item.product_id)?.name ?? null,
      product_image: productMap.get(item.product_id)?.image_url ?? null,
    })
    itemsByOrder.set(item.order_id, list)
  }

  return {
    orders: pageOrders.map((o) => {
      // supabase-js tipa las relaciones embebidas como array; en runtime
      // orders→profiles/addresses es many-to-one (objeto único).
      const unwrap = <T,>(v: T | T[] | null): T | null =>
        Array.isArray(v) ? (v[0] ?? null) : v
      const profile = unwrap(o.profiles as { full_name: string | null } | { full_name: string | null }[] | null)
      type Address = {
        street: string
        number: string
        interior: string | null
        neighborhood: string
        city: string
        state: string
        zip_code: string
        references: string | null
      }
      const addr = unwrap(o.addresses as Address | Address[] | null)
      return {
        id: o.id,
        user_id: o.user_id,
        customer_name: profile?.full_name ?? null,
        status: o.status,
        subtotal: Number(o.subtotal),
        delivery_fee: Number(o.delivery_fee),
        discount: o.discount != null ? Number(o.discount) : undefined,
        coupon_code: o.coupon_code ?? null,
        total: Number(o.total),
        payment_method: o.payment_method,
        payment_status: o.payment_status,
        source: o.source,
        created_at: o.created_at,
        driver_id: (o as { driver_id?: number | null }).driver_id ?? null,
        address: addr
          ? {
              street: addr.street,
              number: addr.number,
              interior: addr.interior ?? null,
              neighborhood: addr.neighborhood,
              city: addr.city,
              state: addr.state,
              zip_code: addr.zip_code,
              references: addr.references ?? null,
            }
          : null,
        items: itemsByOrder.get(o.id) ?? [],
      }
    }),
    hasMore,
  }
}

/** Número de tiendas activas (para el dashboard admin). */
export async function getActiveStoresCount(): Promise<number> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const { count, error } = await supabase
    .from("stores")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true)

  if (error) {
    logger.error("[ADMIN-DASHBOARD] Error fetching stores:", error)
    throw new Error("Error al cargar las tiendas")
  }
  return count ?? 0
}

/** ============================================================
 *  METRICS PARA DASHBOARD ADMIN
 * ============================================================ */

export interface AdminMetricsParams {
  period: "daily" | "weekly" | "monthly"
  from?: string // ISO date
  to?: string // ISO date
}

interface AdminMetricsPoint {
  period: string
  revenue: number
  orders: number
  aov: number
  conversion: number
}

export interface AdminMetricsSummary {
  totalRevenue: number
  totalOrders: number
  avgAov: number
  avgConversion: number
  period: string
  points: AdminMetricsPoint[]
}

/**
 * Obtiene métricas agregadas para el dashboard admin.
 * Agrupa por día/semana/mes según `period`.
 * `from`/`to` permiten filtrar rango (opcional, por defecto últimos 30/12/6 meses).
 */
export async function getAdminMetrics({
  period,
  from,
  to,
}: AdminMetricsParams): Promise<AdminMetricsSummary> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()

  // Determinar rango por defecto según período
  const now = new Date()
  const defaultFrom = new Date(now)
  const defaultTo = new Date(now)

  if (period === "daily") {
    defaultFrom.setDate(now.getDate() - 30)
  } else if (period === "weekly") {
    defaultFrom.setMonth(now.getMonth() - 12)
  } else {
    defaultFrom.setMonth(now.getMonth() - 6)
  }

  const startDate = from ? new Date(from) : defaultFrom
  const endDate = to ? new Date(to) : defaultTo

  // Query orders con filtros
  const query = supabase
    .from("orders")
    .select("id, total, payment_status, created_at")
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString())

  const { data: orders, error } = await query

  if (error) {
    logger.error("[ADMIN-METRICS] Error fetching orders:", error)
    throw new Error("Error al cargar las métricas")
  }

  // Agregar por período
  const buckets = new Map<string, { revenue: number; orders: number }>()

  for (const order of orders ?? []) {
    const date = new Date(order.created_at)
    let key: string

    if (period === "daily") {
      key = format(date, "yyyy-MM-dd")
    } else if (period === "weekly") {
      // ISO week: YYYY-Www
      key = format(date, "yyyy-'W'ww")
    } else {
      key = format(date, "yyyy-MM")
    }

    const bucket = buckets.get(key) ?? { revenue: 0, orders: 0 }
    if (order.payment_status === "paid") {
      bucket.revenue += Number(order.total)
    }
    bucket.orders += 1
    buckets.set(key, bucket)
  }

  // Convertir a array ordenado
  const sortedKeys = Array.from(buckets.keys()).sort()
  const points: AdminMetricsPoint[] = sortedKeys.map((key) => {
    const bucket = buckets.get(key) ?? { revenue: 0, orders: 0 }
    const aov = bucket.orders > 0 ? bucket.revenue / bucket.orders : 0
    // Conversión estimada: asumimos ~100 visitas por pedido como baseline
    // En producción usarías datos reales de analytics
    const conversion = bucket.orders > 0 ? (bucket.orders / 100) * 100 : 0
    return {
      period: key,
      revenue: bucket.revenue,
      orders: bucket.orders,
      aov: Math.round(aov * 100) / 100,
      conversion: Math.round(conversion * 10) / 10,
    }
  })

  const totalRevenue = points.reduce((s, p) => s + p.revenue, 0)
  const totalOrders = points.reduce((s, p) => s + p.orders, 0)
  const avgAov = points.length ? points.reduce((s, p) => s + p.aov, 0) / points.length : 0
  const avgConversion = points.length ? points.reduce((s, p) => s + p.conversion, 0) / points.length : 0

  return {
    totalRevenue,
    totalOrders,
    avgAov: Math.round(avgAov * 100) / 100,
    avgConversion: Math.round(avgConversion * 10) / 10,
    period,
    points,
  }
}

// ============================================================
// CATÁLOGO WHATSAPP (sustituye los antiguos MOCK_PRODUCTS)
// ============================================================

export interface AdminWhatsappProduct {
  id: number
  name: string
  brand: string | null
  category_id: number | null
  image_url: string | null
  price: number | null
  sale_price: number | null
  unit: string | null
  show_in_whatsapp: boolean
  whatsapp_product_id: string | null
}

export interface AdminWhatsappCategory {
  id: number
  name: string
  icon: string | null
  slug: string
}

/** Productos y categorías reales para el panel de catálogo de WhatsApp. */
export async function getAdminWhatsappCatalog(): Promise<{
  products: AdminWhatsappProduct[]
  categories: AdminWhatsappCategory[]
}> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()

  const [productsRes, categoriesRes] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, brand, category_id, image_url, price, sale_price, unit, show_in_whatsapp, whatsapp_product_id"
      )
      .order("name"),
    supabase.from("categories").select("id, name, icon, slug").order("id"),
  ])

  if (productsRes.error) {
    logger.error("[ADMIN-WHATSAPP] Error fetching products:", productsRes.error)
    throw new Error("Error al cargar los productos")
  }
  if (categoriesRes.error) {
    logger.error("[ADMIN-WHATSAPP] Error fetching categories:", categoriesRes.error)
    throw new Error("Error al cargar las categorías")
  }

  return {
    products: (productsRes.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand ?? null,
      category_id: p.category_id ?? null,
      image_url: p.image_url ?? null,
      price: p.price != null ? Number(p.price) : null,
      sale_price: p.sale_price != null ? Number(p.sale_price) : null,
      unit: p.unit ?? null,
      show_in_whatsapp: p.show_in_whatsapp ?? false,
      whatsapp_product_id: p.whatsapp_product_id ?? null,
    })),
    categories: (categoriesRes.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon ?? null,
      slug: c.slug,
    })),
  }
}

/** Actualiza show_in_whatsapp de un producto en la BD. */
export async function setProductWhatsappVisibility(
  productId: number,
  showInWhatsapp: boolean
): Promise<void> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const { error } = await supabase
    .from("products")
    .update({ show_in_whatsapp: showInWhatsapp, updated_at: new Date().toISOString() })
    .eq("id", productId)

  if (error) {
    logger.error("[ADMIN-WHATSAPP] Error updating product:", error)
    throw new Error("Error al actualizar el producto")
  }
}

// ============================================================
// FASE 1 — KPIs HOY VS AYER (deltas reales del dashboard)
// ============================================================

const MX_TZ = "America/Mexico_City"

/** Inicio del día (00:00) en horario CDMX, desplazado `offsetDays` días, como instante UTC. */
function mxMidnightUTC(offsetDays = 0): Date {
  const now = new Date()
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: MX_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
  const base = new Date(`${ymd}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + offsetDays)
  // Offset real de CDMX en este instante (fijo UTC-6 desde 2022, pero se calcula)
  const localAtBase = new Date(base.toLocaleString("en-US", { timeZone: MX_TZ }))
  const utcAtBase = new Date(base.toLocaleString("en-US", { timeZone: "UTC" }))
  const offsetMs = localAtBase.getTime() - utcAtBase.getTime()
  return new Date(base.getTime() - offsetMs)
}

export interface AdminTodayStats {
  ordersToday: number
  ordersYesterday: number
  revenueToday: number
  revenueYesterday: number
  cancellationsToday: number
  cancellationsYesterday: number
  aovToday: number
  aovYesterday: number
  pendingCount: number
  activeStores: number
}

/**
 * KPIs del dashboard comparando HOY vs AYER (días calendario en horario
 * CDMX). Antes el dashboard derivaba "hoy" de los últimos 50 pedidos
 * cargados en el cliente — impreciso y sin comparativa.
 */
export async function getAdminTodayStats(): Promise<AdminTodayStats> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const todayStart = mxMidnightUTC(0)
  const yesterdayStart = mxMidnightUTC(-1)

  const [ordersRes, pendingRes, storesRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, total, status, payment_status, created_at")
      .gte("created_at", yesterdayStart.toISOString()),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("stores")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
  ])

  if (ordersRes.error) {
    logger.error("[ADMIN-TODAY] Error fetching orders:", ordersRes.error)
    throw new Error("Error al cargar las estadísticas del día")
  }

  let ordersToday = 0
  let ordersYesterday = 0
  let revenueToday = 0
  let revenueYesterday = 0
  let cancellationsToday = 0
  let cancellationsYesterday = 0

  for (const o of ordersRes.data ?? []) {
    const isToday = new Date(o.created_at) >= todayStart
    const isPaid = o.payment_status === "paid"
    if (isToday) {
      ordersToday += 1
      if (isPaid) revenueToday += Number(o.total)
      if (o.status === "cancelled") cancellationsToday += 1
    } else {
      ordersYesterday += 1
      if (isPaid) revenueYesterday += Number(o.total)
      if (o.status === "cancelled") cancellationsYesterday += 1
    }
  }

  return {
    ordersToday,
    ordersYesterday,
    revenueToday: Math.round(revenueToday * 100) / 100,
    revenueYesterday: Math.round(revenueYesterday * 100) / 100,
    cancellationsToday,
    cancellationsYesterday,
    aovToday: ordersToday > 0 ? Math.round((revenueToday / ordersToday) * 100) / 100 : 0,
    aovYesterday:
      ordersYesterday > 0 ? Math.round((revenueYesterday / ordersYesterday) * 100) / 100 : 0,
    pendingCount: pendingRes.count ?? 0,
    activeStores: storesRes.count ?? 0,
  }
}

// ============================================================
// FASE 2 — CENTRO DE ALERTAS OPERATIVAS
// ============================================================

export interface AdminAlert {
  kind: "stale_pending" | "out_of_stock" | "low_stock" | "coupon_expiring" | "new_leads"
  severity: "critical" | "warning" | "info"
  title: string
  detail: string
  href: string
}

/**
 * Alertas accionables para el dashboard: pedidos pendientes viejos (>30 min),
 * productos agotados / con stock bajo, cupones que expiran en 7 días y leads
 * capturados en las últimas 48 h.
 */
export async function getAdminAlerts(): Promise<AdminAlert[]> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const now = Date.now()
  const staleThreshold = new Date(now - 30 * 60 * 1000).toISOString()
  const couponHorizon = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
  const leadsSince = new Date(now - 48 * 60 * 60 * 1000).toISOString()

  const [staleRes, outRes, lowRes, couponsRes, leadsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, created_at", { count: "exact" })
      .eq("status", "pending")
      .lt("created_at", staleThreshold)
      .order("created_at", { ascending: true })
      .limit(1),
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("stock_status", "out_of_stock")
      .eq("is_visible", true),
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("stock_status", "low_stock")
      .eq("is_visible", true),
    supabase
      .from("coupons")
      .select("code, expires_at")
      .not("expires_at", "is", null)
      .gt("expires_at", new Date(now).toISOString())
      .lte("expires_at", couponHorizon)
      .order("expires_at", { ascending: true })
      .limit(5),
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("created_at", leadsSince),
  ])

  const alerts: AdminAlert[] = []

  const staleCount = staleRes.count ?? 0
  if (staleCount > 0) {
    const oldest = staleRes.data?.[0]
    const minutes = oldest
      ? Math.round((now - new Date(oldest.created_at).getTime()) / 60000)
      : 30
    alerts.push({
      kind: "stale_pending",
      severity: "critical",
      title: `${staleCount} pedido${staleCount === 1 ? "" : "s"} sin confirmar`,
      detail: `El más antiguo lleva ${minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`} esperando.`,
      href: "/admin/pedidos",
    })
  }

  const outCount = outRes.count ?? 0
  if (outCount > 0) {
    alerts.push({
      kind: "out_of_stock",
      severity: "warning",
      title: `${outCount} producto${outCount === 1 ? "" : "s"} agotado${outCount === 1 ? "" : "s"}`,
      detail: "Siguen visibles en la tienda pero sin stock disponible.",
      href: "/admin/productos?stock=out_of_stock",
    })
  }

  const lowCount = lowRes.count ?? 0
  if (lowCount > 0) {
    alerts.push({
      kind: "low_stock",
      severity: "info",
      title: `${lowCount} producto${lowCount === 1 ? "" : "s"} con stock bajo`,
      detail: "Conviene resurtir antes de que se agoten.",
      href: "/admin/productos?stock=low_stock",
    })
  }

  for (const c of couponsRes.data ?? []) {
    if (!c.expires_at) continue
    const days = Math.ceil((new Date(c.expires_at).getTime() - now) / 86400000)
    alerts.push({
      kind: "coupon_expiring",
      severity: "info",
      title: `Cupón ${c.code} expira pronto`,
      detail: days <= 1 ? "Expira en menos de 24 h." : `Expira en ${days} días.`,
      href: "/admin/marketing",
    })
  }

  const leadsCount = leadsRes.count ?? 0
  if (leadsCount > 0) {
    alerts.push({
      kind: "new_leads",
      severity: "info",
      title: `${leadsCount} lead${leadsCount === 1 ? "" : "s"} nuevo${leadsCount === 1 ? "" : "s"} (48 h)`,
      detail: "Capturados en checkout; listos para seguimiento.",
      href: "/admin",
    })
  }

  return alerts
}

// ============================================================
// FASE 6 — ANALÍTICA AVANZADA (top productos, pago, estados)
// ============================================================

export interface AdminInsights {
  topProducts: Array<{ name: string; revenue: number; units: number }>
  revenueByMethod: Array<{ method: string; revenue: number; orders: number }>
  ordersByStatus: Array<{ status: string; count: number }>
}

/** Analítica de los últimos 30 días: top 5 productos por ingresos, ingresos
 * por método de pago y distribución de pedidos por estado. */
export async function getAdminInsights(): Promise<AdminInsights> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [ordersRes, itemsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, total, status, payment_method, payment_status")
      .gte("created_at", since),
    supabase
      .from("order_items")
      .select("order_id, product_id, quantity, unit_price, orders!inner(created_at, payment_status)")
      .gte("orders.created_at", since)
      .eq("orders.payment_status", "paid"),
  ])

  if (ordersRes.error) {
    logger.error("[ADMIN-INSIGHTS] Error fetching orders:", ordersRes.error)
    throw new Error("Error al cargar la analítica")
  }

  // --- Pedidos por estado + ingresos por método (30 días)
  const statusMap = new Map<string, number>()
  const methodMap = new Map<string, { revenue: number; orders: number }>()
  for (const o of ordersRes.data ?? []) {
    statusMap.set(o.status, (statusMap.get(o.status) ?? 0) + 1)
    if (o.payment_status === "paid") {
      const method = o.payment_method ?? "otro"
      const entry = methodMap.get(method) ?? { revenue: 0, orders: 0 }
      entry.revenue += Number(o.total)
      entry.orders += 1
      methodMap.set(method, entry)
    }
  }

  // --- Top productos por ingresos
  const productIds = Array.from(
    new Set((itemsRes.data ?? []).map((i) => i.product_id))
  )
  const { data: productRows } = productIds.length
    ? await supabase.from("products").select("id, name").in("id", productIds)
    : { data: [] as Array<{ id: number; name: string }> }
  const nameMap = new Map((productRows ?? []).map((p) => [p.id, p.name]))

  const productAgg = new Map<number, { revenue: number; units: number }>()
  for (const item of itemsRes.data ?? []) {
    const entry = productAgg.get(item.product_id) ?? { revenue: 0, units: 0 }
    entry.revenue += Number(item.unit_price) * item.quantity
    entry.units += item.quantity
    productAgg.set(item.product_id, entry)
  }

  const topProducts = Array.from(productAgg.entries())
    .map(([id, agg]) => ({
      name: nameMap.get(id) ?? `Producto #${id}`,
      revenue: Math.round(agg.revenue * 100) / 100,
      units: agg.units,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  return {
    topProducts,
    revenueByMethod: Array.from(methodMap.entries())
      .map(([method, agg]) => ({
        method,
        revenue: Math.round(agg.revenue * 100) / 100,
        orders: agg.orders,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    ordersByStatus: Array.from(statusMap.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
  }
}

// ============================================================
// FASE 8 — RESUMEN LEADS / CRM
// ============================================================

export interface AdminLeadsSummary {
  leadsToday: number
  leadsWeek: number
  crmProspects: number
  crmFollowUpsDue: number
  recentLeads: Array<{ id: number; email: string | null; source: string | null; created_at: string }>
}

/** Resumen de leads de checkout y pipeline CRM para el widget del dashboard. */
export async function getAdminLeadsSummary(): Promise<AdminLeadsSummary> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const todayStart = mxMidnightUTC(0)
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const nowIso = new Date().toISOString()

  const [todayRes, weekRes, recentRes, prospectsRes, followUpsRes] = await Promise.all([
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString()),
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekStart.toISOString()),
    supabase
      .from("leads")
      .select("id, email, source, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("crm_prospects").select("*", { count: "exact", head: true }),
    supabase
      .from("crm_prospects")
      .select("*", { count: "exact", head: true })
      .not("next_follow_up_at", "is", null)
      .lte("next_follow_up_at", nowIso),
  ])

  return {
    leadsToday: todayRes.count ?? 0,
    leadsWeek: weekRes.count ?? 0,
    crmProspects: prospectsRes.count ?? 0,
    crmFollowUpsDue: followUpsRes.count ?? 0,
    recentLeads: (recentRes.data ?? []).map((l) => ({
      id: l.id,
      email: l.email ?? null,
      source: l.source ?? null,
      created_at: l.created_at,
    })),
  }
}

/** Conteo ligero de pedidos pendientes (badge de la subnav, polling). */
export async function getPendingOrdersCount(): Promise<number> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const { count, error } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending")

  if (error) {
    logger.error("[ADMIN-PENDING] Error fetching pending count:", error)
    throw new Error("Error al cargar pedidos pendientes")
  }
  return count ?? 0
}

// ============================================================
// FASE 12 — INVENTARIO PROACTIVO
// ============================================================

export interface StockAdjustmentEntry {
  id: number
  product_id: number
  previous_status: string
  new_status: string
  note: string | null
  created_at: string
  product_name?: string
}

/**
 * Ajusta el stock_status de un producto y registra el cambio en la
 * bitácora stock_adjustments (migración 00077).
 */
export async function adjustProductStock(
  productId: number,
  newStatus: "in_stock" | "low_stock" | "out_of_stock",
  note?: string
): Promise<void> {
  const { response: adminDenied, user } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }
  if (!["in_stock", "low_stock", "out_of_stock"].includes(newStatus)) {
    throw new Error("Estado de stock inválido")
  }

  const supabase = await createServiceClient()
  const { data: product, error: readError } = await supabase
    .from("products")
    .select("id, stock_status")
    .eq("id", productId)
    .single()
  if (readError || !product) {
    throw new Error("Producto no encontrado")
  }
  if (product.stock_status === newStatus) return

  const { error: updateError } = await supabase
    .from("products")
    .update({ stock_status: newStatus })
    .eq("id", productId)
  if (updateError) {
    logger.error("[ADMIN-STOCK] Error updating stock:", updateError)
    throw new Error("Error al actualizar el stock")
  }

  const { error: logError } = await supabase.from("stock_adjustments").insert({
    product_id: productId,
    previous_status: product.stock_status,
    new_status: newStatus,
    note: note?.trim() || null,
    adjusted_by: user?.id ?? null,
  })
  if (logError) {
    // No revertimos el ajuste: la bitácora es best-effort (p.ej. si la
    // migración 00077 aún no se aplica en este entorno).
    logger.error("[ADMIN-STOCK] Error logging adjustment:", logError)
  }
}

/** Últimos ajustes de stock (bitácora), con nombre de producto. */
export async function getStockAdjustments(limit = 20): Promise<StockAdjustmentEntry[]> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from("stock_adjustments")
    .select("id, product_id, previous_status, new_status, note, created_at, products(name)")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) {
    logger.error("[ADMIN-STOCK] Error fetching adjustments:", error)
    throw new Error("Error al cargar el historial de stock")
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    product_id: row.product_id,
    previous_status: row.previous_status,
    new_status: row.new_status,
    note: row.note,
    created_at: row.created_at,
    product_name: (row.products as { name?: string } | null)?.name,
  }))
}

/**
 * Sugerencias de reabasto: productos con stock bajo/agotado con ventas
 * cobradas en los últimos 30 días, ordenados por prioridad.
 */
export async function getRestockSuggestions(limit = 10): Promise<
  { productId: number; name: string; stockStatus: string; units30d: number; priority: number; reason: string }[]
> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("product_id, quantity, orders!inner(created_at, payment_status)")
    .gte("orders.created_at", since)
    .eq("orders.payment_status", "paid")
  if (itemsError) {
    logger.error("[ADMIN-RESTOCK] Error fetching sales:", itemsError)
    throw new Error("Error al calcular sugerencias de reabasto")
  }

  const unitsByProduct = new Map<number, number>()
  for (const i of items ?? []) {
    unitsByProduct.set(i.product_id, (unitsByProduct.get(i.product_id) ?? 0) + Number(i.quantity))
  }

  const productIds = Array.from(unitsByProduct.keys())
  if (productIds.length === 0) return []
  const { data: products } = await supabase
    .from("products")
    .select("id, name, stock_status")
    .in("id", productIds)

  const { buildRestockSuggestions } = await import("@/lib/restock")
  return buildRestockSuggestions(
    (products ?? []).map((p) => ({
      productId: p.id,
      name: p.name,
      stockStatus: p.stock_status as "in_stock" | "low_stock" | "out_of_stock",
      units30d: unitsByProduct.get(p.id) ?? 0,
    })),
    limit
  )
}

// ============================================================
// FASE 13 — CRM OPERATIVO (/admin/leads)
// ============================================================

export interface AdminLeadRow {
  id: number
  email: string
  phone: string | null
  source: string
  coupon_code: string | null
  created_at: string
}

/** Leads web capturados (checkout drawer / exit intent), más recientes primero. */
export async function getAdminLeads(limit = 100): Promise<AdminLeadRow[]> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from("leads")
    .select("id, email, phone, source, coupon_code, created_at")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) {
    logger.error("[ADMIN-LEADS] Error fetching leads:", error)
    throw new Error("Error al cargar los leads")
  }
  return data ?? []
}

/** Tablero CRM: todos los prospectos con sus campos de seguimiento. */
export async function getAdminCrmBoard(): Promise<import("@/lib/crm-pipeline").CrmProspect[]> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from("crm_prospects")
    .select("id, name, restaurant_name, phone, whatsapp, email, status, notes, next_follow_up_at, last_contact_at, created_at")
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) {
    logger.error("[ADMIN-CRM] Error fetching prospects:", error)
    throw new Error("Error al cargar el pipeline CRM")
  }
  return data ?? []
}

async function patchCrmProspect(
  id: number,
  patch: Record<string, unknown>,
  alsoTouchLastContact = false
): Promise<void> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  if (alsoTouchLastContact) {
    patch.last_contact_at = new Date().toISOString()
  }
  patch.updated_at = new Date().toISOString()
  const { error } = await supabase.from("crm_prospects").update(patch).eq("id", id)
  if (error) {
    logger.error("[ADMIN-CRM] Error updating prospect:", error)
    throw new Error("Error al actualizar el prospecto")
  }
}

export async function updateCrmProspectStatus(id: number, status: string): Promise<void> {
  const { isCrmStatus } = await import("@/lib/crm-pipeline")
  if (!isCrmStatus(status)) {
    throw new Error("Estado CRM inválido")
  }
  await patchCrmProspect(id, { status }, true)
}

export async function updateCrmProspectNotes(id: number, notes: string): Promise<void> {
  await patchCrmProspect(id, { notes: notes.trim() || null })
}

export async function setCrmProspectFollowUp(id: number, followUpAt: string | null): Promise<void> {
  if (followUpAt !== null && Number.isNaN(new Date(followUpAt).getTime())) {
    throw new Error("Fecha de seguimiento inválida")
  }
  await patchCrmProspect(id, { next_follow_up_at: followUpAt })
}
