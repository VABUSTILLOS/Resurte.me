"use client"

// ============================================================
// Combos y cross-sell — constructor de combos + reglas de venta
// adicional ("si pide X sugiere Y", ticket mínimo, por categoría).
// ============================================================

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  getFoodosPanelData,
  listCombos,
  listUpsellRules,
  upsertCombo,
  deleteCombo,
  upsertUpsellRule,
  deleteUpsellRule,
} from "../actions"
import { formatMoney } from "@/lib/foodos"
import type {
  FoodosRestaurant,
  FoodosMenuItem,
  FoodosMenuCategory,
  FoodosCombo,
  FoodosUpsellRule,
  FoodosRuleTriggerType,
} from "@/types/foodos"
import {
  Sparkles, Plus, Trash2, Percent, Trophy, Loader2, Check, Wand2,
} from "lucide-react"

interface ComboForm {
  id?: string
  name: string
  price: string
  discount_pct: string
  item_ids: string[]
  highlight: boolean
}

const EMPTY_COMBO: ComboForm = { name: "", price: "", discount_pct: "", item_ids: [], highlight: true }

interface RuleForm {
  id?: string
  name: string
  trigger_type: FoodosRuleTriggerType
  trigger_item_id: string
  trigger_category_id: string
  min_ticket: string
  suggested_items: string[]
  offer_text: string
  boost_amount: string
}

const EMPTY_RULE: RuleForm = {
  name: "",
  trigger_type: "product",
  trigger_item_id: "",
  trigger_category_id: "",
  min_ticket: "",
  suggested_items: [],
  offer_text: "",
  boost_amount: "",
}

