"use client"

import { useCallback, useEffect, useState } from "react"
import { Megaphone, Percent, Plus, Power, TicketPercent, Trash2 } from "lucide-react"

interface BumpRule {
  id: number
  trigger_type: string
  category_slugs: string[]
  subtotal_min: number | null
  product_id: number
  title: string
  description: string
  discount_pct: number
  is_active: boolean
  display_order: number
}

interface Coupon {
  id: number
  code: string
  discount_type: "percentage" | "fixed_amount"
  discount_value: number
  min_order: number
  max_uses: number
  used_count: number
  expires_at: string | null
  origin?: string | null
}

const TRIGGER_LABEL: Record<string, string> = {
  perishables: "Perecederos",
  snacks_drinks: "Snacks/bebidas",
  subtotal_threshold: "Umbral de subtotal",
}

/**
 * /admin/marketing — CRUD de order bumps y cupones públicos (antes solo
 * configurable por SQL/seed). Toggle on/off inmediato, alta de cupones y
 * expiración sin deploy. Las ofertas de upsell comparten bump_rules.
 */
export default function MarketingAdminPage() {
  const [rules, setRules] = useState<BumpRule[]>([])
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Form de cupón nuevo
  const [newCode, setNewCode] = useState("")
  const [newType, setNewType] = useState<"percentage" | "fixed_amount">("percentage")
  const [newValue, setNewValue] = useState("10")
  const [newMinOrder, setNewMinOrder] = useState("0")
  const [newMaxUses, setNewMaxUses] = useState("0")
  const [newExpires, setNewExpires] = useState("")

  const load = useCallback(async () => {
    setError(null)
    try {
      const [r, c] = await Promise.all([
        fetch("/api/admin/bump-rules"),
        fetch("/api/admin/coupons"),
      ])
      if (!r.ok || !c.ok) throw new Error("Error al cargar datos")
      setRules(((await r.json()) as { rules: BumpRule[] }).rules)
      setCoupons(((await c.json()) as { coupons: Coupon[] }).coupons)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggleRule = async (rule: BumpRule) => {
    const res = await fetch(`/api/admin/bump-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !rule.is_active }),
    })
    if (res.ok) {
      setRules((prev) =>
        prev.map((x) => (x.id === rule.id ? { ...x, is_active: !rule.is_active } : x)),
      )
    }
  }

  const editDiscount = async (rule: BumpRule) => {
    const input = window.prompt(
      `Descuento para "${rule.title}" (0-1, ej. 0.10 = 10%)`,
      String(rule.discount_pct),
    )
    if (input === null) return
    const pct = Number(input)
    if (!Number.isFinite(pct) || pct < 0 || pct > 1) return
    const res = await fetch(`/api/admin/bump-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discount_pct: pct }),
    })
    if (res.ok) {
      setRules((prev) =>
        prev.map((x) => (x.id === rule.id ? { ...x, discount_pct: pct } : x)),
      )
    }
  }

  const deleteRule = async (rule: BumpRule) => {
    if (!window.confirm(`¿Eliminar la regla "${rule.title}"?`)) return
    const res = await fetch(`/api/admin/bump-rules/${rule.id}`, { method: "DELETE" })
    if (res.ok) setRules((prev) => prev.filter((x) => x.id !== rule.id))
  }

  const createCoupon = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode,
          discount_type: newType,
          discount_value: Number(newValue),
          min_order: Number(newMinOrder) || 0,
          max_uses: Number(newMaxUses) || 0,
          expires_at: newExpires || null,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Error al crear el cupón")
      setNewCode("")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el cupón")
    } finally {
      setSaving(false)
    }
  }

  const expireCoupon = async (coupon: Coupon) => {
    if (!window.confirm(`¿Expirar el cupón ${coupon.code} ahora mismo?`)) return
    const res = await fetch(`/api/admin/coupons/${coupon.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expires_at: new Date().toISOString() }),
    })
    if (res.ok) await load()
  }

  const isExpired = (c: Coupon) => c.expires_at !== null && new Date(c.expires_at) < new Date()
  const isExhausted = (c: Coupon) => c.max_uses > 0 && c.used_count >= c.max_uses

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-6">
        <Megaphone className="w-5 h-5 text-brand-600" />
        Marketing — bumps y cupones
      </h1>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {/* ── Order bumps ─────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Order bumps del checkout</h2>
        <ul className="divide-y divide-gray-100">
          {rules.map((rule) => (
            <li key={rule.id} className="py-3 flex items-start gap-3">
              <button
                type="button"
                onClick={() => void toggleRule(rule)}
                aria-pressed={rule.is_active}
                aria-label={rule.is_active ? "Desactivar regla" : "Activar regla"}
                className={`mt-0.5 inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
                  rule.is_active
                    ? "bg-brand-50 border-brand-200 text-brand-700"
                    : "bg-gray-50 border-gray-200 text-gray-400"
                }`}
              >
                <Power className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${rule.is_active ? "text-gray-900" : "text-gray-400 line-through"}`}>
                  {rule.title}
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    {TRIGGER_LABEL[rule.trigger_type] ?? rule.trigger_type}
                    {rule.subtotal_min ? ` · ≥ $${rule.subtotal_min}` : ""}
                  </span>
                </p>
                <p className="text-xs text-gray-500 truncate">{rule.description}</p>
                <p className="text-xs text-gray-400">
                  Producto #{rule.product_id} · orden {rule.display_order}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void editDiscount(rule)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1"
              >
                <Percent className="w-3 h-3" />
                {(rule.discount_pct * 100).toFixed(0)}%
              </button>
              <button
                type="button"
                onClick={() => void deleteRule(rule)}
                aria-label="Eliminar regla"
                className="text-gray-400 hover:text-red-600 p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
          {rules.length === 0 && (
            <li className="py-3 text-sm text-gray-500">No hay reglas configuradas.</li>
          )}
        </ul>
      </section>

      {/* ── Cupones ─────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <TicketPercent className="w-4 h-4 text-brand-600" />
          Cupones
        </h2>

        <form onSubmit={(e) => void createCoupon(e)} className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
          <input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            placeholder="CÓDIGO"
            required
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 font-mono uppercase"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as "percentage" | "fixed_amount")}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
            aria-label="Tipo de descuento"
          >
            <option value="percentage">% Porcentaje</option>
            <option value="fixed_amount">$ Monto fijo</option>
          </select>
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            type="number"
            min="0"
            step="0.01"
            placeholder="Valor"
            required
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
            aria-label="Valor del descuento"
          />
          <input
            value={newMinOrder}
            onChange={(e) => setNewMinOrder(e.target.value)}
            type="number"
            min="0"
            step="0.01"
            placeholder="Mín. pedido"
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
            aria-label="Pedido mínimo"
          />
          <input
            value={newExpires}
            onChange={(e) => setNewExpires(e.target.value)}
            type="date"
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
            aria-label="Fecha de expiración"
          />
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-1 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Crear
          </button>
        </form>

        <ul className="divide-y divide-gray-100">
          {coupons.map((c) => {
            const inactive = isExpired(c) || isExhausted(c)
            return (
              <li key={c.id} className="py-2.5 flex items-center gap-3 text-sm">
                <span className={`font-mono font-bold ${inactive ? "text-gray-400 line-through" : "text-gray-900"}`}>
                  {c.code}
                </span>
                <span className="text-gray-600">
                  {c.discount_type === "percentage"
                    ? `${c.discount_value}%`
                    : `$${Number(c.discount_value).toFixed(2)}`}
                  {c.min_order > 0 && ` · mín. $${Number(c.min_order).toFixed(0)}`}
                </span>
                <span className="text-xs text-gray-400">
                  {c.used_count}{c.max_uses > 0 ? `/${c.max_uses}` : ""} usos
                  {c.expires_at &&
                    ` · ${isExpired(c) ? "expiró" : "expira"} ${new Date(c.expires_at).toLocaleDateString("es-MX")}`}
                  {c.origin && ` · ${c.origin}`}
                </span>
                {!inactive && (
                  <button
                    type="button"
                    onClick={() => void expireCoupon(c)}
                    className="ml-auto text-xs font-semibold text-red-600 hover:underline"
                  >
                    Expirar ahora
                  </button>
                )}
              </li>
            )
          })}
          {coupons.length === 0 && (
            <li className="py-3 text-sm text-gray-500">No hay cupones creados.</li>
          )}
        </ul>
      </section>
    </div>
  )
}
