"use client"

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowRight,
  CalendarClock,
  Download,
  Filter,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  UserRound,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react"
import {
  assignCrmProspect,
  bulkTagProspects,
  convertLeadToProspect,
  createCrmProspect,
  discardLead,
  getAdminCities,
  getAdminCrmBoard,
  getAdminCrmSla,
  getAdminLeadBoardCounts,
  getAdminLeads,
  getAdminSellers,
  importCrmProspects,
  restoreLead,
  updateCrmProspectStatus,
  type AdminCrmSla,
  type AdminLeadBoardCounts,
  type AdminLeadRow,
} from "../actions"
import {
  CRM_BOARD_COLUMNS,
  CRM_STATUSES,
  CRM_STATUS_LABEL,
  LEAD_STATUS_LABEL,
  compareByUrgency,
  groupIntoBoard,
  isCrmStatus,
  isFollowUpDue,
  nextCrmStatus,
  sumEstimatedValue,
  type CrmProspect,
  type LeadStatus,
} from "@/lib/crm-pipeline"
import { estimatedCoverageLabel, formatEstimatedTotal } from "@/lib/crm-money"
import { ProspectFormModal } from "@/components/crm/ProspectFormModal"
import { ImportCsvModal } from "@/components/crm/ImportCsvModal"
import { findDuplicatesByPhone } from "@/lib/comercializacion/actions"

/**
 * Comandos del alta de prospecto en el panel.
 *
 * Sin `seller_id`: quien crea es el admin y el prospecto cae en el pozo sin
 * asignar, que es justo lo que `resolveNewProspectSeller` resuelve en el
 * servidor. El selector del formulario permite elegir vendedor, y esa elección
 * sí viaja.
 */
const NEW_PROSPECT_ACTIONS = { create: createCrmProspect }

/** Comandos de la importación: pasan por el envoltorio con bitácora. */
const IMPORT_ACTIONS = {
  import: importCrmProspects,
  findDuplicates: findDuplicatesByPhone,
}
import {
  buildFunnelBySegment,
  buildFunnelBySource,
  buildLeadFunnel,
  buildPendingAging,
  daysPending,
  formatRate,
  leadSources,
  type FunnelLead,
} from "@/lib/crm-funnel"
import {
  CRM_PAGE_SIZE,
  LEAD_BOXES,
  LEAD_BOX_LABEL,
  buildCrmQuery,
  hasActiveCrmFilters,
  leadStatusForFilter,
  parseCrmSearchParams,
  prospectStatusForFilter,
  type CrmTab,
  type LeadBox,
} from "@/lib/crm-filters"
import { downloadCsv, toCsv } from "@/lib/csv"
import { parseTagInput, tagLabel, tagMatches } from "@/lib/crm-tags"
import { formatMinutes } from "@/lib/crm-assignment"
import { formatRelativeTime } from "@/lib/relative-time"
import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"
import { ToastProvider, useToast } from "@/components/toast"
import { LeadDetailDrawer } from "../components/LeadDetailDrawer"
import { LeadAgenda } from "../components/LeadAgenda"
import { LeadConversations } from "../components/LeadConversations"
import { LeadDistribution } from "../components/LeadDistribution"
import { LeadQuickReplies } from "../components/LeadQuickReplies"
import { LeadSequences, SequenceEnrollControl } from "../components/LeadSequences"

const SOURCE_LABEL: Record<string, string> = {
  checkout_drawer: "Checkout",
  exit_intent: "Exit intent",
  restaurantes_landing: "Landing /restaurantes",
  blog_newsletter: "Suscripción del blog",
  manual: "Alta manual",
  lead_web: "Lead web",
}

const TAB_LABEL: Record<CrmTab, string> = {
  leads: "Leads",
  pipeline: "Pipeline CRM",
  embudo: "Embudo",
  agenda: "Agenda",
  bandeja: "Bandeja",
}

const TAB_ORDER: CrmTab[] = ["leads", "pipeline", "embudo", "agenda", "bandeja"]

const SEGMENT_LABEL: Record<string, string> = {
  A: "A · Alto",
  B: "B · Medio",
  C: "C · Bajo",
  sin_diagnostico: "Sin diagnóstico",
}

const FILTER_FIELD =
  "rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
const CARD = "rounded-xl border border-gray-200 bg-white p-4"

/**
 * Tamaño de la ventana del tablero.
 *
 * No es una página: el tablero agrupa por estado en cliente, así que pide todo
 * de golpe. El límite existe para no traer la cartera entera, y por eso la
 * superficie avisa cuando lo alcanza: las sumas por columna son la suma de las
 * tarjetas que se ven, y si la ventana se cortó hay más cartera detrás.
 */
const CRM_BOARD_LIMIT = 500

export default function AdminLeadsPage() {
  return (
    <ToastProvider>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-24 text-sm text-gray-600">
            <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
            Cargando leads y pipeline...
          </div>
        }
      >
        <AdminLeadsContent />
      </Suspense>
    </ToastProvider>
  )
}

