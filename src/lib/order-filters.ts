/**
 * Fase 9 — utilidades puras para la búsqueda avanzada de pedidos admin:
 * rango de fechas, filtros guardados (presets en localStorage) y los mismos
 * filtros viajando en la URL (deep-link desde las alertas del dashboard).
 */

import type { OrderStatus } from "@/types"

export interface OrderDateRange {
  /** ISO date (YYYY-MM-DD) inclusive, día calendario local */
  from?: string
  /** ISO date (YYYY-MM-DD) inclusive, día calendario local */
  to?: string
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/**
 * Normaliza el rango de fechas de la UI a límites ISO para SQL.
 * `from` se interpreta como inicio del día local; `to` como fin del día
 * local, por eso el límite superior devuelto es EXCLUSIVO (inicio del
 * día siguiente). Devuelve undefined para valores inválidos o ausentes.
 */
export function normalizeDateRange(range: OrderDateRange): {
  fromIso?: string
  toExclusiveIso?: string
} {
  const out: { fromIso?: string; toExclusiveIso?: string } = {}
  const from = range.from?.trim()
  const to = range.to?.trim()
  if (from && isValidIsoDate(from)) {
    out.fromIso = new Date(`${from}T00:00:00`).toISOString()
  }
  if (to && isValidIsoDate(to)) {
    const end = new Date(`${to}T00:00:00`)
    end.setDate(end.getDate() + 1)
    out.toExclusiveIso = end.toISOString()
  }
  return out
}

/** Filtro guardado: combinación con nombre de los filtros de la página. */
export interface SavedOrderFilter {
  name: string
  status: string
  search: string
  from: string
  to: string
  /** Estado de pago. Ausente en presets guardados antes de esta ronda. */
  paymentStatus?: string
}

const MAX_SAVED_FILTERS = 10
const MAX_NAME_LENGTH = 40

export const SAVED_FILTERS_STORAGE_KEY = "admin-pedidos-filtros"

/** Parsea el JSON de localStorage; nunca lanza, devuelve [] si es inválido. */
export function parseSavedFilters(json: string | null): SavedOrderFilter[] {
  if (!json) return []
  try {
    const raw: unknown = JSON.parse(json)
    if (!Array.isArray(raw)) return []
    return raw
      .filter(
        (f): f is SavedOrderFilter =>
          typeof f === "object" &&
          f !== null &&
          typeof (f as SavedOrderFilter).name === "string" &&
          typeof (f as SavedOrderFilter).status === "string" &&
          typeof (f as SavedOrderFilter).search === "string" &&
          typeof (f as SavedOrderFilter).from === "string" &&
          typeof (f as SavedOrderFilter).to === "string" &&
          ((f as SavedOrderFilter).paymentStatus === undefined ||
            typeof (f as SavedOrderFilter).paymentStatus === "string")
      )
      .slice(0, MAX_SAVED_FILTERS)
  } catch {
    return []
  }
}

export function serializeSavedFilters(filters: SavedOrderFilter[]): string {
  return JSON.stringify(filters.slice(0, MAX_SAVED_FILTERS))
}

/**
 * Crea un preset normalizado. Devuelve null si el nombre queda vacío.
 * Recorta el nombre y evita duplicados por nombre (el caller decide si
 * reemplaza o rechaza).
 */
export function makeSavedFilter(
  name: string,
  current: Omit<SavedOrderFilter, "name">
): SavedOrderFilter | null {
  const clean = name.trim().slice(0, MAX_NAME_LENGTH)
  if (!clean) return null
  return { name: clean, ...current }
}

/** Estado de filtro de la página: un estado concreto o todos. */
export type OrderStatusFilter = OrderStatus | "all"

/**
 * Allowlist runtime de estados aceptados por el filtro.
 * Un test verifica que coincide con `STATUS_LABEL` (`src/lib/order-labels.ts`)
 * para que no se desincronice del catálogo real de estados.
 */
export const ORDER_STATUS_VALUES: readonly OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
]

