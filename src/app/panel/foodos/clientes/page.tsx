"use client"

// ============================================================
// Clientes y recurrencia — CRM (segmentos, gasto, pedidos) +
// automatizaciones de WhatsApp (agradecimiento, winback,
// promos de temporada) + historial de campañas.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  getMyRestaurant,
  listCustomers,
  listAutomations,
  upsertAutomation,
  listCampaigns,
  insertCampaign,
  deleteCampaign,
} from "../actions"
import { formatMoney, SEGMENT_META, segmentCustomer } from "@/lib/foodos"
import type {
  FoodosRestaurant,
  FoodosCustomer,
  FoodosAutomation,
  FoodosAutomationType,
  FoodosCampaign,
  FoodosCustomerSegment,
} from "@/types/foodos"
import {
  Users,
  Loader2,
  Plus,
  Trash2,
  Send,
  MessageSquare,
  Percent,
  CalendarClock,
} from "lucide-react"

const AUTOMATION_TYPES: { id: FoodosAutomationType; label: string; hint: string }[] = [
  { id: "order_confirmation", label: "Confirmación de pedido", hint: "Se envía al confirmar cada pedido" },
  { id: "thank_you", label: "Agradecimiento", hint: "Después del pedido, con incentivo para volver" },
  { id: "winback", label: "Winback (reactivación)", hint: "Clientes inactivos por X días" },
  { id: "season_promo", label: "Promo de temporada", hint: "Campaña masiva por temporada" },
  { id: "off_hours", label: "Horario valle", hint: "Enviar cuando hay poca demanda" },
  { id: "new_product", label: "Nuevo producto", hint: "Aviso de platillo nuevo" },
]

interface AutomationForm {
  id?: string
  type: FoodosAutomationType
  name: string
  message: string
  days_without_order: string
  discount_pct: string
}

const EMPTY_AUTO: AutomationForm = {
  type: "thank_you",
  name: "",
  message: "",
  days_without_order: "30",
  discount_pct: "10",
}

const SEGMENT_FILTERS: { id: FoodosCustomerSegment | "all"; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "vip", label: "VIP" },
  { id: "recurrente", label: "Recurrentes" },
  { id: "nuevo", label: "Nuevos" },
  { id: "inactivo", label: "Inactivos" },
]

