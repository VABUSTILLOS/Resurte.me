"use server"

import { revalidatePath } from "next/cache"
import { createServiceClient } from "@/lib/supabase/service"
import type * as WaCatalogs from "@/lib/whatsapp-catalogs"
import { logger } from "@/lib/logger"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"
import { isMissingColumnError } from "@/lib/sale-window"
import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"
import {
  ADMIN_ORDER_OPTIONAL_COLUMNS,
  buildAdminOrdersSelect,
  missingOptionalOrderColumn,
  type AdminOrderOptionalColumn,
  type OrderQueryResult,
  type AdminOrderRow,
} from "@/lib/admin/order-selects"
import { deriveStockStatus } from "@/lib/stock"
import {
  buildAlertHref,
  sortAlertsBySeverity,
  type AdminAlertKind,
  type AdminAlertSeverity,
} from "@/lib/admin-alerts"
import {
  buildCityPerformance,
  type CatalogAvailabilityInput,
  type CityOrderRow,
  type CityPerformanceResult,
  type CityPerformanceRow,
  type CityRow,
} from "@/lib/admin-city-performance"
import { format } from "date-fns"
import {
  earnedTierFromOrders,
  effectiveTier,
  featuresForTier,
  isCashbackTier,
  type FoodosFeature,
} from "@/lib/foodos-entitlements"
import {
  ADOPTION_WINDOW_DAYS,
  bucketUsage,
  computeFeatureAdoption,
  summarizeAdoption,
  type AdoptionSummary,
  type FeatureActivity,
  type FeatureAdoption,
  type RestaurantFeatureState,
} from "@/lib/foodos-adoption"
import type { RewardsOrder } from "@/lib/wallet-progress"
import type { CashbackTier } from "@/types"
import { filterLeads } from "@/lib/crm-funnel"
import { CRM_PAGE_SIZE } from "@/lib/crm-filters"
import {
  filterProspects,
  findMatchingProspect,
  leadToProspectDraft,
  type CrmProspect,
  type ProspectFilters,
} from "@/lib/crm-pipeline"

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
  /** Nullable desde 00009: los pedidos de invitado no tienen usuario. */
  user_id: string | null
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

  const status = filters?.status
  const search = filters?.search?.trim()

  // Resolver la búsqueda por nombre/teléfono UNA sola vez: el resultado se
  // reutiliza en cada reintento por columna ausente (antes cada intento
  // repetía la consulta a profiles).
  let searchConditions: string[] = []
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
    searchConditions = conditions
  }

  // Traer limit+1 para saber si hay más páginas. Los filtros se aplican en un
  // único lugar para que los reintentos no pierdan ninguno (el fallback de
  // driver_id los descartaba todos: before, status, fechas y búsqueda).
  const runQuery = (select: string) => {
    let q = supabase
      .from("orders")
      .select(select)
      .order("created_at", { ascending: false })

    if (before) {
      // Pedidos creados ANTES del cursor (página anterior, de más viejo a más nuevo se
      // recorre hacia abajo: el cursor es la fila más antigua ya visible).
      q = q.lt("created_at", before)
    }
    if (status && status !== "all") {
      q = q.eq("status", status)
    }
    // Fase 9 — rango de fechas (día calendario; el límite superior ya viene
    // exclusivo desde normalizeDateRange).
    if (filters?.from) {
      q = q.gte("created_at", filters.from)
    }
    if (filters?.toExclusive) {
      q = q.lt("created_at", filters.toExclusive)
    }
    if (searchConditions.length > 0) {
      q = q.or(searchConditions.join(","))
    }
    return q.limit(limit + 1)
  }

  const dropped = new Set<AdminOrderOptionalColumn>()
  const selectFor = () =>
    buildAdminOrdersSelect({
      coupon: !dropped.has("coupon_code"),
      driver: !dropped.has("driver_id"),
    })

  // El SELECT se arma en runtime (columnas opcionales), así que supabase-js no
  // puede inferir la fila a partir de un literal: se tipa explícitamente.
  const fetchPage = async (select: string) =>
    (await runQuery(select)) as unknown as OrderQueryResult<AdminOrderRow[]>

  let ordersResult = await fetchPage(selectFor())

  // 42703 = una columna opcional aún no existe en el esquema desplegado
  // (driver_id → migración 00076, coupon_code → 00114): reintenta sin ella
  // en lugar de romper el panel de pedidos. Tope de un intento por columna.
  for (let attempt = 0; attempt < ADMIN_ORDER_OPTIONAL_COLUMNS.length; attempt++) {
    const column = missingOptionalOrderColumn(ordersResult.error)
    if (!column || dropped.has(column)) break
    logger.warn(`[ADMIN-ORDERS] orders.${column} no existe; reintentando sin la columna`)
    dropped.add(column)
    ordersResult = await fetchPage(selectFor())
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
      const profile = unwrap(o.profiles)
      const addr = unwrap(o.addresses)
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
        driver_id: o.driver_id ?? null,
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
  kind: AdminAlertKind
  severity: AdminAlertSeverity
  title: string
  detail: string
  href: string
}

/**
 * Alertas accionables para el dashboard: pedidos pendientes viejos (>30 min),
 * productos agotados / con stock bajo, cupones que expiran en 7 días y leads
 * capturados en las últimas 48 h.
 *
 * El `href` no se escribe aquí: lo resuelve `buildAlertHref` para que cada
 * alerta aterrice en el recurso concreto (ver `src/lib/admin-alerts.ts`). Las
 * alertas se devuelven ordenadas por severidad para que una crítica no quede
 * debajo de una informativa.
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

  const [staleRes, outRes, lowRes, couponsRes, leadsRes, followUpsRes] = await Promise.all([
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
    supabase
      .from("crm_prospects")
      .select("*", { count: "exact", head: true })
      .not("next_follow_up_at", "is", null)
      .lte("next_follow_up_at", new Date(now).toISOString()),
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
      href: buildAlertHref({ kind: "stale_pending" }),
    })
  }

  const outCount = outRes.count ?? 0
  if (outCount > 0) {
    alerts.push({
      kind: "out_of_stock",
      severity: "warning",
      title: `${outCount} producto${outCount === 1 ? "" : "s"} agotado${outCount === 1 ? "" : "s"}`,
      detail: "Siguen visibles en la tienda pero sin stock disponible.",
      href: buildAlertHref({ kind: "out_of_stock" }),
    })
  }

  const lowCount = lowRes.count ?? 0
  if (lowCount > 0) {
    alerts.push({
      kind: "low_stock",
      severity: "info",
      title: `${lowCount} producto${lowCount === 1 ? "" : "s"} con stock bajo`,
      detail: "Conviene resurtir antes de que se agoten.",
      href: buildAlertHref({ kind: "low_stock" }),
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
      href: buildAlertHref({ kind: "coupon_expiring", code: c.code }),
    })
  }

  const leadsCount = leadsRes.count ?? 0
  if (leadsCount > 0) {
    alerts.push({
      kind: "new_leads",
      severity: "info",
      title: `${leadsCount} lead${leadsCount === 1 ? "" : "s"} nuevo${leadsCount === 1 ? "" : "s"} (48 h)`,
      detail: "Capturados en checkout; listos para seguimiento.",
      href: buildAlertHref({ kind: "new_leads" }),
    })
  }

  // Seguimientos vencidos: el widget ya los contaba, pero sin alerta ni enlace el
  // número no llevaba a ninguna parte.
  const followUpsCount = followUpsRes.count ?? 0
  if (followUpsCount > 0) {
    alerts.push({
      kind: "follow_ups_due",
      severity: "warning",
      title: `${followUpsCount} seguimiento${followUpsCount === 1 ? "" : "s"} vencido${followUpsCount === 1 ? "" : "s"}`,
      detail: "Prospectos con fecha de contacto prometida y ya pasada.",
      href: buildAlertHref({ kind: "follow_ups_due" }),
    })
  }

  return sortAlertsBySeverity(alerts)
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
  /** Prospectos sin vendedor asignado (leads web convertidos sin repartir). */
  crmUnassigned: number
  /** Bandeja de entrada web (migración 00139). */
  leadsBoard: AdminLeadBoardCounts
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

  const [todayRes, weekRes, recentRes, prospectsRes, followUpsRes, unassignedRes, leadsBoard] =
    await Promise.all([
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
      supabase
        .from("crm_prospects")
        .select("*", { count: "exact", head: true })
        .is("seller_id", null),
      loadLeadBoardCounts(supabase),
    ])

  return {
    leadsToday: todayRes.count ?? 0,
    leadsWeek: weekRes.count ?? 0,
    crmProspects: prospectsRes.count ?? 0,
    crmFollowUpsDue: followUpsRes.count ?? 0,
    crmUnassigned: unassignedRes.count ?? 0,
    leadsBoard,
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
  note?: string,
  newQuantity?: number | null
): Promise<void> {
  const { response: adminDenied, user } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }
  if (!["in_stock", "low_stock", "out_of_stock"].includes(newStatus)) {
    throw new Error("Estado de stock inválido")
  }
  if (
    newQuantity !== undefined &&
    newQuantity !== null &&
    (!Number.isInteger(newQuantity) || newQuantity < 0)
  ) {
    throw new Error("La existencia debe ser un entero mayor o igual a 0")
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

  // Con existencia nueva el estado se deriva de ella (00108); sin cantidad
  // se respeta el estado pedido explícitamente.
  let finalStatus = newStatus
  if (newQuantity !== undefined && newQuantity !== null) {
    const { data: thresholdRow } = await supabase
      .from("products")
      .select("low_stock_threshold")
      .eq("id", productId)
      .single()
    const threshold = (thresholdRow as { low_stock_threshold?: number | null } | null)
      ?.low_stock_threshold
    finalStatus = deriveStockStatus(newQuantity, threshold)
  }
  if (product.stock_status === finalStatus && newQuantity === undefined) return

  const patch: { stock_status: string; stock_quantity?: number } = { stock_status: finalStatus }
  if (newQuantity !== undefined && newQuantity !== null) patch.stock_quantity = newQuantity

  const { error: updateError } = await supabase
    .from("products")
    .update(patch)
    .eq("id", productId)
  if (updateError) {
    logger.error("[ADMIN-STOCK] Error updating stock:", updateError)
    throw new Error("Error al actualizar el stock")
  }

  const { error: logError } = await supabase.from("stock_adjustments").insert({
    product_id: productId,
    previous_status: product.stock_status,
    new_status: finalStatus,
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
  {
    productId: number
    name: string
    stockStatus: string
    stockQuantity: number | null
    lowStockThreshold: number | null
    units30d: number
    priority: number
    suggestedQuantity: number
    reason: string
  }[]
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
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, name, stock_status, stock_quantity, low_stock_threshold")
    .in("id", productIds)

  // Migración 00108 pendiente: reintenta sin el umbral por producto.
  let rows = (products ?? []) as {
    id: number
    name: string
    stock_status: string
    stock_quantity: number | null
    low_stock_threshold?: number | null
  }[]
  if (productsError && isMissingColumnError(productsError)) {
    const fallback = await supabase
      .from("products")
      .select("id, name, stock_status, stock_quantity")
      .in("id", productIds)
    rows = (fallback.data ?? []) as typeof rows
  }

  const { buildRestockSuggestions } = await import("@/lib/restock")
  return buildRestockSuggestions(
    rows.map((p) => ({
      productId: p.id,
      name: p.name,
      stockStatus: p.stock_status as "in_stock" | "low_stock" | "out_of_stock",
      units30d: unitsByProduct.get(p.id) ?? 0,
      stockQuantity: p.stock_quantity ?? null,
      lowStockThreshold: p.low_stock_threshold ?? null,
    })),
    limit
  ).map((s) => ({
    productId: s.productId,
    name: s.name,
    stockStatus: s.stockStatus,
    stockQuantity: s.stockQuantity ?? null,
    lowStockThreshold: s.lowStockThreshold ?? null,
    units30d: s.units30d,
    priority: s.priority,
    suggestedQuantity: s.suggestedQuantity,
    reason: s.reason,
  }))
}

// ============================================================
// FASE 13 — CRM OPERATIVO (/admin/leads)
// ============================================================

/** Diagnóstico del calificador B2B, tal como lo guardó el servidor. */
export interface AdminLeadQualification {
  score: number
  segment: string
  recommended_tier: string
  recommended_features: string[]
  reasons: string[]
  answers: {
    weeklyOrders: number
    averageTicket: number
    channels: string[]
    biggestPain: string
    usesDeliveryApp: boolean
  }
}

export interface AdminLeadRow {
  id: number
  email: string
  phone: string | null
  source: string
  coupon_code: string | null
  created_at: string
  /** Solo en leads de /restaurantes. */
  restaurant_name: string | null
  qualification: AdminLeadQualification | null
  /** Bandeja de entrada (migración 00139). */
  status: string
  converted_at: string | null
  converted_prospect_id: number | null
}

/** Columnas del lead que se seleccionan siempre; el resto son opcionales. */
const ADMIN_LEAD_COLUMNS =
  "id, email, phone, source, coupon_code, created_at, restaurant_name, qualification"

/** Columnas añadidas por 00139; si aún no se aplica, se cae al select base. */
const ADMIN_LEAD_STATUS_COLUMNS = "status, converted_at, converted_prospect_id"

export interface AdminLeadFilters {
  /** Texto libre sobre correo, restaurante y teléfono. */
  q?: string
  source?: string
  segment?: string
  /** Estado exacto del lead (`nuevo` / `convertido` / `descartado`). */
  status?: string
  /** `true` = solo la bandeja pendiente (sin atender). */
  pendingOnly?: boolean
  /** Ventana aplicada DESPUÉS de filtrar, no en SQL. */
  limit?: number
  offset?: number
}

export interface AdminLeadPage {
  rows: AdminLeadRow[]
  /** Filas que cumplen los filtros; puede ser mayor que `rows.length`. */
  total: number
}

/**
 * Techo de filas que se traen de la base. El filtrado fino (texto, segmento,
 * bandeja) se hace en memoria porque el diagnóstico vive dentro de un JSONB y el
 * volumen es de miles, no de millones: un `.or()` de PostgREST sobre
 * `qualification->>` sería más frágil que filtrar aquí.
 */
const LEAD_FETCH_CAP = 2000

/**
 * Leads web capturados (checkout drawer / exit intent / landing B2B).
 *
 * La paginación se aplica tras filtrar. Hacerlo al revés (LIMIT/OFFSET en SQL y
 * filtrar después) devolvería páginas incompletas: la página 2 podría salir vacía
 * aunque hubiera coincidencias más abajo.
 */
export async function getAdminLeads(filters: AdminLeadFilters = {}): Promise<AdminLeadPage> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const limit = filters.limit ?? CRM_PAGE_SIZE
  const offset = Math.max(0, filters.offset ?? 0)

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from("leads")
    .select(`${ADMIN_LEAD_COLUMNS}, ${ADMIN_LEAD_STATUS_COLUMNS}`)
    .order("created_at", { ascending: false })
    .limit(LEAD_FETCH_CAP)

  let rows: Record<string, unknown>[]
  if (error) {
    if (!isMissingColumnError(error)) {
      logger.error("[ADMIN-LEADS] Error fetching leads:", error)
      throw new Error("Error al cargar los leads")
    }
    // Entorno sin 00139: se sirve la bandeja sin estado en vez de romper el panel.
    logger.warn("[ADMIN-LEADS] Migración 00139 no aplicada; se omite el estado del lead")
    const fallback = await supabase
      .from("leads")
      .select(ADMIN_LEAD_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(LEAD_FETCH_CAP)
    if (fallback.error) {
      logger.error("[ADMIN-LEADS] Error fetching leads:", fallback.error)
      throw new Error("Error al cargar los leads")
    }
    rows = (fallback.data ?? []).map((row) => ({
      ...row,
      status: "nuevo",
      converted_at: null,
      converted_prospect_id: null,
    }))
  } else {
    rows = (data ?? []) as Record<string, unknown>[]
  }

  const filtered = filterLeads(rows.map(toAdminLeadRow), filters)
  return { rows: filtered.slice(offset, offset + limit), total: filtered.length }
}

function toAdminLeadRow(row: Record<string, unknown>): AdminLeadRow {
  return {
    id: Number(row.id),
    email: String(row.email),
    phone: (row.phone as string | null) ?? null,
    source: String(row.source),
    coupon_code: (row.coupon_code as string | null) ?? null,
    created_at: String(row.created_at),
    restaurant_name: (row.restaurant_name as string | null) ?? null,
    qualification: (row.qualification as AdminLeadQualification | null) ?? null,
    status: (row.status as string | null) ?? "nuevo",
    converted_at: (row.converted_at as string | null) ?? null,
    converted_prospect_id:
      row.converted_prospect_id != null ? Number(row.converted_prospect_id) : null,
  }
}

/** Un lead de la bandeja: el que ya se convirtió o descartó no está pendiente. */
export interface AdminLeadBoardCounts {
  pending: number
  converted: number
  discarded: number
  total: number
}

/**
 * Conteo de la bandeja de leads. Sin 00139 no existe `status`, así que todo lo
 * capturado se reporta como "sin atender" en lugar de inventar convertidos.
 */
async function loadLeadBoardCounts(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
): Promise<AdminLeadBoardCounts> {
  const { data, error } = await supabase
    .from("leads")
    .select("status, converted_prospect_id")
    .limit(20000)
  if (error) {
    const { count, error: countError } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
    if (countError) {
      logger.error("[ADMIN-LEADS] Error counting leads:", countError)
      return { pending: 0, converted: 0, discarded: 0, total: 0 }
    }
    const total = count ?? 0
    return { pending: total, converted: 0, discarded: 0, total }
  }

  const rows = (data ?? []) as { status: string | null; converted_prospect_id: number | null }[]
  let pending = 0
  let converted = 0
  let discarded = 0
  for (const row of rows) {
    const status = row.status ?? "nuevo"
    if (status === "convertido") converted += 1
    else if (status === "descartado") discarded += 1
    else if (row.converted_prospect_id === null) pending += 1
  }
  return { pending, converted, discarded, total: rows.length }
}

/** Conteos de la bandeja, para las pestañas de `/admin/leads`. */
export async function getAdminLeadBoardCounts(): Promise<AdminLeadBoardCounts> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }
  const supabase = await createServiceClient()
  return loadLeadBoardCounts(supabase)
}