/**
 * Estado de pago con el que se puede filtrar la lista de pedidos.
 *
 * Son los ocho valores del enum `payment_status` de Postgres: el panel debe
 * poder aislar cualquier desenlace real, incluidos los que nadie mira
 * (`failed`, `refunded`, `disputed`), que es justo el punto del desglose del
 * embudo de conversión. No se restringe a los cuatro que resume el embudo.
 */
export type OrderPaymentStatusFilter =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "expired"
  | "refunded"
  | "disputed"
  | "amount_mismatch"
  | "all"

/**
 * Allowlist runtime de estados de pago aceptados por el filtro. Su paridad con
 * el enum `payment_status` de Postgres la verifica
 * `order-enum.contract.test.ts`, que lee `supabase/migrations/`. Compararla con
 * `PAYMENT_STATUS_LABEL` (como se hacía antes) no probaba nada sobre la base:
 * son dos constantes de TypeScript y se mueven juntas.
 */
export const ORDER_PAYMENT_STATUS_VALUES: readonly OrderPaymentStatusFilter[] = [
  "pending",
  "processing",
  "paid",
  "failed",
  "expired",
  "refunded",
  "disputed",
  "amount_mismatch",
]

/** Subconjunto de la página que viaja en la URL. */
export interface OrderFilterState {
  status: OrderStatusFilter
  paymentStatus: OrderPaymentStatusFilter
  search: string
  from: string
  to: string
}

/** Estado inicial de la página, también usado como forma del preset guardado. */
export const EMPTY_ORDER_FILTER: OrderFilterState = {
  status: "all",
  paymentStatus: "all",
  search: "",
  from: "",
  to: "",
}

function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUS_VALUES as readonly string[]).includes(value)
}

function isOrderPaymentStatus(value: string): value is OrderPaymentStatusFilter {
  return (ORDER_PAYMENT_STATUS_VALUES as readonly string[]).includes(value)
}

/**
 * Lee los filtros de la query string. Cada valor se valida antes de usarse como
 * estado: un `status` fuera de la allowlist o una fecha mal formada se
 * descartan en lugar de propagarse (la URL la puede escribir cualquiera).
 *
 * Las claves (`status`, `payment_status`, `q`, `from`, `to`) son las mismas que
 * serializa
 * `orderFilterQuery`, de modo que un enlace profundo y un filtro guardado
 * describen lo mismo y no compiten entre sí.
 */
export function parseOrderFilterParams(params: URLSearchParams): OrderFilterState {
  const rawStatus = params.get("status")?.trim() ?? ""
  const rawPaymentStatus = params.get("payment_status")?.trim() ?? ""
  const rawFrom = params.get("from")?.trim() ?? ""
  const rawTo = params.get("to")?.trim() ?? ""
  return {
    status: isOrderStatus(rawStatus) ? rawStatus : "all",
    paymentStatus: isOrderPaymentStatus(rawPaymentStatus) ? rawPaymentStatus : "all",
    search: params.get("q")?.trim() ?? "",
    from: isValidIsoDate(rawFrom) ? rawFrom : "",
    to: isValidIsoDate(rawTo) ? rawTo : "",
  }
}

/**
 * Serializa el filtro activo a query string (sin `?`). Se omiten los valores por
 * defecto para que la URL limpia siga siendo la de la vista sin filtrar.
 */
export function orderFilterQuery(current: OrderFilterState): string {
  const sp = new URLSearchParams()
  if (current.status !== "all") sp.set("status", current.status)
  if (current.paymentStatus !== "all") sp.set("payment_status", current.paymentStatus)
  const search = current.search.trim()
  if (search) sp.set("q", search)
  if (isValidIsoDate(current.from.trim())) sp.set("from", current.from.trim())
  if (isValidIsoDate(current.to.trim())) sp.set("to", current.to.trim())
  return sp.toString()
}

