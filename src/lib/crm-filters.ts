/**
 * Estado de los filtros de `/admin/leads` leído y escrito en la URL.
 *
 * Por qué en la URL y no en `useState`: un enlace a "los leads pendientes de la
 * landing" tiene que poder pegarse en un chat y abrir exactamente eso. Las
 * alertas del dashboard (`buildAlertHref`) también aterrizan aquí con el filtro
 * ya aplicado.
 *
 * Todo valor que llega por query string es entrada no confiable: cada campo se
 * valida contra una lista permitida y lo que no encaja se ignora en silencio en
 * lugar de propagarse a la consulta.
 */

import { CRM_STATUSES, LEAD_STATUSES, type CrmStatus, type LeadStatus } from "@/lib/crm-pipeline"

export const CRM_TABS = ["leads", "pipeline", "embudo", "bandeja"] as const
export type CrmTab = (typeof CRM_TABS)[number]

/** Bandeja de entrada de leads web. */
export const LEAD_BOXES = ["pendientes", "convertidos", "descartados", "todos"] as const
export type LeadBox = (typeof LEAD_BOXES)[number]

export const LEAD_BOX_LABEL: Record<LeadBox, string> = {
  pendientes: "Sin atender",
  convertidos: "Convertidos",
  descartados: "Descartados",
  todos: "Todos",
}

/** Filas por página. Bajo a propósito: la bandeja se revisa en el celular. */
export const CRM_PAGE_SIZE = 50

/**
 * Bandejas de la pestaña "Bandeja". No se validan contra una lista permitida
 * porque el valor por defecto es "todas": una bandeja desconocida en la URL cae
 * al conjunto completo, que es lo que el admin espera ver.
 */
export const INBOX_VIEWS = ["sin_responder", "esperando", "ventana_cerrada"] as const
export type InboxView = (typeof INBOX_VIEWS)[number]

export const INBOX_VIEW_LABEL: Record<InboxView, string> = {
  sin_responder: "Sin responder",
  esperando: "Esperando respuesta",
  ventana_cerrada: "Ventana cerrada",
}

export interface CrmUrlState {
  tab: CrmTab
  q: string
  /** Fuente del lead; lista abierta, se valida contra los datos. */
  source: string
  /** Segmento del calificador (A/B/C); lista abierta por la misma razón. */
  segment: string
  /** Estado del prospecto (pipeline) o del lead (bandeja). */
  status: string
  box: LeadBox
  /** Solo seguimientos vencidos. */
  due: boolean
  /** Solo prospectos sin vendedor. */
  unassigned: boolean
  /** Bandeja de conversaciones: vacío = todas. */
  view: string
  /** Etiqueta normalizada por la que filtrar. */
  tag: string
  page: number
}

export const DEFAULT_CRM_URL_STATE: CrmUrlState = {
  tab: "leads",
  q: "",
  source: "",
  segment: "",
  status: "",
  box: "pendientes",
  due: false,
  unassigned: false,
  view: "",
  tag: "",
  page: 1,
}

export const MAX_CRM_PAGE = 500

export type RawSearchParams = Record<string, string | string[] | undefined>

function firstValue(raw: RawSearchParams, key: string): string {
  const value = raw[key]
  if (Array.isArray(value)) return (value[0] ?? "").trim()
  return (value ?? "").trim()
}

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value)
}

export function isCrmTab(value: string): value is CrmTab {
  return isOneOf(value, CRM_TABS)
}

export function isLeadBox(value: string): value is LeadBox {
  return isOneOf(value, LEAD_BOXES)
}

export function isInboxView(value: string): value is InboxView {
  return isOneOf(value, INBOX_VIEWS)
}

/**
 * Normaliza los parámetros de la URL. Nunca lanza: un valor inválido cae al
 * default, porque una URL mal escrita no debe tumbar el panel.
 */
export function parseCrmSearchParams(raw: RawSearchParams | URLSearchParams): CrmUrlState {
  const params: RawSearchParams =
    raw instanceof URLSearchParams ? Object.fromEntries(raw.entries()) : raw

  const tab = firstValue(params, "tab")
  const box = firstValue(params, "box")
  const view = firstValue(params, "view")
  const page = Number.parseInt(firstValue(params, "page"), 10)

  return {
    tab: isCrmTab(tab) ? tab : DEFAULT_CRM_URL_STATE.tab,
    q: firstValue(params, "q").slice(0, 120),
    source: firstValue(params, "source").slice(0, 60),
    segment: firstValue(params, "segment").slice(0, 40),
    status: firstValue(params, "status").slice(0, 40),
    box: isLeadBox(box) ? box : DEFAULT_CRM_URL_STATE.box,
    due: firstValue(params, "due") === "1",
    unassigned: firstValue(params, "unassigned") === "1",
    view: isInboxView(view) ? view : DEFAULT_CRM_URL_STATE.view,
    tag: firstValue(params, "tag").slice(0, 40),
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_CRM_PAGE) : 1,
  }
}

/** Serializa el estado a query string, omitiendo lo que ya es default. */
export function buildCrmQuery(state: Partial<CrmUrlState>): string {
  const merged = { ...DEFAULT_CRM_URL_STATE, ...state }
  const params = new URLSearchParams()
  if (merged.tab !== DEFAULT_CRM_URL_STATE.tab) params.set("tab", merged.tab)
  if (merged.q) params.set("q", merged.q)
  if (merged.source) params.set("source", merged.source)
  if (merged.segment) params.set("segment", merged.segment)
  if (merged.status) params.set("status", merged.status)
  if (merged.box !== DEFAULT_CRM_URL_STATE.box) params.set("box", merged.box)
  if (merged.due) params.set("due", "1")
  if (merged.unassigned) params.set("unassigned", "1")
  if (merged.view) params.set("view", merged.view)
  if (merged.tag) params.set("tag", merged.tag)
  if (merged.page > 1) params.set("page", String(merged.page))
  return params.toString()
}

/** Enlace completo a `/admin/leads` con el estado dado. */
export function crmHref(state: Partial<CrmUrlState>): string {
  const query = buildCrmQuery(state)
  return query ? `/admin/leads?${query}` : "/admin/leads"
}

/** ¿Hay algún filtro activo además de la pestaña y la página? */
export function hasActiveCrmFilters(state: CrmUrlState): boolean {
  return Boolean(
    state.q ||
      state.source ||
      state.segment ||
      state.status ||
      state.due ||
      state.unassigned ||
      state.view ||
      state.tag ||
      state.box !== DEFAULT_CRM_URL_STATE.box,
  )
}

/**
 * El estado del lead que corresponde a cada bandeja. `todos` no filtra: deja
 * pasar convertidos y descartados junto con los pendientes.
 */
export function leadStatusForBox(box: LeadBox): LeadStatus | null {
  if (box === "pendientes") return "nuevo"
  if (box === "convertidos") return "convertido"
  if (box === "descartados") return "descartado"
  return null
}

/** El estado del prospecto validado contra el CHECK de `crm_prospects`. */
export function prospectStatusForFilter(status: string): CrmStatus | "todos" {
  return isOneOf(status, CRM_STATUSES) ? status : "todos"
}

/** El estado del lead validado contra el CHECK de `leads`. */
export function leadStatusForFilter(status: string): LeadStatus | null {
  return isOneOf(status, LEAD_STATUSES) ? status : null
}