function AdminLeadsContent() {
  const { toast } = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Los filtros viven en la URL para que una alerta del dashboard pueda
  // aterrizar en el subconjunto exacto (ver `buildAlertHref`).
  const initial = useMemo(() => parseCrmSearchParams(searchParams), [searchParams])

  const [tab, setTab] = useState<CrmTab>(initial.tab)
  const [q, setQ] = useState(initial.q)
  const [debouncedQ, setDebouncedQ] = useState(initial.q)
  const [source, setSource] = useState(initial.source)
  const [segment, setSegment] = useState(initial.segment)
  const [status, setStatus] = useState(initial.status)
  const [box, setBox] = useState<LeadBox>(initial.box)
  const [due, setDue] = useState(initial.due)
  const [unassigned, setUnassigned] = useState(initial.unassigned)
  const [view, setView] = useState(initial.view)
  const [tag, setTag] = useState(initial.tag)
  const [page, setPage] = useState(initial.page)

  const [leads, setLeads] = useState<AdminLeadRow[]>([])
  const [leadTotal, setLeadTotal] = useState(0)
  const [allLeads, setAllLeads] = useState<FunnelLead[]>([])
  const [prospects, setProspects] = useState<CrmProspect[]>([])
  const [counts, setCounts] = useState<AdminLeadBoardCounts | null>(null)
  const [sellers, setSellers] = useState<{ id: string; name: string; email: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [workingId, setWorkingId] = useState<number | null>(null)
  const [drawerId, setDrawerId] = useState<number | null>(null)
  const [showNewProspect, setShowNewProspect] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [cities, setCities] = useState<{ id: number; name: string; state: string }[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkTagDraft, setBulkTagDraft] = useState("")
  const [bulkBusy, setBulkBusy] = useState(false)
  const [inboxSection, setInboxSection] = useState<
    "conversaciones" | "secuencias" | "respuestas rápidas"
  >("conversaciones")

  // Debounce: teclear no debe disparar una recarga por letra.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => clearTimeout(id)
  }, [q])

  useEffect(() => {
    const qs = buildCrmQuery({
      tab,
      q: debouncedQ,
      source,
      segment,
      status,
      box,
      due,
      unassigned,
      view,
      tag,
      page,
    })
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [
    tab,
    debouncedQ,
    source,
    segment,
    status,
    box,
    due,
    unassigned,
    view,
    tag,
    page,
    router,
    pathname,
  ])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // El embudo necesita la bandeja completa sin filtros: mide el proceso, no
      // el subconjunto que el admin esté mirando en ese momento.
      const [board, leadPage, funnelPage, boardCounts] = await Promise.all([
        getAdminCrmBoard({
          q: debouncedQ || undefined,
          status: prospectStatusForFilter(status),
          due,
          unassigned,
          limit: CRM_BOARD_LIMIT,
        }),
        getAdminLeads({
          q: debouncedQ,
          source,
          segment,
          status: leadStatusForFilter(status) ?? undefined,
          pendingOnly: box === "pendientes",
          limit: CRM_PAGE_SIZE,
          offset: 0,
        }),
        getAdminLeads({ limit: 2000 }),
        getAdminLeadBoardCounts(),
      ])
      setProspects(board)
      setLeads(leadPage.rows)
      setLeadTotal(leadPage.total)
      setAllLeads(funnelPage.rows)
      setCounts(boardCounts)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [debouncedQ, source, segment, status, box, due, unassigned])

  useEffect(() => {
    // Diferido a microtask: ningún setState corre síncrono en el efecto.
    void Promise.resolve().then(load)
  }, [load, reloadKey])

  useEffect(() => {
    void getAdminSellers()
      .then(setSellers)
      .catch(() => setSellers([]))
  }, [])

  // Las ciudades se cargan la primera vez que se abre el alta: quien solo mira
  // el listado no paga la consulta. `/admin/leads` es client, así que no puede
  // importar `@/lib/data` sin arrastrar el cliente público al bundle.
  useEffect(() => {
    if (!showNewProspect || cities.length > 0) return
    let cancelled = false
    void Promise.resolve()
      .then(getAdminCities)
      .then((rows) => {
        if (!cancelled) setCities(rows)
      })
      .catch(() => {
        // El selector de ciudad se queda vacío; el resto del formulario sirve.
      })
    return () => {
      cancelled = true
    }
  }, [showNewProspect, cities.length])

  const refresh = useCallback(() => setReloadKey((k) => k + 1), [])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const next = await getAdminLeads({
        q: debouncedQ,
        source,
        segment,
        status: leadStatusForFilter(status) ?? undefined,
        pendingOnly: box === "pendientes",
        limit: CRM_PAGE_SIZE,
        offset: leads.length,
      })
      setLeads((prev) => [...prev, ...next.rows])
      setLeadTotal(next.total)
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar más", "error")
    } finally {
      setLoadingMore(false)
    }
  }

  async function convert(lead: AdminLeadRow) {
    setWorkingId(lead.id)
    try {
      const result = await convertLeadToProspect(lead.id)
      if (result.alreadyConverted) {
        toast("Ese lead ya estaba convertido", "warning")
      } else if (result.duplicateOf) {
        toast(
          `Se vinculó al prospecto existente "${result.duplicateOf.name}" (#${result.duplicateOf.id})`,
          "warning"
        )
      } else {
        toast("Lead convertido: quedó sin asignar en el pipeline", "success")
      }
      refresh()
      setDrawerId(result.prospectId)
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo convertir el lead", "error")
    } finally {
      setWorkingId(null)
    }
  }

  async function discard(lead: AdminLeadRow) {
    setWorkingId(lead.id)
    try {
      await discardLead(lead.id)
      toast("Lead descartado", "success")
      refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo descartar el lead", "error")
    } finally {
      setWorkingId(null)
    }
  }

  async function restore(lead: AdminLeadRow) {
    setWorkingId(lead.id)
    try {
      await restoreLead(lead.id)
      toast("Lead devuelto a la bandeja", "success")
      refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo restaurar el lead", "error")
    } finally {
      setWorkingId(null)
    }
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  /** Marca o desmarca los prospectos visibles del tablero (ya filtrados). */
  function toggleSelectAllVisible() {
    const visible = filteredProspects.map((p) => p.id)
    setSelectedIds((prev) => (prev.length >= visible.length ? [] : visible))
  }

  async function applyBulkTags(add: readonly string[], remove: readonly string[], label: string) {
    if (selectedIds.length === 0) return
    setBulkBusy(true)
    try {
      const touched = await bulkTagProspects(selectedIds, add, remove)
      toast(
        touched === 0
          ? "Ningún prospecto cambió"
          : `${touched} prospecto${touched === 1 ? "" : "s"}: ${label}`,
        touched === 0 ? "warning" : "success"
      )
      setSelectedIds([])
      setBulkTagDraft("")
      refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudieron guardar las etiquetas", "error")
    } finally {
      setBulkBusy(false)
    }
  }

  function bulkAddFromDraft(e: React.FormEvent) {
    e.preventDefault()
    const tags = parseTagInput(bulkTagDraft)
    if (tags.length === 0) return
    void applyBulkTags(tags, [], `+${tags.map(tagLabel).join(", ")}`)
  }

  async function changeStatus(p: CrmProspect, value: string) {
    if (!isCrmStatus(value)) return
    setWorkingId(p.id)
    try {
      await updateCrmProspectStatus(p.id, value)
      toast(`${p.name} → ${CRM_STATUS_LABEL[value]}`, "success")
      refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al actualizar", "error")
    } finally {
      setWorkingId(null)
    }
  }

  async function assign(p: CrmProspect, sellerId: string) {
    setWorkingId(p.id)
    try {
      await assignCrmProspect(p.id, sellerId || null)
      toast(sellerId ? "Prospecto asignado" : "Prospecto devuelto a sin asignar", "success")
      refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo asignar", "error")
    } finally {
      setWorkingId(null)
    }
  }

  function clearFilters() {
    setQ("")
    setDebouncedQ("")
    setSource("")
    setSegment("")
    setStatus("")
    setBox("pendientes")
    setDue(false)
    setUnassigned(false)
    setView("")
    setTag("")
    setPage(1)
  }

  function exportCsv() {
    if (tab === "pipeline") {
      const rows = filteredProspects.map((p) => [
        p.name,
        p.restaurant_name,
        p.phone,
        p.whatsapp,
        p.email,
        isCrmStatus(p.status) ? CRM_STATUS_LABEL[p.status] : p.status,
        p.seller_id === null
          ? "Sin asignar"
          : (sellers.find((s) => s.id === p.seller_id)?.name ?? ""),
        (p.tags ?? []).join(" | "),
        p.next_follow_up_at,
        p.notes,
        p.created_at,
      ])
      downloadCsv(
        `crm-pipeline-${todayKey()}.csv`,
        toCsv(
          [
            "Nombre",
            "Restaurante",
            "Teléfono",
            "WhatsApp",
            "Correo",
            "Estado",
            "Vendedor",
            "Etiquetas",
            "Próximo seguimiento",
            "Notas",
            "Alta",
          ],
          rows
        )
      )
      return
    }

    const rows = leads.map((l) => [
      l.id,
      l.email,
      l.phone,
      SOURCE_LABEL[l.source] ?? l.source,
      l.restaurant_name,
      l.qualification ? `${l.qualification.segment} (${l.qualification.score}/100)` : "",
      l.qualification?.recommended_tier ?? "",
      l.coupon_code,
      LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status,
      l.converted_at,
      l.created_at,
    ])
    downloadCsv(
      `crm-leads-${box}-${todayKey()}.csv`,
      toCsv(
        [
          "ID",
          "Correo",
          "Teléfono",
          "Fuente",
          "Restaurante",
          "Segmento",
          "Nivel recomendado",
          "Cupón",
          "Estado",
          "Convertido el",
          "Alta",
        ],
        rows
      )
    )
  }

  const sources = useMemo(() => leadSources(allLeads), [allLeads])
  const segments = useMemo(
    () =>
      [...new Set(allLeads.map((l) => l.qualification?.segment).filter(Boolean) as string[])].sort(),
    [allLeads]
  )
  const availableTags = useMemo(() => {
    const all = new Set<string>()
    for (const p of prospects) for (const t of p.tags ?? []) all.add(t)
    return [...all].sort((a, b) => a.localeCompare(b, "es"))
  }, [prospects])

  // El filtro por etiqueta se resuelve en memoria: `getAdminCrmBoard` no lo
  // soporta y así el selector puede listar las etiquetas realmente presentes.
  const filteredProspects = prospects.filter(
    (p) => !tag || (p.tags ?? []).some((t) => tagMatches(t, tag))
  )
  const board = useMemo(() => groupIntoBoard(filteredProspects), [filteredProspects])
  const unassignedCount = useMemo(
    () => prospects.filter((p) => p.seller_id === null).length,
    [prospects]
  )
  const filtersActive = hasActiveCrmFilters({
    tab,
    q: debouncedQ,
    source,
    segment,
    status,
    box,
    due,
    unassigned,
    view,
    tag,
    page,
  })

  const tabRefs = useRef<Record<CrmTab, HTMLButtonElement | null>>({
    leads: null,
    pipeline: null,
    embudo: null,
    agenda: null,
    bandeja: null,
  })

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
    if (dir === 0) return
    e.preventDefault()
    const idx = TAB_ORDER.indexOf(tab)
    const next = TAB_ORDER[(idx + dir + TAB_ORDER.length) % TAB_ORDER.length]
    if (!next) return
    setTab(next)
    setPage(1)
    tabRefs.current[next]?.focus()
  }

  if (loading && leads.length === 0 && prospects.length === 0 && !error) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-gray-600">
        <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
        Cargando leads y pipeline...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-medium text-red-700">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 min-h-[44px] rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads / CRM</h1>
          <p className="text-sm text-gray-500">
            {counts
              ? `${counts.pending} sin atender · ${counts.converted} convertidos · ${counts.discarded} descartados`
              : `${leads.length} leads web`}
            {" · "}
            {prospects.length} prospectos
            {unassignedCount > 0 && ` · ${unassignedCount} sin asignar`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNewProspect(true)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#0E7A0E] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#0A610A]"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo prospecto
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Upload className="h-3.5 w-3.5" />
            Importar CSV
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Vistas del CRM de leads"
        className="mb-4 flex overflow-hidden rounded-lg border border-gray-200"
      >
        {TAB_ORDER.map((key) => (
          <button
            key={key}
            ref={(el) => {
              tabRefs.current[key] = el
            }}
            role="tab"
            id={`crm-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`crm-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            onKeyDown={onTabKeyDown}
            onClick={() => {
              setTab(key)
              setPage(1)
            }}
            className={`min-h-[44px] flex-1 px-3 text-xs font-semibold transition-colors sm:flex-none ${
              tab === key ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {TAB_LABEL[key]}
          </button>
        ))}
      </div>

      {tab !== "embudo" && tab !== "bandeja" && tab !== "agenda" && (
        <div className={`${CARD} mb-4`}>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[200px] flex-1">
              <span className="sr-only">Buscar</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-600" />
              <input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setPage(1)
                }}
                placeholder={
                  tab === "leads"
                    ? "Correo, restaurante o teléfono"
                    : "Nombre, restaurante, correo o teléfono"
                }
                className={`${FILTER_FIELD} w-full pl-9`}
              />
            </label>

            {tab === "leads" ? (
              <>
                <select
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value)
                    setPage(1)
                  }}
                  aria-label="Fuente del lead"
                  className={FILTER_FIELD}
                >
                  <option value="">Todas las fuentes</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>
                      {SOURCE_LABEL[s] ?? s}
                    </option>
                  ))}
                </select>
                <select
                  value={segment}
                  onChange={(e) => {
                    setSegment(e.target.value)
                    setPage(1)
                  }}
                  aria-label="Segmento del calificador"
                  className={FILTER_FIELD}
                >
                  <option value="">Todos los segmentos</option>
                  {segments.map((s) => (
                    <option key={s} value={s}>
                      {SEGMENT_LABEL[s] ?? s}
                    </option>
                  ))}
                </select>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value)
                    setPage(1)
                  }}
                  aria-label="Estado del lead"
                  className={FILTER_FIELD}
                >
                  <option value="">Cualquier estado</option>
                  <option value="nuevo">Sin atender</option>
                  <option value="convertido">Convertido</option>
                  <option value="descartado">Descartado</option>
                </select>
              </>
            ) : (
              <>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value)
                    setPage(1)
                  }}
                  aria-label="Estado del prospecto"
                  className={FILTER_FIELD}
                >
                  <option value="">Cualquier estado</option>
                  {CRM_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CRM_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={due}
                    onChange={(e) => {
                      setDue(e.target.checked)
                      setPage(1)
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Seguimiento vencido
                </label>
                <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={unassigned}
                    onChange={(e) => {
                      setUnassigned(e.target.checked)
                      setPage(1)
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Sin asignar
                </label>
                <select
                  value={tag}
                  onChange={(e) => {
                    setTag(e.target.value)
                    setPage(1)
                  }}
                  aria-label="Filtrar por etiqueta"
                  disabled={availableTags.length === 0}
                  className={FILTER_FIELD}
                >
                  <option value="">
                    {availableTags.length === 0 ? "Sin etiquetas" : "Cualquier etiqueta"}
                  </option>
                  {availableTags.map((t) => (
                    <option key={t} value={t}>
                      {tagLabel(t)}
                    </option>
                  ))}
                </select>
              </>
            )}

            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              >
                <X className="h-3.5 w-3.5" />
                Limpiar
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "leads" && (
        <div role="tabpanel" id="crm-panel-leads" aria-labelledby="crm-tab-leads">
          <LeadInbox
            leads={leads}
            total={leadTotal}
            box={box}
            counts={counts}
            workingId={workingId}
            loadingMore={loadingMore}
            onBoxChange={(next) => {
              setBox(next)
              setPage(1)
            }}
            onConvert={(l) => void convert(l)}
            onDiscard={(l) => void discard(l)}
            onRestore={(l) => void restore(l)}
            onOpenProspect={(id) => setDrawerId(id)}
            onLoadMore={() => void loadMore()}
          />
        </div>
      )}

      {tab === "pipeline" && (
        <div role="tabpanel" id="crm-panel-pipeline" aria-labelledby="crm-tab-pipeline">
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-2.5">
            <button
              type="button"
              onClick={toggleSelectAllVisible}
              disabled={filteredProspects.length === 0}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Users className="h-3.5 w-3.5" />
              {selectedIds.length >= filteredProspects.length && filteredProspects.length > 0
                ? "Quitar selección"
                : `Seleccionar los ${filteredProspects.length}`}
            </button>
            <span className="text-[11px] text-gray-500">
              {selectedIds.length === 0
                ? "Selecciona prospectos para etiquetarlos en lote"
                : `${selectedIds.length} seleccionado${selectedIds.length === 1 ? "" : "s"}`}
            </span>
            {selectedIds.length > 0 && (
              <>
                <form className="flex flex-1 flex-wrap items-center gap-2" onSubmit={bulkAddFromDraft}>
                  <label className="sr-only" htmlFor="bulk-tag-input">
                    Etiquetas a añadir
                  </label>
                  <input
                    id="bulk-tag-input"
                    value={bulkTagDraft}
                    disabled={bulkBusy}
                    onChange={(e) => setBulkTagDraft(e.target.value)}
                    placeholder="vip, mayoreo (separa con comas)"
                    className="min-h-[36px] min-w-[12rem] flex-1 rounded-lg border border-gray-200 px-2.5 text-[11px]"
                  />
                  <button
                    type="submit"
                    disabled={bulkBusy || !bulkTagDraft.trim()}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-brand-600 px-3 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Añadir
                  </button>
                </form>
                <button
                  type="button"
                  disabled={bulkBusy || !tag}
                  title={tag ? undefined : "Elige una etiqueta en el filtro para poder quitarla"}
                  onClick={() => void applyBulkTags([], [tag], `−${tagLabel(tag)}`)}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-gray-200 px-3 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  {tag ? `Quitar «${tagLabel(tag)}»` : "Quitar etiqueta"}
                </button>
                <SequenceEnrollControl
                  selectedIds={selectedIds}
                  disabled={bulkBusy}
                  onEnrolled={(message) => {
                    toast(message, "success")
                    setSelectedIds([])
                    refresh()
                  }}
                />
                <LeadDistribution
                  selectedIds={selectedIds}
                  disabled={bulkBusy}
                  onDistributed={(message) => {
                    toast(message, "success")
                    setSelectedIds([])
                    refresh()
                  }}
                />
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="inline-flex min-h-[36px] items-center rounded-lg px-3 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                >
                  Cancelar
                </button>
              </>
            )}
          </div>

          {prospects.length >= CRM_BOARD_LIMIT && (
            <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              Mostrando los primeros {CRM_BOARD_LIMIT} prospectos del filtro actual. Los
              contadores y las sumas por columna son los de estas tarjetas, no los de la
              cartera completa: acota con la búsqueda o el estado para ver el resto.
            </p>
          )}

          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-5">
            {CRM_BOARD_COLUMNS.map((col) => {
              const cards = [...(board[col.key] ?? [])].sort(compareByUrgency)
              const value = sumEstimatedValue(cards)
              return (
                <div
                  key={col.key}
                  className="w-[80vw] flex-none snap-start rounded-xl border border-gray-200 bg-gray-50 p-3 sm:w-auto"
                >
                  <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                    {col.label}
                    <span className="ml-1 text-gray-600">({cards.length})</span>
                  </h2>
                  <p
                    className={`mb-2 text-[11px] font-semibold ${
                      value.total === null ? "text-gray-500" : "text-gray-700"
                    }`}
                    title={estimatedCoverageLabel(value.declared, cards.length)}
                  >
                    {formatEstimatedTotal(value)}
                  </p>
                  <ul className="space-y-2">
                    {cards.map((p) => {
                      const next = isCrmStatus(p.status) ? nextCrmStatus(p.status) : null
                      const overdue = isFollowUpDue(p.next_follow_up_at)
                      return (
                        <li key={p.id} className="rounded-lg border border-gray-200 bg-white p-2.5">
                          <div className="mb-1 flex items-start gap-1.5">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(p.id)}
                              onChange={() => toggleSelected(p.id)}
                              aria-label={`Seleccionar ${p.name}`}
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-gray-300"
                            />
                            <button
                              type="button"
                              onClick={() => setDrawerId(p.id)}
                              className="block w-full text-left"
                            >
                              <span className="block text-sm font-semibold text-gray-900">
                                {p.name}
                              </span>
                              {p.restaurant_name && (
                                <span className="block text-xs text-gray-500">
                                  {p.restaurant_name}
                                </span>
                              )}
                            </button>
                          </div>

                          {p.tags && p.tags.length > 0 && (
                            <ul className="mt-1 flex flex-wrap gap-1">
                              {p.tags.map((t) => (
                                <li
                                  key={t}
                                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                    tagMatches(t, tag)
                                      ? "bg-brand-600 text-white"
                                      : "bg-brand-50 text-brand-700"
                                  }`}
                                >
                                  {tagLabel(t)}
                                </li>
                              ))}
                            </ul>
                          )}

                          {p.seller_id === null && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                              <UserRound className="h-2.5 w-2.5" />
                              Sin asignar
                            </span>
                          )}

                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-600">
                            {p.whatsapp && (
                              <a
                                href={`https://wa.me/${p.whatsapp.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 hover:text-brand-600"
                              >
                                <MessageCircle className="h-3 w-3" /> {p.whatsapp}
                              </a>
                            )}
                            {p.email && (
                              <a
                                href={`mailto:${p.email}`}
                                className="inline-flex items-center gap-0.5 hover:text-brand-600"
                              >
                                <Mail className="h-3 w-3" /> {p.email}
                              </a>
                            )}
                          </div>

                          {p.next_follow_up_at && (
                            <p
                              className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${
                                overdue ? "text-red-700" : "text-gray-600"
                              }`}
                              title={new Date(p.next_follow_up_at).toLocaleString("es-MX")}
                            >
                              <CalendarClock className="h-3 w-3" />
                              {overdue ? "Vencido" : "Seguimiento"} ·{" "}
                              {formatRelativeTime(p.next_follow_up_at)}
                            </p>
                          )}

                          {p.notes && (
                            <p
                              className="mt-1 line-clamp-2 text-[11px] text-gray-500"
                              title={p.notes}
                            >
                              {p.notes}
                            </p>
                          )}

                          <div className="mt-2 space-y-1.5">
                            <select
                              value={p.seller_id ?? ""}
                              disabled={workingId === p.id}
                              onChange={(e) => void assign(p, e.target.value)}
                              aria-label={`Vendedor de ${p.name}`}
                              className="min-h-[32px] w-full rounded-lg border border-gray-200 px-1.5 text-[11px] text-gray-600"
                            >
                              <option value="">Sin asignar</option>
                              {sellers.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center gap-1.5">
                              {next && (
                                <button
                                  type="button"
                                  disabled={workingId === p.id}
                                  onClick={() => void changeStatus(p, next)}
                                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-brand-600 px-2 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                                >
                                  {CRM_STATUS_LABEL[next]}
                                  <ArrowRight className="h-3 w-3" />
                                </button>
                              )}
                              <select
                                value={p.status}
                                disabled={workingId === p.id}
                                onChange={(e) => void changeStatus(p, e.target.value)}
                                aria-label={`Estado de ${p.name}`}
                                className="min-h-[32px] rounded-lg border border-gray-200 px-1.5 text-[11px] text-gray-600"
                              >
                                {CRM_STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {CRM_STATUS_LABEL[s]}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => setDrawerId(p.id)}
                                className="min-h-[32px] px-1 text-[11px] text-gray-500 hover:underline"
                              >
                                Ficha
                              </button>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                    {cards.length === 0 && (
                      <li className="py-3 text-center text-[11px] text-gray-600">Vacío</li>
                    )}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === "embudo" && (
        <div
          role="tabpanel"
          id="crm-panel-embudo"
          aria-labelledby="crm-tab-embudo"
          className="space-y-4"
        >
          <FunnelView leads={allLeads} />
          <SlaView />
        </div>
      )}

      {tab === "agenda" && (
        <div
          role="tabpanel"
          id="crm-panel-agenda"
          aria-labelledby="crm-tab-agenda"
          className="space-y-4"
        >
          <LeadAgenda onOpenProspect={setDrawerId} />
        </div>
      )}

      {tab === "bandeja" && (
        <div
          role="tabpanel"
          id="crm-panel-bandeja"
          aria-labelledby="crm-tab-bandeja"
          className="space-y-3"
        >
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
            {(["conversaciones", "secuencias", "respuestas rápidas"] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={inboxSection === key}
                onClick={() => setInboxSection(key)}
                className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition-colors ${
                  inboxSection === key
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {key === "conversaciones"
                  ? "Conversaciones"
                  : key === "secuencias"
                    ? "Secuencias de goteo"
                    : "Respuestas rápidas"}
              </button>
            ))}
          </div>

          {inboxSection === "conversaciones" ? (
            <LeadConversations
              onChanged={refresh}
              view={view}
              onViewChange={(next) => {
                setView(next)
                setPage(1)
              }}
              tag={tag}
              onTagChange={(next) => {
                setTag(next)
                setPage(1)
              }}
            />
          ) : inboxSection === "secuencias" ? (
            <LeadSequences onChanged={refresh} />
          ) : (
            <LeadQuickReplies />
          )}
        </div>
      )}

      {drawerId !== null && (
        <LeadDetailDrawer
          prospectId={drawerId}
          onClose={() => setDrawerId(null)}
          onChanged={refresh}
        />
      )}

      <ProspectFormModal
        open={showNewProspect}
        onClose={() => setShowNewProspect(false)}
        cities={cities}
        actions={NEW_PROSPECT_ACTIONS}
        sellers={sellers}
        onSaved={() => {
          toast("Prospecto creado")
          refresh()
        }}
      />

      <ImportCsvModal
        open={showImport}
        onClose={() => setShowImport(false)}
        actions={IMPORT_ACTIONS}
        onImported={() => {
          refresh()
        }}
      />
    </div>
  )
}