/** Tablero CRM: prospectos con sus campos de seguimiento. */
export async function getAdminCrmBoard(
  filters: ProspectFilters & { limit?: number } = {},
): Promise<CrmProspect[]> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const limit = filters.limit ?? 500
  let query = supabase
    .from("crm_prospects")
    .select(
      "id, seller_id, lead_id, name, restaurant_name, phone, whatsapp, email, status, notes, next_follow_up_at, last_contact_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit)

  if (filters.status && filters.status !== "todos") query = query.eq("status", filters.status)
  if (filters.unassigned) query = query.is("seller_id", null)
  if (filters.due) query = query.not("next_follow_up_at", "is", null).lte(
    "next_follow_up_at",
    new Date().toISOString(),
  )

  let rows: Record<string, unknown>[]
  const { data, error } = await query
  if (error) {
    // Entorno sin 00139 (sin `lead_id` ni `seller_id` nullable): se degrada.
    if (!isMissingColumnError(error)) {
      logger.error("[ADMIN-CRM] Error fetching prospects:", error)
      throw new Error("Error al cargar el pipeline CRM")
    }
    logger.warn("[ADMIN-CRM] Migración 00139 no aplicada; se omite lead_id")
    const fallback = await supabase
      .from("crm_prospects")
      .select(
        "id, seller_id, name, restaurant_name, phone, whatsapp, email, status, notes, next_follow_up_at, last_contact_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit)
    if (fallback.error) {
      logger.error("[ADMIN-CRM] Error fetching prospects:", fallback.error)
      throw new Error("Error al cargar el pipeline CRM")
    }
    rows = (fallback.data ?? []).map((row) => ({ ...row, lead_id: null }))
  } else {
    rows = (data ?? []) as Record<string, unknown>[]
  }

  const prospects: CrmProspect[] = rows.map((row) => ({
    id: Number(row.id),
    seller_id: row.seller_id != null ? String(row.seller_id) : null,
    lead_id: row.lead_id != null ? Number(row.lead_id) : null,
    name: String(row.name),
    restaurant_name: (row.restaurant_name as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    whatsapp: (row.whatsapp as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    status: String(row.status),
    notes: (row.notes as string | null) ?? null,
    next_follow_up_at: (row.next_follow_up_at as string | null) ?? null,
    last_contact_at: (row.last_contact_at as string | null) ?? null,
    created_at: String(row.created_at),
  }))
  // `q` se resuelve en memoria para poder ignorar acentos, que PostgREST no hace.
  return filters.q ? filterProspects(prospects, { q: filters.q }) : prospects
}

/** Vendedores activos, para el selector de asignación. */
export async function getAdminSellers(): Promise<{ id: string; name: string; email: string }[]> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "vendedor")
    .order("full_name", { ascending: true })
  if (error) {
    logger.error("[ADMIN-CRM] Error fetching sellers:", error)
    throw new Error("Error al cargar los vendedores")
  }
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: (row.full_name as string | null)?.trim() || String(row.email ?? "Sin nombre"),
    email: String(row.email ?? ""),
  }))
}

/** Ficha completa de un prospecto: datos, historial y vendedor asignado. */
export async function getAdminProspectDetail(prospectId: number): Promise<{
  prospect: import("@/lib/comercializacion/types").Prospect
  activities: import("@/lib/comercializacion/types").Activity[]
  seller: { id: string; name: string } | null
  lead: { id: number; email: string; source: string; created_at: string } | null
}> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  // Se reutiliza la lectura del CRM de vendedores: un admin pasa el filtro de
  // rol, así que ve cualquier prospecto sin duplicar la consulta ni el mapeo.
  const { getProspectDetail } = await import("@/lib/comercializacion/actions/actividades")
  const detail = await getProspectDetail(prospectId)

  const supabase = await createServiceClient()
  const seller = detail.prospect.seller_id
    ? await fetchProfileName(supabase, detail.prospect.seller_id)
    : null

  let lead: { id: number; email: string; source: string; created_at: string } | null = null
  const { data: leadRow, error: leadError } = await supabase
    .from("crm_prospects")
    .select("leads(id, email, source, created_at)")
    .eq("id", prospectId)
    .maybeSingle()
  if (leadError) {
    // 00139 ausente: el prospecto simplemente no tiene lead de origen.
    if (!isMissingColumnError(leadError)) {
      logger.warn("[ADMIN-CRM] No se pudo leer el lead de origen:", { message: leadError.message })
    }
  } else {
    const embedded = (
      leadRow as { leads?: { id: number; email: string; source: string; created_at: string } | null } | null
    )?.leads
    if (embedded) {
      lead = {
        id: Number(embedded.id),
        email: String(embedded.email),
        source: String(embedded.source),
        created_at: String(embedded.created_at),
      }
    }
  }

  return { ...detail, seller, lead }
}

async function fetchProfileName(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  userId: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", userId)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: String(data.id),
    name: (data.full_name as string | null)?.trim() || String(data.email ?? "Sin nombre"),
  }
}

export interface ConvertLeadResult {
  prospectId: number
  /** `true` si el lead ya estaba convertido (la llamada fue idempotente). */
  alreadyConverted: boolean
  /** Prospecto preexistente con el que se vinculó, si se detectó un duplicado. */
  duplicateOf: { id: number; name: string } | null
}

/**
 * Convierte un lead web en prospecto.
 *
 * Idempotente por diseño: si el lead ya tiene `converted_prospect_id` devuelve
 * ese prospecto en vez de crear otro. Antes de crear, busca un prospecto con el
 * mismo teléfono o correo (`findMatchingProspect`) para no duplicar una ficha que
 * un vendedor ya había capturado a mano: en ese caso vincula el lead al
 * prospecto existente y lo deja sin reasignar.
 */
export async function convertLeadToProspect(leadId: number): Promise<ConvertLeadResult> {
  const { response: adminDenied, user } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select(`${ADMIN_LEAD_COLUMNS}, ${ADMIN_LEAD_STATUS_COLUMNS}`)
    .eq("id", leadId)
    .maybeSingle()
  if (leadError) {
    logger.error("[ADMIN-LEADS] Error reading lead:", leadError)
    throw new Error("Error al leer el lead")
  }
  if (!lead) {
    throw new Error("Lead no encontrado")
  }

  const current = toAdminLeadRow(lead as Record<string, unknown>)
  if (current.converted_prospect_id !== null) {
    return {
      prospectId: current.converted_prospect_id,
      alreadyConverted: true,
      duplicateOf: null,
    }
  }

  const draft = leadToProspectDraft({
    id: current.id,
    email: current.email,
    phone: current.phone,
    restaurant_name: current.restaurant_name,
    source: current.source,
    qualification: current.qualification,
  })

  const { data: existingRows, error: existingError } = await supabase
    .from("crm_prospects")
    .select("id, lead_id, name, restaurant_name, phone, whatsapp, email")
    .limit(2000)
  if (existingError) {
    logger.error("[ADMIN-CRM] Error buscando duplicados:", existingError)
    throw new Error("Error al buscar prospectos existentes")
  }

  const existing = (existingRows ?? []).map((row) => ({
    id: Number(row.id),
    seller_id: null,
    lead_id: row.lead_id != null ? Number(row.lead_id) : null,
    name: String(row.name),
    restaurant_name: (row.restaurant_name as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    whatsapp: (row.whatsapp as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    status: "nuevo",
    notes: null,
    next_follow_up_at: null,
    last_contact_at: null,
    created_at: "",
  }))

  const match = findMatchingProspect(draft, existing)
  let prospectId: number
  let duplicateOf: { id: number; name: string } | null = null

  if (match) {
    prospectId = match.id
    duplicateOf = { id: match.id, name: match.name }
    // Se vincula el lead al prospecto ya existente sin sobrescribir lo que el
    // vendedor haya escrito: sólo se rellena el origen si estaba vacío.
    const { error: linkError } = await supabase
      .from("crm_prospects")
      .update({ lead_id: draft.lead_id, updated_at: new Date().toISOString() })
      .eq("id", match.id)
    if (linkError) {
      logger.error("[ADMIN-CRM] Error vinculando lead a prospecto:", linkError)
      throw new Error("Error al vincular el lead con el prospecto existente")
    }
  } else {
    const { data: created, error: createError } = await supabase
      .from("crm_prospects")
      .insert({
        lead_id: draft.lead_id,
        seller_id: draft.seller_id,
        name: draft.name,
        restaurant_name: draft.restaurant_name,
        phone: draft.phone,
        whatsapp: draft.whatsapp,
        email: draft.email,
        status: draft.status,
        source: draft.source,
        notes: draft.notes,
      })
      .select("id")
      .single()
    if (createError || !created) {
      logger.error("[ADMIN-CRM] Error creando prospecto desde lead:", createError)
      throw new Error("Error al crear el prospecto")
    }
    prospectId = Number(created.id)
  }

  const convertedAt = new Date().toISOString()
  const { error: updateError } = await supabase
    .from("leads")
    .update({
      status: "convertido",
      converted_at: convertedAt,
      converted_prospect_id: prospectId,
    })
    .eq("id", leadId)
  if (updateError) {
    logger.error("[ADMIN-LEADS] Error marcando lead convertido:", updateError)
    throw new Error("Error al marcar el lead como convertido")
  }

  await logAdminAction(supabase, {
    actorId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    action: "lead_convert",
    entity: "leads",
    entityId: leadId,
    detail: { prospectId, duplicateOf: duplicateOf?.id ?? null },
  })

  revalidatePath("/admin/leads")
  return { prospectId, alreadyConverted: false, duplicateOf }
}

/** Descarta un lead de la bandeja (sin borrarlo: se conserva el histórico). */
export async function discardLead(leadId: number): Promise<void> {
  const { response: adminDenied, user } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const { error } = await supabase
    .from("leads")
    .update({ status: "descartado" })
    .eq("id", leadId)
    .is("converted_prospect_id", null)
  if (error) {
    logger.error("[ADMIN-LEADS] Error descartando lead:", error)
    throw new Error("Error al descartar el lead")
  }

  await logAdminAction(supabase, {
    actorId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    action: "lead_discard",
    entity: "leads",
    entityId: leadId,
  })
  revalidatePath("/admin/leads")
}

/** Devuelve un lead descartado a la bandeja. */
export async function restoreLead(leadId: number): Promise<void> {
  const { response: adminDenied, user } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const { error } = await supabase
    .from("leads")
    .update({ status: "nuevo" })
    .eq("id", leadId)
    .is("converted_prospect_id", null)
  if (error) {
    logger.error("[ADMIN-LEADS] Error restaurando lead:", error)
    throw new Error("Error al restaurar el lead")
  }

  await logAdminAction(supabase, {
    actorId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    action: "lead_restore",
    entity: "leads",
    entityId: leadId,
  })
  revalidatePath("/admin/leads")
}

async function patchCrmProspect(
  id: number,
  patch: Record<string, unknown>,
  alsoTouchLastContact = false,
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
  const { response: adminDenied, user } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }
  const { isCrmStatus } = await import("@/lib/crm-pipeline")
  if (!isCrmStatus(status)) {
    throw new Error("Estado CRM inválido")
  }
  await patchCrmProspect(id, { status }, true)

  const supabase = await createServiceClient()
  await logAdminAction(supabase, {
    actorId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    action: "crm_prospect_status",
    entity: "crm_prospects",
    entityId: id,
    detail: { status },
  })
  revalidatePath("/admin/leads")
}

export async function updateCrmProspectNotes(id: number, notes: string): Promise<void> {
  const { response: adminDenied, user } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }
  await patchCrmProspect(id, { notes: notes.trim() || null })

  const supabase = await createServiceClient()
  await logAdminAction(supabase, {
    actorId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    action: "crm_prospect_notes",
    entity: "crm_prospects",
    entityId: id,
  })
  revalidatePath("/admin/leads")
}