export default function ClientesPage() {
  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [customers, setCustomers] = useState<FoodosCustomer[]>([])
  const [automations, setAutomations] = useState<FoodosAutomation[]>([])
  const [campaigns, setCampaigns] = useState<FoodosCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [segmentFilter, setSegmentFilter] = useState<FoodosCustomerSegment | "all">("all")
  const [search, setSearch] = useState("")

  const [showAutoForm, setShowAutoForm] = useState(false)
  const [autoForm, setAutoForm] = useState<AutomationForm>(EMPTY_AUTO)
  const [saving, setSaving] = useState(false)
  const [sendingCampaign, setSendingCampaign] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await getMyRestaurant()
      setRestaurant(r)
      if (r) {
        const [cs, as, cps] = await Promise.all([
          listCustomers(r.id),
          listAutomations(r.id),
          listCampaigns(r.id),
        ])
        setCustomers(cs)
        setAutomations(as)
        setCampaigns(cps)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar clientes")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Recalcular segmento en cliente (espejo del trigger) por si pasó el tiempo
  const computedSegments = useMemo(() => {
    const map = new Map<string, FoodosCustomerSegment>()
    for (const c of customers) map.set(c.id, segmentCustomer(c))
    return map
  }, [customers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return customers.filter((c) => {
      const seg = computedSegments.get(c.id) ?? c.segment
      if (segmentFilter !== "all" && seg !== segmentFilter) return false
      if (!q) return true
      return (
        (c.name ?? "").toLowerCase().includes(q) ||
        c.phone.includes(q.replace(/\D/g, ""))
      )
    })
  }, [customers, computedSegments, segmentFilter, search])

  const stats = useMemo(() => {
    const seg = computedSegments
    const active = customers.filter((c) => seg.get(c.id) !== "inactivo")
    const totalSpend = active.reduce((s, c) => s + c.total_spend, 0)
    const avgTicket = active.length ? totalSpend / active.length : 0
    return {
      total: customers.length,
      active: active.length,
      inactive: customers.length - active.length,
      totalSpend,
      avgTicket,
    }
  }, [customers, computedSegments])

  async function handleSaveAuto(e: React.FormEvent) {
    e.preventDefault()
    if (!restaurant || !autoForm.name.trim()) return
    setSaving(true)
    try {
      const triggerConfig =
        autoForm.type === "winback"
          ? { days_without_order: Number(autoForm.days_without_order) || 30, target_segment: "inactivo" as const }
          : autoForm.type === "season_promo"
            ? { season: autoForm.name, target_segment: "recurrente" as const }
            : { target_segment: "recurrente" as const }
      await upsertAutomation({
        id: autoForm.id,
        restaurant_id: restaurant.id,
        type: autoForm.type,
        name: autoForm.name.trim(),
        trigger_config: triggerConfig,
        message: autoForm.message.trim() || null,
        incentive_config: autoForm.discount_pct ? { discount_pct: Number(autoForm.discount_pct) } : {},
        is_active: true,
      })
      setShowAutoForm(false)
      setAutoForm(EMPTY_AUTO)
      setAutomations(await listAutomations(restaurant.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar automatización")
    } finally {
      setSaving(false)
    }
  }

  async function runCampaign(auto: FoodosAutomation) {
    if (!restaurant) return
    if (!confirm(`¿Ejecutar "${auto.name}" ahora? Se registrará una campaña para los clientes objetivo.`)) return
    setSendingCampaign(auto.id)
    try {
      await insertCampaign({
        restaurant_id: restaurant.id,
        automation_id: auto.id,
        status: "scheduled",
        channel: "whatsapp",
      })
      setCampaigns(await listCampaigns(restaurant.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear campaña")
    } finally {
      setSendingCampaign(null)
    }
  }

  async function removeCampaign(id: string) {
    if (!confirm("¿Eliminar esta campaña del historial?")) return
    await deleteCampaign(id)
    setCampaigns(await listCampaigns(restaurant!.id))
  }

  if (!restaurant) {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-24 text-stone-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
        </div>
      )
    }
    return (
      <div className="max-w-2xl mx-auto mt-16 bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
        <h1 className="text-xl font-black text-stone-900">Primero configura tu restaurante</h1>
        <p className="text-stone-600 mt-2">Registra tu perfil para empezar a capturar clientes con tus pedidos.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-stone-900">Clientes y recurrencia</h1>
          <p className="text-sm text-stone-500">Conoce a tus clientes y automatiza el regreso por WhatsApp.</p>
        </div>
        <button
          onClick={() => { setAutoForm(EMPTY_AUTO); setShowAutoForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4" /> Nueva automatización
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Clientes" value={String(stats.total)} />
        <StatCard label="Activos" value={String(stats.active)} />
        <StatCard label="Gasto total" value={formatMoney(stats.totalSpend)} />
        <StatCard label="Gasto promedio" value={formatMoney(stats.avgTicket)} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* CRM */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-stone-500" />
              <h2 className="font-bold text-stone-900">Base de clientes</h2>
              <span className="ml-auto text-xs text-stone-400">{filtered.length} mostrados</span>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o teléfono..."
                className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {SEGMENT_FILTERS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSegmentFilter(s.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    segmentFilter === s.id ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <p className="text-sm text-stone-400 py-8 text-center">
                Aún no hay clientes. Cuando alguien pida por tu menú digital, aparecerá aquí.
              </p>
            ) : (
              <div className="divide-y divide-stone-100">
                {filtered.map((c) => {
                  const seg = computedSegments.get(c.id) ?? c.segment
                  const meta = SEGMENT_META[seg]
                  return (
                    <div key={c.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900 truncate">
                          {c.name ?? "Sin nombre"}
                        </p>
                        <p className="text-xs text-stone-500">{c.phone}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.badge}`}>
                          {meta.label}
                        </span>
                        <p className="text-xs text-stone-500 mt-1">{c.total_orders} pedidos</p>
                        <p className="text-sm font-bold text-stone-900">{formatMoney(c.total_spend)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Automatizaciones + campañas */}
        <div className="space-y-6">
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5 text-stone-500" />
              <h2 className="font-bold text-stone-900">Automatizaciones</h2>
            </div>

            {automations.length === 0 ? (
              <p className="text-sm text-stone-400 py-4">
                Crea tu primera automatización para reactivar clientes o agradecer pedidos.
              </p>
            ) : (
              <div className="space-y-2">
                {automations.map((a) => {
                  const typeMeta = AUTOMATION_TYPES.find((t) => t.id === a.type)
                  return (
                    <div key={a.id} className="bg-stone-50 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-stone-900">{a.name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.is_active ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-500"}`}>
                          {a.is_active ? "Activa" : "Inactiva"}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 mt-0.5">{typeMeta?.label ?? a.type}</p>
                      {a.incentive_config?.discount_pct && (
                        <p className="flex items-center gap-1 text-xs text-emerald-600 font-semibold mt-1">
                          <Percent className="w-3 h-3" /> {a.incentive_config.discount_pct}% de incentivo
                        </p>
                      )}
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => runCampaign(a)}
                          disabled={sendingCampaign === a.id}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {sendingCampaign === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          Ejecutar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Historial de campañas */}
          <div className="bg-white border border-stone-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock className="w-5 h-5 text-stone-500" />
              <h2 className="font-bold text-stone-900">Campañas</h2>
            </div>
            {campaigns.length === 0 ? (
              <p className="text-sm text-stone-400 py-4">Sin campañas ejecutadas.</p>
            ) : (
              <div className="space-y-2">
                {campaigns.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 bg-stone-50 rounded-xl p-3">
                    <div>
                      <p className="text-xs font-semibold text-stone-700">
                        {new Date(c.created_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                      <p className="text-xs text-stone-500 capitalize">{c.status} · {c.channel}</p>
                    </div>
                    <button
                      onClick={() => removeCampaign(c.id)}
                      className="text-stone-400 hover:text-red-600"
                      aria-label="Eliminar campaña"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal nueva automatización */}
      {showAutoForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveAuto} className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-black text-stone-900">Nueva automatización</h2>
              <button type="button" onClick={() => setShowAutoForm(false)} className="text-stone-400 hover:text-stone-600">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  {AUTOMATION_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setAutoForm((f) => ({ ...f, type: t.id }))}
                      className={`rounded-xl p-2 text-left border-2 text-xs ${
                        autoForm.type === t.id ? "border-emerald-500 bg-emerald-50" : "border-stone-200"
                      }`}
                    >
                      <span className="font-bold text-stone-900 block">{t.label}</span>
                      <span className="text-stone-500">{t.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">Nombre</label>
                <input
                  value={autoForm.name}
                  onChange={(e) => setAutoForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ej. Regreso de clientes inactivos"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {autoForm.type === "winback" && (
                <div>
                  <label className="text-xs font-semibold text-stone-600 block mb-1">Días sin pedir</label>
                  <input
                    value={autoForm.days_without_order}
                    onChange={(e) => setAutoForm((f) => ({ ...f, days_without_order: e.target.value }))}
                    type="number"
                    min="1"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">Mensaje</label>
                <textarea
                  value={autoForm.message}
                  onChange={(e) => setAutoForm((f) => ({ ...f, message: e.target.value }))}
                  rows={3}
                  placeholder="Ej. ¡Hola! Hace tiempo que no te vemos, te esperamos con un 10% de descuento esta semana 🍔"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1">Incentivo (% descuento)</label>
                <input
                  value={autoForm.discount_pct}
                  onChange={(e) => setAutoForm((f) => ({ ...f, discount_pct: e.target.value }))}
                  type="number"
                  min="0"
                  max="100"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowAutoForm(false)}
                className="px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !autoForm.name.trim()}
                className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-xl font-black text-stone-900 mt-1">{value}</p>
    </div>
  )
}
