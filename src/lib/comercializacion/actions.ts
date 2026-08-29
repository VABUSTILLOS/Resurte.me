"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { requireSellerOrAdminAction } from "@/lib/roles"
import { logger } from "@/lib/logger"
import { getWeekBounds, getMonthBounds, getTodayBounds } from "./dates"
import { getCommissionRate } from "./commissions"
import {
  ACTIVITY_TYPES,
  PROSPECT_STATUSES,
  type Prospect,
  type Activity,
  type ActivityType,
  type ActivityDirection,
  type DashboardKpis,
  type FollowUp,
  type ClientToReorder,
  type AssistedOrderSummary,
  type CatalogProduct,
  type ClientAddress,
  type SellerClientSummary,
  type ProspectStatus,
  type LastOrderSummary,
  type WeeklyTrendsReport,
} from "./types"

/**
 * Escapa caracteres especiales para interpolar texto de usuario en
 * patrones `ilike` / filtros `or()` de PostgREST (%, _, comas, paréntesis,
 * comillas, backslash). Sin esto, una búsqueda como "50%" o "a,b" rompe
 * la sintaxis del filtro o altera los resultados.
 */
function escapeIlike(raw: string): string {
  return raw.replace(/[\\%_,()."]/g, (c) => `\\${c}`)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function digitsOf(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "")
}

export type DuplicateMatch = {
  /** Dígitos del teléfono buscado que coincidió. */
  phone: string
  prospectId: number
  prospectName: string
}

/**
 * Busca prospectos del vendedor que ya tienen alguno de los teléfonos dados
 * (comparando solo dígitos, contra phone y whatsapp). Para advertir
 * duplicados antes de crear o importar.
 */
export async function findDuplicatesByPhone(
  phones: string[]
): Promise<DuplicateMatch[]> {
  const { userId, role } = await requireSellerOrAdminAction()
  const wanted = new Map<string, string>()
  for (const p of phones) {
    const d = digitsOf(p)
    if (d.length >= 8) wanted.set(d, d)
  }
  if (wanted.size === 0) return []

  const supabase = await createServiceClient()
  const query = supabase
    .from("crm_prospects")
    .select("id, name, phone, whatsapp")
    .limit(2000)
  if (role !== "admin") query.eq("seller_id", userId)
  const { data, error } = await query

  if (error) {
    logger.error("[CRM] findDuplicatesByPhone error:", error)
    return []
  }

  const matches: DuplicateMatch[] = []
  for (const row of data ?? []) {
    const existing = [digitsOf(row.phone as string | null), digitsOf(row.whatsapp as string | null)]
    for (const d of existing) {
      // Coincidencia exacta o por últimos 10 dígitos (con/sin código de país).
      const tail = d.length > 10 ? d.slice(-10) : d
      for (const w of wanted.keys()) {
        const wTail = w.length > 10 ? w.slice(-10) : w
        if (d === w || (tail.length >= 10 && tail === wTail)) {
          matches.push({
            phone: w,
            prospectId: Number(row.id),
            prospectName: String(row.name),
          })
          break
        }
      }
    }
  }
  return matches
}

/** Validaciones ligeras de contacto para prospectos (errores en español). */
function validateProspectContact(input: {
  name?: string | null
  email?: string | null
  phone?: string | null
  whatsapp?: string | null
}) {
  if (input.name !== undefined && input.name !== null && !input.name.trim()) {
    throw new Error("El nombre del contacto es obligatorio")
  }
  if (input.email && !EMAIL_RE.test(input.email.trim())) {
    throw new Error("El correo no tiene un formato válido")
  }
  for (const [label, value] of [
    ["teléfono", input.phone],
    ["WhatsApp", input.whatsapp],
  ] as const) {
    if (value) {
      const digits = value.replace(/\D/g, "")
      if (digits.length < 8 || digits.length > 15) {
        throw new Error(`El ${label} debe tener entre 8 y 15 dígitos`)
      }
    }
  }
}

function mapProspect(row: Record<string, unknown>): Prospect {
  return {
    id: Number(row.id),
    seller_id: String(row.seller_id),
    name: String(row.name),
    restaurant_name: (row.restaurant_name as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    whatsapp: (row.whatsapp as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    city_id: row.city_id != null ? Number(row.city_id) : null,
    city_name: (row.city_name as string | null) ?? null,
    tier: row.tier != null ? Number(row.tier) : null,
    zone: (row.zone as string | null) ?? null,
    status: row.status as ProspectStatus,
    user_id: (row.user_id as string | null) ?? null,
    referral_code: (row.referral_code as string | null) ?? null,
    last_contact_at: (row.last_contact_at as string | null) ?? null,
    next_follow_up_at: (row.next_follow_up_at as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    source: (row.source as string) ?? "manual",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

// ============================================================
// PROSPECTOS
// ============================================================

export interface ProspectFilters {
  status?: ProspectStatus | "todos"
  q?: string
  onlyPending?: boolean
  /** Máximo de filas (default 200) para no traer la tabla completa. */
  limit?: number
  /** Desplazamiento para paginación ("Cargar más"). */
  offset?: number
}

export async function getProspects(
  filters: ProspectFilters = {}
): Promise<Prospect[]> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()

  const limit = filters.limit ?? 200
  const offset = filters.offset ?? 0

  let query = supabase
    .from("crm_prospects")
    .select("*, cities(name)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  // El admin ve la cartera completa; el vendedor solo la suya
  if (role !== "admin") query = query.eq("seller_id", userId)

  if (filters.status && filters.status !== "todos") {
    query = query.eq("status", filters.status)
  }
  if (filters.q) {
    const q = escapeIlike(filters.q.trim())
    query = query.or(
      `name.ilike.%${q}%,restaurant_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`
    )
  }

  const { data, error } = await query
  if (error) {
    logger.error("[CRM] getProspects error:", error)
    throw new Error("Error al cargar los prospectos")
  }

  let prospects = (data ?? []).map((row) =>
    mapProspect({ ...row, city_name: (row.cities as { name?: string } | null)?.name ?? null })
  )

  if (filters.onlyPending) {
    const now = new Date().toISOString()
    prospects = prospects.filter(
      (p) => p.status === "nuevo" || (p.next_follow_up_at && p.next_follow_up_at <= now)
    )
  }

  return prospects
}

export interface ProspectInput {
  name: string
  restaurant_name?: string | null
  phone?: string | null
  whatsapp?: string | null
  email?: string | null
  city_id?: number | null
  tier?: number | null
  zone?: string | null
  status?: ProspectStatus
  next_follow_up_at?: string | null
  notes?: string | null
}

export async function createProspect(input: ProspectInput): Promise<Prospect> {
  const { userId } = await requireSellerOrAdminAction()
  validateProspectContact(input)

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from("crm_prospects")
    .insert({
      seller_id: userId,
      name: input.name.trim(),
      restaurant_name: input.restaurant_name?.trim() || null,
      phone: input.phone?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      email: input.email?.trim() || null,
      city_id: input.city_id ?? null,
      tier: input.tier ?? null,
      zone: input.zone ?? null,
      status: input.status ?? "nuevo",
      next_follow_up_at: input.next_follow_up_at || null,
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single()

  if (error) {
    logger.error("[CRM] createProspect error:", error)
    throw new Error("Error al crear el prospecto")
  }
  return mapProspect(data as Record<string, unknown>)
}

export async function updateProspect(
  id: number,
  input: Partial<ProspectInput>
): Promise<Prospect> {
  const { userId, role } = await requireSellerOrAdminAction()
  validateProspectContact(input)
  if (input.status !== undefined && !PROSPECT_STATUSES.includes(input.status)) {
    throw new Error("Estado de prospecto inválido")
  }
  const supabase = await createServiceClient()

  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.restaurant_name !== undefined)
    patch.restaurant_name = input.restaurant_name?.trim() || null
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null
  if (input.whatsapp !== undefined) patch.whatsapp = input.whatsapp?.trim() || null
  if (input.email !== undefined) patch.email = input.email?.trim() || null
  if (input.city_id !== undefined) patch.city_id = input.city_id ?? null
  if (input.tier !== undefined) patch.tier = input.tier ?? null
  if (input.zone !== undefined) patch.zone = input.zone ?? null
  if (input.status !== undefined) patch.status = input.status
  if (input.next_follow_up_at !== undefined)
    patch.next_follow_up_at = input.next_follow_up_at || null
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null

  const query = supabase
    .from("crm_prospects")
    .update(patch)
    .eq("id", id)
  if (role !== "admin") query.eq("seller_id", userId)
  const { data, error } = await query.select("*, cities(name)").single()

  if (error) {
    logger.error("[CRM] updateProspect error:", error)
    throw new Error("Error al actualizar el prospecto")
  }
  return mapProspect({
    ...data,
    city_name: (data.cities as { name?: string } | null)?.name ?? null,
  })
}

export async function deleteProspect(id: number): Promise<void> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const query = supabase
    .from("crm_prospects")
    .delete()
    .eq("id", id)
  if (role !== "admin") query.eq("seller_id", userId)
  const { error } = await query
  if (error) {
    logger.error("[CRM] deleteProspect error:", error)
    throw new Error("Error al eliminar el prospecto")
  }
}

export interface BulkProspectRow {
  name: string
  restaurant_name?: string | null
  phone?: string | null
  whatsapp?: string | null
  email?: string | null
  city_name?: string | null
  notes?: string | null
}

export async function bulkCreateProspects(rows: BulkProspectRow[]): Promise<{
  created: number
  errors: { row: number; message: string }[]
}> {
  const { userId } = await requireSellerOrAdminAction()
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("No hay filas para importar")
  }
  if (rows.length > 200) {
    throw new Error("Máximo 200 prospectos por importación")
  }

  const supabase = await createServiceClient()

  // Mapeo ciudad (nombre → id) para resolver city_name por fila
  const { data: cities } = await supabase.from("cities").select("id, name")
  const cityMap = new Map<string, number>()
  for (const c of cities ?? []) {
    cityMap.set(String(c.name).trim().toLowerCase(), Number(c.id))
  }

  // Validar todo primero; si hay errores no se inserta nada
  const errors: { row: number; message: string }[] = []
  const prepared = rows.map((row, idx) => {
    try {
      validateProspectContact(row)
    } catch (e) {
      errors.push({ row: idx + 1, message: e instanceof Error ? e.message : "Fila inválida" })
      return null
    }
    const cityKey = row.city_name?.trim().toLowerCase()
    let city_id: number | null = null
    if (cityKey) {
      city_id = cityMap.get(cityKey) ?? null
      if (city_id === null) {
        errors.push({ row: idx + 1, message: `Ciudad "${row.city_name}" no existe en el catálogo` })
        return null
      }
    }
    return {
      seller_id: userId,
      name: row.name.trim(),
      restaurant_name: row.restaurant_name?.trim() || null,
      phone: row.phone?.trim() || null,
      whatsapp: row.whatsapp?.trim() || null,
      email: row.email?.trim() || null,
      city_id,
      status: "nuevo",
      notes: row.notes?.trim() || null,
      source: "import",
    }
  })

  if (errors.length > 0) return { created: 0, errors }

  const toInsert = prepared.filter((r): r is NonNullable<typeof r> => r !== null)
  const { error } = await supabase.from("crm_prospects").insert(toInsert)
  if (error) {
    logger.error("[CRM] bulkCreateProspects error:", error)
    throw new Error("Error al importar los prospectos")
  }
  return { created: toInsert.length, errors: [] }
}

// ============================================================
// DETALLE + ACTIVIDADES
// ============================================================

export async function getProspectDetail(id: number): Promise<{
  prospect: Prospect
  activities: Activity[]
}> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()

  const prospectQuery = supabase
    .from("crm_prospects")
    .select("*, cities(name)")
    .eq("id", id)
  if (role !== "admin") prospectQuery.eq("seller_id", userId)
  const { data: prospect, error } = await prospectQuery.single()

  if (error || !prospect) {
    throw new Error("Prospecto no encontrado")
  }

  const { data: activities } = await supabase
    .from("crm_activities")
    .select("*")
    .eq("prospect_id", id)
    .order("occurred_at", { ascending: false })

  return {
    prospect: mapProspect({
      ...prospect,
      city_name: (prospect.cities as { name?: string } | null)?.name ?? null,
    }),
    activities: (activities ?? []).map((a) => ({
      id: Number(a.id),
      prospect_id: Number(a.prospect_id),
      seller_id: String(a.seller_id),
      type: a.type as ActivityType,
      direction: a.direction as ActivityDirection,
      outcome: (a.outcome as string | null) ?? null,
      summary: (a.summary as string | null) ?? null,
      duration_seconds: a.duration_seconds != null ? Number(a.duration_seconds) : null,
      occurred_at: String(a.occurred_at),
      created_at: String(a.created_at),
    })),
  }
}

export interface ActivityInput {
  type: ActivityType
  direction?: ActivityDirection
  outcome?: string | null
  summary?: string | null
  duration_seconds?: number | null
}

export async function addActivity(
  prospectId: number,
  input: ActivityInput
): Promise<void> {
  const { userId, role } = await requireSellerOrAdminAction()
  if (!ACTIVITY_TYPES.includes(input.type)) {
    throw new Error("Tipo de actividad inválido")
  }
  if (
    input.duration_seconds != null &&
    (!Number.isFinite(input.duration_seconds) || input.duration_seconds <= 0)
  ) {
    throw new Error("La duración debe ser mayor a 0")
  }
  const supabase = await createServiceClient()

  // Verificar propiedad
  const ownerQuery = supabase
    .from("crm_prospects")
    .select("id, status")
    .eq("id", prospectId)
  if (role !== "admin") ownerQuery.eq("seller_id", userId)
  const { data: prospect, error: ownerErr } = await ownerQuery.single()
  if (ownerErr || !prospect) {
    throw new Error("Prospecto no encontrado")
  }

  const { error } = await supabase.from("crm_activities").insert({
    prospect_id: prospectId,
    seller_id: userId,
    type: input.type,
    direction: input.direction ?? "saliente",
    outcome: input.outcome ?? null,
    summary: input.summary?.trim() || null,
    duration_seconds: input.duration_seconds ?? null,
  })
  if (error) {
    logger.error("[CRM] addActivity error:", error)
    throw new Error("Error al registrar la actividad")
  }

  // Refrescar last_contact_at y promocionar de "nuevo" a "contactado"
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { last_contact_at: now }
  if (prospect.status === "nuevo") patch.status = "contactado"
  await supabase.from("crm_prospects").update(patch).eq("id", prospectId)
}

export async function updateActivity(
  id: number,
  input: Partial<ActivityInput>
): Promise<void> {
  const { userId, role } = await requireSellerOrAdminAction()
  if (input.type !== undefined && !ACTIVITY_TYPES.includes(input.type)) {
    throw new Error("Tipo de actividad inválido")
  }
  if (
    input.duration_seconds != null &&
    (!Number.isFinite(input.duration_seconds) || input.duration_seconds <= 0)
  ) {
    throw new Error("La duración debe ser mayor a 0")
  }
  const supabase = await createServiceClient()

  const patch: Record<string, unknown> = {}
  if (input.type !== undefined) patch.type = input.type
  if (input.direction !== undefined) patch.direction = input.direction
  if (input.outcome !== undefined) patch.outcome = input.outcome ?? null
  if (input.summary !== undefined) patch.summary = input.summary?.trim() || null
  if (input.duration_seconds !== undefined)
    patch.duration_seconds = input.duration_seconds ?? null

  const query = supabase
    .from("crm_activities")
    .update(patch)
    .eq("id", id)
  if (role !== "admin") query.eq("seller_id", userId)
  const { error } = await query
  if (error) {
    logger.error("[CRM] updateActivity error:", error)
    throw new Error("Error al actualizar la actividad")
  }
}

export async function deleteActivity(id: number): Promise<void> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const query = supabase
    .from("crm_activities")
    .delete()
    .eq("id", id)
  if (role !== "admin") query.eq("seller_id", userId)
  const { error } = await query
  if (error) {
    logger.error("[CRM] deleteActivity error:", error)
    throw new Error("Error al eliminar la actividad")
  }
}

// ============================================================
// VINCULACIÓN DE CUENTA
// ============================================================

/** Pedidos pagados del usuario vinculado a un prospecto (para comisión). */
export async function getProspectClientOrders(prospectId: number): Promise<{
  orders: Array<{ id: number; total: number; status: string; payment_status: string; created_at: string }>
  revenue: number
  commission: number
}> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()

  const prospectQuery = supabase
    .from("crm_prospects")
    .select("id, user_id")
    .eq("id", prospectId)
  if (role !== "admin") prospectQuery.eq("seller_id", userId)
  const { data: prospect, error } = await prospectQuery.maybeSingle()
  if (error || !prospect || !prospect.user_id) {
    return { orders: [], revenue: 0, commission: 0 }
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("id, total, status, payment_status, created_at")
    .eq("user_id", prospect.user_id)
    .order("created_at", { ascending: false })
    .limit(50)

  const paid = (orders ?? []).filter(
    (o) => o.payment_status === "paid" && o.status !== "cancelled"
  )
  const revenue = paid.reduce((s, o) => s + Number(o.total), 0)
  return {
    orders: (orders ?? []).map((o) => ({
      id: Number(o.id),
      total: Number(o.total),
      status: String(o.status),
      payment_status: String(o.payment_status),
      created_at: String(o.created_at),
    })),
    revenue,
    commission: revenue * getCommissionRate(),
  }
}

export interface UserSearchResult {
  id: string
  full_name: string | null
  email: string
  phone: string | null
}

export async function searchUsersForLinking(
  query: string
): Promise<UserSearchResult[]> {
  await requireSellerOrAdminAction()
  if (!query.trim()) return []
  const supabase = await createServiceClient()
  const q = escapeIlike(query.trim())

  // Buscar por email o nombre del perfil (el RLS no permite leer emails
  // de auth.users; usamos profiles.phone / auth emails vía join a users).
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, email")
    .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
    .limit(10)

  if (error) {
    logger.error("[CRM] searchUsersForLinking error:", error)
    throw new Error("Error al buscar usuarios")
  }
  return (data ?? []).map((u) => ({
    id: String(u.id),
    full_name: (u.full_name as string | null) ?? null,
    email: (u.email as string | null) ?? "",
    phone: (u.phone as string | null) ?? null,
  }))
}

export async function linkProspectAccount(
  prospectId: number,
  userId: string
): Promise<void> {
  const { userId: sellerId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()

  // Verificar que el usuario existe y no está vinculado a otro prospecto
  // del mismo vendedor (para admin: a ningún prospecto en general).
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle()
  if (!profile) throw new Error("El usuario no existe")

  const existingQuery = supabase
    .from("crm_prospects")
    .select("id")
    .eq("user_id", userId)
  if (role !== "admin") existingQuery.eq("seller_id", sellerId)
  const { data: existing } = await existingQuery.maybeSingle()
  if (existing) throw new Error("Este usuario ya está vinculado a otro prospecto tuyo")

  const updateQuery = supabase
    .from("crm_prospects")
    .update({ user_id: userId })
    .eq("id", prospectId)
  if (role !== "admin") updateQuery.eq("seller_id", sellerId)
  const { error } = await updateQuery
  if (error) {
    logger.error("[CRM] linkProspectAccount error:", error)
    throw new Error("Error al vincular la cuenta")
  }
}

// ============================================================
// DASHBOARD
// ============================================================

export async function getSellerDisplayName(): Promise<string> {
  const { userId } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle()
  return (data?.full_name as string | null) || "tu asesor de Resurte"
}

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const week = getWeekBounds()
  const month = getMonthBounds()
  const today = getTodayBounds()

  const prospectsQuery = supabase.from("crm_prospects").select("id, status, next_follow_up_at, user_id")
  const activitiesQuery = supabase.from("crm_activities").select("id, type, occurred_at")
  const linkedQuery = supabase
    .from("crm_prospects")
    .select("id, user_id")
    .not("user_id", "is", null)
  const activeClientsQuery = supabase
    .from("crm_prospects")
    .select("id")
    .eq("status", "cliente_activo")
  if (role !== "admin") {
    prospectsQuery.eq("seller_id", userId)
    activitiesQuery.eq("seller_id", userId)
    linkedQuery.eq("seller_id", userId)
    activeClientsQuery.eq("seller_id", userId)
  }

  const [prospectsRes, activitiesRes, linkedRes, activeClientsRes] = await Promise.all([
    prospectsQuery,
    activitiesQuery,
    linkedQuery,
    activeClientsQuery,
  ])

  if (prospectsRes.error || activitiesRes.error) {
    logger.error("[CRM] getDashboardKpis error")
    throw new Error("Error al cargar el dashboard")
  }

  const prospects = prospectsRes.data ?? []
  const activities = activitiesRes.data ?? []
  const linked = ((linkedRes.data ?? []) as unknown as { user_id: string }[]).map((c) => String(c.user_id))

  const now = new Date().toISOString()
  const pendingContact = prospects.filter(
    (p) => p.status === "nuevo" || (p.next_follow_up_at && p.next_follow_up_at <= now)
  ).length

  const callsToday = activities.filter(
    (a) => a.type === "llamada" && a.occurred_at >= today.startISO
  ).length
  const whatsappToday = activities.filter(
    (a) => a.type === "whatsapp" && a.occurred_at >= today.startISO
  ).length
  const callsWeek = activities.filter(
    (a) => a.type === "llamada" && a.occurred_at >= week.startISO
  ).length
  const whatsappWeek = activities.filter(
    (a) => a.type === "whatsapp" && a.occurred_at >= week.startISO
  ).length

  // Ingresos pagados de clientes vinculados
  let weekRevenue = 0
  let monthRevenue = 0
  if (linked.length > 0) {
    const { data: orders } = await supabase
      .from("orders")
      .select("total, created_at, payment_status, status")
      .in("user_id", linked)
      .eq("payment_status", "paid")
      .neq("status", "cancelled")
    for (const o of orders ?? []) {
      const total = Number(o.total)
      if (o.created_at >= week.startISO) weekRevenue += total
      if (o.created_at >= month.startISO) monthRevenue += total
    }
  }

  const rate = getCommissionRate()
  return {
    totalProspects: prospects.length,
    pendingContact,
    activeClients: (activeClientsRes.data ?? []).length,
    callsToday,
    whatsappToday,
    callsWeek,
    whatsappWeek,
    linkedClients: linked.length,
    weekRevenue,
    weekCommission: weekRevenue * rate,
    monthRevenue,
    monthCommission: monthRevenue * rate,
  }
}

export async function getPendingFollowUps(): Promise<FollowUp[]> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const now = new Date().toISOString()

  const query = supabase
    .from("crm_prospects")
    .select("id, name, restaurant_name, whatsapp, phone, status, next_follow_up_at, last_contact_at, user_id")
    .lte("next_follow_up_at", now)
    .not("status", "in", "(perdido,inactivo)")
    .order("next_follow_up_at", { ascending: true })
    .limit(20)
  if (role !== "admin") query.eq("seller_id", userId)
  const { data, error } = await query

  if (error) {
    logger.error("[CRM] getPendingFollowUps error:", error)
    throw new Error("Error al cargar seguimientos")
  }
  return (data ?? []).map((f) => ({
    id: Number(f.id),
    name: String(f.name),
    restaurant_name: (f.restaurant_name as string | null) ?? null,
    whatsapp: (f.whatsapp as string | null) ?? null,
    phone: (f.phone as string | null) ?? null,
    status: f.status as ProspectStatus,
    next_follow_up_at: (f.next_follow_up_at as string | null) ?? null,
    last_contact_at: (f.last_contact_at as string | null) ?? null,
    user_id: (f.user_id as string | null) ?? null,
  }))
}

/** Seguimientos vencidos (fecha anterior a hoy CDMX), para badge en la navegación. */
export async function getOverdueFollowUpCount(): Promise<number> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const { startISO } = getTodayBounds()

  const query = supabase
    .from("crm_prospects")
    .select("id", { count: "exact", head: true })
    .lt("next_follow_up_at", startISO)
    .not("status", "in", "(perdido,inactivo)")
  if (role !== "admin") query.eq("seller_id", userId)
  const { count, error } = await query

  if (error) {
    logger.error("[CRM] getOverdueFollowUpCount error:", error)
    return 0
  }
  return count ?? 0
}

/** Clientes vinculados activos que aún no piden en la semana actual. */
export async function getClientsToReorder(): Promise<ClientToReorder[]> {
  const { userId, role } = await requireSellerOrAdminAction()
  const supabase = await createServiceClient()
  const week = getWeekBounds()

  const query = supabase
    .from("crm_prospects")
    .select("id, name, restaurant_name, whatsapp, phone, user_id")
    .not("user_id", "is", null)
    .in("status", ["cliente_activo", "en_seguimiento"])
  if (role !== "admin") query.eq("seller_id", userId)
  const { data, error } = await query

  if (error) {
    logger.error("[CRM] getClientsToReorder error:", error)
    throw new Error("Error al cargar los clientes")
  }

  const clients = (data ?? [])
    .filter((c) => c.user_id)
    .map((c) => ({
      id: Number(c.id),
      name: String(c.name),
      restaurant_name: (c.restaurant_name as string | null) ?? null,
      whatsapp: (c.whatsapp as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      user_id: String(c.user_id),
      last_order_at: null as string | null,
    }))

  if (clients.length === 0) return []

  const { data: orders } = await supabase
    .from("orders")
    .select("user_id, created_at, total, payment_status")
    .in("user_id", clients.map((c) => c.user_id))
    .eq("payment_status", "paid")
    .neq("status", "cancelled")
    .gte("created_at", week.startISO)

  const orderedThisWeek = new Set((orders ?? []).map((o) => String(o.user_id)))
  const weekByUser = new Map<string, string>()
  for (const o of orders ?? []) {
    const uid = String(o.user_id)
    const prev = weekByUser.get(uid)
    if (!prev || (o.created_at ?? "") > prev) {
      weekByUser.set(uid, String(o.created_at))
    }
  }

  return clients
    .filter((c) => !orderedThisWeek.has(c.user_id))
    .map((c) => ({ ...c, last_order_at: weekByUser.get(c.user_id) ?? null }))
}

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
