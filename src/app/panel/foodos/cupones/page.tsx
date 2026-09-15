"use client"

// ============================================================
// Cupones del restaurante — descuentos por porcentaje o monto
// fijo aplicables en el checkout del micrositio.
// ============================================================

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { getFoodosPanelData, listCoupons, upsertCoupon, deleteCoupon } from "../actions"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { formatMoney } from "@/lib/foodos"
import type { FoodosCoupon, FoodosRestaurant } from "@/types/foodos"
import { Ticket, Plus, Trash2, Loader2, Pencil, X } from "lucide-react"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"

interface CouponForm {
  id?: string
  code: string
  type: "percent" | "fixed"
  value: string
  min_order: string
  max_uses: string
  expires_at: string
  is_active: boolean
}

const EMPTY: CouponForm = {
  code: "",
  type: "percent",
  value: "",
  min_order: "",
  max_uses: "",
  expires_at: "",
  is_active: true,
}

export default function CuponesPage() {
  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [coupons, setCoupons] = useState<FoodosCoupon[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<CouponForm | null>(null)

  const load = useCallback(async () => {
    try {
      const { restaurant: r } = await getFoodosPanelData()
      setRestaurant(r)
      if (r) setCoupons(await listCoupons(r.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!restaurant || !form) return
    setSaving(true)
    setError(null)
    try {
      await upsertCoupon({
        id: form.id,
        restaurant_id: restaurant.id,
        code: form.code,
        type: form.type,
        value: Number(form.value) || 0,
        min_order: Number(form.min_order) || 0,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        is_active: form.is_active,
        expires_at: form.expires_at || null,
      })
      setForm(null)
      setCoupons(await listCoupons(restaurant.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!restaurant || !confirm("¿Eliminar este cupón?")) return
    await deleteCoupon(id)
    setCoupons(await listCoupons(restaurant.id))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#0E7A0E]" />
      </div>
    )
  }

  if (!restaurant) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h2 className="font-semibold text-gray-900">Primero crea tu restaurante</h2>
        <p className="text-sm text-gray-500 mt-1">
          Ve a <Link href="/panel/foodos/restaurante" className="text-[#0E7A0E] font-semibold hover:underline">Mi restaurante</Link> para darlo de alta.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cupones</h1>
          <p className="text-sm text-gray-500 mt-1">
            Descuentos que tus clientes aplican en el checkout de tu menú digital.
          </p>
        </div>
        <button
          onClick={() => setForm({ ...EMPTY })}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0e7a0e]"
        >
          <Plus className="w-4 h-4" /> Nuevo cupón
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {coupons.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-12 text-center text-gray-400">
          <Ticket className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          Aún no tienes cupones. Crea el primero para promocionar tu menú.
        </div>
      ) : (
        <div className="grid gap-3">
          {coupons.map((c) => (
            <div key={c.id} className={`bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between gap-3 ${!c.is_active ? "opacity-60" : ""}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-gray-900">{c.code}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {c.is_active ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {c.type === "percent" ? `${Number(c.value)}% de descuento` : `${formatMoney(Number(c.value))} de descuento`}
                  {Number(c.min_order) > 0 && ` · mínimo ${formatMoney(Number(c.min_order))}`}
                  {c.max_uses !== null && ` · ${c.usage_count}/${c.max_uses} usos`}
                  {c.expires_at && ` · expira ${new Date(c.expires_at).toLocaleDateString("es-MX")}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setForm({
                    id: c.id,
                    code: c.code,
                    type: c.type,
                    value: String(c.value),
                    min_order: c.min_order ? String(c.min_order) : "",
                    max_uses: c.max_uses !== null ? String(c.max_uses) : "",
                    expires_at: c.expires_at ? c.expires_at.slice(0, 10) : "",
                    is_active: c.is_active,
                  })}
                  className="p-2 rounded-lg text-gray-400 hover:text-[#0E7A0E]"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(c.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      <BottomSheet
        open={form != null}
        onClose={() => setForm(null)}
        ariaLabelledby="coupon-form-title"
        maxWidthClass="max-w-md"
      >
        {form && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 id="coupon-form-title" className="font-semibold text-gray-900 flex items-center gap-2">
                <Ticket className="w-5 h-5 text-[#0E7A0E]" />
                {form.id ? "Editar cupón" : "Nuevo cupón"}
              </h3>
              <button onClick={() => setForm(null)} className="p-1.5 text-gray-400 hover:text-gray-700" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="CÓDIGO (ej. LUNES10)"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as "percent" | "fixed" })}
                  className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm"
                >
                  <option value="percent">Porcentaje (%)</option>
                  <option value="fixed">Monto fijo ($)</option>
                </select>
                <input
                  type="number" min="0" step="0.01"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder={form.type === "percent" ? "% descuento" : "$ descuento"}
                  className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number" min="0" step="0.01"
                  value={form.min_order}
                  onChange={(e) => setForm({ ...form, min_order: e.target.value })}
                  placeholder="Pedido mínimo $"
                  className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                />
                <input
                  type="number" min="1"
                  value={form.max_uses}
                  onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                  placeholder="Usos máximos (vacío = ∞)"
                  className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                />
              </div>
              <input
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-600"
                title="Fecha de expiración (opcional)"
              />
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="accent-[#0E7A0E]"
                />
                Activo
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.code.trim() || !Number(form.value)}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0e7a0e] disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Guardar
                </button>
              </div>
            </form>
          </div>
        )}
      </BottomSheet>
      <ToolGuideHost toolKey="cupones" pathname="/panel/foodos/cupones" slug={null} icon="🎟️" title="Cupones" />
    </div>
  )
}