export default function CombosPage() {
  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [menuItems, setMenuItems] = useState<FoodosMenuItem[]>([])
  const [categories, setCategories] = useState<FoodosMenuCategory[]>([])
  const [combos, setCombos] = useState<FoodosCombo[]>([])
  const [rules, setRules] = useState<FoodosUpsellRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showComboForm, setShowComboForm] = useState(false)
  const [comboForm, setComboForm] = useState<ComboForm>(EMPTY_COMBO)
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [ruleForm, setRuleForm] = useState<RuleForm>(EMPTY_RULE)

  const load = useCallback(async () => {
    try {
      const { restaurant: r, items, categories: cats, combos: cs, rules: rs } = await getFoodosPanelData()
      setRestaurant(r)
      setMenuItems(items)
      setCategories(cats)
      setCombos(cs)
      setRules(rs)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar combos")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  function itemById(id: string) { return menuItems.find((m) => m.id === id) }
  function comboFullValue(c: FoodosCombo) {
    return c.item_ids.reduce((s, id) => s + (itemById(id)?.price ?? 0), 0)
  }

  async function handleSaveCombo(e: React.FormEvent) {
    e.preventDefault()
    if (!restaurant || !comboForm.name.trim() || comboForm.item_ids.length === 0) return
    await upsertCombo({
      id: comboForm.id,
      restaurant_id: restaurant.id,
      name: comboForm.name.trim(),
      price: Number(comboForm.price) || 0,
      discount_pct: Number(comboForm.discount_pct) || 0,
      item_ids: comboForm.item_ids,
      highlight: comboForm.highlight,
    })
    setShowComboForm(false)
    setComboForm(EMPTY_COMBO)
    setCombos(await listCombos(restaurant.id))
  }

  async function handleDeleteCombo(id: string) {
    await deleteCombo(id)
    setCombos(await listCombos(restaurant!.id))
  }

  function toggleComboItem(id: string) {
    setComboForm((f) => ({
      ...f,
      item_ids: f.item_ids.includes(id) ? f.item_ids.filter((x) => x !== id) : [...f.item_ids, id],
    }))
  }

  async function handleSaveRule(e: React.FormEvent) {
    e.preventDefault()
    if (!restaurant || !ruleForm.name.trim() || ruleForm.suggested_items.length === 0) return
    const trigger_value =
      ruleForm.trigger_type === "product" ? { item_id: ruleForm.trigger_item_id } :
      ruleForm.trigger_type === "category" ? { category_id: ruleForm.trigger_category_id } :
      { min_ticket: Number(ruleForm.min_ticket) || 0 }
    await upsertUpsellRule({
      id: ruleForm.id,
      restaurant_id: restaurant.id,
      name: ruleForm.name.trim(),
      trigger_type: ruleForm.trigger_type,
      trigger_value,
      suggested_items: ruleForm.suggested_items,
      offer_text: ruleForm.offer_text || null,
      boost_amount: Number(ruleForm.boost_amount) || 0,
    })
    setShowRuleForm(false)
    setRuleForm(EMPTY_RULE)
    setRules(await listUpsellRules(restaurant.id))
  }

  async function handleDeleteRule(id: string) {
    await deleteUpsellRule(id)
    setRules(await listUpsellRules(restaurant!.id))
  }

  function toggleRuleSuggested(id: string) {
    setRuleForm((f) => ({
      ...f,
      suggested_items: f.suggested_items.includes(id) ? f.suggested_items.filter((x) => x !== id) : [...f.suggested_items, id],
    }))
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-[#108910]" /></div>
  }

  if (!restaurant) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h2 className="font-semibold text-gray-900">Primero crea tu restaurante</h2>
        <p className="text-sm text-gray-500 mt-1">Ve a <Link href="/panel/foodos/restaurante" className="text-[#108910] font-semibold hover:underline">Mi restaurante</Link>.</p>
      </div>
    )
  }

  const itemLabel = (id: string) => itemById(id)?.name ?? "—"

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Combos y cross-sell</h1>
        <p className="text-sm text-gray-500 mt-1">
          Sube el ticket promedio: combos, y reglas de venta adicional que el micrositio aplica al hacer checkout.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}

      {/* Combos */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h2 className="font-semibold text-gray-900">Combos</h2>
          </div>
          <button
            onClick={() => { setComboForm(EMPTY_COMBO); setShowComboForm(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#108910] text-white text-sm font-semibold hover:bg-[#0e7a0e]"
          >
            <Plus className="w-4 h-4" /> Nuevo combo
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {combos.map((c) => {
            const full = comboFullValue(c)
            const savings = full - c.price
            return (
              <div key={c.id} className={`bg-white rounded-2xl border p-5 ${c.highlight ? "border-amber-200 bg-amber-50/40" : "border-gray-100"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{c.name}</h3>
                    {c.highlight && <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full mt-1 inline-block">Destacado</span>}
                  </div>
                  <button onClick={() => handleDeleteCombo(c.id)} className="p-1.5 rounded-md text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.item_ids.map((id) => (
                    <span key={id} className="text-[11px] bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{itemLabel(id)}</span>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <span className="text-lg font-bold text-gray-900">{formatMoney(c.price)}</span>
                    {savings > 0 && (
                      <span className="ml-2 text-xs text-emerald-600 font-semibold">Ahorras {formatMoney(savings)}</span>
                    )}
                  </div>
                  {c.discount_pct > 0 && (
                    <span className="flex items-center gap-1 text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                      <Percent className="w-3 h-3" /> {c.discount_pct}%
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          {combos.length === 0 && (
            <p className="text-sm text-gray-400 col-span-full py-4">Aún no tienes combos. Crea uno para que el micrositio lo sugiera cuando el ticket es bajo.</p>
          )}
        </div>
      </section>

      {/* Reglas de cross-sell */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-[#108910]" />
            <h2 className="font-semibold text-gray-900">Reglas de cross-sell</h2>
          </div>
          <button
            onClick={() => { setRuleForm(EMPTY_RULE); setShowRuleForm(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#108910]/30 text-[#108910] text-sm font-semibold hover:bg-[#F0FDF4]"
          >
            <Plus className="w-4 h-4" /> Nueva regla
          </button>
        </div>

        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className={`bg-white rounded-2xl border p-4 ${!r.is_active ? "opacity-60" : "border-gray-100"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-gray-900 text-sm">{r.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {r.trigger_type === "product" && `Si pide "${itemLabel(r.trigger_value?.item_id ?? "")}"`}
                    {r.trigger_type === "category" && `Si pide de la categoría "${categories.find((c) => c.id === r.trigger_value?.category_id)?.name ?? ""}"`}
                    {r.trigger_type === "min_ticket" && `Si el ticket es menor a ${formatMoney(r.trigger_value?.min_ticket ?? 0)}`}
                    {" → "}sugiere: {r.suggested_items.map((s) => itemLabel(s)).join(", ")}
                  </p>
                  {r.offer_text && <p className="text-xs text-[#108910] font-medium mt-1">💬 {r.offer_text}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {r.boost_amount > 0 && (
                    <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      +{formatMoney(r.boost_amount)} en venta
                    </span>
                  )}
                  <button onClick={() => handleDeleteRule(r.id)} className="p-1.5 rounded-md text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
          {rules.length === 0 && (
            <p className="text-sm text-gray-400 py-4">
              Crea reglas tipo &ldquo;Si pide papas fritas, sugiere refresco por solo $25&rdquo; y el micrositio las aplicará en el checkout.
            </p>
          )}
        </div>
      </section>

      {/* Modal combo */}
      {showComboForm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowComboForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" /> Nuevo combo</h3>
            <form onSubmit={handleSaveCombo} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Nombre *</label>
                  <input value={comboForm.name} onChange={(e) => setComboForm({ ...comboForm, name: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#108910]/30 focus:border-[#108910]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Precio combo *</label>
                  <input type="number" min="0" step="0.01" value={comboForm.price} onChange={(e) => setComboForm({ ...comboForm, price: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#108910]/30 focus:border-[#108910]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">% descuento</label>
                  <input type="number" min="0" max="100" value={comboForm.discount_pct} onChange={(e) => setComboForm({ ...comboForm, discount_pct: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#108910]/30 focus:border-[#108910]" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer pb-2.5">
                    <input type="checkbox" checked={comboForm.highlight} onChange={(e) => setComboForm({ ...comboForm, highlight: e.target.checked })} className="accent-amber-500" />
                    Destacado
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Platillos que incluye *</label>
                <div className="max-h-52 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                  {menuItems.map((m) => (
                    <button type="button" key={m.id} onClick={() => toggleComboItem(m.id)} className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${comboForm.item_ids.includes(m.id) ? "bg-[#F0FDF4] text-[#108910]" : "text-gray-700"}`}>
                      <span>{m.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{formatMoney(m.price)}</span>
                        {comboForm.item_ids.includes(m.id) ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4 text-gray-300" />}
                      </span>
                    </button>
                  ))}
                  {menuItems.length === 0 && <p className="text-xs text-gray-400 px-3 py-3">Agrega platillos en el módulo Menú primero.</p>}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowComboForm(false)} className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={!comboForm.name.trim() || comboForm.item_ids.length === 0} className="px-5 py-2 rounded-xl bg-[#108910] text-white text-sm font-semibold hover:bg-[#0e7a0e] disabled:opacity-50">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal regla */}
      {showRuleForm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowRuleForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Wand2 className="w-5 h-5 text-[#108910]" /> Nueva regla de cross-sell</h3>
            <form onSubmit={handleSaveRule} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Nombre *</label>
                <input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} placeholder="Ej. Papas + refresco" className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#108910]/30 focus:border-[#108910]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Se activa cuando…</label>
                <select
                  value={ruleForm.trigger_type}
                  onChange={(e) => setRuleForm({ ...ruleForm, trigger_type: e.target.value as RuleForm["trigger_type"] })}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm"
                >
                  <option value="product">El cliente pide un platillo</option>
                  <option value="category">El cliente pide de una categoría</option>
                  <option value="min_ticket">El ticket es menor a un monto</option>
                </select>
              </div>
              {ruleForm.trigger_type === "product" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Platillo disparador</label>
                  <select value={ruleForm.trigger_item_id} onChange={(e) => setRuleForm({ ...ruleForm, trigger_item_id: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm">
                    <option value="">Selecciona…</option>
                    {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}
              {ruleForm.trigger_type === "category" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Categoría disparadora</label>
                  <select value={ruleForm.trigger_category_id} onChange={(e) => setRuleForm({ ...ruleForm, trigger_category_id: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm">
                    <option value="">Selecciona…</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              {ruleForm.trigger_type === "min_ticket" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Ticket menor a $</label>
                  <input type="number" min="0" value={ruleForm.min_ticket} onChange={(e) => setRuleForm({ ...ruleForm, min_ticket: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm" />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Sugerir estos platillos *</label>
                <div className="max-h-44 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                  {menuItems.map((m) => (
                    <button type="button" key={m.id} onClick={() => toggleRuleSuggested(m.id)} className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${ruleForm.suggested_items.includes(m.id) ? "bg-[#F0FDF4] text-[#108910]" : "text-gray-700"}`}>
                      <span>{m.name}</span>
                      {ruleForm.suggested_items.includes(m.id) ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4 text-gray-300" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Mensaje de oferta</label>
                  <input value={ruleForm.offer_text} onChange={(e) => setRuleForm({ ...ruleForm, offer_text: e.target.value })} placeholder="Añade un refresco por solo $25" className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#108910]/30 focus:border-[#108910]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Ganancia extra estimada $</label>
                  <input type="number" min="0" value={ruleForm.boost_amount} onChange={(e) => setRuleForm({ ...ruleForm, boost_amount: e.target.value })} className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowRuleForm(false)} className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={!ruleForm.name.trim() || ruleForm.suggested_items.length === 0} className="px-5 py-2 rounded-xl bg-[#108910] text-white text-sm font-semibold hover:bg-[#0e7a0e] disabled:opacity-50">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
