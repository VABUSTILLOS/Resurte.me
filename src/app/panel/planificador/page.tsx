"use client"

import { useState, useMemo, useEffect } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage, useSharedDishes } from "@/hooks/use-local-storage"
import { useToast } from "@/components/toast"
import { normalizeName } from "@/lib/normalize"
import { getCatalogProducts } from "@/lib/catalog"
import { findManualQty, findManualQtyKey, ManualQty, ManualQtys, readManualQtys } from "@/lib/panel-units"
import { COLLECTION_PRODUCTS, DEFAULT_PRODUCTS, WASTE_CATEGORIES, getWasteCategory } from "@/components/panel/planificador/planificador-shared"
import PlannerHeader from "@/components/panel/planificador/planner-header"
import SharedDishesRef from "@/components/panel/planificador/shared-dishes-ref"
import ActiveDishes from "@/components/panel/planificador/active-dishes"
import SeasonTransfers from "@/components/panel/planificador/season-transfers"
import PlannerControls from "@/components/panel/planificador/planner-controls"
import CategorySection from "@/components/panel/planificador/category-section"
import ShoppingList from "@/components/panel/planificador/shopping-list"
import ConfirmImportModal from "@/components/panel/planificador/confirm-import-modal"
import { ShoppingCart } from "lucide-react"
import type { PlannerProduct } from "@/components/panel/planificador/planificador-shared"

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

  const collectionName = selectedCollection.name

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

  // Toggle a dish import: if already imported remove it, otherwise import
  // (asking for confirmation when manual quantities would be overwritten).
  function toggleImportDish(dish: { name: string; ingredients: { ingredientName: string; quantity?: number; unit?: string; unitPrice?: number }[] }) {
    const alreadyImported = dish.ingredients.some((i) => findManualQtyKey(manualQtys, normalizeName(i.ingredientName)))
    if (alreadyImported) {
      const cleaned: ManualQtys = { ...manualQtys }
      dish.ingredients.forEach((i) => {
        const k = findManualQtyKey(manualQtys, normalizeName(i.ingredientName))
        if (k) delete cleaned[k]
      })
      setManualQtysRaw(cleaned)
      toast(`"${dish.name}" quitado del pedido`, "warning")
      return
    }
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
    doImportDish(dish)
  }

  // Manual qty input: 0 clears the manual entry; otherwise store { qty, unit, price }.
  function handleQtyChange(item: PlannerProduct, val: number, unit: string, price: number) {
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
        [key]: { qty: val, unit, price },
      }))
    }
  }

  function handleUnitChange(item: PlannerProduct, newUnit: string, qty: number, price: number) {
    const key = findManualQtyKey(manualQtys, item.name) ?? item.name
    setManualQtysRaw((prev) => ({
      ...prev,
      [key]: { qty, unit: newUnit, price },
    }))
  }

  // Copy the final shopping list to the clipboard.
  function copyOrder() {
    const text = products.map((p) => {
      const needed = qtyFor(p).toFixed(2)
      const unit = unitFor(p)
      const price = priceFor(p)
      return `• ${p.name}: ${needed} ${unit} — $${(parseFloat(needed) * price).toFixed(0)} MXN ($${price}/${unit})`
    }).join("\n")
    const header = `Pedido para ${covers} comensales (+${avgWastePct}% merma) — ${collectionName}\n\n`
    navigator.clipboard.writeText(header + text + `\n\nTotal estimado: $${totalCost.toFixed(0)} MXN\nPedido generado con Resurte.me`)
    toast("Lista de pedido copiada", "success")
  }

  return (
    <div>
      <PlannerHeader collectionName={collectionName} sharedDishesCount={sharedDishes.length} />

      {sharedDishes.length === 0 && (
        <SharedDishesRef collectionName={collectionName} collectionSlug={selectedCollection.slug} />
      )}
      {sharedDishes.length > 0 && (
        <ActiveDishes
          sharedDishes={sharedDishes}
          covers={covers}
          avgWastePct={avgWastePct}
          manualQtys={manualQtys}
          isImported={(dish) => dish.ingredients.every((i) => findManualQtyKey(manualQtys, normalizeName(i.ingredientName)))}
          onToggleImport={toggleImportDish}
        />
      )}

      {transfers.length > 0 && (
        <SeasonTransfers transfers={transfers} onAccept={acceptTransfers} onDismiss={() => setTransfers([])} />
      )}

      <PlannerControls
        covers={covers}
        setCovers={setCovers}
        realDemand={realDemand}
        onUseDemand={() => {
          if (realDemand) {
            setCovers(realDemand.avg)
            toast(`Comensales ajustados a la demanda real (${realDemand.avg})`, "success")
          }
        }}
        wastePcts={wastePcts}
        setWastePcts={setWastePcts}
      />

      <CategorySection
        categories={Array.from(categories.entries())}
        expandedCategory={expandedCategory}
        onToggle={(c) => setExpandedCategory(expandedCategory === c ? null : c)}
        covers={covers}
        getWastePct={getWastePct}
        manualQtys={manualQtys}
        onQtyChange={handleQtyChange}
        onUnitChange={handleUnitChange}
      />

      <ShoppingList
        products={products}
        covers={covers}
        avgWastePct={avgWastePct}
        totalCost={totalCost}
        collectionName={collectionName}
        showOrder={showOrder}
        onToggleOrder={() => setShowOrder(!showOrder)}
        onCopy={copyOrder}
        qtyFor={qtyFor}
        unitFor={unitFor}
        priceFor={priceFor}
      />

      {confirmImport && (
        <ConfirmImportModal
          confirmImport={confirmImport}
          onCancel={() => setConfirmImport(null)}
          onConfirm={() => {
            const dish = sharedDishes.find((d) => d.name === confirmImport.dishName)
            if (dish) doImportDish(dish)
            setConfirmImport(null)
          }}
        />
      )}
    </div>
  )
}