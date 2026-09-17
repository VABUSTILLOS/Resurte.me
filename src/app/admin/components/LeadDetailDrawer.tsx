"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Activity as ActivityIcon,
  CalendarClock,
  ExternalLink,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  UserRound,
  X,
} from "lucide-react"
import {
  addCrmActivity,
  assignCrmProspect,
  getAdminProspectDetail,
  getAdminSellers,
  setCrmProspectFollowUp,
  updateCrmProspectNotes,
  updateCrmProspectStatus,
} from "../actions"
import { CRM_STATUSES, CRM_STATUS_LABEL, isFollowUpDue } from "@/lib/crm-pipeline"
import {
  ACTIVITY_OUTCOMES,
  ACTIVITY_OUTCOME_LABEL,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABEL,
  PROSPECT_STATUS_LABEL,
  type Activity,
  type ActivityType,
  type Prospect,
} from "@/lib/comercializacion/types"
import { formatRelativeTime } from "@/lib/relative-time"
import { LeadConversationPanel } from "./LeadConversations"
import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"
import { useToast } from "@/components/toast"

interface LeadOrigin {
  id: number
  email: string
  source: string
  created_at: string
}

interface Detail {
  prospect: Prospect
  activities: Activity[]
  seller: { id: string; name: string } | null
  lead: LeadOrigin | null
}

const SOURCE_LABEL: Record<string, string> = {
  checkout_drawer: "Checkout",
  exit_intent: "Exit intent",
  restaurantes_landing: "Landing /restaurantes",
  manual: "Alta manual",
  lead_web: "Lead web",
}

const FIELD =
  "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
const LABEL = "block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1"

interface LeadDetailDrawerProps {
  prospectId: number
  onClose: () => void
  /** Se llama tras cualquier cambio que altere el tablero. */
  onChanged: () => void
}

export function LeadDetailDrawer({ prospectId, onClose, onChanged }: LeadDetailDrawerProps) {
  const { toast } = useToast()
  const panelRef = useRef<HTMLDivElement>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [sellers, setSellers] = useState<{ id: string; name: string; email: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notesDraft, setNotesDraft] = useState("")
  const [notesDirty, setNotesDirty] = useState(false)
  const [activityType, setActivityType] = useState<ActivityType>("llamada")
  const [activityOutcome, setActivityOutcome] = useState("")
  const [activitySummary, setActivitySummary] = useState("")

  const load = useCallback(async () => {
    try {
      const data = await getAdminProspectDetail(prospectId)
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
    void Promise.resolve().then(load)
  }, [load])

  useEffect(() => {
    void getAdminSellers()
      .then(setSellers)
      .catch(() => setSellers([]))
  }, [])

  // Foco al panel (no a un input: en móvil eso abriría el teclado) y bloqueo
  // del scroll de la lista que queda detrás.
  useEffect(() => {
    panelRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

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

  const prospect = detail?.prospect ?? null
  const due = prospect ? isFollowUpDue(prospect.next_follow_up_at) : false

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-drawer-title"
        tabIndex={-1}
        onKeyDown={onPanelKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col overflow-hidden bg-white shadow-xl outline-none"
      >
        <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="lead-drawer-title" className="truncate text-base font-bold text-gray-900">
              {prospect?.name ?? "Ficha del prospecto"}
            </h2>
            {prospect && (
              <p className="mt-0.5 text-[11px] text-gray-500">
                {prospect.restaurant_name ?? "Sin restaurante"} ·{" "}
                {SOURCE_LABEL[prospect.source] ?? prospect.source}
                {prospect.seller_id === null && (
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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <p className="flex items-center gap-2 py-8 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Cargando ficha...
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
                {detail?.lead && (
                  <a
                    href={`/admin/leads?tab=leads&box=todos&q=${encodeURIComponent(detail.lead.email)}`}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Lead #{detail.lead.id}
                  </a>
                )}
              </section>

              <section className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className={LABEL}>Estado</span>
                  <select
                    value={prospect.status}
                    disabled={busy}
                    aria-label="Estado del prospecto"
                    onChange={(e) =>
                      void run(
                        () => updateCrmProspectStatus(prospect.id, e.target.value),
                        "Estado actualizado"
                      )
                    }
                    className={FIELD}
                  >
                    {CRM_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {PROSPECT_STATUS_LABEL[status] ?? CRM_STATUS_LABEL[status] ?? status}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className={LABEL}>Vendedor asignado</span>
                  <select
                    value={prospect.seller_id ?? ""}
                    disabled={busy}
                    aria-label="Vendedor asignado"
                    onChange={(e) =>
                      void run(
                        () => assignCrmProspect(prospect.id, e.target.value || null),
                        e.target.value ? "Prospecto asignado" : "Prospecto sin asignar"
                      )
                    }
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
                            setCrmProspectFollowUp(
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

              <section>
                <label className={LABEL} htmlFor="lead-drawer-notes">
                  Notas internas
                </label>
                <textarea
                  id="lead-drawer-notes"
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
                      void run(() => updateCrmProspectNotes(prospect.id, notesDraft), "Notas guardadas")
                    }
                    className="min-h-[44px] rounded-xl bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
                  >
                    Guardar notas
                  </button>
                  {notesDirty && <span className="text-[11px] text-amber-700">Sin guardar</span>}
                </div>
              </section>

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
                      await addCrmActivity(prospect.id, {
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

              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
                  <ActivityIcon className="h-3.5 w-3.5" /> Historial
                </h3>
                {detail.activities.length === 0 ? (
                  <p className="rounded-xl bg-gray-50 px-3 py-4 text-center text-[11px] text-gray-400">
                    Sin actividad registrada
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {detail.activities.map((a) => (
                      <li key={a.id} className="rounded-xl border border-gray-200 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-gray-800">
                            {ACTIVITY_TYPE_LABEL[a.type] ?? a.type}
                            {a.outcome && (
                              <span className="ml-1.5 font-normal text-gray-500">
                                · {ACTIVITY_OUTCOME_LABEL[a.outcome] ?? a.outcome}
                              </span>
                            )}
                          </span>
                          <span className="whitespace-nowrap text-[11px] text-gray-400">
                            {formatRelativeTime(a.occurred_at)}
                          </span>
                        </div>
                        {a.summary && <p className="mt-1 text-[11px] text-gray-600">{a.summary}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
                  <MessageCircle className="h-3.5 w-3.5" /> Conversación de WhatsApp
                </h3>
                <LeadConversationPanel
                  key={prospectId}
                  prospectId={prospectId}
                  onSent={onChanged}
                  className="h-[420px]"
                />
              </section>

              <section className="border-t border-gray-100 pt-3 text-[11px] text-gray-400">
                <p className="flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" /> Alta {formatRelativeTime(prospect.created_at)}
                </p>
                <p className="mt-0.5 flex items-center gap-1">
                  <UserRound className="h-3 w-3" />
                  {detail.seller ? `Asignado a ${detail.seller.name}` : "Sin vendedor asignado"}
                </p>
                {detail.lead && (
                  <p className="mt-0.5">
                    Origen: lead #{detail.lead.id} ({SOURCE_LABEL[detail.lead.source] ?? detail.lead.source})
                  </p>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