function todayKey(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

interface LeadInboxProps {
  leads: AdminLeadRow[]
  total: number
  box: LeadBox
  counts: AdminLeadBoardCounts | null
  workingId: number | null
  loadingMore: boolean
  onBoxChange: (box: LeadBox) => void
  onConvert: (lead: AdminLeadRow) => void
  onDiscard: (lead: AdminLeadRow) => void
  onRestore: (lead: AdminLeadRow) => void
  onOpenProspect: (id: number) => void
  onLoadMore: () => void
}

function LeadInbox({
  leads,
  total,
  box,
  counts,
  workingId,
  loadingMore,
  onBoxChange,
  onConvert,
  onDiscard,
  onRestore,
  onOpenProspect,
  onLoadMore,
}: LeadInboxProps) {
  const boxCount: Record<LeadBox, number> = {
    pendientes: counts?.pending ?? 0,
    convertidos: counts?.converted ?? 0,
    descartados: counts?.discarded ?? 0,
    todos: counts?.total ?? 0,
  }
  const hasMore = leads.length < total

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {LEAD_BOXES.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onBoxChange(key)}
            aria-pressed={box === key}
            className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition-colors ${
              box === key
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {LEAD_BOX_LABEL[key]}
            {counts && <span className="ml-1 opacity-70">{boxCount[key]}</span>}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500">
                <th className="px-4 py-3">Correo</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Fuente</th>
                <th className="px-4 py-3">Restaurante / diagnóstico</th>
                <th className="px-4 py-3">Cupón</th>
                <th className="px-4 py-3">Antigüedad</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((l) => {
                const days = daysPending(l)
                const busy = workingId === l.id
                const prospectId = l.converted_prospect_id
                return (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-800">{l.email}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {l.phone ? (
                        <a href={`tel:${l.phone.replace(/\s/g, "")}`} className="hover:underline">
                          {l.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {SOURCE_LABEL[l.source] ?? l.source}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {l.restaurant_name && (
                        <span className="block font-medium text-gray-800">{l.restaurant_name}</span>
                      )}
                      {l.qualification ? (
                        <span
                          className="block text-gray-500"
                          title={l.qualification.reasons.join(" ")}
                        >
                          Segmento {l.qualification.segment} ({l.qualification.score}/100) · nivel{" "}
                          {l.qualification.recommended_tier}
                        </span>
                      ) : (
                        !l.restaurant_name && <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {l.coupon_code ?? "—"}
                    </td>
                    <td
                      className="px-4 py-3 text-xs text-gray-600"
                      title={new Date(l.created_at).toLocaleString("es-MX")}
                    >
                      {formatRelativeTime(l.created_at)}
                      {days !== null && days > 0 && (
                        <span className="block text-[10px] text-gray-300">
                          {days} {days === 1 ? "día" : "días"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          l.status === "convertido"
                            ? "bg-emerald-100 text-emerald-800"
                            : l.status === "descartado"
                              ? "bg-gray-100 text-gray-600"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {prospectId !== null ? (
                          <button
                            type="button"
                            onClick={() => onOpenProspect(prospectId)}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-gray-200 px-2.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            <UserRoundCheck className="h-3.5 w-3.5" />
                            Ver prospecto
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onConvert(l)}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-brand-600 px-2.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                          >
                            {busy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                            ) : (
                              <ArrowRight className="h-3.5 w-3.5" />
                            )}
                            Convertir
                          </button>
                        )}
                        {l.status === "descartado" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onRestore(l)}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restaurar
                          </button>
                        ) : (
                          prospectId === null && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onDiscard(l)}
                              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 hover:text-red-700 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Descartar
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-600">
                    <Users className="mx-auto mb-2 h-5 w-5 text-gray-300" />
                    Sin leads en esta bandeja
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="border-t border-gray-100 p-3 text-center">
            <button
              type="button"
              disabled={loadingMore}
              onClick={onLoadMore}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-200 px-4 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loadingMore && (
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              )}
              Cargar más ({leads.length} de {total})
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function FunnelView({ leads }: { leads: FunnelLead[] }) {
  const steps = buildLeadFunnel(leads)
  const bySource = buildFunnelBySource(leads)
  const bySegment = buildFunnelBySegment(leads)
  const aging = buildPendingAging(leads)
  const maxStep = Math.max(1, ...steps.map((s) => s.count))
  const agingMax = Math.max(1, ...aging.map((b) => b.count))

  return (
    <>
      <div className={CARD}>
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <Filter className="h-3.5 w-3.5 text-gray-600" />
          Embudo de captación
        </h2>
        <ul className="space-y-3">
          {steps.map((step) => (
            <li key={step.key}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="font-semibold text-gray-700">{step.label}</span>
                <span className="text-gray-500">
                  {step.count}
                  <span className="ml-2 text-gray-600">
                    {step.rateFromPrevious === null
                      ? "—"
                      : `${formatRate(step.rateFromPrevious)} de capturados`}
                  </span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{ width: `${Math.round((step.count / maxStep) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        {leads.length === 0 && (
          <p className="mt-3 text-xs text-gray-600">Todavía no hay leads capturados que medir.</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={CARD}>
          <h2 className="mb-3 text-sm font-bold text-gray-900">Por fuente</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-600">
                <th className="pb-2">Fuente</th>
                <th className="pb-2 text-right">Capturados</th>
                <th className="pb-2 text-right">Calificados</th>
                <th className="pb-2 text-right">Convertidos</th>
                <th className="pb-2 text-right">Conversión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bySource.map((row) => (
                <tr key={row.source}>
                  <td className="py-2 text-gray-700">{SOURCE_LABEL[row.source] ?? row.source}</td>
                  <td className="py-2 text-right text-gray-600">{row.total}</td>
                  <td className="py-2 text-right text-gray-600">{row.qualified}</td>
                  <td className="py-2 text-right text-gray-600">{row.converted}</td>
                  <td className="py-2 text-right font-semibold text-gray-800">
                    {formatRate(row.conversionRate)}
                  </td>
                </tr>
              ))}
              {bySource.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-gray-600">
                    Sin datos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className={CARD}>
          <h2 className="mb-3 text-sm font-bold text-gray-900">Por segmento del calificador</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-600">
                <th className="pb-2">Segmento</th>
                <th className="pb-2 text-right">Capturados</th>
                <th className="pb-2 text-right">Convertidos</th>
                <th className="pb-2 text-right">Conversión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bySegment.map((row) => (
                <tr key={row.segment}>
                  <td className="py-2 text-gray-700">{SEGMENT_LABEL[row.segment] ?? row.segment}</td>
                  <td className="py-2 text-right text-gray-600">{row.total}</td>
                  <td className="py-2 text-right text-gray-600">{row.converted}</td>
                  <td className="py-2 text-right font-semibold text-gray-800">
                    {formatRate(row.conversionRate)}
                  </td>
                </tr>
              ))}
              {bySegment.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-600">
                    Sin datos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={CARD}>
        <h2 className="mb-3 text-sm font-bold text-gray-900">Antigüedad de lo sin atender</h2>
        <ul className="space-y-2">
          {aging.map((bucket) => (
            <li key={bucket.key} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs text-gray-600">{bucket.label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                <span
                  className={`block h-full rounded-full ${
                    bucket.key === "old" || bucket.key === "30d" ? "bg-red-500" : "bg-brand-600"
                  }`}
                  style={{ width: `${Math.round((bucket.count / agingMax) * 100)}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right text-xs font-semibold text-gray-700">
                {bucket.count}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

/**
 * SLA de conversaciones dentro del embudo: qué está sin responder, cuánto se
 * tarda en contestar y cómo está repartida la carga entre vendedores.
 *
 * Los indicadores se piden al servidor ya calculados; aquí solo se pintan.
 */
function SlaView() {
  const [sla, setSla] = useState<AdminCrmSla | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getAdminCrmSla()
      .then((data) => {
        if (cancelled) return
        setSla(data)
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "Error al cargar el SLA")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className={CARD}>
        <p className="flex items-center gap-2 py-8 text-xs text-gray-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Calculando
          SLA de conversaciones...
        </p>
      </div>
    )
  }

  if (error || !sla) {
    return (
      <div className={CARD}>
        <p className="py-8 text-center text-xs text-red-700">
          {error ?? "No se pudo calcular el SLA"}
        </p>
      </div>
    )
  }

  const { board, stats, loads, pending } = sla
  const busiest = Math.max(1, ...loads.map((l) => l.open))
  const bucketCount = (key: "sin_responder" | "esperando" | "ventana_cerrada") =>
    board.buckets.find((b) => b.key === key)?.count ?? 0

  function exportPending() {
    const stamp = dayKeyOf(DEFAULT_TIMEZONE)
    downloadCsv(
      `crm-conversaciones-pendientes-${stamp}.csv`,
      toCsv(
        [
          "prospecto_id",
          "nombre",
          "restaurante",
          "telefono",
          "vendedor",
          "minutos_esperando",
          "ultimo_mensaje",
          "mensajes",
        ],
        pending.map((row) => [
          row.prospectId,
          row.name,
          row.restaurantName,
          row.phone,
          row.sellerName,
          row.waitingMinutes,
          row.lastMessageAt,
          row.messageCount,
        ]),
      ),
    )
  }

  return (
    <>
      <div className={CARD}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <MessageCircle className="h-3.5 w-3.5 text-gray-600" />
            SLA de conversaciones
          </h2>
          <span className="text-[11px] text-gray-600">
            {sla.considered} prospectos abiertos considerados
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
          <SlaStat label="Sin responder" value={board.pendientes} tone="danger" />
          <SlaStat label="Esperando" value={bucketCount("esperando")} />
          <SlaStat label="Ventana cerrada" value={bucketCount("ventana_cerrada")} tone="warning" />
          <SlaStat label="Sin conversación" value={board.sinConversacion} />
          <SlaStat label="Mediana 1.ª respuesta" value={formatMinutes(stats.medianMinutes)} />
          <SlaStat label="P90 1.ª respuesta" value={formatMinutes(stats.p90Minutes)} />
        </dl>

        <p className="mt-3 text-[11px] text-gray-600">
          {stats.measured} conversaciones medidas · {stats.pending} sin respuesta todavía ·{" "}
          {stats.unmeasured} sin mensajes entrantes
          {stats.bestMinutes !== null && ` · mejor ${formatMinutes(stats.bestMinutes)}`}
        </p>
      </div>

      <div className={CARD}>
        <h2 className="mb-3 text-sm font-bold text-gray-900">Carga por vendedor</h2>
        {loads.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-600">Sin vendedores registrados</p>
        ) : (
          <ul className="space-y-2">
            {loads.map((load) => (
              <li key={load.sellerId} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-xs text-gray-700">{load.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <span
                    className={`block h-full rounded-full ${
                      load.overdue > 0 ? "bg-red-500" : "bg-brand-600"
                    }`}
                    style={{ width: `${Math.round((load.open / busiest) * 100)}%` }}
                  />
                </span>
                <span className="w-28 shrink-0 text-right text-[11px] text-gray-500">
                  {load.open} abiertos
                  {load.overdue > 0 && (
                    <span className="ml-1 font-semibold text-red-700">{load.overdue} vencidos</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={CARD}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900">Conversaciones sin responder</h2>
          <button
            type="button"
            onClick={exportPending}
            disabled={pending.length === 0}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </button>
        </div>

        {pending.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-600">
            Nadie está esperando respuesta. Buen trabajo.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="pb-2">Prospecto</th>
                  <th className="pb-2">Vendedor</th>
                  <th className="pb-2 text-right">Esperando</th>
                  <th className="pb-2 text-right">Último mensaje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pending.map((row) => (
                  <tr key={row.prospectId}>
                    <td className="py-2">
                      <span className="font-semibold text-gray-800">{row.name}</span>
                      {row.restaurantName && (
                        <span className="block text-[11px] text-gray-500">
                          {row.restaurantName}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-gray-600">{row.sellerName ?? "Sin asignar"}</td>
                    <td className="py-2 text-right font-semibold text-red-700">
                      {formatMinutes(row.waitingMinutes)}
                    </td>
                    <td className="py-2 text-right text-gray-500">
                      {row.lastMessageAt ? formatRelativeTime(row.lastMessageAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pending.length >= 200 && (
              <p className="mt-2 text-[11px] text-gray-600">
                Se muestran los 200 casos más antiguos; el CSV incluye los mismos.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function SlaStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: number | string
  tone?: "neutral" | "danger" | "warning"
}) {
  const color =
    tone === "danger" && Number(value) > 0
      ? "text-red-700"
      : tone === "warning" && Number(value) > 0
        ? "text-amber-700"
        : "text-gray-900"
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`mt-0.5 text-lg font-bold ${color}`}>{value}</dd>
    </div>
  )
}