export async function setCrmProspectFollowUp(id: number, followUpAt: string | null): Promise<void> {
  const { response: adminDenied, user } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }
  if (followUpAt !== null && Number.isNaN(new Date(followUpAt).getTime())) {
    throw new Error("Fecha de seguimiento inválida")
  }
  await patchCrmProspect(id, { next_follow_up_at: followUpAt })

  const supabase = await createServiceClient()
  await logAdminAction(supabase, {
    actorId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    action: "crm_prospect_follow_up",
    entity: "crm_prospects",
    entityId: id,
    detail: { followUpAt },
  })
  revalidatePath("/admin/leads")
}

/**
 * Asigna o libera un prospecto. `sellerId = null` lo devuelve al pool sin
 * asignar, que es el estado natural de un lead web recién convertido.
 */
export async function assignCrmProspect(id: number, sellerId: string | null): Promise<void> {
  const { response: adminDenied, user } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  if (sellerId !== null) {
    const seller = await fetchProfileName(supabase, sellerId)
    if (!seller) {
      throw new Error("Vendedor no encontrado")
    }
  }

  await patchCrmProspect(id, { seller_id: sellerId })
  await logAdminAction(supabase, {
    actorId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    action: "crm_prospect_assign",
    entity: "crm_prospects",
    entityId: id,
    detail: { sellerId },
  })
  revalidatePath("/admin/leads")
}

/** Registra una actividad del prospecto (llamada, WhatsApp, visita, nota…). */
export async function addCrmActivity(
  prospectId: number,
  input: {
    type: string
    outcome?: string | null
    summary?: string | null
    direction?: string
    occurred_at?: string
  },
): Promise<void> {
  const { response: adminDenied, user } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const { ACTIVITY_TYPES, ACTIVITY_OUTCOMES } = await import("@/lib/comercializacion/types")
  if (!(ACTIVITY_TYPES as readonly string[]).includes(input.type)) {
    throw new Error("Tipo de actividad inválido")
  }
  if (input.outcome && !(ACTIVITY_OUTCOMES as readonly string[]).includes(input.outcome)) {
    throw new Error("Resultado de actividad inválido")
  }
  if (input.occurred_at && Number.isNaN(new Date(input.occurred_at).getTime())) {
    throw new Error("Fecha de actividad inválida")
  }

  const supabase = await createServiceClient()
  const occurredAt = input.occurred_at ?? new Date().toISOString()

  // `crm_activities.seller_id` es NOT NULL: el admin firma con su propio id,
  // que es justo lo que se quiere ver en el historial ("quién lo contactó").
  const { error } = await supabase.from("crm_activities").insert({
    prospect_id: prospectId,
    seller_id: user?.id ?? null,
    type: input.type,
    direction: input.direction ?? "saliente",
    outcome: input.outcome ?? null,
    summary: input.summary?.trim() || null,
    occurred_at: occurredAt,
  })
  if (error) {
    logger.error("[ADMIN-CRM] Error registrando actividad:", error)
    throw new Error("Error al registrar la actividad")
  }

  // La actividad mueve el prospecto: último contacto y, si seguía en `nuevo`,
  // pasa a `contactado`. Misma regla que la acción del vendedor.
  const { data: prospect } = await supabase
    .from("crm_prospects")
    .select("status")
    .eq("id", prospectId)
    .maybeSingle()
  const patch: Record<string, unknown> = { last_contact_at: occurredAt }
  if (prospect?.status === "nuevo") patch.status = "contactado"
  await patchCrmProspect(prospectId, patch)

  await logAdminAction(supabase, {
    actorId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    action: "crm_prospect_activity",
    entity: "crm_prospects",
    entityId: prospectId,
    detail: { type: input.type, outcome: input.outcome ?? null },
  })
  revalidatePath("/admin/leads")
}

// ============================================================
// FASE 14 — ANALÍTICA COMPARATIVA POR PERIODO
// ============================================================

export interface PeriodComparison {
  days: number
  orders: { current: number; previous: number; deltaPct: number | null; direction: "up" | "down" | "flat" }
  revenue: { current: number; previous: number; deltaPct: number | null; direction: "up" | "down" | "flat" }
  avgTicket: { current: number; previous: number; deltaPct: number | null; direction: "up" | "down" | "flat" }
  newCustomers: number
  recurringCustomers: number
  prevNewCustomers: number
  prevRecurringCustomers: number
}

/** Comparativa del periodo (7/30/90 días) contra el periodo anterior de igual duración. */
export async function getAdminPeriodComparison(days: number): Promise<PeriodComparison> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const { isPeriodDays, periodBounds, compareMetric, splitNewVsRecurring } = await import(
    "@/lib/analytics-periods"
  )
  if (!isPeriodDays(days)) {
    throw new Error("Periodo inválido (7, 30 o 90 días)")
  }

  const { since, prevSince } = periodBounds(days)
  const supabase = await createServiceClient()

  const [currentRes, prevRes, priorUsersRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, total, payment_status, user_id")
      .gte("created_at", since.toISOString()),
    supabase
      .from("orders")
      .select("id, total, payment_status, user_id")
      .gte("created_at", prevSince.toISOString())
      .lt("created_at", since.toISOString()),
    // user_ids con pedidos ANTES del periodo actual (para nuevo vs recurrente)
    supabase
      .from("orders")
      .select("user_id")
      .lt("created_at", since.toISOString())
      .not("user_id", "is", null)
      .limit(5000),
  ])

  if (currentRes.error || prevRes.error) {
    logger.error("[ADMIN-COMPARE] Error fetching orders:", currentRes.error ?? prevRes.error)
    throw new Error("Error al cargar la comparativa")
  }

  const current = currentRes.data ?? []
  const previous = prevRes.data ?? []
  const paidRevenue = (rows: typeof current) =>
    rows.filter((o) => o.payment_status === "paid").reduce((s, o) => s + Number(o.total), 0)

  const curRevenue = Math.round(paidRevenue(current) * 100) / 100
  const prevRevenue = Math.round(paidRevenue(previous) * 100) / 100
  const curPaidCount = current.filter((o) => o.payment_status === "paid").length
  const prevPaidCount = previous.filter((o) => o.payment_status === "paid").length

  const priorUserIds = new Set(
    (priorUsersRes.data ?? []).map((r) => r.user_id as string)
  )
  const curSplit = splitNewVsRecurring(current, priorUserIds)
  const prevSplit = splitNewVsRecurring(previous, priorUserIds)

  return {
    days,
    orders: compareMetric(current.length, previous.length),
    revenue: compareMetric(curRevenue, prevRevenue),
    avgTicket: compareMetric(
      curPaidCount > 0 ? Math.round((curRevenue / curPaidCount) * 100) / 100 : 0,
      prevPaidCount > 0 ? Math.round((prevRevenue / prevPaidCount) * 100) / 100 : 0
    ),
    newCustomers: curSplit.newCustomers,
    recurringCustomers: curSplit.recurringCustomers,
    prevNewCustomers: prevSplit.newCustomers,
    prevRecurringCustomers: prevSplit.recurringCustomers,
  }
}

// ============================================================
// FASE 44 — DESEMPEÑO POR CIUDAD
// ============================================================

/** Tope de lectura por tabla: evita traer un histórico ilimitado al servidor. */
const CITY_PERF_PAGE_SIZE = 1000
const CITY_PERF_MAX_ROWS = 20000

type AdminSupabase = Awaited<ReturnType<typeof createServiceClient>>

/**
 * Pedidos de una ventana, paginados. Solo se traen las columnas que alimentan
 * las métricas: sumar en SQL obligaría a una vista nueva y aquí el volumen es
 * de cientos de filas por periodo.
 */
async function fetchCityOrderRows(
  supabase: AdminSupabase,
  fromIso: string,
  untilIso: string | null
): Promise<{ rows: CityOrderRow[]; truncated: boolean }> {
  const rows: CityOrderRow[] = []
  for (let from = 0; from < CITY_PERF_MAX_ROWS; from += CITY_PERF_PAGE_SIZE) {
    let query = supabase
      .from("orders")
      .select("city_id, total, status, payment_status, source")
      .gte("created_at", fromIso)
      .order("created_at", { ascending: false })
      .range(from, from + CITY_PERF_PAGE_SIZE - 1)
    if (untilIso) query = query.lt("created_at", untilIso)

    const { data, error } = await query
    if (error) throw error
    const batch = data ?? []
    rows.push(...(batch as CityOrderRow[]))
    if (batch.length < CITY_PERF_PAGE_SIZE) break
  }
  return { rows, truncated: rows.length >= CITY_PERF_MAX_ROWS }
}

/**
 * Cobertura de catálogo por ciudad respetando la semántica de
 * `product_city_availability` (migración 00065): sin filas = global.
 * Devuelve `null` si la disponibilidad no se pudo leer, para que el dashboard
 * omita los tips de catálogo en lugar de mostrar una cobertura inventada.
 */
async function loadCityCatalogAvailability(
  supabase: AdminSupabase
): Promise<CatalogAvailabilityInput | null> {
  try {
    const visibleProducts = new Set<number>()
    for (let from = 0; from < CITY_PERF_MAX_ROWS; from += CITY_PERF_PAGE_SIZE) {
      const { data, error } = await supabase
        .from("products")
        .select("id")
        .eq("is_visible", true)
        .order("id", { ascending: true })
        .range(from, from + CITY_PERF_PAGE_SIZE - 1)
      if (error) throw error
      const batch = data ?? []
      for (const p of batch) visibleProducts.add(Number(p.id))
      if (batch.length < CITY_PERF_PAGE_SIZE) break
    }

    const restricted = new Set<number>()
    const availableByCity = new Map<number, number>()
    for (let from = 0; from < CITY_PERF_MAX_ROWS; from += CITY_PERF_PAGE_SIZE) {
      const { data, error } = await supabase
        .from("product_city_availability")
        .select("product_id, city_id, is_available")
        .order("product_id", { ascending: true })
        .range(from, from + CITY_PERF_PAGE_SIZE - 1)
      if (error) throw error
      const batch = data ?? []
      for (const row of batch) {
        const productId = Number(row.product_id)
        // Productos ocultos no cuentan en la cobertura de la tienda pública.
        if (!visibleProducts.has(productId)) continue
        restricted.add(productId)
        if (row.is_available === true) {
          const cityId = Number(row.city_id)
          availableByCity.set(cityId, (availableByCity.get(cityId) ?? 0) + 1)
        }
      }
      if (batch.length < CITY_PERF_PAGE_SIZE) break
    }

    return {
      totalProducts: visibleProducts.size,
      restrictedProducts: restricted.size,
      availableByCity,
    }
  } catch (error) {
    logger.error("[ADMIN-CITY-PERF] Error fetching catalog availability:", error)
    return null
  }
}

export interface AdminCityPerformance extends CityPerformanceResult {
  days: number
  /** `true` si se alcanzó el tope de lectura: los totales son parciales. */
  truncated: boolean
}

/**
 * Desempeño de cada ciudad de los últimos `days` días (incluye hoy), comparado
 * contra los `days` días anteriores. Las ventanas van alineadas a la
 * medianoche de CDMX para que "7 días" signifique días calendario y no una
 * rebanada arbitraria de 168 horas.
 */
