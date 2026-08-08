"use client"

import { useState, useMemo, useEffect } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage, useSharedDishes } from "@/hooks/use-local-storage"
import { useToast } from "@/components/toast"
import { normalizeName } from "@/lib/normalize"
import { getCatalogProducts } from "@/lib/catalog"
import { getAllRecipes } from "@/lib/recipes"
import { findManualQty, findManualQtyKey, ManualQty, ManualQtys, convertQty, readManualQtys, unitDimension } from "@/lib/panel-units"
import { COLLECTION_PRODUCTS, DEFAULT_PRODUCTS, WASTE_CATEGORIES, getWasteCategory } from "@/components/panel/planificador/planificador-shared"
import Link from "next/link"
import {
  ShoppingCart, ArrowLeft, Users, TrendingUp, AlertCircle,
  Package, ChevronDown, ChevronUp, Calculator, TrendingDown,
} from "lucide-react"

export default function PlanificadorPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || null
  const { toast } = useToast()
  const [sharedDishes] = useSharedDishes(slug)

  const [covers, setCovers] = useLocalStorage<number>("planner-covers", 50, slug)
  const [ventasEntries] = useLocalStorage<{ id: string; dishId: string; dishName: string; quantity: number; date: string; unitPrice: number; unitCost: number }[]>("ventas-entries", [], slug)
  const [wastePcts, setWastePcts] = useLocalStorage<Record<string, number>>("planner-waste-pcts", {}, slug)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [showOrder, setShowOrder] = useState(false)
  const [manualQtysRaw, setManualQtysRaw] = useLocalStorage<Record<string, number | ManualQty>>("planner-manual-qtys", {}, slug)
  const [transfers, setTransfers] = useLocalStorage<{ name: string; unit: string; price: number; qty: number; icon?: string; qtyKg?: number }[]>("temporada-transfer", [], slug)

  // Real catalog prices (Supabase): refresh price/unit of matching products.
  const [catalogPrices, setCatalogPrices] = useState<Record<string, { price: number; unit?: string }>>({})
  const [confirmImport, setConfirmImport] = useState<{ dishName: string; ingredients: { name: string; existing: string }[] } | null>(null)
  useEffect(() => {
    let alive = true
    getCatalogProducts().then((catalog) => {
      if (!alive) return
      const byKey: Record<string, { price: number; unit?: string }> = {}
      catalog.forEach((p) => {
        const key = normalizeName(p.name)
        if (key && (!(key in byKey) || p.price > 0)) byKey[key] = { price: p.price, unit: p.unit }
      })
      setCatalogPrices(byKey)
    })
    return () => { alive = false }
  }, [])

  // Close overwrite-confirm modal with Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && confirmImport) setConfirmImport(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [confirmImport])

  const products = useMemo(() => {
    const base = selectedCollection
      ? (COLLECTION_PRODUCTS[selectedCollection.slug] || DEFAULT_PRODUCTS)
      : DEFAULT_PRODUCTS
    if (Object.keys(catalogPrices).length === 0) return base
    return base.map((p) => {
      const real = catalogPrices[normalizeName(p.name)]
      if (!real) return p
      return { ...p, price: real.price > 0 ? real.price : p.price, unit: real.unit || p.unit }
    })
  }, [selectedCollection, catalogPrices])

  // Normalized manual quantities: legacy bare numbers → { qty, unit } with the
  // catalog unit when known, so unit metadata is always available.
  const manualQtys = useMemo<ManualQtys>(
    () => readManualQtys(manualQtysRaw, (name) => {
      const p = products.find((pp) => normalizeName(pp.name) === normalizeName(name))
      return p?.unit
    }),
    [manualQtysRaw, products],
  )

  // Quantity and price to use for a catalog product: manual override wins,
  // otherwise the per-person estimate with category waste.
  const qtyFor = (p: { name: string; unit: string; price: number; perPerson: number; category: string }) => {
    const mq = findManualQty(manualQtys, p.name)
    if (mq) return mq.qty
    const waste = getWastePct(p.category)
    return p.perPerson * covers * (1 + waste / 100)
  }

  const unitFor = (p: { name: string; unit: string }) => {
    return findManualQty(manualQtys, p.name)?.unit ?? p.unit
  }

  const priceFor = (p: { name: string; unit: string; price: number }) => {
    const mq = findManualQty(manualQtys, p.name)
    return mq?.price && mq.price > 0 ? mq.price : p.price
  }

  // Accept pending season transfers
  function acceptTransfers() {
    transfers.forEach((t) => {
      const name = normalizeName(t.name)
      if (!name) return
      const qty = t.qty ?? t.qtyKg ?? 0
      setManualQtysRaw((prev) => ({ ...prev, [name]: { qty, unit: t.unit || "kg", price: t.price } }))
    })
    setTransfers([])
    toast(`${transfers.length} producto(s) de temporada agregados al pedido`, "success")
  }

  // Import a dish's ingredients as manual quantities, overwriting existing entries
  function doImportDish(dish: { name: string; ingredients: { ingredientName: string; quantity?: number; unit?: string; unitPrice?: number }[] }) {
    const newQtys: ManualQtys = { ...manualQtys }
    dish.ingredients.forEach((ing) => {
      newQtys[ing.ingredientName] = {
        qty: (ing.quantity || 0) * covers,
        unit: ing.unit || "kg",
        price: ing.unitPrice,
      }
    })
    setManualQtysRaw(newQtys)
    toast(`"${dish.name}" importado (${dish.ingredients.length} ingredientes)`, "success")
  }

  // Group by category
  const categories = new Map<string, typeof products>()
  products.forEach((p) => {
    const existing = categories.get(p.category) || []
    existing.push(p)
    categories.set(p.category, existing)
  })

  // Real demand from recent sales: avg dishes sold per day (last 7 days)
  const realDemand = useMemo(() => {
    if (!slug || ventasEntries.length === 0) return null
    const today = new Date()
    const cutoff = new Date()
    cutoff.setDate(today.getDate() - 6)
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const cutoffStr = iso(cutoff)
    const todayStr = iso(today)
    const last7 = ventasEntries.filter((e) => e.date >= cutoffStr && e.date <= todayStr)
    if (last7.length === 0) return null
    const units = last7.reduce((s, e) => s + e.quantity, 0)
    return { avg: Math.max(1, Math.round(units / 7)), units, days: last7.length }
  }, [ventasEntries, slug])

  if (!selectedCollection) {
    return (
      <div className="text-center py-16">
        <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Selecciona tu tipo de cocina</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          Usa el selector para personalizar tu lista de insumos y cantidades sugeridas por comensal.
        </p>
      </div>
    )
  }

  const getWastePct = (productCategory: string) => {
    const wc = getWasteCategory(productCategory)
    return wastePcts[wc] ?? WASTE_CATEGORIES.find((w) => w.key === wc)?.defaultPct ?? 8
  }

  const avgWastePct = (() => {
    const cats = new Set(products.map((p) => getWasteCategory(p.category)))
    const pcts = Array.from(cats).map((c) => wastePcts[c] ?? WASTE_CATEGORIES.find((w) => w.key === c)?.defaultPct ?? 8)
    return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
  })()

  const totalCost = products.reduce((sum, p) => {
    return sum + (qtyFor(p) * priceFor(p))
  }, 0)

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/panel" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Planificador de pedidos</h2>
          <p className="text-sm text-gray-400">{selectedCollection.name}</p>
          {sharedDishes.length > 0 && (
            <p className="text-xs text-[#108910] font-medium mt-0.5">
              {sharedDishes.length} platillos de Costeando mi menú — revisa cantidades abajo
            </p>
          )}
        </div>
      </div>

      {/* Shared dishes from Costeo — quick ingredient needs reference */}
      {sharedDishes.length === 0 && (
        <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl border border-emerald-100 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-gray-700">Empieza en 3 pasos</h3>
          </div>
          <ol className="space-y-2 text-xs text-gray-600">
            {[
              <>1. <Link href="/panel/costeo" className="text-emerald-700 font-semibold hover:underline">Costea tu menú</Link> para tener precios reales de insumos.</>,
              <>2. Vuelve aquí: tus platillos costeados aparecerán arriba con sus ingredientes.</>,
              <>3. Escribe las cantidades por persona y envía el pedido a tu inventario.</>,
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <Link
            href="/panel/costeo"
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-[11px] font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Calculator className="w-3.5 h-3.5" />
            Ir al Costeador
          </Link>

          {/* Suggested recipes for this collection — inspiración de platillos */}
          {(() => {
            const recipes = getAllRecipes()[selectedCollection.slug] ?? []
            if (recipes.length === 0) return null
            return (
              <details className="mt-4 border-t border-emerald-100 pt-3">
                <summary className="text-xs font-semibold text-emerald-700 cursor-pointer hover:text-emerald-800 transition-colors">
                  🍳 Recetas sugeridas para {selectedCollection.name} ({recipes.length})
                </summary>
                <div className="mt-2 space-y-2">
                  {recipes.slice(0, 5).map((r) => (
                    <div key={r.name} className="bg-white rounded-xl border border-emerald-100 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-gray-800">{r.name}</p>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">
                          {r.prep_time} · {r.servings}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{r.description}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {r.ingredients.map((ing) => (
                          <span key={ing} className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                            {ing}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )
          })()}
        </div>
      )}
      {sharedDishes.length > 0 && (
        <div className="bg-white rounded-2xl border border-green-100 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-green-600" />
            <h3 className="text-sm font-semibold text-gray-700">
              Tus platillos activos ({sharedDishes.length})
            </h3>
            <span className="text-[10px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full ml-auto">
              Del Costeador
            </span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {sharedDishes.map((dish) => {
              const totals = dish.ingredients.reduce(
                (acc, ing) => {
                  const qty = ing.quantity || 0
                  const dim = unitDimension(ing.unit)
                  if (dim === "mass") acc.mass += (convertQty(qty, ing.unit, "kg") ?? 0) * covers
                  else if (dim === "volume") acc.volume += (convertQty(qty, ing.unit, "L") ?? 0) * covers
                  else acc.count += qty * covers
                  return acc
                },
                { mass: 0, volume: 0, count: 0 },
              )
              const summary = [
                totals.mass > 0 ? `${totals.mass.toFixed(1)} kg` : "",
                totals.volume > 0 ? `${totals.volume.toFixed(1)} L` : "",
                totals.count > 0 ? `${Math.round(totals.count)} pza` : "",
              ].filter(Boolean).join(" · ")
              return (
                <div key={dish.id} className="flex items-center justify-between bg-green-50/50 rounded-xl px-3 py-2 text-xs">
                  <span className="font-medium text-gray-700 truncate mr-2">{dish.name}</span>
                  <span className="text-green-700 whitespace-nowrap font-medium">
                    ~{summary} para {covers} pax
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            Estimación basada en las cantidades por platillo × {covers} comensales. Agrega ~{avgWastePct}% de merma promedio.
          </p>
          <details className="mt-3">
            <summary className="text-xs font-semibold text-[#108910] cursor-pointer hover:text-green-800 transition-colors">
              + Importar ingredientes de un platillo al planificador
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sharedDishes.map((dish) => (
                <button
                  key={dish.id}
                  onClick={() => {
                    // Check if any ingredient is already in manualQtys
                    const alreadyImported = dish.ingredients.some((i) => findManualQtyKey(manualQtys, normalizeName(i.ingredientName)))
                    if (alreadyImported) {
                      // Remove them
                      const cleaned: ManualQtys = { ...manualQtys }
                      dish.ingredients.forEach((i) => {
                        const k = findManualQtyKey(manualQtys, normalizeName(i.ingredientName))
                        if (k) delete cleaned[k]
                      })
                      setManualQtysRaw(cleaned)
                      toast(`"${dish.name}" quitado del pedido`, "warning")
                    } else {
                      // Detect manual quantities that would be overwritten by this import
                      const willOverwrite = dish.ingredients
                        .map((ing) => ({
                          name: ing.ingredientName,
                          existing: findManualQtyKey(manualQtys, normalizeName(ing.ingredientName)),
                        }))
                        .filter((o): o is { name: string; existing: string } => !!o.existing)
                      if (willOverwrite.length > 0) {
                        setConfirmImport({
                          dishName: dish.name,
                          ingredients: willOverwrite.map((o) => ({
                            name: o.name,
                            existing: manualQtys[o.existing]!.qty + " " + (manualQtys[o.existing]!.unit || ""),
                          })),
                        })
                        return
                      }
                      // Add them with per-person scaling, preserving each ingredient's unit and price
                      doImportDish(dish)
                    }
                  }}
                  className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                    dish.ingredients.every((i) => findManualQtyKey(manualQtys, normalizeName(i.ingredientName)))
                      ? "bg-green-200 text-green-800"
                      : "bg-white border border-green-200 text-green-700 hover:bg-green-50"
                  }`}
                >
                  {dish.ingredients.every((i) => findManualQtyKey(manualQtys, normalizeName(i.ingredientName))) ? "✓ " : "+ "}
                  {dish.name} ({dish.ingredients.length} ing.)
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              Al importar un platillo, sus ingredientes se agregan como cantidades manuales (resaltadas en ámbar). 
              Click de nuevo para quitar. Las cantidades se escalan a {covers} comensales.
            </p>
          </details>
        </div>
      )}

      {/* Temporada → Planificador transfer banner */}
      {transfers.length > 0 && (
        <div className="bg-emerald-50 rounded-2xl border-2 border-emerald-300 p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🥬</span>
            <h3 className="font-semibold text-emerald-800">Productos de temporada por agregar</h3>
            <span className="text-[10px] bg-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">De temporada</span>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {transfers.map((t, i) => (
              <span key={i} className="text-xs bg-white border border-emerald-200 rounded-lg px-2.5 py-1 text-emerald-700 font-medium">
                {t.icon ? `${t.icon} ` : ""}{t.name}: {t.qty ?? t.qtyKg} {t.unit}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={acceptTransfers}
              className="text-xs font-semibold bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 transition-colors"
            >
              Agregar como cantidades manuales
            </button>
            <button
              onClick={() => setTransfers([])}
              className="text-xs font-medium text-gray-500 border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-gray-900">Comensales esperados</h3>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCovers(Math.max(5, covers - 10))}
              className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 text-lg transition-colors"
              aria-label="Reducir comensales"
            >
              −
            </button>
            <input
              type="number"
              value={covers}
              onChange={(e) => setCovers(Math.max(1, parseInt(e.target.value) || 0))}
              className="w-24 text-center text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-gray-200 focus:border-[#108910] focus:outline-none py-1"
            />
            <button
              onClick={() => setCovers(covers + 10)}
              className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 text-lg transition-colors"
              aria-label="Aumentar comensales"
            >
              +
            </button>
          </div>
          {realDemand && (
            <div className="mt-3 flex items-center gap-2 bg-emerald-50 rounded-xl px-3 py-2">
              <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-800 min-w-0">
                <span className="font-semibold">📈 Demanda real: {realDemand.avg} platillos/día</span>
                <span className="block text-[10px] text-emerald-600">
                  Promedio de ventas en los últimos 7 días ({realDemand.days} registros)
                </span>
              </p>
              <button
                onClick={() => {
                  setCovers(realDemand.avg)
                  toast(`Comensales ajustados a la demanda real (${realDemand.avg})`, "success")
                }}
                className="ml-auto text-xs font-semibold bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors shrink-0"
                aria-label="Usar demanda real como comensales esperados"
              >
                Usar
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-gray-900">% de merma por categoría</h3>
          </div>
          <div className="space-y-2">
            {WASTE_CATEGORIES.map((wc) => {
              const pct = wastePcts[wc.key] ?? wc.defaultPct
              return (
                <div key={wc.key} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-20 shrink-0">{wc.label}</span>
                  <input
                    type="range"
                    min="0"
                    max="25"
                    value={pct}
                    onChange={(e) => setWastePcts((prev) => ({ ...prev, [wc.key]: parseInt(e.target.value) }))}
                    className="flex-1 accent-amber-500 h-1.5"
                  />
                  <span className="text-xs font-bold text-amber-600 w-10 text-right">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Product list by category */}
      <div className="space-y-3 mb-6">
        {Array.from(categories.entries()).map(([category, items]) => (
          <div key={category} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <button
              onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-400" />
                <span className="font-semibold text-gray-700">{category}</span>
                <span className="text-xs text-gray-400">({items.length} insumos)</span>
              </div>
              {expandedCategory === category
                ? <ChevronUp className="w-4 h-4 text-gray-400" />
                : <ChevronDown className="w-4 h-4 text-gray-400" />
              }
            </button>
            {expandedCategory === category && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {items.map((item, idx) => {
                  const waste = getWastePct(item.category)
                  const autoNeeded = item.perPerson * covers * (1 + waste / 100)
                  const mq = findManualQty(manualQtys, item.name)
                  const isManual = !!mq
                  const needed = mq ? mq.qty : autoNeeded
                  const unit = mq ? mq.unit : item.unit
                  const price = mq?.price && mq.price > 0 ? mq.price : item.price
                  const cost = needed * price
                  return (
                    <div key={idx} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div className="min-w-0 mr-4 flex-1">
                        <p className="font-medium text-gray-800 truncate">{item.name}</p>
                        <p className="text-xs text-gray-400">${price}/{unit}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="number"
                          value={parseFloat(needed.toFixed(2))}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0
                            const key = findManualQtyKey(manualQtys, item.name) ?? item.name
                            if (val === 0) {
                              setManualQtysRaw((prev) => {
                                const rest = { ...prev }
                                delete rest[key]
                                return rest
                              })
                            } else {
                              setManualQtysRaw((prev) => ({
                                ...prev,
                                [key]: { qty: val, unit, price: mq?.price ?? item.price },
                              }))
                            }
                          }}
                          className={`w-20 text-right text-sm font-mono font-bold py-1 px-2 rounded-lg border focus:outline-none ${
                            isManual ? "border-amber-300 bg-amber-50 text-amber-800" : "border-transparent bg-gray-50 text-gray-900 hover:border-gray-200"
                          }`}
                          step={unit === "kg" || unit === "L" ? "0.01" : "1"}
                          min="0"
                          title={isManual ? "Cantidad manual" : "Click para ajustar"}
                        />
                        <select
                          value={unit}
                          onChange={(e) => {
                            const newUnit = e.target.value
                            const key = findManualQtyKey(manualQtys, item.name) ?? item.name
                            setManualQtysRaw((prev) => ({
                              ...prev,
                              [key]: { qty: parseFloat(needed.toFixed(2)), unit: newUnit, price: mq?.price ?? item.price },
                            }))
                          }}
                          className={`text-xs py-1 px-1 rounded-lg border focus:outline-none w-14 ${
                            isManual ? "border-amber-300 bg-amber-50 text-amber-800" : "border-gray-200 bg-gray-50 text-gray-500"
                          }`}
                          title="Unidad de medida"
                          aria-label={`Unidad de ${item.name}`}
                        >
                          {["kg", "g", "pza", "L", "ml", "rebanada", "docena"].map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                        <p className="text-xs text-emerald-600 font-medium w-16 text-right">
                          ${cost.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Total card */}
      <div className="bg-gradient-to-r from-emerald-50 to-[#F0FDF4] rounded-2xl border border-emerald-200/50 p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-gray-900">Costo total estimado</h3>
          </div>
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold">
            Para {covers} comensales
          </span>
        </div>
        <p className="text-4xl font-extrabold text-[#108910] mb-2">
          ${totalCost.toFixed(0)} <span className="text-lg font-medium text-gray-400">MXN</span>
        </p>
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <span className="bg-white rounded-lg px-2.5 py-1">
            ${(totalCost / covers).toFixed(2)} por comensal
          </span>
          <span className="bg-white rounded-lg px-2.5 py-1">
            +~{avgWastePct}% promedio incluido por merma
          </span>
        </div>
      </div>

      {/* Waste savings delta */}
      {avgWastePct > 5 && (
        <div className="mt-4 bg-amber-50 rounded-2xl border border-amber-200 p-5">
          <div className="flex items-start gap-3">
            <TrendingDown className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-semibold text-amber-800 text-sm mb-1">
                Oportunidad de ahorro por reducción de merma
              </h4>
              <p className="text-xs text-amber-700 mb-2">
                Si reduces tu merma del <strong>{avgWastePct}%</strong> al <strong>5%</strong> (nivel óptimo), 
                ahorrarías aproximadamente:
              </p>
              <p className="text-2xl font-extrabold text-amber-700">
                ${(() => {
                  const costNow = products.reduce((sum, p) => {
                    return sum + (p.perPerson * covers * (1 + avgWastePct / 100) * p.price)
                  }, 0)
                  const costIdeal = products.reduce((sum, p) => {
                    return sum + (p.perPerson * covers * (1 + 5 / 100) * p.price)
                  }, 0)
                  return (costNow - costIdeal).toFixed(0)
                })()}
                <span className="text-sm font-medium text-amber-500"> MXN</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="mt-4 space-y-3">
        <button
          onClick={() => setShowOrder(!showOrder)}
          className="w-full flex items-center justify-center gap-2 bg-[#108910] hover:bg-green-800 text-white font-bold py-3 rounded-2xl transition-colors"
        >
          <ShoppingCart className="w-5 h-5" />
          {showOrder ? "Ocultar lista de pedido" : "Generar lista de pedido"}
        </button>

        {/* Order summary */}
        {showOrder && (
          <div className="bg-white rounded-2xl border-2 border-[#108910]/20 p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-gray-900">📋 Lista de pedido — {selectedCollection.name}</h4>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const text = products.map((p) => {
                    const needed = qtyFor(p).toFixed(2)
                    const unit = unitFor(p)
                    const price = priceFor(p)
                    return `• ${p.name}: ${needed} ${unit} — $${(parseFloat(needed) * price).toFixed(0)} MXN ($${price}/${unit})`
                  }).join("\n")
                  const header = `Pedido para ${covers} comensales (+${avgWastePct}% merma) — ${selectedCollection.name}\n\n`
                  navigator.clipboard.writeText(header + text + `\n\nTotal estimado: $${totalCost.toFixed(0)} MXN\nPedido generado con Resurte.me`)
                  toast("Lista de pedido copiada", "success")
                }}
                className="text-xs font-semibold text-[#108910] hover:text-green-800 transition-colors"
              >
                📋 Copiar
              </button>
              <Link
                href="/panel/inventario"
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#108910] text-white px-3 py-1.5 rounded-lg hover:bg-[#0D720D] transition-colors"
                title="Importa estas cantidades como stock en tu inventario"
              >
                <Package className="w-3.5 h-3.5" />
                Enviar a inventario
              </Link>
            </div>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {products.map((p) => {
                const needed = qtyFor(p).toFixed(2)
                const unit = unitFor(p)
                const price = priceFor(p)
                const subtotal = parseFloat(needed) * price
                return (
                  <div key={p.name} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="font-medium text-gray-800">{p.name}</span>
                      <span className="text-gray-400 ml-1">{needed} {unit}</span>
                    </div>
                    <span className="font-semibold text-gray-700 text-xs">${subtotal.toFixed(0)}</span>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
              <span className="font-bold text-gray-900">Total estimado</span>
              <span className="font-extrabold text-[#108910] text-lg">${totalCost.toFixed(0)} MXN</span>
            </div>
          </div>
        )}

        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
          <div className="flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800 mb-1">
                ¿Listo para hacer tu pedido?
              </p>
              <p className="text-xs text-emerald-600">
                Todos estos insumos están disponibles en Resurte.me. Arma tu carrito con las cantidades sugeridas 
                y recibe todo en una sola entrega. Los precios son en tiempo real de nuestro catálogo.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Overwrite confirmation dialog */}
      {confirmImport && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setConfirmImport(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-import-title"
          >
            <h4 id="confirm-import-title" className="font-bold text-gray-900 mb-2">Sobrescribir cantidades manuales</h4>
            <p className="text-xs text-gray-500 mb-4">
              Importar <span className="font-semibold text-gray-700">&quot;{confirmImport.dishName}&quot;</span> sobrescribirá estas cantidades que ya escribiste a mano:
            </p>
            <ul className="space-y-1.5 mb-5 bg-amber-50 border border-amber-200 rounded-xl p-3">
              {confirmImport.ingredients.map((o) => (
                <li key={o.name} className="flex items-center justify-between text-xs">
                  <span className="text-amber-800 font-medium">{o.name}</span>
                  <span className="text-amber-600">{o.existing} → automático</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmImport(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const dish = sharedDishes.find((d) => d.name === confirmImport.dishName)
                  if (dish) doImportDish(dish)
                  setConfirmImport(null)
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                Sí, sobrescribir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
