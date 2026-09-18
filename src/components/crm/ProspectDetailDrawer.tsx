"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Activity as ActivityIcon,
  CalendarClock,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react"
import {
  CRM_CLOSE_OUTCOME_LABEL,
  CRM_LOSS_REASONS,
  CRM_LOSS_REASON_LABEL,
  CRM_STATUSES,
  CRM_STATUS_LABEL,
  isCrmClosed,
  isFollowUpDue,
  type CrmCloseOutcome,
  type CrmLossReason,
  type CrmProspectRow,
  type CrmScope,
  type CrmStatus,
} from "@/lib/crm-core"
import { MAX_TAGS_PER_PROSPECT, addTags, tagLabel, toggleTag } from "@/lib/crm-tags"
import type { CrmTask, CrmTaskDraft } from "@/lib/crm-tasks"
import { ProspectTasks } from "@/components/crm/ProspectTasks"
import {
  ACTIVITY_OUTCOMES,
  ACTIVITY_OUTCOME_LABEL,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABEL,
  type Activity,
  type ActivityType,
} from "@/lib/comercializacion/types"
import { formatRelativeTime } from "@/lib/relative-time"
import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"
import { useToast } from "@/components/toast"

/**
 * Ficha única de prospecto.
 *
 * Existía dos veces: la del panel (`LeadDetailDrawer`) y la del vendedor
 * (`prospecto-detail`). Mantenían por separado el mismo panel, el mismo foco
 * atrapado y los mismos campos, así que un arreglo en una no llegaba a la otra.
 *
 * Lo que cambia entre superficies se resuelve de dos maneras, y ninguna es
 * duplicar el componente:
 *
 * - **Por alcance.** `scope.kind === "admin"` habilita asignación de vendedor.
 *   El vendedor nunca ve el pozo sin asignar.
 * - **Por inyección.** Lo exclusivo de una superficie entra como `actions`
 *   (comandos) o `slots` (UI). Si un comando no se inyecta, su sección no se
 *   pinta: así el vendedor no obtiene etiquetas hasta que se le pasan, ni
 *   conversación hasta que se le pasa el lector.
 */

const SOURCE_LABEL: Record<string, string> = {
  checkout_drawer: "Checkout",
  exit_intent: "Exit intent",
  restaurantes_landing: "Landing /restaurantes",
  blog_newsletter: "Suscripción del blog",
  manual: "Alta manual",
  lead_web: "Lead web",
}

const FIELD =
  "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
const LABEL = "block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1"

/** Ícono por tipo de actividad, para reconocer la bitácora de un vistazo. */
const ACTIVITY_ICON: Record<ActivityType, string> = {
  llamada: "📞",
  whatsapp: "💬",
  correo: "✉️",
  visita: "🤝",
  nota: "📝",
  pedido: "🛒",
}

/**
 * Lo que devuelve el lector de ficha. `seller`, `lead` y `tags` son opcionales
 * porque el lector del vendedor no los resuelve.
 */
export interface CrmProspectDetail {
  prospect: CrmProspectRow
  activities: Activity[]
  seller?: { id: string; name: string } | null
  lead?: { id: number; email: string; source: string; created_at: string } | null
  tags?: readonly string[]
}

export interface ProspectActivityDraft {
  type: ActivityType
  outcome: string | null
  summary: string | null
}