export async function getAdminCityPerformance(days: number): Promise<AdminCityPerformance> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const { isPeriodDays } = await import("@/lib/analytics-periods")
  if (!isPeriodDays(days)) {
    throw new Error("Periodo inválido (7, 30 o 90 días)")
  }

  const supabase = await createServiceClient()
  const currentStart = mxMidnightUTC(-(days - 1))
  const previousStart = mxMidnightUTC(-(2 * days - 1))

  const [current, previous, citiesRes, catalog] = await Promise.all([
    fetchCityOrderRows(supabase, currentStart.toISOString(), null),
    fetchCityOrderRows(
      supabase,
      previousStart.toISOString(),
      currentStart.toISOString()
    ),
    supabase.from("cities").select("id, name, is_active").order("name", { ascending: true }),
    loadCityCatalogAvailability(supabase),
  ])

  if (citiesRes.error) {
    logger.error("[ADMIN-CITY-PERF] Error fetching cities:", citiesRes.error)
    throw new Error("Error al cargar las ciudades")
  }

  const result = buildCityPerformance({
    cities: (citiesRes.data ?? []) as CityRow[],
    currentOrders: current.rows,
    previousOrders: previous.rows,
    catalog,
  })

  return {
    ...result,
    days,
    truncated: current.truncated || previous.truncated,
  }
}

export interface AdminCityTip {
  cityId: number
  cityName: string
  days: number
  tip: string
  model: string
  generatedAt: string
}

function buildCityTipPrompt(
  row: CityPerformanceRow,
  context: {
    days: number
    medianAov: number
    maxCatalogCoverage: number | null
    revenueLeader: number
  }
): string {
  const lines = [
    `Ciudad: ${row.name} (${row.isActive ? "activa" : "inactiva"})`,
    `Ventana: últimos ${context.days} días`,
    `Pedidos válidos: ${row.orders} (periodo anterior: ${row.previousOrders})`,
    `Ingresos pagados: $${row.revenue} MXN (periodo anterior: $${row.previousRevenue})`,
    `Ticket promedio: $${row.aov} MXN (mediana de la operación: $${context.medianAov} MXN)`,
    `Tasa de cancelación: ${row.cancellationRate}%`,
    `Pedidos por WhatsApp: ${row.whatsappShare}% (${row.whatsappOrders} de ${row.orders})`,
    `Score de desempeño: ${row.score}/100 (nivel ${row.tier})`,
    `Mejor ciudad por ingresos: $${context.revenueLeader} MXN`,
  ]
  if (row.catalogCoverage !== null && context.maxCatalogCoverage !== null) {
    lines.push(
      `Catálogo disponible: ${row.catalogCoverage} productos (máximo entre ciudades: ${context.maxCatalogCoverage})`
    )
  }
  if (row.tips.length > 0) {
    lines.push(
      `Señales detectadas por reglas: ${row.tips.map((t) => t.title).join("; ")}`
    )
  }

  return [
    "Eres analista de operaciones de Resurte.me, una app de entregas de abarrotes y mandado a domicilio en México.",
    "A continuación están las métricas reales de una ciudad. Propón un plan de mejora para el equipo de operaciones.",
    "Reglas:",
    "- Español de México, tono directo y sin relleno.",
    "- Máximo 120 palabras.",
    "- Exactamente 3 acciones concretas, numeradas.",
    "- Cada acción debe indicar el responsable (catálogo, marketing, logística o soporte) y el impacto esperado.",
    "- Usa solo los datos proporcionados; no inventes cifras ni prometas resultados.",
    "- Si los datos no alcanzan para concluir algo, dilo en lugar de suponer.",
    "",
    ...lines,
  ].join("\n")
}

/**
 * Tip de IA bajo demanda para una ciudad. Recalcula las métricas en el
 * servidor: el cliente nunca manda números, solo el id de la ciudad.
 */
export async function getAdminCityTip(input: {
  cityId: number
  days: number
}): Promise<AdminCityTip> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  if (!Number.isInteger(input.cityId) || input.cityId <= 0) {
    throw new Error("Ciudad inválida")
  }

  const performance = await getAdminCityPerformance(input.days)
  const row =
    performance.cities.find((c) => c.cityId === input.cityId) ??
    performance.withoutOrders.find((c) => c.cityId === input.cityId)

  if (!row) {
    throw new Error("Ciudad no encontrada")
  }

  const { isKieAiConfigured, chatCompletion } = await import("@/lib/ai/kie-ai")
  if (!isKieAiConfigured()) {
    throw new Error("KIE_AI_API_KEY no está configurada. Ver docs/KIE_AI.md.")
  }

  const revenueLeader = Math.max(
    0,
    ...performance.cities.map((c) => c.revenue)
  )
  const prompt = buildCityTipPrompt(row, {
    days: input.days,
    medianAov: performance.medianAov,
    maxCatalogCoverage: performance.maxCatalogCoverage,
    revenueLeader: Math.round(revenueLeader * 100) / 100,
  })

  const result = await chatCompletion({
    // `model: ""` usa el modelo por defecto de la API (mismo criterio que bulk-seo).
    model: "",
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          "Eres analista de operaciones de Resurte.me. Respondes en español de México con acciones accionables y medibles.",
      },
      { role: "user", content: prompt },
    ],
  })

  const tip = result.content.trim()
  if (!tip) {
    throw new Error("La IA no devolvió una recomendación. Intenta de nuevo.")
  }

  return {
    cityId: row.cityId,
    cityName: row.name,
    days: input.days,
    tip,
    model: "kie-ai:default",
    generatedAt: new Date().toISOString(),
  }
}

// ============================================================
// FASE 15 — BITÁCORA DE AUDITORÍA (lectura)
// ============================================================

export interface AuditLogEntry {
  id: number
  actor_email: string | null
  action: string
  entity: string
  entity_id: string | null
  detail: Record<string, unknown>
  created_at: string
}

/** Lee la bitácora admin_audit_log con filtros por acción y rango de fechas. */
export async function getAdminAuditLog(filters?: {
  action?: string
  from?: string
  to?: string
}): Promise<AuditLogEntry[]> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const { normalizeAuditFilters, AUDIT_LOG_PAGE_SIZE } = await import("@/lib/audit-log")
  const f = normalizeAuditFilters(filters ?? {})

  const supabase = await createServiceClient()
  let query = supabase
    .from("admin_audit_log")
    .select("id, actor_email, action, entity, entity_id, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(AUDIT_LOG_PAGE_SIZE)

  if (f.action) query = query.eq("action", f.action)
  if (f.from) query = query.gte("created_at", new Date(`${f.from}T00:00:00`).toISOString())
  if (f.to) {
    const end = new Date(`${f.to}T00:00:00`)
    end.setDate(end.getDate() + 1)
    query = query.lt("created_at", end.toISOString())
  }

  const { data, error } = await query
  if (error) {
    logger.error("[ADMIN-AUDIT] Error fetching audit log:", error)
    throw new Error("Error al cargar la bitácora")
  }
  return (data ?? []) as AuditLogEntry[]
}

// ------------------------------------------------------------
// Multi-catálogo WhatsApp de la plataforma (master admin)
// ------------------------------------------------------------

export interface WaCatalogSummary {
  id: string
  slug: string
  name: string
  city_id: number | null
  city_name: string | null
  is_active: boolean
  items_count: number
}

export interface WaCatalogDetailItem {
  product_id: number
  position: number
  is_visible: boolean
  available_in_city: boolean | null // null = catálogo global
}

export async function listWaCatalogs(): Promise<WaCatalogSummary[]> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const { data: catalogs, error } = await supabase
    .from("whatsapp_catalogs")
    .select("id, slug, name, city_id, is_active")
    .order("created_at")
  if (error) throw new Error(error.message)
  if (!catalogs?.length) return []

  const cityIds = [...new Set(catalogs.map((c) => c.city_id).filter(Boolean))] as number[]
  const { data: cities } = cityIds.length
    ? await supabase.from("cities").select("id, name").in("id", cityIds)
    : { data: [] as { id: number; name: string }[] }
  const cityName = new Map((cities ?? []).map((c) => [c.id, c.name]))

  const { data: items } = await supabase
    .from("whatsapp_catalog_items")
    .select("catalog_id, is_visible")
  const countByCatalog = new Map<string, number>()
  for (const i of items ?? []) {
    if (!i.is_visible) continue
    countByCatalog.set(i.catalog_id, (countByCatalog.get(i.catalog_id) ?? 0) + 1)
  }

  return catalogs.map((c) => ({
    id: c.id as string,
    slug: c.slug as string,
    name: c.name as string,
    city_id: c.city_id as number | null,
    city_name: c.city_id ? cityName.get(c.city_id as number) ?? null : null,
    is_active: c.is_active as boolean,
    items_count: countByCatalog.get(c.id as string) ?? 0,
  }))
}

export async function createWaCatalog(name: string, cityId: number | null): Promise<void> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  let slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  if (cityId) {
    const { data: city } = await supabase.from("cities").select("slug").eq("id", cityId).maybeSingle()
    if (city?.slug) slug = city.slug
  }
  const { error } = await supabase
    .from("whatsapp_catalogs")
    .upsert({ slug, name: name.trim(), city_id: cityId }, { onConflict: "slug" })
  if (error) throw new Error(error.message)
  revalidatePath("/admin/whatsapp")
}

/** Detalle del catálogo: curaduría completa (visibles y no visibles). */
export async function getWaCatalogItems(catalogId: string): Promise<WaCatalogDetailItem[]> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const { data: catalog } = await supabase
    .from("whatsapp_catalogs")
    .select("city_id")
    .eq("id", catalogId)
    .maybeSingle()
  if (!catalog) throw new Error("Catálogo no encontrado")

  const { data: items, error } = await supabase
    .from("whatsapp_catalog_items")
    .select("product_id, position, is_visible")
    .eq("catalog_id", catalogId)
    .order("position")
  if (error) throw new Error(error.message)

  // Disponibilidad por ciudad (semántica opt-out de 00065)
  let availability = new Map<number, boolean>()
  if (catalog.city_id) {
    const { data: rows } = await supabase
      .from("product_city_availability")
      .select("product_id, is_available")
      .eq("city_id", catalog.city_id)
    const withRows = new Set((rows ?? []).map((r) => r.product_id))
    availability = new Map(
      (rows ?? []).map((r) => [r.product_id, r.is_available])
    )
    // productos sin fila: disponibles en todas las ciudades
    for (const i of items ?? []) {
      if (!withRows.has(i.product_id)) availability.set(i.product_id, true)
    }
  }

  return ((items ?? []) as { product_id: number; position: number; is_visible: boolean }[]).map((i) => ({
    ...i,
    available_in_city: catalog.city_id ? availability.get(i.product_id) ?? false : null,
  }))
}

/** Agrega/quita un producto de la curaduría (visible). */
export async function setWaCatalogProduct(
  catalogId: string,
  productId: number,
  visible: boolean
): Promise<void> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  if (visible) {
    const { data: maxRow } = await supabase
      .from("whatsapp_catalog_items")
      .select("position")
      .eq("catalog_id", catalogId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle()
    const { error } = await supabase
      .from("whatsapp_catalog_items")
      .upsert(
        { catalog_id: catalogId, product_id: productId, position: (maxRow?.position ?? 0) + 1, is_visible: true },
        { onConflict: "catalog_id,product_id" }
      )
    if (error) throw new Error(error.message)
    // WA5 — alta en curaduría: encolar para que el sync incremental lo suba.
    const { enqueueProductsForWaSync } = await import("@/lib/whatsapp-sync-queue")
    await enqueueProductsForWaSync(supabase, [productId], "catalog_curation_add")
  } else {
    const { error } = await supabase
      .from("whatsapp_catalog_items")
      .delete()
      .eq("catalog_id", catalogId)
      .eq("product_id", productId)
    if (error) throw new Error(error.message)
  }
  revalidatePath("/admin/whatsapp")
}

export interface WaMetaCatalogRow {
  retailer_id: string
  name: string
  status: WaCatalogs.MetaStoreMatchStatus
  metaPrice: number | null
  storePrice: number | null
  metaSalePrice: number | null
  storeSalePrice: number | null
  imageUrl: string | null
  metaAvailability: string | null
  metaReviewStatus: string | null
}

/**
 * Explorador del catálogo Meta (WD3): catálogo vivo cruzado con la
 * curaduría de la tienda, listo para la UI.
 */
export async function getWaMetaCatalog(catalogId: string): Promise<{
  rows: WaMetaCatalogRow[]
  metaTotal: number
}> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const wa = await import("@/lib/whatsapp-catalogs")
  const { getCatalogProducts } = await import("@/lib/whatsapp")

  const { config, catalog } = await wa.getCatalogWhatsAppConfig(supabase, catalogId)
  if (!config) throw new Error("No hay credenciales de WhatsApp configuradas")
  if (!catalog) throw new Error("Catálogo no encontrado")

  const [{ data: items }, { data: products }, metaProducts] = await Promise.all([
    supabase
      .from("whatsapp_catalog_items")
      .select("catalog_id, product_id, position, is_visible")
      .eq("catalog_id", catalogId),
    supabase.from("products").select("id, name, brand, category_id, image_url, price, sale_price, unit"),
    getCatalogProducts(config),
  ])

  const desired = wa.buildAdminCatalogProducts(
    (items ?? []) as WaCatalogs.WaCatalogItemRow[],
    (products ?? []) as WaCatalogs.AdminProduct[]
  )
  const comparison = wa.compareMetaVsStore(metaProducts, desired)

  const nameById = new Map<string, string>()
  for (const p of products ?? []) nameById.set(String(p.id), p.name as string)
  for (const mp of metaProducts) {
    if (mp.retailer_id && !nameById.has(mp.retailer_id)) nameById.set(mp.retailer_id, mp.name)
  }

  return {
    rows: comparison.map((c) => ({
      retailer_id: c.retailer_id,
      name: nameById.get(c.retailer_id) ?? `#${c.retailer_id}`,
      status: c.status,
      metaPrice: c.metaPrice,
      storePrice: c.storePrice,
      metaSalePrice: c.metaSalePrice,
      storeSalePrice: c.storeSalePrice,
      imageUrl: c.metaImageUrl ?? c.storeImageUrl,
      metaAvailability: c.metaAvailability,
      metaReviewStatus: c.metaReviewStatus,
    })),
    metaTotal: metaProducts.length,
  }
}

