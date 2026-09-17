"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Copy, Megaphone, Pencil, Percent, Plus, Power, TicketPercent, Trash2, X } from "lucide-react"
import { suggestDuplicateCode } from "@/lib/admin-marketing-validation"
import BumpAffinitySection, { type AffinityPair } from "@/components/admin/bump-affinity-section"

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
  meat_bbq: "Carne/asador",
  drinks_sides: "Bebidas/guarniciones",
  recipe_collection: "Receta",
  ingredient_affinity: "Afinidad (automática)",
}

/**
 * /admin/marketing — CRUD de order bumps y cupones públicos (antes solo
 * configurable por SQL/seed). Toggle on/off inmediato, alta de cupones y
 * expiración sin deploy. Las ofertas de upsell comparten bump_rules.
 *
 * Acepta `?code=XYZ` para enfocar un cupón concreto: así la alerta de "cupón
 * por expirar" del dashboard aterriza en el cupón que la disparó.
 */
export default function MarketingAdminPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="h-6 w-72 animate-pulse rounded bg-gray-100 mb-6" />
          <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
        </div>
      }
    >
      <MarketingContent />
    </Suspense>
  )
}

function MarketingContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [rules, setRules] = useState<BumpRule[]>([])
  const [pairs, setPairs] = useState<AffinityPair[]>([])
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // A15 ronda 2 — cupón enfocado por deep-link (dismissible).
  const [focusedCode, setFocusedCode] = useState(
    () => searchParams.get("code")?.trim() ?? ""
  )
  const couponRefs = useRef<Map<number, HTMLLIElement>>(new Map())
  const scrolledCodeRef = useRef<string | null>(null)

  // Form de cupón nuevo
  const [newCode, setNewCode] = useState("")
  const [newType, setNewType] = useState<"percentage" | "fixed_amount">("percentage")
  const [newValue, setNewValue] = useState("10")
  const [newMinOrder, setNewMinOrder] = useState("0")
  const [newMaxUses] = useState("0")
  const [newExpires, setNewExpires] = useState("")

  const load = useCallback(async () => {
    try {
      const [r, a, c] = await Promise.all([
        fetch("/api/admin/bump-rules"),
        fetch("/api/admin/bump-affinity"),
        fetch("/api/admin/coupons"),
      ])
      if (!r.ok || !c.ok) throw new Error("Error al cargar datos")
      setRules(((await r.json()) as { rules: BumpRule[] }).rules)
      // La afinidad falla en silencio: si la migración 00112 no está aplicada
      // el resto del panel debe seguir funcionando.
      if (a.ok) setPairs(((await a.json()) as { pairs: AffinityPair[] }).pairs)
      else setPairs([])
      setCoupons(((await c.json()) as { coupons: Coupon[] }).coupons)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos")
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    // Diferido a microtask: ningún setState de load corre síncrono en el efecto.
    void Promise.resolve().then(load)
  }, [load])

  // Para event handlers: el reset de error va fuera del efecto.
  const reload = useCallback(async () => {
    setError(null)
    await load()
  }, [load])

  const focusedCoupon = focusedCode
    ? coupons.find((c) => c.code.toLowerCase() === focusedCode.toLowerCase()) ?? null
    : null

  // Lleva el cupón enfocado a la vista una sola vez por código; el resto de
  // rerenders (edición, expiración) no vuelven a saltar.
  useEffect(() => {
    if (!focusedCode) {
      scrolledCodeRef.current = null
      return
    }
    if (!focusedCoupon || scrolledCodeRef.current === focusedCode) return
    const el = couponRefs.current.get(focusedCoupon.id)
    if (!el) return
    scrolledCodeRef.current = focusedCode
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" })
  }, [focusedCode, focusedCoupon])

  const clearFocusedCode = useCallback(() => {
    setFocusedCode("")
    scrolledCodeRef.current = null
    const sp = new URLSearchParams(searchParams.toString())
    sp.delete("code")
    const qs = sp.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

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
      await reload()
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
    if (res.ok) await reload()
  }

  const isExpired = (c: Coupon) => c.expires_at !== null && new Date(c.expires_at) < new Date()
  const isExhausted = (c: Coupon) => c.max_uses > 0 && c.used_count >= c.max_uses

  // Fase 11 — edición en línea, duplicado y borrado de cupones
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null)
  const [editValue, setEditValue] = useState("")
  const [editMinOrder, setEditMinOrder] = useState("")
  const [editMaxUses, setEditMaxUses] = useState("")
  const [editExpires, setEditExpires] = useState("")

  const startEdit = (c: Coupon) => {
    setEditingCoupon(c)
    setEditValue(String(c.discount_value))
    setEditMinOrder(String(c.min_order))
    setEditMaxUses(String(c.max_uses))
    setEditExpires(c.expires_at ? c.expires_at.slice(0, 10) : "")
  }

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCoupon) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/coupons/${editingCoupon.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discount_value: Number(editValue),
          min_order: Number(editMinOrder) || 0,
          max_uses: Number(editMaxUses) || 0,
          expires_at: editExpires ? new Date(`${editExpires}T23:59:59`).toISOString() : null,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Error al actualizar el cupón")
      setEditingCoupon(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar el cupón")
    } finally {
      setSaving(false)
    }
  }

  const duplicateCoupon = async (c: Coupon) => {
    const suggested = suggestDuplicateCode(c.code, coupons.map((x) => x.code))
    const code = window.prompt("Código para el cupón duplicado:", suggested)
    if (!code) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          discount_type: c.discount_type,
          discount_value: c.discount_value,
          min_order: c.min_order,
          max_uses: c.max_uses,
          expires_at: c.expires_at,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Error al duplicar el cupón")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al duplicar el cupón")
    } finally {
      setSaving(false)
    }
  }

  const deleteCoupon = async (c: Coupon) => {
    if (!window.confirm(`¿Eliminar el cupón ${c.code} definitivamente?`)) return
    const res = await fetch(`/api/admin/coupons/${c.id}`, { method: "DELETE" })
    if (res.ok) await load()
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-6">
        <Megaphone className="w-5 h-5 text-brand-600" />
        Marketing — bumps y cupones
      </h1>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {/* A15 ronda 2 — deep-link ?code= desde la alerta de cupón por expirar.
          Se renderiza sin depender de que los datos hayan cargado. */}
      {focusedCode && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-800"
        >
          <TicketPercent className="w-4 h-4 shrink-0" />
          {!loaded ? (
            <span>Buscando el cupón <strong>{focusedCode}</strong>…</span>
          ) : focusedCoupon ? (
            <span>Enfocando el cupón <strong>{focusedCoupon.code}</strong>.</span>
          ) : (
            <span>
              No encontramos ningún cupón <strong>{focusedCode}</strong>. Puede
              haber sido eliminado o renombrado.
            </span>
          )}
          <button
            type="button"
            onClick={clearFocusedCode}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-white px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
          >
            <X className="w-3 h-3" />
            Ver todos los cupones
          </button>
        </div>
      )}

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

      <BumpAffinitySection pairs={pairs} onChanged={reload} />

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

        {/* Fase 11 — edición en línea del cupón seleccionado */}
        {editingCoupon && (
          <form
            onSubmit={(e) => void saveEdit(e)}
            className="mb-4 rounded-lg border border-brand-200 bg-brand-50/50 p-3 flex flex-wrap items-center gap-2"
            aria-label={`Editar cupón ${editingCoupon.code}`}
          >
            <span className="font-mono text-sm font-bold text-gray-900">{editingCoupon.code}</span>
            <input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              required
              aria-label="Valor del descuento"
              className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-1.5"
            />
            <input
              value={editMinOrder}
              onChange={(e) => setEditMinOrder(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              aria-label="Pedido mínimo"
              placeholder="Mín. pedido"
              className="w-28 text-sm border border-gray-200 rounded-lg px-2 py-1.5"
            />
            <input
              value={editMaxUses}
              onChange={(e) => setEditMaxUses(e.target.value)}
              type="number"
              min="0"
              aria-label="Usos máximos (0 = ilimitado)"
              placeholder="Máx. usos"
              className="w-28 text-sm border border-gray-200 rounded-lg px-2 py-1.5"
            />
            <input
              value={editExpires}
              onChange={(e) => setEditExpires(e.target.value)}
              type="date"
              aria-label="Fecha de expiración (vacío = sin expiración)"
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
            />
            <button
              type="submit"
              disabled={saving}
              className="text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setEditingCoupon(null)}
              className="text-sm text-gray-500 hover:underline"
            >
              Cancelar
            </button>
          </form>
        )}

        <ul className="divide-y divide-gray-100">
          {coupons.map((c) => {
            const inactive = isExpired(c) || isExhausted(c)
            const isFocused =
              !!focusedCode && c.code.toLowerCase() === focusedCode.toLowerCase()
            return (
              <li
                key={c.id}
                ref={(el) => {
                  if (el) couponRefs.current.set(c.id, el)
                  else couponRefs.current.delete(c.id)
                }}
                className={`py-2.5 flex items-center gap-3 text-sm rounded-lg transition-shadow ${
                  isFocused ? "ring-2 ring-brand-300 bg-brand-50/50 px-2" : ""
                }`}
              >
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
                <span className="ml-auto flex items-center gap-1">
                  {/* Fase 11 — editar, duplicar, eliminar */}
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    aria-label={`Editar cupón ${c.code}`}
                    title="Editar"
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void duplicateCoupon(c)}
                    aria-label={`Duplicar cupón ${c.code}`}
                    title="Duplicar"
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteCoupon(c)}
                    aria-label={`Eliminar cupón ${c.code}`}
                    title="Eliminar"
                    className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {!inactive && (
                    <button
                      type="button"
                      onClick={() => void expireCoupon(c)}
                      className="ml-1 text-xs font-semibold text-red-600 hover:underline"
                    >
                      Expirar ahora
                    </button>
                  )}
                </span>
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