export interface ProspectDetailActions {
  loadDetail: (prospectId: number) => Promise<CrmProspectDetail>
  setStatus: (prospectId: number, status: CrmStatus) => Promise<void>
  /**
   * Cierra el trato con desenlace y, al perder, motivo. Sin este comando no se
   * pinta el bloque de cierre: mover el desplegable de estado a `perdido` sigue
   * siendo posible, pero no escribe la causa.
   */
  closeDeal?: (
    prospectId: number,
    outcome: CrmCloseOutcome,
    lossReason?: CrmLossReason | null
  ) => Promise<void>
  setNotes: (prospectId: number, notes: string | null) => Promise<void>
  setFollowUp: (prospectId: number, iso: string | null) => Promise<void>
  addActivity: (prospectId: number, draft: ProspectActivityDraft) => Promise<void>
  /** Etiquetas (00140). Sin este comando la sección no se pinta. */
  setTags?: (prospectId: number, tags: readonly string[]) => Promise<unknown>
  /** Solo admin: listado para el selector de vendedor. */
  listSellers?: () => Promise<{ id: string; name: string; email: string }[]>
  /** Solo admin: asignación. Se pinta junto a `listSellers`. */
  assign?: (prospectId: number, sellerId: string | null) => Promise<void>
  /**
   * Tareas del prospecto (00185). Sin `listTasks` no se pinta la sección: una
   * superficie sin comandos no debe mostrar un bloque vacío que parece "este
   * trato no tiene tareas" cuando en realidad es "aquí no se pueden ver".
   */
  listTasks?: (prospectId: number) => Promise<CrmTask[]>
  /** Sin este comando la sección es de solo lectura. */
  addTask?: (prospectId: number, draft: CrmTaskDraft) => Promise<void>
  completeTask?: (taskId: number) => Promise<void>
  reopenTask?: (taskId: number) => Promise<void>
  deleteTask?: (taskId: number) => Promise<void>
}

export interface ProspectDetailSlots {
  /** Botones extra en la fila de contacto (editar, link de registro…). */
  contactActions?: (prospect: CrmProspectRow) => React.ReactNode
  /** Bloque propio de la superficie, bajo las notas (cuenta vinculada, comisiones…). */
  extra?: (prospect: CrmProspectRow) => React.ReactNode
  /**
   * Sustituye el alta rápida de actividad. El vendedor lo usa para abrir su
   * formulario completo (dirección y duración, que el panel no guarda); el
   * panel se queda con el alta rápida por defecto.
   */
  activityForm?: (ctx: { prospect: CrmProspectRow; onSaved: () => void }) => React.ReactNode
}

export interface ProspectDetailDrawerProps {
  scope: CrmScope
  prospectId: number
  open: boolean
  onClose: () => void
  /** Se llama tras cualquier cambio que altere el listado de origen. */
  onChanged: () => void
  actions: ProspectDetailActions
  slots?: ProspectDetailSlots
  /**
   * Permite editar y borrar actividades desde el historial. Sin esto, el
   * historial es de solo lectura.
   */
  activityActions?: {
    onEdit?: (activity: Activity) => void
    onDelete?: (activity: Activity) => void
  }
  /**
   * Lector de conversación de WhatsApp. En el panel es el del admin; el vendedor
   * recibe el suyo, ya acotado a su cartera. Sin esta prop no se pinta la
   * sección.
   */
  renderConversation?: (prospectId: number, onSent: () => void) => React.ReactNode
  /** `page` deja la ficha en el flujo del documento en vez de superponerla. */
  variant?: "drawer" | "page"
  /**
   * Cambiar este número fuerza una recarga de la ficha. Lo usan las superficies
   * que abren sus propios modales fuera del drawer y necesitan refrescarlo.
   */
  refreshKey?: number
  /** Encabezado mientras aún no hay datos. */
  title?: string
}