/**
 * Re-subida individual desde el explorador (WD3): corrige una diferencia
 * empujando el producto con los datos actuales de la tienda. Registra run
 * + item pending para que el resolvedor de handles confirme con Meta.
 */
export async function pushWaProductToMeta(
  catalogId: string,
  productId: number
): Promise<{ ok: boolean; error?: string }> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const wa = await import("@/lib/whatsapp-catalogs")
  const { batchCatalogItems, buildCatalogBatchRequests } = await import("@/lib/whatsapp")

  const { config } = await wa.getCatalogWhatsAppConfig(supabase, catalogId)
  if (!config) return { ok: false, error: "Sin credenciales de WhatsApp" }

  const { data: product } = await supabase
    .from("products")
    .select("id, name, brand, category_id, image_url, price, sale_price, unit, stock_status")
    .eq("id", productId)
    .maybeSingle()
  if (!product) return { ok: false, error: "Producto no encontrado" }

  const waProduct = wa.toWhatsAppProduct(product as WaCatalogs.AdminProduct & { stock_status?: string | null })
  if (!waProduct) return { ok: false, error: "Precio inválido" }
  const { valid, invalid } = wa.validateCatalogProducts([waProduct])
  if (valid.length === 0) {
    return { ok: false, error: invalid[0]?.reasons.join(", ") ?? "Datos inválidos" }
  }

  const result = await batchCatalogItems(buildCatalogBatchRequests(valid, "UPDATE"), config)

  // Run ligero para que el cron resuelva el handle y confirme el resultado.
  try {
    const { data: run } = await supabase
      .from("whatsapp_sync_runs")
      .insert({ catalog_id: catalogId, trigger_kind: "auto", status: "done", updated: 1, handles: result.handles, finished_at: new Date().toISOString() })
      .select("id")
      .single()
    if (run?.id) {
      await supabase.from("whatsapp_sync_items").insert({
        run_id: run.id as string,
        product_id: productId,
        action: "update",
        status: "pending",
      })
    }
  } catch (err) {
    logger.warn("No se pudo registrar el run del push individual", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return { ok: true }
}

/**
 * Elimina UN producto del catálogo de Meta (WE2). No toca la tienda:
 * si el producto sigue curado, volverá en el próximo sync (aparecerá
 * como diferencia "solo en tienda" hasta entonces).
 */
export async function deleteWaMetaProduct(
  catalogId: string,
  retailerId: string
): Promise<{ ok: boolean; error?: string }> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const wa = await import("@/lib/whatsapp-catalogs")
  const { deleteCatalogProductsByRetailer } = await import("@/lib/whatsapp")

  const { config } = await wa.getCatalogWhatsAppConfig(supabase, catalogId)
  if (!config) return { ok: false, error: "Sin credenciales de WhatsApp" }

  const result = await deleteCatalogProductsByRetailer([retailerId], config)

  // Trazabilidad: run ligero con el item delete pending.
  try {
    const productId = Number(retailerId)
    const { data: run } = await supabase
      .from("whatsapp_sync_runs")
      .insert({ catalog_id: catalogId, trigger_kind: "manual", status: "done", removed: 1, handles: result.handles, finished_at: new Date().toISOString() })
      .select("id")
      .single()
    if (run?.id && Number.isFinite(productId)) {
      await supabase.from("whatsapp_sync_items").insert({
        run_id: run.id as string,
        product_id: productId,
        action: "delete",
        status: "pending",
      })
    }
  } catch (err) {
    logger.warn("No se pudo registrar el run del delete individual", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return { ok: true }
}

/**
 * Cambia la disponibilidad de un producto en Meta (WE2).
 * Si existe en la tienda, la DB sigue siendo fuente única: se actualiza
 * products.stock_status y se empuja el producto completo. Si es un
 * producto "solo en Meta", el UPDATE va solo a Meta.
 */
export async function setWaMetaProductAvailability(
  catalogId: string,
  retailerId: string,
  inStock: boolean
): Promise<{ ok: boolean; error?: string }> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const wa = await import("@/lib/whatsapp-catalogs")
  const { setCatalogProductAvailability } = await import("@/lib/whatsapp")

  const { config } = await wa.getCatalogWhatsAppConfig(supabase, catalogId)
  if (!config) return { ok: false, error: "Sin credenciales de WhatsApp" }

  const availability = inStock ? "in stock" : "out of stock"
  const productId = Number(retailerId)

  let storeProduct: WaCatalogs.AdminProduct | null = null
  if (Number.isFinite(productId)) {
    const { data: product } = await supabase
      .from("products")
      .select("id, name, brand, category_id, image_url, price, sale_price, unit, stock_status")
      .eq("id", productId)
      .maybeSingle()
    if (product) {
      storeProduct = product as WaCatalogs.AdminProduct
      // DB fuente única: reflejar el cambio en la tienda también.
      const { error } = await supabase
        .from("products")
        .update({ stock_status: inStock ? "in_stock" : "out_of_stock" })
        .eq("id", productId)
      if (error) logger.warn("No se pudo actualizar stock_status", { productId, error: error.message })
    }
  }

  const waProduct = storeProduct
    ? wa.toWhatsAppProduct(storeProduct as WaCatalogs.AdminProduct & { stock_status?: string | null })
    : null

  await setCatalogProductAvailability(
    retailerId,
    availability,
    waProduct ? { ...waProduct, availability } : null,
    config
  )

  return { ok: true }
}

/**
 * Corrige TODAS las diferencias del explorador de una vez (WE2):
 * re-sube los productos con price_diff, sale_price_diff,
 * image_missing_meta y only_store en un solo batch y un solo run.
 */
export async function fixAllWaCatalogIssues(catalogId: string): Promise<{
  fixed: number
  skipped: number
  error?: string
}> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const wa = await import("@/lib/whatsapp-catalogs")
  const { batchCatalogItems, buildCatalogBatchRequests, getCatalogProducts } = await import("@/lib/whatsapp")

  const { config, catalog } = await wa.getCatalogWhatsAppConfig(supabase, catalogId)
  if (!config) return { fixed: 0, skipped: 0, error: "Sin credenciales de WhatsApp" }
  if (!catalog) return { fixed: 0, skipped: 0, error: "Catálogo no encontrado" }

  const [{ data: items }, { data: products }, metaProducts] = await Promise.all([
    supabase.from("whatsapp_catalog_items").select("catalog_id, product_id, position, is_visible").eq("catalog_id", catalogId),
    supabase.from("products").select("id, name, brand, category_id, image_url, price, sale_price, unit, stock_status"),
    getCatalogProducts(config),
  ])

  const desired = wa.buildAdminCatalogProducts(
    (items ?? []) as WaCatalogs.WaCatalogItemRow[],
    (products ?? []) as WaCatalogs.AdminProduct[]
  )
  const comparison = wa.compareMetaVsStore(metaProducts, desired)

  const FIXABLE = new Set(["price_diff", "sale_price_diff", "image_missing_meta", "only_store"])
  const fixableIds = comparison
    .filter((c) => FIXABLE.has(c.status))
    .map((c) => Number(c.retailer_id))
    .filter((n) => Number.isFinite(n))
  if (fixableIds.length === 0) return { fixed: 0, skipped: 0 }

  const productById = new Map((products ?? []).map((p) => [p.id as number, p]))
  const waProducts = fixableIds
    .map((id) => productById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => wa.toWhatsAppProduct(p as WaCatalogs.AdminProduct & { stock_status?: string | null }))
    .filter((p): p is NonNullable<typeof p> => p !== null)
  const { valid } = wa.validateCatalogProducts(waProducts)
  if (valid.length === 0) return { fixed: 0, skipped: fixableIds.length }

  const result = await batchCatalogItems(buildCatalogBatchRequests(valid, "UPDATE"), config)

  // Un solo run con todos los items pending.
  try {
    const { data: run } = await supabase
      .from("whatsapp_sync_runs")
      .insert({ catalog_id: catalogId, trigger_kind: "manual", status: "done", updated: valid.length, handles: result.handles, finished_at: new Date().toISOString() })
      .select("id")
      .single()
    if (run?.id) {
      await supabase.from("whatsapp_sync_items").insert(
        valid.map((p) => ({ run_id: run.id as string, product_id: Number(p.id), action: "update", status: "pending" }))
      )
    }
  } catch (err) {
    logger.warn("No se pudo registrar el run del fix-all", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return { fixed: valid.length, skipped: fixableIds.length - valid.length }
}

export interface WaCatalogCredentials {
  phone_number_id: string | null
  waba_id: string | null
  catalog_id: string | null
  display_phone: string | null
  is_active: boolean
  hasToken: boolean
}

/** Credenciales de un catálogo (sin el token; solo indicador). WC8. */
export async function getWaCatalogCredentials(catalogId: string): Promise<WaCatalogCredentials> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from("whatsapp_catalogs")
    .select("phone_number_id, waba_id, catalog_id, display_phone, access_token_enc, is_active")
    .eq("id", catalogId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("Catálogo no encontrado")
  return {
    phone_number_id: (data.phone_number_id as string | null) ?? null,
    waba_id: (data.waba_id as string | null) ?? null,
    catalog_id: (data.catalog_id as string | null) ?? null,
    display_phone: (data.display_phone as string | null) ?? null,
    is_active: data.is_active as boolean,
    hasToken: Boolean(data.access_token_enc),
  }
}

/**
 * Guarda credenciales de un catálogo (WC8). El token se cifra con AES-GCM
 * y NUNCA se devuelve; "" lo borra (fallback a la WABA de plataforma);
 * undefined lo deja intacto.
 */
export async function updateWaCatalogCredentials(
  catalogId: string,
  fields: {
    phone_number_id?: string | null
    waba_id?: string | null
    catalog_id?: string | null
    display_phone?: string | null
    is_active?: boolean
    accessToken?: string | null
  }
): Promise<void> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const updates: Record<string, unknown> = {}
  if ("phone_number_id" in fields) updates.phone_number_id = fields.phone_number_id || null
  if ("waba_id" in fields) updates.waba_id = fields.waba_id || null
  if ("catalog_id" in fields) updates.catalog_id = fields.catalog_id || null
  if ("display_phone" in fields) updates.display_phone = fields.display_phone || null
  if ("is_active" in fields) updates.is_active = fields.is_active
  if (typeof fields.accessToken === "string") {
    const { encryptToken } = await import("@/lib/foodos-whatsapp")
    updates.access_token_enc = fields.accessToken.trim() ? encryptToken(fields.accessToken.trim()) : null
  }
  if (Object.keys(updates).length === 0) return

  const { error } = await supabase.from("whatsapp_catalogs").update(updates).eq("id", catalogId)
  if (error) throw new Error(error.message)
  revalidatePath("/admin/whatsapp")
}

/** Prueba la conexión a Meta con las credenciales efectivas (WC9). */
export async function testWaCatalogConnection(catalogId: string): Promise<{
  ok: boolean
  latencyMs: number
  catalogName: string | null
  error: string | null
  usingPlatformFallback: boolean
}> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const wa = await import("@/lib/whatsapp-catalogs")
  const { testCatalogConnection } = await import("@/lib/whatsapp")
  const { config, catalog } = await wa.getCatalogWhatsAppConfig(supabase, catalogId)
  if (!config) {
    return { ok: false, latencyMs: 0, catalogName: null, error: "Sin credenciales configuradas", usingPlatformFallback: false }
  }
  const result = await testCatalogConnection(config)
  const usingPlatformFallback = !(catalog && (catalog as { access_token_enc?: string | null }).access_token_enc)
  return { ...result, usingPlatformFallback }
}

// ============================================================
// WF4 — Plantillas de mensajes administrables
// ============================================================

export interface WaTemplateRow {
  id: number
  template_name: string
  template_type: string
  language: string
  status: string
}

const WA_TEMPLATE_TYPES = new Set(["broadcast", "payment_reminder", "birthday", "reactivation", "rating", "onboarding"])

/** Tienda de la plataforma para filas de whatsapp_templates. */
async function platformStoreId(supabase: Awaited<ReturnType<typeof createServiceClient>>): Promise<number> {
  const { data, error } = await supabase
    .from("stores")
    .select("id")
    .eq("is_active", true)
    .order("id")
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("No hay tienda activa configurada")
  return data.id as number
}

/** Lista las plantillas registradas (WF4). */
export async function listWaTemplates(): Promise<WaTemplateRow[]> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from("whatsapp_templates")
    .select("id, template_name, template_type, language, status")
    .order("template_name")
  if (error) throw new Error(error.message)
  return (data ?? []) as WaTemplateRow[]
}

/** Registra una plantilla manualmente (queda pendiente de Meta). */
export async function createWaTemplate(fields: {
  template_name: string
  template_type: string
  language?: string
}): Promise<void> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const name = fields.template_name.trim().toLowerCase()
  if (!/^[a-z0-9_]{2,60}$/.test(name)) {
    throw new Error("El nombre debe ser minúsculas, números y guion bajo (2–60)")
  }
  if (!WA_TEMPLATE_TYPES.has(fields.template_type)) {
    throw new Error("Tipo de plantilla inválido")
  }
  const supabase = await createServiceClient()
  const storeId = await platformStoreId(supabase)

  const { data: existing } = await supabase
    .from("whatsapp_templates")
    .select("id")
    .eq("template_name", name)
    .maybeSingle()
  if (existing) throw new Error(`La plantilla "${name}" ya existe`)

  const { error } = await supabase.from("whatsapp_templates").insert({
    store_id: storeId,
    template_name: name,
    template_id: name,
    template_type: fields.template_type,
    language: fields.language?.trim() || "es_MX",
    status: "pending",
  })
  if (error) throw new Error(error.message)
  revalidatePath("/admin/whatsapp")
}

