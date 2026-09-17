// ============================================================
// Catering — capa de servidor (Fase 7, nivel Diamante).
// ============================================================
// Decisiones que se ven en este archivo:
//
// 1. Leer nunca lanza. El panel degrada a listas vacías y la página pública
//    sigue mostrando lo que ya tenía.
//
// 2. El total cotizado lo fija el servidor. `quoteCatering` es la única fuente
//    del número y `quoted_total` se escribe aquí, nunca desde el navegador.
//
// 3. Cotizar es un acto explícito. Cambiar el estado a `quoted` sin pasar por
//    `quoteCateringRequest` dejaría la solicitud sin total, así que la
//    transición se hace en una sola función que calcula y escribe.
//
// 4. Las lecturas del comensal usan service role, como los pedidos: la política
//    pública de `foodos_catering_packages` cubre el catálogo, y las solicitudes
//    solo las ve el restaurante.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"

import { logger } from "@/lib/logger"
import {
  isCateringStatus,
  planCateringTransition,
  quoteCatering,
  summarizeCatering,
  validateCateringPackage,
  validateCateringRequest,
  type CateringKpis,
  type CateringPackage,
  type CateringRequestFacts,
  type CateringRequestInput,
  type CateringStatus,
} from "./foodos-catering"

type Client = SupabaseClient

const MAX_ROWS = 200

const PACKAGE_COLUMNS =
  "id, name, description, price_per_person, min_people, max_people, lead_time_hours, includes, is_active, sort_order"

const REQUEST_COLUMNS =
  "id, package_id, customer_name, customer_phone, customer_email, event_date, headcount, notes, status, quoted_total, quoted_at, deposit_amount, created_at"

export interface CateringRequestRow extends CateringRequestFacts {
  id: string
  packageId: string | null
  customerName: string
  customerPhone: string
  customerEmail: string | null
  eventDate: string
  notes: string | null
  status: CateringStatus
  total: number | null
  quotedAt: string | null
  depositAmount: number | null
  createdAt: string | null
}

export type CateringMutationResult =
  | { ok: true }
  | { ok: false; error: string; errors?: string[] }

export interface CateringContext {
  packages: CateringPackage[]
  requests: CateringRequestRow[]
  kpis: CateringKpis
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function int(value: unknown, fallback = 0): number {
  const parsed = num(value)
  return parsed === null ? fallback : Math.trunc(parsed)
}

function asIncludes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
}

function rowToPackage(data: unknown): CateringPackage | null {
  if (!data || typeof data !== "object") return null
  const row = data as Record<string, unknown>
  const id = text(row.id)
  const name = text(row.name)
  if (!id || !name) return null
  return {
    id,
    name,
    description: text(row.description),
    pricePerPerson: num(row.price_per_person) ?? 0,
    minPeople: int(row.min_people, 1),
    maxPeople: num(row.max_people) === null ? null : int(row.max_people),
    leadTimeHours: int(row.lead_time_hours, 0),
    includes: asIncludes(row.includes),
    isActive: row.is_active !== false,
    sortOrder: int(row.sort_order),
  }
}

function rowToRequest(data: unknown): CateringRequestRow | null {
  if (!data || typeof data !== "object") return null
  const row = data as Record<string, unknown>
  const id = text(row.id)
  const name = text(row.customer_name)
  const phone = text(row.customer_phone)
  const eventDate = text(row.event_date)
  if (!id || !name || !phone || !eventDate) return null
  const status = isCateringStatus(row.status) ? row.status : "requested"
  const total = num(row.quoted_total)
  return {
    id,
    packageId: text(row.package_id),
    customerName: name,
    customerPhone: phone,
    customerEmail: text(row.customer_email),
    eventDate,
    headcount: int(row.headcount, 0),
    notes: text(row.notes),
    status,
    total,
    quotedAt: text(row.quoted_at),
    depositAmount: num(row.deposit_amount),
    createdAt: text(row.created_at),
  }
}

