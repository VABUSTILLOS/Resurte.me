"use client"

import { useCallback, useEffect, useState } from "react"
import { Gift, RefreshCcw, Plus, Eye, EyeOff, Save } from "lucide-react"

interface RewardService {
  id: string
  name: string
  tier: string
  cost: number
  category: string
  icon: string | null
  is_active: boolean
  display_order: number
}

const TIERS = ["verde", "plata", "oro", "diamante"]
const CATEGORIES = ["presencia", "trafico", "infraestructura"]

/**
 * /admin/recompensas — catálogo canjeable de la Tienda de Crecimiento.
 * Los cambios se reflejan de inmediato en /recompensas (la tienda pública
 * lee reward_services vía /api/recompensas/servicios).
 */
export default function AdminRecompensasPage() {
  const [services, setServices] = useState<RewardService[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({})
  const [showNew, setShowNew] = useState(false)
  const [newService, setNewService] = useState({
    id: "",
    name: "",
    tier: "verde",
    cost: "",
    category: "presencia",
    icon: "🎁",
  })

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reward-services", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error al cargar")
      setServices(data.services ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Para event handlers: el reset de loading/error va fuera del efecto.
  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    return load()
  }, [load])

  const save = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/admin/reward-services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Error al guardar")
    await reload()
  }

  const toggleActive = async (s: RewardService) => {
    setBusyId(s.id)
    try {
      await save({ ...s, is_active: !s.is_active })
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setBusyId(null)
    }
  }

  const saveCost = async (s: RewardService) => {
    const cost = Number(costDrafts[s.id]?.replace(/[^0-9.]/g, ""))
    if (!Number.isFinite(cost) || cost <= 0 || cost === s.cost) return
    setBusyId(s.id)
    try {
      await save({ ...s, cost })
      setCostDrafts((prev) => ({ ...prev, [s.id]: "" }))
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setBusyId(null)
    }
  }

  const createService = async () => {
    if (!newService.id.trim() || !newService.name.trim() || !newService.cost) return
    setBusyId("new")
    try {
      await save({
        id: newService.id.trim(),
        name: newService.name.trim(),
        tier: newService.tier,
        cost: Number(newService.cost),
        category: newService.category,
        icon: newService.icon,
        display_order: services.length + 1,
      })
      setShowNew(false)
      setNewService({ id: "", name: "", tier: "verde", cost: "", category: "presencia", icon: "🎁" })
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al crear")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tienda de Crecimiento</h1>
          <p className="text-sm text-gray-500 mt-1">
            Catálogo de servicios canjeables por Créditos Resurte. Los cambios se
            ven al instante en /recompensas.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void reload()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Actualizar
          </button>
          <button
            onClick={() => setShowNew((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo servicio
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showNew && (
        <div className="mb-6 bg-white rounded-2xl border border-brand-200 p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Nuevo servicio</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <input
              placeholder="id (ej. email-marketing)"
              value={newService.id}
              onChange={(e) => setNewService((p) => ({ ...p, id: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs"
            />
            <input
              placeholder="Nombre visible"
              value={newService.name}
              onChange={(e) => setNewService((p) => ({ ...p, name: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs col-span-2"
            />
            <select
              value={newService.tier}
              onChange={(e) => setNewService((p) => ({ ...p, tier: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs"
              aria-label="Nivel requerido"
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              placeholder="Costo en créditos"
              inputMode="numeric"
              value={newService.cost}
              onChange={(e) => setNewService((p) => ({ ...p, cost: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs"
            />
            <select
              value={newService.category}
              onChange={(e) => setNewService((p) => ({ ...p, category: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs"
              aria-label="Categoría"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => void createService()}
            disabled={busyId === "new"}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            Crear servicio
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-12 text-center">Cargando catálogo…</p>
      ) : services.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Gift className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Catálogo vacío</p>
          <p className="text-xs text-gray-400 mt-1">
            Aplica la migración 00075 y/o crea el primer servicio.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50 text-left text-gray-400">
                <th className="px-4 py-3 font-medium">Servicio</th>
                <th className="px-4 py-3 font-medium">Nivel</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium">Costo (créditos)</th>
                <th className="px-4 py-3 font-medium text-center">Visible</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {services.map((s) => (
                <tr key={s.id} className={s.is_active ? "" : "opacity-50"}>
                  <td className="px-4 py-3">
                    <span className="mr-1.5">{s.icon}</span>
                    <span className="font-semibold text-gray-900">{s.name}</span>
                    <span className="block text-[10px] text-gray-400">{s.id}</span>
                  </td>
                  <td className="px-4 py-3 capitalize">{s.tier}</td>
                  <td className="px-4 py-3 capitalize">{s.category}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        inputMode="numeric"
                        defaultValue={s.cost}
                        value={costDrafts[s.id] ?? String(s.cost)}
                        onChange={(e) =>
                          setCostDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))
                        }
                        className="w-24 rounded-lg border border-gray-200 px-2 py-1.5"
                        aria-label={`Costo de ${s.name}`}
                      />
                      <button
                        onClick={() => void saveCost(s)}
                        disabled={busyId === s.id}
                        className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 disabled:opacity-40"
                        aria-label={`Guardar costo de ${s.name}`}
                      >
                        <Save className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => void toggleActive(s)}
                      disabled={busyId === s.id}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-semibold transition-colors ${
                        s.is_active
                          ? "bg-brand-50 text-brand-700 border border-brand-200"
                          : "bg-gray-100 text-gray-500 border border-gray-200"
                      }`}
                      aria-label={s.is_active ? `Ocultar ${s.name}` : `Mostrar ${s.name}`}
                    >
                      {s.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      {s.is_active ? "Activo" : "Oculto"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