/** Cambia el estado de una plantilla (approved/pending/rejected). */
export async function setWaTemplateStatus(id: number, status: string): Promise<void> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  if (!["approved", "pending", "rejected"].includes(status)) {
    throw new Error("Estado inválido")
  }
  const supabase = await createServiceClient()
  const { error } = await supabase.from("whatsapp_templates").update({ status }).eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/admin/whatsapp")
}

/** Elimina una plantilla del registro. */
export async function deleteWaTemplate(id: number): Promise<void> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()
  const { error } = await supabase.from("whatsapp_templates").delete().eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/admin/whatsapp")
}

/**
 * Sincroniza el estado real de las plantillas desde Meta (WF4):
 * trae /{waba}/message_templates y crea/actualiza las filas locales.
 */
export async function syncWaTemplatesFromMeta(): Promise<{ created: number; updated: number; total: number }> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()
  const { listMessageTemplates } = await import("@/lib/whatsapp")

  const metaTemplates = await listMessageTemplates()
  const storeId = await platformStoreId(supabase)

  let created = 0
  let updated = 0
  for (const tpl of metaTemplates) {
    const status = tpl.status.toLowerCase()
    const localStatus = status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending"
    const { data: existing } = await supabase
      .from("whatsapp_templates")
      .select("id, status")
      .eq("template_name", tpl.name)
      .maybeSingle()

    if (existing) {
      if (existing.status !== localStatus) {
        await supabase.from("whatsapp_templates").update({ status: localStatus }).eq("id", existing.id as number)
        updated++
      }
    } else {
      // Tipo por defecto: broadcast (el enum no tiene "utility/marketing").
      await supabase.from("whatsapp_templates").insert({
        store_id: storeId,
        template_name: tpl.name,
        template_id: tpl.id,
        template_type: "broadcast",
        language: tpl.language || "es_MX",
        status: localStatus,
      })
      created++
    }
  }

  revalidatePath("/admin/whatsapp")
  return { created, updated, total: metaTemplates.length }
}

/** Agrega varios productos a la curaduría de una vez (WC7). */
export async function bulkAddWaCatalogProducts(
  catalogId: string,
  productIds: number[]
): Promise<number> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  if (productIds.length === 0) return 0
  const supabase = await createServiceClient()

  const { data: maxRow } = await supabase
    .from("whatsapp_catalog_items")
    .select("position")
    .eq("catalog_id", catalogId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()
  let next = (maxRow?.position as number | undefined) ?? 0

  const rows = productIds.map((product_id) => ({
    catalog_id: catalogId,
    product_id,
    position: ++next,
    is_visible: true,
  }))
  const { error } = await supabase
    .from("whatsapp_catalog_items")
    .upsert(rows, { onConflict: "catalog_id,product_id" })
  if (error) throw new Error(error.message)

  // WA5 — encolar para sync incremental.
  const { enqueueProductsForWaSync } = await import("@/lib/whatsapp-sync-queue")
  await enqueueProductsForWaSync(supabase, productIds, "catalog_curation_add")

  revalidatePath("/admin/whatsapp")
  return rows.length
}

/** Quita varios productos de la curaduría de una vez (WC7). */
export async function bulkRemoveWaCatalogProducts(
  catalogId: string,
  productIds: number[]
): Promise<number> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  if (productIds.length === 0) return 0
  const supabase = await createServiceClient()

  const { error } = await supabase
    .from("whatsapp_catalog_items")
    .delete()
    .eq("catalog_id", catalogId)
    .in("product_id", productIds)
  if (error) throw new Error(error.message)
  revalidatePath("/admin/whatsapp")
  return productIds.length
}

/** Reordena la curaduría: array ordenado de product_ids (posiciones 1..N). */
export async function reorderWaCatalog(
  catalogId: string,
  orderedProductIds: number[]
): Promise<void> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  for (let i = 0; i < orderedProductIds.length; i++) {
    const { error } = await supabase
      .from("whatsapp_catalog_items")
      .update({ position: i + 1 })
      .eq("catalog_id", catalogId)
      .eq("product_id", orderedProductIds[i])
    if (error) throw new Error(error.message)
  }
  revalidatePath("/admin/whatsapp")
}

export interface WaSyncRunSummary {
  id: string
  trigger_kind: string
  status: string
  added: number
  updated: number
  removed: number
  stale_count: number
  error: string | null
  started_at: string
  finished_at: string | null
}

/** Historial de syncs de un catálogo (más recientes primero). */
export async function getWaCatalogSyncHistory(
  catalogId: string,
  limit = 10
): Promise<WaSyncRunSummary[]> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from("whatsapp_sync_runs")
    .select("id, trigger_kind, status, added, updated, removed, stale_count, error, started_at, finished_at")
    .eq("catalog_id", catalogId)
    .order("started_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as WaSyncRunSummary[]
}

/** Pendientes en la cola de sync automático de un catálogo. */
export async function getWaCatalogQueueCount(catalogId: string): Promise<number> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const { count, error } = await supabase
    .from("whatsapp_sync_queue")
    .select("id", { count: "exact", head: true })
    .eq("catalog_id", catalogId)
    .is("processed_at", null)
  if (error) throw new Error(error.message)
  return count ?? 0
}

/** Procesa manualmente la cola de sync automático (admin). */
export async function processWaSyncQueueNow(): Promise<{
  catalogs: number
  synced: number
  failed: number
  resolvedRuns: number
  orphansFailed: number
}> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const { processWaSyncQueue } = await import("@/lib/whatsapp-sync-queue")
  const { resolvePendingSyncRuns } = await import("@/lib/whatsapp-batch-status")
  const queue = await processWaSyncQueue()
  // WB2/WB5 — también resolver handles pendientes y runs huérfanos.
  const resolution = await resolvePendingSyncRuns().catch(() => null)
  return {
    ...queue,
    resolvedRuns: resolution?.runsResolved ?? 0,
    orphansFailed: resolution?.orphansFailed ?? 0,
  }
}

/** Núcleo de reintento de UN producto de un run (upsert directo + nuevo handle). */
async function retryWaProductCore(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  runId: string,
  productId: number
): Promise<{ ok: boolean; error?: string }> {
  const wa = await import("@/lib/whatsapp-catalogs")
  const { batchCatalogItems, buildCatalogBatchRequests } = await import("@/lib/whatsapp")

  const { data: run } = await supabase
    .from("whatsapp_sync_runs")
    .select("id, catalog_id, handles")
    .eq("id", runId)
    .maybeSingle()
  if (!run) return { ok: false, error: "Corrida no encontrada" }

  const { config } = await wa.getCatalogWhatsAppConfig(supabase, run.catalog_id as string)
  if (!config) return { ok: false, error: "Sin credenciales de WhatsApp" }

  const { data: product } = await supabase
    .from("products")
    .select("id, name, brand, category_id, image_url, price, sale_price, unit, stock_status")
    .eq("id", productId)
    .maybeSingle()
  if (!product) return { ok: false, error: "Producto no encontrado" }

  const waProduct = wa.toWhatsAppProduct(product as WaCatalogs.AdminProduct & { stock_status?: string | null })
  if (!waProduct) return { ok: false, error: "Precio inválido" }

  const { valid, invalid } = wa.validateCatalogProducts([waProduct])
  if (valid.length === 0) {
    return { ok: false, error: invalid[0]?.reasons.join(", ") ?? "Datos inválidos" }
  }

  const result = await batchCatalogItems(buildCatalogBatchRequests(valid, "UPDATE"), config)

  // El item vuelve a pending y el run acumula el nuevo handle para que el
  // resolvedor (cron / Procesar cola) confirme el resultado con Meta.
  await supabase
    .from("whatsapp_sync_items")
    .upsert(
      { run_id: runId, product_id: productId, action: "update", status: "pending", error: null },
      { onConflict: "run_id,product_id", ignoreDuplicates: false }
    )
  const handles = Array.isArray(run.handles) ? (run.handles as string[]) : []
  await supabase
    .from("whatsapp_sync_runs")
    .update({ handles: [...handles, ...result.handles], error: null })
    .eq("id", runId)

  return { ok: true }
}

/** Reintenta UN producto fallido de una corrida (WB3). */
export async function retryWaSyncProduct(
  runId: string,
  productId: number
): Promise<{ ok: boolean; error?: string }> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()
  return retryWaProductCore(supabase, runId, productId)
}

/** Reintenta todos los productos con error de un run (WB3). */
export async function retryWaFailedProducts(
  catalogId: string,
  runId?: string
): Promise<{ retried: number; failed: number; errors: string[] }> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  let targetRunId = runId
  if (!targetRunId) {
    const { data: lastRun } = await supabase
      .from("whatsapp_sync_runs")
      .select("id")
      .eq("catalog_id", catalogId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    targetRunId = lastRun?.id as string | undefined
  }
  if (!targetRunId) return { retried: 0, failed: 0, errors: ["Sin corridas para este catálogo"] }

  const { data: errorItems } = await supabase
    .from("whatsapp_sync_items")
    .select("product_id")
    .eq("run_id", targetRunId)
    .eq("status", "error")
  const productIds = [...new Set((errorItems ?? []).map((i) => i.product_id as number))]

  let retried = 0
  const errors: string[] = []
  for (const productId of productIds) {
    const result = await retryWaProductCore(supabase, targetRunId, productId)
    if (result.ok) retried++
    else errors.push(`${productId}: ${result.error}`)
  }
  return { retried, failed: productIds.length - retried, errors }
}

export interface WaSyncItemDetail {
  product_id: number
  product_name: string
  action: string
  status: string
  error: string | null
}

/** Items (detalle por producto) de una corrida de sync (WB4). */
export async function getWaRunItems(runId: string): Promise<WaSyncItemDetail[]> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const { data: items, error } = await supabase
    .from("whatsapp_sync_items")
    .select("product_id, action, status, error")
    .eq("run_id", runId)
    .order("product_id")
  if (error) throw new Error(error.message)

  const productIds = (items ?? []).map((i) => i.product_id as number)
  const { data: products } = productIds.length
    ? await supabase.from("products").select("id, name").in("id", productIds)
    : { data: [] as { id: number; name: string }[] }
  const nameById = new Map((products ?? []).map((p) => [p.id, p.name]))

  return ((items ?? []) as { product_id: number; action: string; status: string; error: string | null }[]).map((i) => ({
    ...i,
    product_name: nameById.get(i.product_id) ?? `#${i.product_id}`,
  }))
}

export interface WaQueueItem {
  id: string
  product_id: number
  product_name: string
  reason: string
  attempts: number
  queued_at: string
}

/** Pendientes de la cola de sync automático con nombre de producto (WB4). */
export async function getWaCatalogQueue(catalogId: string): Promise<WaQueueItem[]> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const { data: rows, error } = await supabase
    .from("whatsapp_sync_queue")
    .select("id, product_id, reason, attempts, queued_at")
    .eq("catalog_id", catalogId)
    .is("processed_at", null)
    .order("queued_at")
  if (error) throw new Error(error.message)

  const productIds = (rows ?? []).map((r) => r.product_id as number)
  const { data: products } = productIds.length
    ? await supabase.from("products").select("id, name").in("id", productIds)
    : { data: [] as { id: number; name: string }[] }
  const nameById = new Map((products ?? []).map((p) => [p.id, p.name]))

  return ((rows ?? []) as Omit<WaQueueItem, "product_name">[]).map((r) => ({
    ...r,
    product_name: nameById.get(r.product_id) ?? `#${r.product_id}`,
  }))
}

/** Quita un item de la cola de sync (admin, WB4). */
export async function removeWaQueueItem(queueItemId: string): Promise<void> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()
  const { error } = await supabase.from("whatsapp_sync_queue").delete().eq("id", queueItemId)
  if (error) throw new Error(error.message)
}

/** Destinatarios de la difusión por ciudad (deduplicados, acotados). */
async function resolveBroadcastAudience(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  catalogId: string,
  limit: number
): Promise<string[]> {
  const { data: catalog } = await supabase
    .from("whatsapp_catalogs")
    .select("city_id")
    .eq("id", catalogId)
    .maybeSingle()
  const phones = new Set<string>()

  if (catalog?.city_id) {
    const { data: orders } = await supabase
      .from("orders")
      .select("customer_phone")
      .eq("city_id", catalog.city_id as number)
      .not("customer_phone", "is", null)
      .limit(2000)
    for (const o of orders ?? []) {
      const digits = String(o.customer_phone ?? "").replace(/\D/g, "")
      if (digits.length >= 10) phones.add(digits)
    }
  }

  // Perfiles con consentimiento de marketing (cualquier ciudad sin catálogo
  // propio también recibe el catálogo global).
  const { data: profiles } = await supabase
    .from("profiles")
    .select("phone")
    .eq("marketing_consent", true)
    .not("phone", "is", null)
    .limit(2000)
  for (const p of profiles ?? []) {
    const digits = String(p.phone ?? "").replace(/\D/g, "")
    if (digits.length >= 10) phones.add(digits)
  }

  return [...phones].slice(0, limit)
}

/** Conteo previo de la audiencia de difusión (WF3). */
export async function countWaBroadcastAudience(catalogId: string): Promise<number> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()
  const phones = await resolveBroadcastAudience(supabase, catalogId, 10_000)
  return phones.length
}

const BROADCAST_HARD_LIMIT = 200

/**
 * Difunde el catálogo (product_list) a una audiencia (WF3).
 * audience "city_customers": pedidos de la ciudad + perfiles con
 * marketing_consent. audience "manual": lista de teléfonos del admin.
 * Bitácora por destinatario en whatsapp_automation_sends (dedupe por día).
 */
