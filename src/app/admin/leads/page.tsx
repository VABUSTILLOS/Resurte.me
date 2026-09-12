"use client"

import { useCallback, useEffect, useState } from "react"
import { Users, Mail, Phone, CalendarClock, ArrowRight } from "lucide-react"
import {
  getAdminLeads,
  getAdminCrmBoard,
  updateCrmProspectStatus,
  updateCrmProspectNotes,
  setCrmProspectFollowUp,
  type AdminLeadRow,
} from "../actions"
import {
  CRM_BOARD_COLUMNS,
  CRM_STATUS_LABEL,
  groupIntoBoard,
  nextCrmStatus,
  isFollowUpDue,
  isCrmStatus,
  type CrmProspect,
  type CrmStatus,
} from "@/lib/crm-pipeline"
import { formatRelativeTime } from "@/lib/relative-time"
import { ToastProvider, useToast } from "@/components/toast"

const SOURCE_LABEL: Record<string, string> = {
  checkout_drawer: "Checkout",
  exit_intent: "Exit intent",
}

export default function AdminLeadsPage() {
  return (
    <ToastProvider>
      <AdminLeadsContent />
    </ToastProvider>
  )
}

function AdminLeadsContent() {
  const { toast } = useToast()
  const [tab, setTab] = useState<"pipeline" | "leads">("pipeline")
  const [prospects, setProspects] = useState<CrmProspect[]>([])
  const [leads, setLeads] = useState<AdminLeadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workingId, setWorkingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [board, leadRows] = await Promise.all([getAdminCrmBoard(), getAdminLeads(100)])
      setProspects(board)
      setLeads(leadRows)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function advance(p: CrmProspect) {
    const next = nextCrmStatus(p.status as CrmStatus)
    if (!next) return
    setWorkingId(p.id)
    try {
      await updateCrmProspectStatus(p.id, next)
      toast(`${p.name} → ${CRM_STATUS_LABEL[next]}`, "success")
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al actualizar", "error")
    } finally {
      setWorkingId(null)
    }
  }

  async function changeStatus(p: CrmProspect, status: string) {
    if (!isCrmStatus(status)) return
    setWorkingId(p.id)
    try {
      await updateCrmProspectStatus(p.id, status)
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al actualizar", "error")
    } finally {
      setWorkingId(null)
    }
  }

  async function editNotes(p: CrmProspect) {
    const notes = window.prompt(`Notas para ${p.name}:`, p.notes ?? "")
    if (notes === null) return
    try {
      await updateCrmProspectNotes(p.id, notes)
      toast("Notas actualizadas", "success")
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al guardar notas", "error")
    }
  }

  async function editFollowUp(p: CrmProspect) {
    const current = p.next_follow_up_at?.slice(0, 10) ?? ""
    const date = window.prompt("Próximo seguimiento (YYYY-MM-DD, vacío para quitar):", current)
    if (date === null) return
    try {
      await setCrmProspectFollowUp(p.id, date.trim() ? `${date.trim()}T09:00:00` : null)
      toast("Seguimiento actualizado", "success")
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al programar seguimiento", "error")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
        Cargando leads y pipeline...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-red-600 text-sm font-medium">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const board = groupIntoBoard(prospects)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads / CRM</h1>
          <p className="text-sm text-gray-500">
            {prospects.length} prospectos en pipeline · {leads.length} leads web recientes
          </p>
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "pipeline"}
            onClick={() => setTab("pipeline")}
            className={`px-3 py-1.5 text-xs font-semibold ${
              tab === "pipeline" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Pipeline CRM
          </button>
          <button
            role="tab"
            aria-selected={tab === "leads"}
            onClick={() => setTab("leads")}
            className={`px-3 py-1.5 text-xs font-semibold ${
              tab === "leads" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Leads web
          </button>
        </div>
      </div>

      {tab === "pipeline" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {CRM_BOARD_COLUMNS.map((col) => (
            <div key={col.key} className="bg-gray-50 rounded-xl border border-gray-200 p-3">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                {col.label}
                <span className="ml-1 text-gray-400">({(board[col.key] ?? []).length})</span>
              </h2>
              <ul className="space-y-2">
                {(board[col.key] ?? []).map((p) => {
                  const next = nextCrmStatus(p.status as CrmStatus)
                  const due = isFollowUpDue(p.next_follow_up_at)
                  return (
                    <li key={p.id} className="bg-white rounded-lg border border-gray-200 p-2.5">
                      <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                      {p.restaurant_name && (
                        <p className="text-xs text-gray-500">{p.restaurant_name}</p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-400">
                        {p.whatsapp && (
                          <span className="inline-flex items-center gap-0.5">
                            <Phone className="w-3 h-3" /> {p.whatsapp}
                          </span>
                        )}
                        {p.email && (
                          <span className="inline-flex items-center gap-0.5">
                            <Mail className="w-3 h-3" /> {p.email}
                          </span>
                        )}
                      </div>
                      {p.next_follow_up_at && (
                        <button
                          type="button"
                          onClick={() => void editFollowUp(p)}
                          className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${
                            due ? "text-red-600" : "text-gray-400"
                          }`}
                          title={new Date(p.next_follow_up_at).toLocaleString("es-MX")}
                        >
                          <CalendarClock className="w-3 h-3" />
                          {due ? "Seguimiento vencido" : "Seguimiento"} ·{" "}
                          {formatRelativeTime(p.next_follow_up_at)}
                        </button>
                      )}
                      {p.notes && (
                        <p className="mt-1 text-[11px] text-gray-500 line-clamp-2" title={p.notes}>
                          {p.notes}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-1.5">
                        {next && (
                          <button
                            type="button"
                            disabled={workingId === p.id}
                            onClick={() => void advance(p)}
                            className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                          >
                            {CRM_STATUS_LABEL[next]}
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                        <select
                          value={p.status}
                          disabled={workingId === p.id}
                          onChange={(e) => void changeStatus(p, e.target.value)}
                          aria-label={`Estado de ${p.name}`}
                          className="text-[11px] border border-gray-200 rounded-lg px-1.5 py-1 text-gray-600"
                        >
                          {Object.entries(CRM_STATUS_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void editNotes(p)}
                          className="text-[11px] text-gray-500 hover:underline"
                        >
                          Notas
                        </button>
                        {!p.next_follow_up_at && (
                          <button
                            type="button"
                            onClick={() => void editFollowUp(p)}
                            className="text-[11px] text-gray-500 hover:underline"
                          >
                            + Seguimiento
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
                {(board[col.key] ?? []).length === 0 && (
                  <li className="text-[11px] text-gray-400 text-center py-3">Vacío</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-400 font-medium">
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Teléfono</th>
                <th className="px-5 py-3">Fuente</th>
                <th className="px-5 py-3">Cupón</th>
                <th className="px-5 py-3">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-xs text-gray-800">{l.email}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">{l.phone ?? "—"}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {SOURCE_LABEL[l.source] ?? l.source}
                  </td>
                  <td className="px-5 py-3 text-xs font-mono text-gray-500">{l.coupon_code ?? "—"}</td>
                  <td
                    className="px-5 py-3 text-xs text-gray-400"
                    title={new Date(l.created_at).toLocaleString("es-MX")}
                  >
                    {formatRelativeTime(l.created_at)}
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">
                    <Users className="w-5 h-5 mx-auto mb-2 text-gray-300" />
                    Sin leads capturados todavía
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