// ------------------------------------------------------------
// Lecturas
// ------------------------------------------------------------

/**
 * Paquetes del restaurante.
 *
 * `onlyActive` es para la cara pública: el panel necesita ver también los
 * pausados, porque si no desaparecerían sin forma de reactivarlos.
 */
export async function listCateringPackages(
  supabase: Client,
  restaurantId: string,
  options: { onlyActive?: boolean } = {}
): Promise<CateringPackage[]> {
  try {
    let query = supabase
      .from("foodos_catering_packages")
      .select(PACKAGE_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(MAX_ROWS)
    if (options.onlyActive) query = query.eq("is_active", true)
    const { data, error } = await query
    if (error || !Array.isArray(data)) return []
    return data.map(rowToPackage).filter((pkg): pkg is CateringPackage => pkg !== null)
  } catch (error) {
    logger.error("[foodos-catering] no se pudieron leer los paquetes", error, { restaurantId })
    return []
  }
}

export async function listCateringRequests(
  supabase: Client,
  restaurantId: string
): Promise<CateringRequestRow[]> {
  try {
    const { data, error } = await supabase
      .from("foodos_catering_requests")
      .select(REQUEST_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS)
    if (error || !Array.isArray(data)) return []
    return data.map(rowToRequest).filter((row): row is CateringRequestRow => row !== null)
  } catch (error) {
    logger.error("[foodos-catering] no se pudieron leer las solicitudes", error, { restaurantId })
    return []
  }
}

export async function loadCateringContext(
  supabase: Client,
  restaurantId: string,
  now: Date = new Date()
): Promise<CateringContext> {
  const [packages, requests] = await Promise.all([
    listCateringPackages(supabase, restaurantId),
    listCateringRequests(supabase, restaurantId),
  ])
  return { packages, requests, kpis: summarizeCatering(requests, now) }
}

export async function getCateringPackage(
  supabase: Client,
  restaurantId: string,
  packageId: string
): Promise<CateringPackage | null> {
  try {
    const { data, error } = await supabase
      .from("foodos_catering_packages")
      .select(PACKAGE_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .eq("id", packageId)
      .maybeSingle()
    if (error) return null
    return rowToPackage(data)
  } catch {
    return null
  }
}

// ------------------------------------------------------------
// Paquetes — escrituras
// ------------------------------------------------------------

export async function saveCateringPackage(
  supabase: Client,
  restaurantId: string,
  packageId: string | null,
  input: unknown
): Promise<CateringMutationResult & { id?: string }> {
  const source = (input ?? {}) as Record<string, unknown>
  // El panel manda JSON, así que todo llega como `unknown`. Se normaliza aquí
  // —no en `validateCateringPackage`— para que el validador siga recibiendo
  // tipos honestos y no tenga que defenderse de un `Record<string, unknown>`.
  const validated = validateCateringPackage({
    name: text(source.name) ?? "",
    description: text(source.description),
    pricePerPerson: num(source.pricePerPerson),
    minPeople: num(source.minPeople),
    maxPeople: num(source.maxPeople),
    leadTimeHours: num(source.leadTimeHours),
    includes: source.includes,
    isActive: source.isActive === undefined ? undefined : source.isActive !== false,
    sortOrder: num(source.sortOrder),
  })
  if (!validated.ok) return { ok: false, error: validated.error }

  const payload = {
    restaurant_id: restaurantId,
    name: validated.value.name,
    description: validated.value.description,
    price_per_person: validated.value.pricePerPerson,
    min_people: validated.value.minPeople,
    max_people: validated.value.maxPeople,
    lead_time_hours: validated.value.leadTimeHours,
    includes: validated.value.includes,
    is_active: validated.value.isActive,
    sort_order: validated.value.sortOrder,
  }

  try {
    if (packageId) {
      const { error } = await supabase
        .from("foodos_catering_packages")
        .update(payload)
        .eq("id", packageId)
        .eq("restaurant_id", restaurantId)
      if (error) return { ok: false, error: "No se pudo guardar el paquete" }
      return { ok: true, id: packageId }
    }
    const { data, error } = await supabase
      .from("foodos_catering_packages")
      .insert(payload)
      .select("id")
      .maybeSingle()
    if (error) return { ok: false, error: "No se pudo crear el paquete" }
    const id = text((data as Record<string, unknown> | null)?.id)
    return id ? { ok: true, id } : { ok: true }
  } catch (error) {
    logger.error("[foodos-catering] falló guardar el paquete", error, { restaurantId })
    return { ok: false, error: "No se pudo guardar el paquete" }
  }
}

export async function deleteCateringPackage(
  supabase: Client,
  restaurantId: string,
  packageId: string
): Promise<CateringMutationResult> {
  try {
    const { error } = await supabase
      .from("foodos_catering_packages")
      .delete()
      .eq("id", packageId)
      .eq("restaurant_id", restaurantId)
    if (error) return { ok: false, error: "No se pudo borrar el paquete" }
    return { ok: true }
  } catch (error) {
    logger.error("[foodos-catering] falló borrar el paquete", error, { restaurantId })
    return { ok: false, error: "No se pudo borrar el paquete" }
  }
}

// ------------------------------------------------------------
// Solicitudes
// ------------------------------------------------------------

/**
 * Registra una solicitud de cotización desde el micrositio.
 *
 * Nace en `quoted`, no en `requested`: el precio por persona es público, así
 * que el comensal ve el total antes de enviar. Lo que falta es la decisión del
 * restaurante — confirmar o declinar — y eso sí es suyo.
 *
 * Valida contra el paquete real (mínimo, máximo, anticipación) y guarda el
 * total en el mismo paso: dejar la solicitud sin número obligaría al dueño a
 * recalcular a mano y permitiría dos totales distintos para el mismo evento.
 */
export async function createCateringRequest(
  supabase: Client,
  restaurantId: string,
  packageId: string,
  input: CateringRequestInput,
  now: Date = new Date()
): Promise<CateringMutationResult & { id?: string; total?: number }> {
  const pkg = await getCateringPackage(supabase, restaurantId, packageId)
  if (!pkg || !pkg.isActive) {
    return { ok: false, error: "Ese paquete de catering ya no está disponible" }
  }

  const validated = validateCateringRequest(input, pkg, now)
  if (!validated.ok) {
    return { ok: false, error: validated.errors[0] ?? "Revisa los datos", errors: validated.errors }
  }

  const quoted = quoteCatering({ package: pkg, headcount: validated.value.headcount })
  if (!quoted.ok) return { ok: false, error: quoted.error }

  try {
    const { data, error } = await supabase
      .from("foodos_catering_requests")
      .insert({
        restaurant_id: restaurantId,
        package_id: pkg.id,
        customer_name: validated.value.customerName,
        customer_phone: validated.value.customerPhone,
        customer_email: validated.value.customerEmail,
        event_date: validated.value.eventDate,
        headcount: validated.value.headcount,
        notes: validated.value.notes,
        status: "quoted",
        quoted_total: quoted.quote.total,
        quoted_at: now.toISOString(),
      })
      .select("id")
      .maybeSingle()
    if (error) return { ok: false, error: "No se pudo enviar la solicitud" }
    const id = text((data as Record<string, unknown> | null)?.id)
    return { ok: true, id: id ?? undefined, total: quoted.quote.total }
  } catch (error) {
    logger.error("[foodos-catering] falló crear la solicitud", error, { restaurantId })
    return { ok: false, error: "No se pudo enviar la solicitud" }
  }
}

async function loadRequest(
  supabase: Client,
  restaurantId: string,
  requestId: string
): Promise<CateringRequestRow | null> {
  try {
    const { data, error } = await supabase
      .from("foodos_catering_requests")
      .select(REQUEST_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .eq("id", requestId)
      .maybeSingle()
    if (error) return null
    return rowToRequest(data)
  } catch {
    return null
  }
}

/**
 * Cambia el estado de una solicitud.
 *
 * Las transiciones las decide `planCateringTransition`, no el navegador: un
 * evento confirmado no se puede declinar y uno terminado no se reabre. Al
 * confirmar se recalcula el total con el paquete vigente, porque el paquete pudo
 * cambiar de precio entre la cotización y el acuerdo.
 */
export async function setCateringRequestStatus(
  supabase: Client,
  restaurantId: string,
  requestId: string,
  next: unknown
): Promise<CateringMutationResult> {
  if (!isCateringStatus(next)) return { ok: false, error: "Estado no reconocido" }

  const request = await loadRequest(supabase, restaurantId, requestId)
  if (!request) return { ok: false, error: "Solicitud no encontrada" }

  const plan = planCateringTransition(request.status, next)
  if (plan.action === "ignore" || !plan.next) {
    return { ok: false, error: plan.reason }
  }

  const payload: Record<string, unknown> = { status: plan.next }

  if (plan.next === "quoted") {
    if (!request.packageId) {
      return { ok: false, error: "La solicitud no tiene paquete: no se puede cotizar" }
    }
    const pkg = await getCateringPackage(supabase, restaurantId, request.packageId)
    if (!pkg) return { ok: false, error: "El paquete de esta solicitud ya no existe" }
    const quoted = quoteCatering({ package: pkg, headcount: request.headcount })
    if (!quoted.ok) return { ok: false, error: quoted.error }
    payload.quoted_total = quoted.quote.total
    payload.quoted_at = new Date().toISOString()
  }

  try {
    const { error } = await supabase
      .from("foodos_catering_requests")
      .update(payload)
      .eq("id", requestId)
      .eq("restaurant_id", restaurantId)
    if (error) return { ok: false, error: "No se pudo actualizar la solicitud" }
    return { ok: true }
  } catch (error) {
    logger.error("[foodos-catering] falló actualizar el estado", error, { restaurantId, requestId })
    return { ok: false, error: "No se pudo actualizar la solicitud" }
  }
}

/**
 * Ajusta el total cotizado a mano.
 *
 * Existe porque ningún paquete por persona cubre todo: una mesa de postres
 * extra, un cargo por montaje. El total sigue siendo del servidor, solo que con
 * un valor autorizado explícitamente por el dueño.
 */
export async function overrideCateringTotal(
  supabase: Client,
  restaurantId: string,
  requestId: string,
  total: unknown,
  deposit: unknown = null
): Promise<CateringMutationResult> {
  const parsed = num(total)
  if (parsed === null || parsed < 0) {
    return { ok: false, error: "El total debe ser un número mayor o igual a cero" }
  }
  const parsedDeposit = deposit === null || deposit === undefined || deposit === "" ? null : num(deposit)
  if (parsedDeposit === null && deposit !== null && deposit !== undefined && deposit !== "") {
    return { ok: false, error: "El anticipo debe ser un número" }
  }
  if (parsedDeposit !== null && parsedDeposit > parsed) {
    return { ok: false, error: "El anticipo no puede superar el total" }
  }

  try {
    const { error } = await supabase
      .from("foodos_catering_requests")
      .update({
        quoted_total: Math.round(parsed * 100) / 100,
        deposit_amount: parsedDeposit === null ? null : Math.round(parsedDeposit * 100) / 100,
        quoted_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("restaurant_id", restaurantId)
    if (error) return { ok: false, error: "No se pudo ajustar el total" }
    return { ok: true }
  } catch (error) {
    logger.error("[foodos-catering] falló ajustar el total", error, { restaurantId, requestId })
    return { ok: false, error: "No se pudo ajustar el total" }
  }
}