export async function broadcastWaCatalog(
  catalogId: string,
  opts: { audience: "city_customers" | "manual"; manualPhones?: string[]; limit?: number }
): Promise<{ sent: number; skipped: number; failed: number; errors: string[] }> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const wa = await import("@/lib/whatsapp-catalogs")
  const { sendProductListMessage } = await import("@/lib/whatsapp")

  const { config, catalog } = await wa.getCatalogWhatsAppConfig(supabase, catalogId)
  if (!config) throw new Error("No hay credenciales de WhatsApp configuradas")
  if (!catalog) throw new Error("Catálogo no encontrado")

  const limit = Math.min(opts.limit ?? BROADCAST_HARD_LIMIT, BROADCAST_HARD_LIMIT)

  const recipients =
    opts.audience === "manual"
      ? (opts.manualPhones ?? [])
          .map((p) => p.replace(/\D/g, ""))
          .filter((d) => d.length >= 10)
          .slice(0, limit)
      : await resolveBroadcastAudience(supabase, catalogId, limit)

  if (recipients.length === 0) throw new Error("La audiencia está vacía")

  // Secciones del product_list en el orden exacto de la curaduría.
  const [{ data: items }, { data: products }, { data: categories }] = await Promise.all([
    supabase.from("whatsapp_catalog_items").select("catalog_id, product_id, position, is_visible").eq("catalog_id", catalogId),
    supabase.from("products").select("id, name, brand, category_id, image_url, price, sale_price, unit"),
    supabase.from("categories").select("id, name"),
  ])
  const catName = new Map((categories ?? []).map((c) => [c.id, c.name]))
  const adminProducts = ((products ?? []) as WaCatalogs.AdminProduct[]).map((p) => ({
    ...p,
    category_name: p.category_id ? catName.get(p.category_id) ?? null : null,
  }))
  const sections = wa.buildAdminProductListSections(
    (items ?? []) as WaCatalogs.WaCatalogItemRow[],
    adminProducts
  )
  if (!sections.length) throw new Error("El catálogo está vacío")

  const day = dayKeyOf(DEFAULT_TIMEZONE)
  let sent = 0
  let skipped = 0
  let failed = 0
  const errors: string[] = []

  for (const phone of recipients) {
    // Dedupe por día vía la bitácora de envíos.
    const { count } = await supabase
      .from("whatsapp_automation_sends")
      .select("id", { count: "exact", head: true })
      .eq("dedupe_key", `broadcast_catalog:${phone}:${day}`)
    if ((count ?? 0) > 0) {
      skipped++
      continue
    }

    let status: "sent" | "failed" = "sent"
    let detail: string | null = null
    try {
      const res = await sendProductListMessage(
        {
          to: phone,
          sections,
          headerText: catalog.name,
          bodyText: "Elige tus productos y te los llevamos:",
        },
        config
      )
      detail = res.id
      sent++
    } catch (err) {
      status = "failed"
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      detail = msg
      if (errors.length < 5) errors.push(`${phone}: ${msg}`)
    }

    const { error: logError } = await supabase.from("whatsapp_automation_sends").insert({
      automation_type: "broadcast_catalog",
      recipient: phone,
      dedupe_key: `broadcast_catalog:${phone}:${day}`,
      status,
      detail,
    })
    if (logError && logError.code !== "23505") {
      logger.warn("No se pudo registrar el envío de difusión", { error: logError.message })
    }
  }

  return { sent, skipped, failed, errors }
}

/** Previsualiza el diff del sync sin tocar Meta (WA2/WA6). */
export async function previewWaCatalogSync(catalogId: string): Promise<{
  diff: WaCatalogs.WaCatalogSyncDiff
  metaTotal: number
  invalid: WaCatalogs.InvalidCatalogProduct[]
}> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const wa = await import("@/lib/whatsapp-catalogs")
  const { getCatalogProducts } = await import("@/lib/whatsapp")

  const { config, catalog } = await wa.getCatalogWhatsAppConfig(supabase, catalogId)
  if (!config) throw new Error("No hay credenciales de WhatsApp configuradas")
  if (!catalog) throw new Error("Catálogo no encontrado")

  const { data: items } = await supabase
    .from("whatsapp_catalog_items")
    .select("catalog_id, product_id, position, is_visible")
    .eq("catalog_id", catalogId)
  const { data: products } = await supabase
    .from("products")
    .select("id, name, brand, category_id, image_url, price, sale_price, unit")

  const desired = wa.buildAdminCatalogProducts(
    (items ?? []) as WaCatalogs.WaCatalogItemRow[],
    (products ?? []) as WaCatalogs.AdminProduct[]
  )
  const metaProducts = await getCatalogProducts(config)
  const { valid, invalid } = wa.validateCatalogProducts(desired)
  return {
    diff: wa.buildCatalogSyncDiff(valid, metaProducts),
    metaTotal: metaProducts.length,
    invalid,
  }
}

interface WaSyncCoreResult {
  runId: string | null
  added: number
  updated: number
  removed: number
  stale: string[]
  invalid: WaCatalogs.InvalidCatalogProduct[]
}

