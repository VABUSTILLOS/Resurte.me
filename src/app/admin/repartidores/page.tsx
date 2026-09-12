"use client"

import { useCallback, useEffect, useState } from "react"
import { Bike, Plus, RefreshCcw, Phone } from "lucide-react"

interface Driver {
  id: number
  name: string
  phone: string | null
  is_active: boolean
}

/**
 * /admin/repartidores — alta y activación de repartidores asignables a
 * pedidos (desde el detalle del pedido en /admin/pedidos).
 */
export default function AdminRepartidoresPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/drivers", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error al cargar")
      setDrivers(data.drivers ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const createDriver = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/admin/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error al crear")
      setName("")
      setPhone("")
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al crear")
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (d: Driver) => {
    const res = await fetch("/api/admin/drivers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, is_active: !d.is_active }),
    })
    if (res.ok) {
      setDrivers((prev) => prev.map((x) => (x.id === d.id ? { ...x, is_active: !d.is_active } : x)))
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Repartidores</h1>
          <p className="text-sm text-gray-500 mt-1">
            Los repartidores activos se asignan a pedidos desde el detalle del pedido.
            El cliente ve el nombre del repartidor cuando su pedido va en camino.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          Actualizar
        </button>
      </div>

      {/* Alta */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="driver-name" className="text-xs font-semibold text-gray-700">
            Nombre
          </label>
          <input
            id="driver-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Luis Hernández"
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="min-w-[160px]">
          <label htmlFor="driver-phone" className="text-xs font-semibold text-gray-700">
            Teléfono (opcional)
          </label>
          <input
            id="driver-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="614 000 0000"
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={() => void createDriver()}
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Agregar
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-12 text-center">Cargando repartidores…</p>
      ) : drivers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Bike className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Sin repartidores</p>
          <p className="text-xs text-gray-400 mt-1">
            Agrega al primero arriba para asignarlo a los pedidos en camino.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          {drivers.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center">
                <Bike className="w-4 h-4 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{d.name}</p>
                {d.phone && (
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {d.phone}
                  </p>
                )}
              </div>
              <button
                onClick={() => void toggleActive(d)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  d.is_active
                    ? "bg-brand-50 text-brand-700 border border-brand-200"
                    : "bg-gray-100 text-gray-500 border border-gray-200"
                }`}
              >
                {d.is_active ? "Activo" : "Inactivo"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