export function ProspectDetailDrawer({
  scope,
  prospectId,
  open,
  onClose,
  onChanged,
  actions,
  slots,
  activityActions,
  renderConversation,
  variant = "drawer",
  refreshKey = 0,
  title = "Ficha del prospecto",
}: ProspectDetailDrawerProps) {
  const { toast } = useToast()
  const panelRef = useRef<HTMLDivElement>(null)
  const [detail, setDetail] = useState<CrmProspectDetail | null>(null)
  const [sellers, setSellers] = useState<{ id: string; name: string; email: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notesDraft, setNotesDraft] = useState("")
  const [notesDirty, setNotesDirty] = useState(false)
  const [activityType, setActivityType] = useState<ActivityType>("llamada")
  const [activityOutcome, setActivityOutcome] = useState("")
  const [activitySummary, setActivitySummary] = useState("")
  const [activityFilter, setActivityFilter] = useState<ActivityType | "todos">("todos")
  const [tagDraft, setTagDraft] = useState("")
  const [tagBusy, setTagBusy] = useState(false)
  // Cierre del trato: el desenlace elegido y el motivo. `null` = sin elegir,
  // que es el estado que decide si se pintan los botones o la confirmación.
  const [closeOutcome, setCloseOutcome] = useState<CrmCloseOutcome | null>(null)
  const [lossReason, setLossReason] = useState<CrmLossReason | "">("")

  // Los comandos se leen por ref para que un `actions` creado en línea por el
  // adaptador no reinicie la carga en cada render.
  const actionsRef = useRef(actions)
  useEffect(() => {
    actionsRef.current = actions
  }, [actions])

  const load = useCallback(async () => {
    try {
      const data = await actionsRef.current.loadDetail(prospectId)
      setDetail(data)
      setNotesDraft(data.prospect.notes ?? "")
      setNotesDirty(false)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar la ficha")
    } finally {
      setLoading(false)
    }
  }, [prospectId])

  useEffect(() => {
    if (!open) return
    // `refreshKey` y `reloadToken` se leen solo como disparadores: cambiarlos
    // fuerza recargar la ficha (desde fuera, o desde `requestReload`).
    void refreshKey
    void reloadToken
    void Promise.resolve().then(load)
  }, [open, load, refreshKey, reloadToken])

  useEffect(() => {
    const listSellers = actionsRef.current.listSellers
    if (!listSellers) return
    void listSellers()
      .then(setSellers)
      .catch(() => setSellers([]))
  }, [])

  // Foco al panel (no a un input: en móvil eso abriría el teclado) y bloqueo
  // del scroll de la lista que queda detrás. En variante `page` la ficha es el
  // documento, así que no hay nada que atrapar.
  useEffect(() => {
    if (!open || variant === "page") return
    panelRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open, variant])

  /** Escape cierra y Tab no se escapa del panel. */
  function onPanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== "Tab") return
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    if (!focusables || focusables.length === 0) return
    const first = focusables.item(0)
    const last = focusables.item(focusables.length - 1)
    if (!first || !last) return
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true)
    try {
      await action()
      toast(success, "success")
      await load()
      onChanged()
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo completar la acción", "error")
    } finally {
      setBusy(false)
    }
  }

  /**
   * Las etiquetas se guardan con su propio estado (`tagBusy`) en vez de `run`
   * para que pulsar varias seguidas no bloquee el resto de la ficha.
   */
  async function applyTags(next: readonly string[], success: string) {
    const setTags = actionsRef.current.setTags
    if (!setTags) return
    setTagBusy(true)
    try {
      await setTags(prospectId, next)
      toast(success, "success")
      await load()
      onChanged()
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudieron guardar las etiquetas", "error")
    } finally {
      setTagBusy(false)
    }
  }

  function addTagFromDraft(e: React.FormEvent) {
    e.preventDefault()
    if (!detail || !tagDraft.trim()) return
    const current = detail.tags ?? []
    const next = addTags(current, [tagDraft])
    setTagDraft("")
    if (next.join("\u0000") === current.join("\u0000")) return
    void applyTags(next, "Etiqueta añadida")
  }

  const prospect = detail?.prospect ?? null
  const tags = detail?.tags ?? []
  const activities = detail?.activities ?? []
  // `requestReload` no cierra sobre `load`: el compilador de React rechaza
  // pasar durante el render un valor derivado de un ref (`actionsRef`), y
  // `load` lo es. Un contador de estado es un disparador equivalente y estable.
  const requestReload = () => setReloadToken((t) => t + 1)
  const visibleActivities =
    activityFilter === "todos" ? activities : activities.filter((a) => a.type === activityFilter)
  const due = prospect ? isFollowUpDue(prospect.next_follow_up_at) : false
  const canAssign = Boolean(actions.listSellers && actions.assign)
  const canClose = Boolean(actions.closeDeal)
  const isAdmin = scope.kind === "admin"
  const closed = prospect ? isCrmClosed(prospect.status) : false

  /**
   * Cerrar es una decisión, no un cambio de estado: por eso pide confirmación y,
   * al perder, el motivo. El desplegable de estado sigue existiendo para
   * corregir un estado mal puesto, pero no registra causa.
   */
  function confirmClose() {
    const closeDeal = actions.closeDeal
    if (!closeDeal || !prospect || closeOutcome === null) return
    const outcome = closeOutcome
    void run(
      async () => {
        await closeDeal(prospect.id, outcome, outcome === "perdido" ? lossReason || null : null)
        setCloseOutcome(null)
        setLossReason("")
      },
      outcome === "perdido" ? "Trato cerrado como perdido" : "Trato cerrado como ganado"
    )
  }

  if (!open) return null

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={variant === "drawer" ? "true" : undefined}
      aria-labelledby="crm-detail-title"
      tabIndex={-1}
      onKeyDown={onPanelKeyDown}
      onClick={variant === "drawer" ? (e) => e.stopPropagation() : undefined}
      className={
        variant === "drawer"
          ? "flex h-full w-full max-w-lg flex-col overflow-hidden bg-white shadow-xl outline-none"
          : "flex w-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm outline-none"
      }
    >
      <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="min-w-0">
          <h2 id="crm-detail-title" className="truncate text-base font-bold text-gray-900">
            {prospect?.name ?? title}
          </h2>
          {prospect && (
            <p className="mt-0.5 text-[11px] text-gray-500">
              {prospect.restaurant_name ?? "Sin restaurante"} ·{" "}
              {SOURCE_LABEL[prospect.source] ?? prospect.source}
              {isAdmin && prospect.seller_id === null && (
                <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
                  Sin asignar
                </span>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar ficha"
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className={variant === "drawer" ? "flex-1 overflow-y-auto px-5 py-4" : "px-5 py-4"}>
        {loading && (
          <p className="flex items-center gap-2 py-8 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Cargando
            ficha...
          </p>
        )}

        {error && !loading && (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Reintentar
            </button>
          </div>
        )}

        {detail && prospect && !loading && !error && (
          <div className="space-y-5">
            <section className="flex flex-wrap gap-2">
              {prospect.whatsapp && (
                <a
                  href={`https://wa.me/${prospect.whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </a>
              )}
              {prospect.phone && (
                <a
                  href={`tel:${prospect.phone.replace(/\s/g, "")}`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <Phone className="h-3.5 w-3.5" /> Llamar
                </a>
              )}
              {prospect.email && (
                <a
                  href={`mailto:${prospect.email}`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <Mail className="h-3.5 w-3.5" /> Correo
                </a>
              )}
              {prospect.city_name && (
                <span className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-500">
                  <MapPin className="h-3.5 w-3.5" /> {prospect.city_name}
                </span>
              )}
              {isAdmin && detail.lead && (
                <a
                  href={`/admin/leads?tab=leads&box=todos&q=${encodeURIComponent(detail.lead.email)}`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Lead #{detail.lead.id}
                </a>
              )}
              {slots?.contactActions?.(prospect)}
            </section>

            {actions.setTags && (
              <section>
                <span className={LABEL}>Etiquetas</span>
                {tags.length === 0 ? (
                  <p className="text-xs text-gray-400">Sin etiquetas todavía.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <li
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2 pr-1 text-[11px] font-semibold text-brand-700"
                      >
                        {tagLabel(tag)}
                        <button
                          type="button"
                          disabled={tagBusy}
                          aria-label={`Quitar la etiqueta ${tagLabel(tag)}`}
                          onClick={() => void applyTags(toggleTag(tags, tag), "Etiqueta quitada")}
                          className="rounded-full p-0.5 text-brand-600 hover:bg-brand-100 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <form className="mt-2 flex gap-2" onSubmit={addTagFromDraft}>
                  <label className="sr-only" htmlFor="crm-tag-input">
                    Nueva etiqueta
                  </label>
                  <input
                    id="crm-tag-input"
                    value={tagDraft}
                    disabled={tagBusy || tags.length >= MAX_TAGS_PER_PROSPECT}
                    onChange={(e) => setTagDraft(e.target.value)}
                    placeholder={
                      tags.length >= MAX_TAGS_PER_PROSPECT
                        ? `Máximo ${MAX_TAGS_PER_PROSPECT} etiquetas`
                        : "vip, mayoreo, sin respuesta..."
                    }
                    className={FIELD}
                  />
                  <button
                    type="submit"
                    disabled={tagBusy || !tagDraft.trim() || tags.length >= MAX_TAGS_PER_PROSPECT}
                    className="shrink-0 rounded-xl bg-gray-900 px-3 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    Añadir
                  </button>
                </form>
                <p className="mt-1 text-[11px] text-gray-400">
                  Se guardan en minúsculas y sin acentos: <em>Vip</em> y <em>vip</em> son la misma.
                </p>
              </section>
            )}

            <section className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className={LABEL}>Estado</span>
                <select
                  value={prospect.status}
                  disabled={busy}
                  aria-label="Estado del prospecto"
                  onChange={(e) =>
                    void run(
                      () => actions.setStatus(prospect.id, e.target.value as CrmStatus),
                      "Estado actualizado"
                    )
                  }
                  className={FIELD}
                >
                  {CRM_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {CRM_STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
              </div>
              {canAssign && actions.assign && (
                <div>
                  <span className={LABEL}>Vendedor asignado</span>
                  <select
                    value={prospect.seller_id ?? ""}
                    disabled={busy}
                    aria-label="Vendedor asignado"
                    onChange={(e) => {
                      const assign = actions.assign
                      if (!assign) return
                      void run(
                        () => assign(prospect.id, e.target.value || null),
                        e.target.value ? "Prospecto asignado" : "Prospecto sin asignar"
                      )
                    }}
                    className={FIELD}
                  >
                    <option value="">Sin asignar</option>
                    {sellers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="col-span-2">
                <span className={LABEL}>Próximo seguimiento</span>
                <div className="flex items-center gap-2">
                  <input
                    key={prospect.next_follow_up_at ?? "sin-fecha"}
                    type="date"
                    disabled={busy}
                    aria-label="Próximo seguimiento"
                    // El día se lee y se escribe en hora local del negocio:
                    // `slice(0,10)` sobre el ISO mostraba el día UTC, que en
                    // México es el anterior por la tarde.
                    defaultValue={
                      prospect.next_follow_up_at
                        ? dayKeyOf(DEFAULT_TIMEZONE, new Date(prospect.next_follow_up_at))
                        : ""
                    }
                    onChange={(e) =>
                      void run(
                        () =>
                          actions.setFollowUp(
                            prospect.id,
                            e.target.value
                              ? new Date(`${e.target.value}T09:00:00`).toISOString()
                              : null
                          ),
                        "Seguimiento actualizado"
                      )
                    }
                    className={FIELD}
                  />
                  {due && (
                    <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-700">
                      Vencido
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-gray-400">
                  {prospect.last_contact_at
                    ? `Último contacto ${formatRelativeTime(prospect.last_contact_at)}`
                    : "Sin contacto registrado todavía"}
                </p>
              </div>
            </section>

            {canClose && (
              <section className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={LABEL}>Cierre del trato</span>
                  {closed && (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                      {CRM_CLOSE_OUTCOME_LABEL[prospect.status === "perdido" ? "perdido" : "ganado"]}
                    </span>
                  )}
                </div>
                {closed ? (
                  <p className="text-xs text-gray-600">
                    {prospect.status === "perdido"
                      ? `Perdido · ${
                          prospect.loss_reason
                            ? CRM_LOSS_REASON_LABEL[prospect.loss_reason]
                            : "motivo no registrado"
                        }`
                      : "Ganado"}
                    {prospect.closed_at && ` · ${formatRelativeTime(prospect.closed_at)}`}
                  </p>
                ) : closeOutcome === null ? (
                  <>
                    <p className="mb-2 text-[11px] text-gray-500">
                      Se registra la fecha del cierre y, al perder, el motivo. Reabrir se hace
                      desde el estado.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setCloseOutcome("ganado")}
                        className="min-h-[44px] flex-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                      >
                        Ganado
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setCloseOutcome("perdido")}
                        className="min-h-[44px] flex-1 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40"
                      >
                        Perdido
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    {closeOutcome === "perdido" && (
                      <div>
                        <label className={LABEL} htmlFor="crm-loss-reason">
                          Motivo de pérdida (obligatorio)
                        </label>
                        <select
                          id="crm-loss-reason"
                          value={lossReason}
                          disabled={busy}
                          onChange={(e) => setLossReason(e.target.value as CrmLossReason | "")}
                          className={FIELD}
                        >
                          <option value="">Elige un motivo…</option>
                          {CRM_LOSS_REASONS.map((reason) => (
                            <option key={reason} value={reason}>
                              {CRM_LOSS_REASON_LABEL[reason]}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy || (closeOutcome === "perdido" && !lossReason)}
                        onClick={confirmClose}
                        className="min-h-[44px] flex-1 rounded-xl bg-gray-900 px-3 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
                      >
                        {closeOutcome === "perdido" ? "Cerrar como perdido" : "Cerrar como ganado"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setCloseOutcome(null)
                          setLossReason("")
                        }}
                        className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            <section>
              <label className={LABEL} htmlFor="crm-detail-notes">
                Notas internas
              </label>
              <textarea
                id="crm-detail-notes"
                value={notesDraft}
                rows={3}
                disabled={busy}
                onChange={(e) => {
                  setNotesDraft(e.target.value)
                  setNotesDirty(true)
                }}
                className={FIELD}
                placeholder="Contexto del negocio, objeciones, acuerdos..."
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !notesDirty}
                  onClick={() =>
                    void run(
                      () => actions.setNotes(prospect.id, notesDraft || null),
                      "Notas guardadas"
                    )
                  }
                  className="min-h-[44px] rounded-xl bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
                >
                  Guardar notas
                </button>
                {notesDirty && <span className="text-[11px] text-amber-700">Sin guardar</span>}
              </div>
            </section>

            {actions.listTasks && (
              <ProspectTasks
                prospectId={prospect.id}
                listTasks={actions.listTasks}
                addTask={actions.addTask}
                completeTask={actions.completeTask}
                reopenTask={actions.reopenTask}
                deleteTask={actions.deleteTask}
                reloadToken={reloadToken}
                disabled={busy}
              />
            )}

            {slots?.extra?.(prospect)}

            {slots?.activityForm ? (
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
                  <Plus className="h-3.5 w-3.5" /> Registrar actividad
                </h3>
                {slots.activityForm({ prospect, onSaved: requestReload })}
              </section>
            ) : (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
                <Plus className="h-3.5 w-3.5" /> Registrar actividad
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={activityType}
                  aria-label="Tipo de actividad"
                  onChange={(e) => setActivityType(e.target.value as ActivityType)}
                  className={FIELD}
                >
                  {ACTIVITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ACTIVITY_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
                <select
                  value={activityOutcome}
                  aria-label="Resultado de la actividad"
                  onChange={(e) => setActivityOutcome(e.target.value)}
                  className={FIELD}
                >
                  <option value="">Sin resultado</option>
                  {ACTIVITY_OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {ACTIVITY_OUTCOME_LABEL[o] ?? o}
                    </option>
                  ))}
                </select>
                <input
                  value={activitySummary}
                  aria-label="Resumen de la actividad"
                  placeholder="Resumen breve"
                  onChange={(e) => setActivitySummary(e.target.value)}
                  className={`${FIELD} col-span-2`}
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await actions.addActivity(prospect.id, {
                      type: activityType,
                      outcome: activityOutcome || null,
                      summary: activitySummary || null,
                    })
                    setActivitySummary("")
                    setActivityOutcome("")
                  }, "Actividad registrada")
                }
                className="mt-2 min-h-[44px] w-full rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Registrar
              </button>
            </section>
            )}

            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
                  <ActivityIcon className="h-3.5 w-3.5" /> Historial
                </h3>
                {detail.activities.length > 0 && (
                  <>
                    <label className="sr-only" htmlFor="crm-activity-filter">
                      Filtrar actividades por tipo
                    </label>
                    <select
                      id="crm-activity-filter"
                      value={activityFilter}
                      onChange={(e) => setActivityFilter(e.target.value as ActivityType | "todos")}
                      className="rounded-xl border border-gray-200 px-2 py-1 text-[11px]"
                    >
                      <option value="todos">Todas</option>
                      {ACTIVITY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {ACTIVITY_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              {detail.activities.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-3 py-4 text-center text-[11px] text-gray-500">
                  Sin actividad registrada
                </p>
              ) : visibleActivities.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-3 py-4 text-center text-[11px] text-gray-500">
                  Sin actividades de este tipo. Cambia el filtro para ver el resto.
                </p>
              ) : (
                <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-gray-100">
                  {visibleActivities.map((a) => (
                    <li key={a.id} className="relative pl-10">
                      <span className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border border-gray-100 bg-gray-50 text-sm">
                        {ACTIVITY_ICON[a.type] ?? "•"}
                      </span>
                      <div className="rounded-xl border border-gray-200 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-gray-800">
                            {ACTIVITY_TYPE_LABEL[a.type] ?? a.type}
                            {a.outcome && (
                              <span className="ml-1.5 font-normal text-gray-500">
                                · {ACTIVITY_OUTCOME_LABEL[a.outcome] ?? a.outcome}
                              </span>
                            )}
                            {a.direction === "entrante" && (
                              <span className="ml-1.5 font-normal text-gray-400">· Entrante</span>
                            )}
                            {a.duration_seconds ? (
                              <span className="ml-1.5 font-normal text-gray-400">
                                · {Math.round(a.duration_seconds / 60)} min
                              </span>
                            ) : null}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="whitespace-nowrap text-[11px] text-gray-400">
                              {formatRelativeTime(a.occurred_at)}
                            </span>
                            {activityActions?.onEdit && (
                              <button
                                type="button"
                                onClick={() => activityActions.onEdit?.(a)}
                                title="Editar actividad"
                                aria-label="Editar actividad"
                                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {activityActions?.onDelete && (
                              <button
                                type="button"
                                onClick={() => activityActions.onDelete?.(a)}
                                title="Eliminar actividad"
                                aria-label="Eliminar actividad"
                                className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </span>
                        </div>
                        {a.summary && (
                          <p className="mt-1 text-[11px] text-gray-600">{a.summary}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {renderConversation && (
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
                  <MessageCircle className="h-3.5 w-3.5" /> Conversación de WhatsApp
                </h3>
                {renderConversation(prospectId, onChanged)}
              </section>
            )}

            <section className="border-t border-gray-100 pt-3 text-[11px] text-gray-400">
              <p className="flex items-center gap-1">
                <CalendarClock className="h-3 w-3" /> Alta{" "}
                {formatRelativeTime(prospect.created_at)}
              </p>
              <p className="mt-0.5 flex items-center gap-1">
                <UserRound className="h-3 w-3" />
                {detail.seller ? `Asignado a ${detail.seller.name}` : "Sin vendedor asignado"}
              </p>
              {isAdmin && detail.lead && (
                <p className="mt-0.5">
                  Origen: lead #{detail.lead.id} (
                  {SOURCE_LABEL[detail.lead.source] ?? detail.lead.source})
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )

  if (variant === "page") return panel

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      {panel}
    </div>
  )
}