/** Núcleo del sync: ejecuta y registra el run (manual o automático). */
async function runWaCatalogSync(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  catalogId: string,
  opts: { deleteUnknown?: boolean; triggerKind: "manual" | "auto" }
): Promise<WaSyncCoreResult> {
  const wa = await import("@/lib/whatsapp-catalogs")
  const { getCatalogWhatsAppConfig, buildAdminCatalogProducts } = wa
  const { syncCatalog, getCatalogProducts } = await import("@/lib/whatsapp")

  const { config, catalog } = await getCatalogWhatsAppConfig(supabase, catalogId)
  if (!config) throw new Error("No hay credenciales de WhatsApp configuradas")
  if (!catalog) throw new Error("Catálogo no encontrado")

  const { data: items } = await supabase
    .from("whatsapp_catalog_items")
    .select("catalog_id, product_id, position, is_visible")
    .eq("catalog_id", catalogId)
  const { data: products } = await supabase
    .from("products")
    .select("id, name, brand, category_id, image_url, price, sale_price, unit")

  const desired = buildAdminCatalogProducts(
    (items ?? []) as WaCatalogs.WaCatalogItemRow[],
    (products ?? []) as WaCatalogs.AdminProduct[]
  )
  // Meta lista "más reciente primero": subir en orden inverso al deseado.
  // WA7: excluir los productos que Meta rechazaría (se reportan al admin).
  const { valid: validDesired, invalid } = wa.validateCatalogProducts(desired.reverse())

  // Historial: run en 'running' (best-effort; no bloquea el sync).
  let runId: string | null = null
  try {
    const { data: run } = await supabase
      .from("whatsapp_sync_runs")
      .insert({ catalog_id: catalogId, trigger_kind: opts.triggerKind, status: "running" })
      .select("id")
      .single()
    runId = (run?.id as string) ?? null
  } catch (err) {
    logger.warn("No se pudo registrar el inicio del sync", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    const result = await syncCatalog(validDesired, config, { deleteUnknown: opts.deleteUnknown })

    // Persistir el id de Meta por producto (whatsapp_product_id).
    try {
      const metaProducts = await getCatalogProducts(config)
      const desiredIds = new Set(validDesired.map((p) => p.id))
      for (const mp of metaProducts) {
        if (!desiredIds.has(mp.retailer_id)) continue
        const { error } = await supabase
          .from("products")
          .update({ whatsapp_product_id: mp.id })
          .eq("id", Number(mp.retailer_id))
        if (error) logger.warn("No se pudo guardar whatsapp_product_id", { product: mp.retailer_id, error: error.message })
      }
    } catch (err) {
      logger.warn("No se pudieron persistir los ids de Meta tras el sync", {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    if (runId) {
      const { error } = await supabase
        .from("whatsapp_sync_runs")
        .update({
          status: "done",
          added: result.added,
          updated: result.updated,
          removed: result.removed,
          stale_count: result.stale.length,
          handles: result.handles,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId)
      if (error) logger.warn("No se pudo cerrar el run de sync", { error: error.message })

      // WB2 — detalle por producto: enviados como pending (Meta los resuelve
      // vía handles) y los excluidos por validación como error/skipped.
      try {
        const itemRows = [
          ...result.createdIds.map((id) => ({ run_id: runId, product_id: Number(id), action: "create", status: "pending" })),
          ...result.updatedIds.map((id) => ({ run_id: runId, product_id: Number(id), action: "update", status: "pending" })),
          ...result.removedIds.map((id) => ({ run_id: runId, product_id: Number(id), action: "delete", status: "pending" })),
          ...invalid.map((p) => ({
            run_id: runId,
            product_id: Number(p.id),
            action: "skipped",
            status: "error",
            error: p.reasons.join(", "),
          })),
        ]
        if (itemRows.length > 0) {
          const { error: itemsError } = await supabase.from("whatsapp_sync_items").insert(itemRows)
          if (itemsError) logger.warn("No se pudieron registrar los items del sync", { error: itemsError.message })
        }
      } catch (itemsErr) {
        logger.warn("Registro de items del sync falló (best-effort)", {
          error: itemsErr instanceof Error ? itemsErr.message : String(itemsErr),
        })
      }
    }

    return {
      runId,
      added: result.added,
      updated: result.updated,
      removed: result.removed,
      stale: result.stale,
      invalid,
    }
  } catch (err) {
    if (runId) {
      await supabase
        .from("whatsapp_sync_runs")
        .update({
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId)
    }
    throw err
  }
}

/** Sincroniza la curaduría del catálogo al catálogo nativo de WhatsApp. */
export async function syncWaCatalog(
  catalogId: string,
  opts?: { deleteUnknown?: boolean }
): Promise<{
  added: number
  updated: number
  removed: number
  stale: string[]
  invalid: WaCatalogs.InvalidCatalogProduct[]
}> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const result = await runWaCatalogSync(supabase, catalogId, {
    deleteUnknown: opts?.deleteUnknown,
    triggerKind: "manual",
  })
  return {
    added: result.added,
    updated: result.updated,
    removed: result.removed,
    stale: result.stale,
    invalid: result.invalid,
  }
}

/** Envía el catálogo ordenado (product_list) a un teléfono. */
export async function sendWaCatalogToPhone(
  catalogId: string,
  toPhone: string
): Promise<void> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")
  const supabase = await createServiceClient()

  const wa = await import("@/lib/whatsapp-catalogs")
  const { sendProductListMessage } = await import("@/lib/whatsapp")
  const { config, catalog } = await wa.getCatalogWhatsAppConfig(supabase, catalogId)
  if (!config) throw new Error("No hay credenciales de WhatsApp configuradas")

  const [{ data: items }, { data: products }, { data: categories }] = await Promise.all([
    supabase.from("whatsapp_catalog_items").select("catalog_id, product_id, position, is_visible").eq("catalog_id", catalogId),
    supabase.from("products").select("id, name, brand, category_id, image_url, price, sale_price, unit"),
    supabase.from("categories").select("id, name"),
  ])
  const catName = new Map((categories ?? []).map((c) => [c.id, c.name]))
  const adminProducts = ((products ?? []) as WaCatalogs.AdminProduct[]).map((p) => ({
    ...p,
    category_name: p.category_id ? catName.get(p.category_id) ?? null : null,
  }))
  const sections = wa.buildAdminProductListSections(
    (items ?? []) as WaCatalogs.WaCatalogItemRow[],
    adminProducts
  )
  if (!sections.length) throw new Error("El catálogo está vacío")

  const digits = toPhone.replace(/\D/g, "")
  if (digits.length < 10) throw new Error("Teléfono inválido")
  await sendProductListMessage(
    {
      to: digits,
      sections,
      headerText: catalog?.name ?? "Catálogo",
      bodyText: "Elige tus productos y te los llevamos:",
    },
    config
  )
}

// ============================================================
// FoodOS — administración de restaurantes y niveles
// ============================================================

/** Fila del listado de restaurantes FoodOS con su nivel y uso real. */
export interface AdminFoodosRestaurantRow {
  id: string
  name: string
  slug: string
  status: string
  ownerId: string | null
  ownerEmail: string | null
  createdAt: string
  /** Nivel ganado por compras calificadas del dueño. */
  earnedTier: CashbackTier
  /** Nivel efectivo (ganado + override vigente). */
  tier: CashbackTier
  overridden: boolean
  overrideReason: string | null
  overrideExpiresAt: string | null
  /** Semanas calificadas del mes en curso. */
  qualifyingWeeksThisMonth: number
  /** Gasto del dueño en la semana ISO en curso (MXN). */
  weekSpend: number
  /** Capacidades premium abiertas por el nivel efectivo. */
  features: FoodosFeature[]
  aiSessions: number
  aiMessages: number
  deliveries: number
}

/** Ventana de órdenes a leer: cubre la semana ISO en curso aunque cruce mes. */
const FOODOS_TIER_LOOKBACK_DAYS = 45

/** Tope de restaurantes listados de una sola vez. */
const FOODOS_ADMIN_LIST_LIMIT = 200

interface AdminTierOverride {
  tier: string
  reason: string | null
  expires_at: string | null
}

/**
 * Listado de restaurantes FoodOS con nivel ganado, nivel efectivo, override
 * y uso real de las capacidades premium.
 *
 * El nivel NO se recalcula por restaurante (sería N consultas): se leen todas
 * las órdenes pagadas de la ventana y todos los overrides en dos consultas, y
 * el cálculo puro (`earnedTierFromOrders`) se aplica en memoria.
 */
export async function getAdminFoodosRestaurants(): Promise<AdminFoodosRestaurantRow[]> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const { data: restaurants, error } = await supabase
    .from("foodos_restaurants")
    .select("id, name, slug, status, user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(FOODOS_ADMIN_LIST_LIMIT)

  if (error) {
    logger.error("admin.foodosRestaurants.restaurants", error)
    throw new Error("No se pudieron cargar los restaurantes")
  }

  const rows = restaurants ?? []
  if (rows.length === 0) return []

  const ownerIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
  const restaurantIds = rows.map((r) => r.id)
  const since = new Date(
    Date.now() - FOODOS_TIER_LOOKBACK_DAYS * 86400000
  ).toISOString()

  const [ordersRes, overridesRes, usersRes, sessionsRes, messagesRes, deliveriesRes] =
    await Promise.all([
      ownerIds.length
        ? supabase
            .from("orders")
            .select("user_id, created_at, total")
            .in("user_id", ownerIds)
            .eq("payment_status", "paid")
            .neq("status", "cancelled")
            .gte("created_at", since)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("foodos_entitlement_overrides")
        .select("restaurant_id, tier, reason, expires_at")
        .in("restaurant_id", restaurantIds),
      // El correo vive en `auth.users`, no en `profiles`.
      ownerIds.length
        ? supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
        : Promise.resolve({ data: { users: [] }, error: null }),
      supabase.from("foodos_ai_sessions").select("restaurant_id").in("restaurant_id", restaurantIds),
      supabase.from("foodos_ai_messages").select("restaurant_id").in("restaurant_id", restaurantIds),
      supabase.from("foodos_deliveries").select("restaurant_id").in("restaurant_id", restaurantIds),
    ])

  for (const [label, res] of [
    ["orders", ordersRes],
    ["overrides", overridesRes],
    ["users", usersRes],
    ["aiSessions", sessionsRes],
    ["aiMessages", messagesRes],
    ["deliveries", deliveriesRes],
  ] as const) {
    if (res.error) logger.warn("admin.foodosRestaurants.query", { label, error: res.error.message })
  }

  // Órdenes agrupadas por dueño: el nivel es del dueño, no del restaurante.
  const ordersByOwner = new Map<string, RewardsOrder[]>()
  for (const order of ordersRes.data ?? []) {
    const owner = order.user_id
    if (!owner) continue
    const list = ordersByOwner.get(owner) ?? []
    list.push({ created_at: order.created_at, total: order.total })
    ordersByOwner.set(owner, list)
  }

  const overrideByRestaurant = new Map<string, AdminTierOverride>()
  for (const row of overridesRes.data ?? []) {
    overrideByRestaurant.set(row.restaurant_id, {
      tier: row.tier,
      reason: row.reason,
      expires_at: row.expires_at,
    })
  }

  const emailByOwner = new Map<string, string>()
  const wantedOwners = new Set(ownerIds)
  for (const authUser of usersRes.data?.users ?? []) {
    if (authUser.email && wantedOwners.has(authUser.id)) {
      emailByOwner.set(authUser.id, authUser.email)
    }
  }

  const countByRestaurant = (data: { restaurant_id: string }[] | null) => {
    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      counts.set(row.restaurant_id, (counts.get(row.restaurant_id) ?? 0) + 1)
    }
    return counts
  }

  const sessions = countByRestaurant(sessionsRes.data)
  const messages = countByRestaurant(messagesRes.data)
  const deliveries = countByRestaurant(deliveriesRes.data)

  const now = new Date()

  return rows.map((r) => {
    const { tier: earned, progress } = earnedTierFromOrders(ordersByOwner.get(r.user_id) ?? [], now)
    const override = overrideByRestaurant.get(r.id) ?? null
    const { tier, overridden } = effectiveTier(earned, override, now)
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      ownerId: r.user_id ?? null,
      ownerEmail: emailByOwner.get(r.user_id) ?? null,
      createdAt: r.created_at,
      earnedTier: earned,
      tier,
      overridden,
      overrideReason: overridden ? (override?.reason ?? null) : null,
      overrideExpiresAt: overridden ? (override?.expires_at ?? null) : null,
      qualifyingWeeksThisMonth: progress.qualifyingWeeksThisMonth,
      weekSpend: progress.weekSpend,
      features: featuresForTier(tier),
      aiSessions: sessions.get(r.id) ?? 0,
      aiMessages: messages.get(r.id) ?? 0,
      deliveries: deliveries.get(r.id) ?? 0,
    }
  })
}

/**
 * Concede, cambia o revoca el nivel de un restaurante.
 *
 * Conceder `Verde` equivale a revocar: el override se borra y vuelve a mandar
 * el nivel ganado por compras (misma regla que `effectiveTier`).
 */
export async function setFoodosTierOverride(
  restaurantId: string,
  tier: string,
  reason?: string | null,
  expiresAt?: string | null
): Promise<void> {
  const { user, response: adminDenied } = await requireAdmin()
  if (adminDenied || !user) {
    throw new Error("Acceso restringido a administradores")
  }

  if (!isCashbackTier(tier)) {
    throw new Error("Nivel inválido")
  }

  const supabase = await createServiceClient()

  if (tier === "Verde") {
    const { error } = await supabase
      .from("foodos_entitlement_overrides")
      .delete()
      .eq("restaurant_id", restaurantId)
    if (error) {
      logger.error("admin.foodosTierOverride.delete", error, { restaurantId })
      throw new Error("No se pudo revocar el nivel")
    }
    revalidatePath("/admin/restaurantes")
    return
  }

  const { error } = await supabase.from("foodos_entitlement_overrides").upsert(
    {
      restaurant_id: restaurantId,
      tier,
      reason: reason?.trim().slice(0, 500) || null,
      granted_by: user.id,
      expires_at: expiresAt || null,
    },
    { onConflict: "restaurant_id" }
  )

  if (error) {
    logger.error("admin.foodosTierOverride.upsert", error, { restaurantId })
    throw new Error("No se pudo guardar el nivel")
  }

  revalidatePath("/admin/restaurantes")
}

// ============================================================
// FoodOS — KPIs de adopción por capacidad (Fase 9)
// ============================================================

/**
 * Fuentes de actividad de cada capacidad.
 *
 * `app_marca` no aparece: el manifest PWA y el icono se sirven derivados de la
 * configuración del restaurante y no dejan rastro en la base, así que no hay
 * nada honesto que medir. Se reporta aparte en `untracked` en vez de fingir un
 * 0%, que se leería como "nadie la usa".
 */
const ADOPTION_SOURCES: Record<
  Exclude<FoodosFeature, "app_marca">,
  {
    table: string
    column: string
    onlyOk?: boolean
    notNull?: boolean
    /** Filtro extra para fuentes que comparten tabla con otros canales. */
    eq?: { column: string; value: string }
  }
> = {
  marketing_ia: { table: "foodos_campaigns", column: "sent_at" },
  flotilla: { table: "foodos_deliveries", column: "created_at" },
  mesero_ia: { table: "foodos_ai_sessions", column: "created_at" },
  // Venta en mostrador: un pedido con ese canal es la prueba de que la caja
  // nativa se usa. `foodos_orders` es compartida con web/qr/whatsapp, así que
  // sin el filtro de canal contaríamos como mostrador pedidos que no lo son.
  pos_mostrador: {
    table: "foodos_orders",
    column: "created_at",
    eq: { column: "channel", value: "mostrador" },
  },
  // Comandero: abrir una cuenta de mesa ya es adoptar el comandero, sin
  // importar si la mesa terminó cerrada.
  comandero: { table: "foodos_table_tickets", column: "created_at" },
  wallet_passes: { table: "foodos_wallet_passes", column: "created_at" },
  // Solo las aprobadas: un borrador que la IA generó y el dueño nunca revisó
  // no es adopción del sitio. El filtro de no-nulos no es cosmético: en un
  // `ORDER BY ... DESC` Postgres pone los NULL primero, así que sin él los
  // borradores desplazarían a las páginas aprobadas del tope de lectura.
  sitio_ia: {
    table: "foodos_seo_pages",
    column: "approved_at",
    notNull: true,
  },
  pos_integraciones: { table: "foodos_pos_sync_log", column: "created_at", onlyOk: true },
  catering: { table: "foodos_catering_requests", column: "created_at" },
}

/** Tope de filas leídas por fuente. */
const ADOPTION_ACTIVITY_LIMIT = 5000

export interface AdminFoodosAdoption {
  windowDays: number
  features: FeatureAdoption[]
  summary: AdoptionSummary
  /** Capacidades abiertas por nivel que la base no puede medir. */
  untracked: FoodosFeature[]
}

interface AdoptionActivityRow {
  restaurant_id: string
  [column: string]: unknown
}

/**
 * KPIs de adopción de las capacidades premium.
 *
 * Tres consultas fijas (restaurantes, overrides, órdenes del dueño) más una por
 * capacidad. Igual que `getAdminFoodosRestaurants`, el nivel no se recalcula
 * por restaurante: se lee todo de golpe y el cálculo puro se aplica en memoria.
 *
 * Cada lectura de actividad es best-effort: si una fuente falla, esa capacidad
 * queda en cero y se registra el aviso, pero el panel sigue cargando.
 */
export async function getAdminFoodosAdoption(): Promise<AdminFoodosAdoption> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const { data: restaurants, error } = await supabase
    .from("foodos_restaurants")
    .select("id, name, user_id")
    .order("created_at", { ascending: false })
    .limit(FOODOS_ADMIN_LIST_LIMIT)

  if (error) {
    logger.error("admin.foodosAdoption.restaurants", error)
    throw new Error("No se pudieron cargar los restaurantes")
  }

  const rows = restaurants ?? []
  if (rows.length === 0) {
    return {
      windowDays: ADOPTION_WINDOW_DAYS,
      features: [],
      summary: {
        restaurants: 0,
        activeRestaurants: 0,
        dormantRestaurants: 0,
        averageUnlocked: 0,
      },
      untracked: ["app_marca"],
    }
  }

  const ownerIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
  const restaurantIds = rows.map((r) => r.id)
  const since = new Date(Date.now() - FOODOS_TIER_LOOKBACK_DAYS * 86400000).toISOString()

  const featureKeys = Object.keys(ADOPTION_SOURCES) as (keyof typeof ADOPTION_SOURCES)[]

  const [ordersRes, overridesRes, ...activityRes] = await Promise.all([
    ownerIds.length
      ? supabase
          .from("orders")
          .select("user_id, created_at, total")
          .in("user_id", ownerIds)
          .eq("payment_status", "paid")
          .neq("status", "cancelled")
          .gte("created_at", since)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("foodos_entitlement_overrides")
      .select("restaurant_id, tier, expires_at")
      .in("restaurant_id", restaurantIds),
    ...featureKeys.map((feature) => {
      const src = ADOPTION_SOURCES[feature]
      let query = supabase
        .from(src.table)
        .select(`restaurant_id, ${src.column}`)
        .in("restaurant_id", restaurantIds)
        .order(src.column, { ascending: false })
        .limit(ADOPTION_ACTIVITY_LIMIT)
      if (src.onlyOk) query = query.eq("status", "ok")
      if (src.notNull) query = query.not(src.column, "is", null)
      if (src.eq) query = query.eq(src.eq.column, src.eq.value)
      return query
    }),
  ])

  for (const [label, res] of [
    ["orders", ordersRes],
    ["overrides", overridesRes],
    ...activityRes.map((res, i) => [`activity:${featureKeys[i]}`, res] as const),
  ] as const) {
    if (res.error) logger.warn("admin.foodosAdoption.query", { label, error: res.error.message })
  }

  const ordersByOwner = new Map<string, RewardsOrder[]>()
  for (const order of ordersRes.data ?? []) {
    const owner = order.user_id
    if (!owner) continue
    const list = ordersByOwner.get(owner) ?? []
    list.push({ created_at: order.created_at, total: order.total })
    ordersByOwner.set(owner, list)
  }

  const overrideByRestaurant = new Map<
    string,
    { tier: string; expires_at: string | null }
  >()
  for (const row of overridesRes.data ?? []) {
    overrideByRestaurant.set(row.restaurant_id, { tier: row.tier, expires_at: row.expires_at })
  }

  const now = new Date()

  const states: RestaurantFeatureState[] = rows.map((r) => {
    const { tier: earned } = earnedTierFromOrders(ordersByOwner.get(r.user_id) ?? [], now)
    const { tier } = effectiveTier(earned, overrideByRestaurant.get(r.id) ?? null, now)
    return { restaurantId: r.id, name: r.name, unlocked: featuresForTier(tier) }
  })

  const activity: FeatureActivity[] = []

  featureKeys.forEach((feature, index) => {
    const src = ADOPTION_SOURCES[feature]
    const res = activityRes[index]
    const data = (res?.data ?? []) as unknown as AdoptionActivityRow[]
    if (data.length >= ADOPTION_ACTIVITY_LIMIT) {
      logger.warn("admin.foodosAdoption.truncated", {
        feature,
        table: src.table,
        limit: ADOPTION_ACTIVITY_LIMIT,
      })
    }

    const stampsByRestaurant = new Map<string, (string | null)[]>()
    for (const row of data) {
      const stamp = row[src.column]
      const list = stampsByRestaurant.get(row.restaurant_id) ?? []
      list.push(typeof stamp === "string" ? stamp : null)
      stampsByRestaurant.set(row.restaurant_id, list)
    }

    for (const [restaurantId, stamps] of stampsByRestaurant) {
      activity.push({
        restaurantId,
        feature,
        ...bucketUsage(stamps, now),
      })
    }
  })

  // `app_marca` no se mide: se devuelve fuera de `features` para que nadie lea
  // su 0% como "nadie la usa" cuando en realidad es "no hay nada que medir".
  const untracked: FoodosFeature[] = ["app_marca"]

  return {
    windowDays: ADOPTION_WINDOW_DAYS,
    features: computeFeatureAdoption(states, activity).filter(
      (row) => !untracked.includes(row.feature)
    ),
    summary: summarizeAdoption(states, activity),
    untracked,
  }
}
