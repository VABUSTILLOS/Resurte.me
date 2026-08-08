"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage, useSharedDishes } from "@/hooks/use-local-storage"
import { useToast } from "@/components/toast"
import { normalizeName } from "@/lib/normalize"
import { uid } from "@/lib/ids"
import { convertQty, ManualQty, readManualQtys } from "@/lib/panel-units"
import { Package } from "lucide-react"
import type { InventoryItem, Proveedor, StockMovement, SortField } from "@/components/panel/inventario/inventario-shared"
import InventarioHeader from "@/components/panel/inventario/InventarioHeader"
import StatsRow from "@/components/panel/inventario/StatsRow"
import ValueCards from "@/components/panel/inventario/ValueCards"
import SuppliersCatalog from "@/components/panel/inventario/SuppliersCatalog"
import ImportPlanificador from "@/components/panel/inventario/ImportPlanificador"
import StockProjection from "@/components/panel/inventario/StockProjection"
import SortControls from "@/components/panel/inventario/SortControls"
import ItemsTable from "@/components/panel/inventario/ItemsTable"
import PurchaseOrder from "@/components/panel/inventario/PurchaseOrder"
import MovementHistory from "@/components/panel/inventario/MovementHistory"
import InventarioTips from "@/components/panel/inventario/InventarioTips"
import AddEditModal from "@/components/panel/inventario/AddEditModal"
import DeleteConfirm from "@/components/panel/inventario/DeleteConfirm"

export default function InventarioPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || "default"
  const { toast } = useToast()

  const [items, setItems] = useLocalStorage<InventoryItem[]>("inventario-items", [], slug)
  const [proveedores, setProveedores] = useLocalStorage<Proveedor[]>("proveedores", [], slug)
  const [sortBy, setSortBy] = useLocalStorage<SortField>("inventario-sort", "name", slug)
  // NOTE: planificador writes to "planner-manual-qtys" (was previously "planificador-qtys")
  const [manualQtysRaw] = useLocalStorage<Record<string, number | ManualQty>>("planner-manual-qtys", {}, slug)
  // Normalized quantities: legacy bare numbers → { qty, unit } so the import
  // preserves real units instead of assuming grams.
  const manualQtys = useMemo(() => readManualQtys(manualQtysRaw), [manualQtysRaw])
  const [covers] = useLocalStorage<number>("planner-covers", 50, slug)
  const [sharedDishes] = useSharedDishes(slug)
  const [movements, setMovements] = useLocalStorage<StockMovement[]>("inventario-movimientos", [], slug)
  const [showMovements, setShowMovements] = useState(false)
  const [projectionIncluded, setProjectionIncluded] = useState(false)
  const [groupBySupplier, setGroupBySupplier] = useState(false)
  const [showSuppliers, setShowSuppliers] = useState(false)
  const [supplierForm, setSupplierForm] = useState<{ nombre: string; contacto: string; telefono: string }>({
    nombre: "",
    contacto: "",
    telefono: "",
  })

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formStock, setFormStock] = useState("0")
  const [formMinStock, setFormMinStock] = useState("5")
  const [formUnit, setFormUnit] = useState("kg")
  const [formPrice, setFormPrice] = useState("0")
  const [formCategory, setFormCategory] = useState("")
  const [formProveedorId, setFormProveedorId] = useState("")

  // Purchase order
  const [orderExpanded, setOrderExpanded] = useState(false)

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // ── Derived data ──────────────────────────────────────
  const lowStock = useMemo(() => items.filter((i) => i.stock > 0 && i.stock <= i.minStock), [items])
  const outOfStock = useMemo(() => items.filter((i) => i.stock === 0), [items])
  const okStock = useMemo(() => items.filter((i) => i.stock > i.minStock), [items])

  const getStatus = (item: InventoryItem) => {
    if (item.stock === 0) return { label: "Agotado", color: "red", icon: "🔴" }
    if (item.stock <= item.minStock) return { label: "Bajo", color: "amber", icon: "🟡" }
    return { label: "Suficiente", color: "green", icon: "🟢" }
  }

  const sortedItems = useMemo(() => {
    const s = [...items]
    switch (sortBy) {
      case "name":
        s.sort((a, b) => a.name.localeCompare(b.name))
        break
      case "stock":
        s.sort((a, b) => a.stock - b.stock)
        break
      case "pricePerUnit":
        s.sort((a, b) => b.pricePerUnit - a.pricePerUnit)
        break
      case "status":
        s.sort((a, b) => {
          const sa = a.stock === 0 ? 2 : a.stock <= a.minStock ? 1 : 0
          const sb = b.stock === 0 ? 2 : b.stock <= b.minStock ? 1 : 0
          return sa - sb
        })
        break
    }
    return s
  }, [items, sortBy])

  const weeklyCost = useMemo(() => {
    return items.reduce((sum, item) => sum + item.minStock * item.pricePerUnit, 0)
  }, [items])

  const totalValue = useMemo(() => {
    return items.reduce((sum, item) => sum + item.stock * item.pricePerUnit, 0)
  }, [items])

  const purchaseOrder = useMemo(() => {
    return lowStock.concat(outOfStock).map((item) => {
      const target = item.minStock * 2
      const toBuy = Math.max(0, target - item.stock)
      return { ...item, toBuy, cost: toBuy * item.pricePerUnit }
    })
  }, [lowStock, outOfStock])

  // ── Stock projection from recipe menu (shared dishes × covers) ──
  // Each ingredient carries its own unit (kg, L, pza…); needs are aggregated
  // per dimension so the projection compares correctly against inventory units.
  const ingredientNeeds = useMemo(() => {
    if (sharedDishes.length === 0 || covers <= 0) return new Map<string, { qty: number; unit: string }>()
    const needs = new Map<string, { qty: number; unit: string }>()
    sharedDishes.forEach((dish) => {
      dish.ingredients.forEach((ing) => {
        const qty = (ing.quantity || 0) * covers
        const unit = ing.unit || "kg"
        const key = normalizeName(ing.ingredientName)
        if (!key) return
        const prev = needs.get(key)
        if (!prev) {
          needs.set(key, { qty, unit })
        } else {
          const converted = convertQty(qty, unit, prev.unit)
          needs.set(key, { qty: prev.qty + (converted ?? qty), unit: prev.unit })
        }
      })
    })
    return needs
  }, [sharedDishes, covers])

  const projection = useMemo(() => {
    if (ingredientNeeds.size === 0) return []
    const rows: {
      key: string
      name: string
      neededQty: number
      neededUnit: string
      stockQty: number | null
      stockUnit: string | null
      shortfallQty: number
      itemId: string | null
      status: "ok" | "justo" | "falta"
      label: string
      icon: string
    }[] = []
    ingredientNeeds.forEach((need, key) => {
      const match = items.find((i) => normalizeName(i.name) === key)
      // Convert the recipe need into the inventory item's unit when dimensions match
      let neededQty = need.qty
      let neededUnit = need.unit
      if (match) {
        const converted = convertQty(need.qty, need.unit, match.unit)
        if (converted !== null) {
          neededQty = converted
          neededUnit = match.unit
        }
      }
      const stockQty = match ? match.stock : null
      let status: "ok" | "justo" | "falta"
      let label: string
      if (stockQty === null) {
        status = "falta"
        label = "No registrado en inventario"
      } else if (stockQty >= neededQty * 1.1) {
        status = "ok"
        label = "Suficiente"
      } else if (stockQty >= neededQty) {
        status = "justo"
        label = "Justo (mínimo)"
      } else {
        status = "falta"
        label = "Falta pedir"
      }
      const icon = status === "ok" ? "🟢" : status === "justo" ? "🟡" : "🔴"
      rows.push({
        key,
        name: match?.name ?? key.charAt(0).toUpperCase() + key.slice(1),
        neededQty,
        neededUnit,
        stockQty,
        stockUnit: match?.unit ?? null,
        shortfallQty: stockQty === null ? neededQty : Math.max(0, neededQty - stockQty),
        itemId: match?.id || null,
        status,
        label,
        icon,
      })
    })
    return rows.sort((a, b) => {
      const order = { falta: 0, justo: 1, ok: 2 } as const
      return order[a.status] - order[b.status]
    })
  }, [ingredientNeeds, items])

  const missingCount = useMemo(() => projection.filter((p) => p.status !== "ok").length, [projection])

  // Merge projected shortfalls into the purchase order when enabled
  const projectedOrder = useMemo(() => {
    if (!projectionIncluded) return purchaseOrder
    const base = [...purchaseOrder]
    projection
      .filter((p) => p.status !== "ok" && p.shortfallQty > 0)
      .forEach((p) => {
        const existing = base.find((b) => normalizeName(b.name) === p.key)
        if (existing) {
          const converted = convertQty(p.shortfallQty, p.neededUnit, existing.unit)
          existing.toBuy = Math.max(existing.toBuy, Math.ceil(converted ?? p.shortfallQty))
          existing.cost = existing.toBuy * existing.pricePerUnit
        } else {
          base.push({
            id: `proj-${p.key}`,
            name: p.name,
            toBuy: Math.ceil(p.shortfallQty),
            unit: p.neededUnit,
            stock: 0,
            minStock: 0,
            pricePerUnit: p.itemId ? items.find((i) => i.id === p.itemId)?.pricePerUnit || 0 : 0,
            cost: Math.ceil(p.shortfallQty) * (p.itemId ? items.find((i) => i.id === p.itemId)?.pricePerUnit || 0 : 0),
          })
        }
      })
    return base
  }, [purchaseOrder, projection, projectionIncluded, items])

  // ── CRUD ──────────────────────────────────────────────
  const openAddForm = () => {
    setEditingId(null)
    setFormName("")
    setFormStock("0")
    setFormMinStock("5")
    setFormUnit("kg")
    setFormPrice("0")
    setFormCategory("")
    setFormProveedorId("")
    setShowForm(true)
  }

  const openEditForm = (item: InventoryItem) => {
    setEditingId(item.id)
    setFormName(item.name)
    setFormStock(String(item.stock))
    setFormMinStock(String(item.minStock))
    setFormUnit(item.unit)
    setFormPrice(String(item.pricePerUnit))
    setFormCategory(item.category || "")
    setFormProveedorId(item.proveedorId || "")
    setShowForm(true)
  }

  const saveItem = () => {
    const stock = parseFloat(formStock) || 0
    const minStock = parseFloat(formMinStock) || 5
    const pricePerUnit = parseFloat(formPrice) || 0
    if (!formName.trim()) {
      toast("El nombre del producto es obligatorio", "warning")
      return
    }
    if (stock < 0 || minStock < 0 || pricePerUnit < 0) {
      toast("Las cantidades y precios no pueden ser negativos", "error")
      return
    }

    if (editingId) {
      const prev = items.find((i) => i.id === editingId)
      setItems((prevArr) =>
        prevArr.map((i) =>
          i.id === editingId
            ? { ...i, name: formName.trim(), stock, minStock, unit: formUnit, pricePerUnit, category: formCategory || undefined, proveedorId: formProveedorId || undefined }
            : i
        )
      )
      if (prev && prev.stock !== stock) {
        logMovement({
          itemId: editingId,
          itemName: formName.trim(),
          tipo: "ajuste",
          delta: stock - prev.stock,
          motivo: "Edición del producto (stock actualizado)",
        })
      }
      toast("Producto actualizado", "success")
    } else {
      const newItem: InventoryItem = {
        id: uid("item"),
        name: formName.trim(),
        stock,
        minStock,
        unit: formUnit,
        pricePerUnit,
        category: formCategory || undefined,
        proveedorId: formProveedorId || undefined,
      }
      setItems((prev) => [...prev, newItem])
      toast("Producto agregado al inventario", "success")
    }
    setShowForm(false)
    setEditingId(null)
  }

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    setDeleteConfirm(null)
    toast("Producto eliminado", "warning")
  }

  // ── Suppliers CRUD ────────────────────────────────────
  const addSupplier = () => {
    if (!supplierForm.nombre.trim()) {
      toast("El nombre del proveedor es obligatorio", "warning")
      return
    }
    const nuevo: Proveedor = {
      id: uid("item"),
      nombre: supplierForm.nombre.trim(),
      contacto: supplierForm.contacto.trim() || undefined,
      telefono: supplierForm.telefono.trim() || undefined,
    }
    setProveedores((prev) => [...prev, nuevo])
    setSupplierForm({ nombre: "", contacto: "", telefono: "" })
    toast(`Proveedor ${nuevo.nombre} agregado`, "success")
  }

  const deleteSupplier = (id: string) => {
    setProveedores((prev) => prev.filter((p) => p.id !== id))
    // Unlink items assigned to the deleted supplier
    setItems((prev) => prev.map((i) => (i.proveedorId === id ? { ...i, proveedorId: undefined } : i)))
    toast("Proveedor eliminado", "warning")
  }

  const proveedorName = useCallback((id?: string) => proveedores.find((p) => p.id === id)?.nombre || "Sin proveedor", [proveedores])

  // Group the projected order by supplier
  const groupedOrder = useMemo(() => {
    const groups = new Map<string | null, { proveedorId: string | null; nombre: string; items: typeof projectedOrder }>()
    projectedOrder.forEach((item) => {
      const id = item.proveedorId || null
      if (!groups.has(id)) {
        groups.set(id, { proveedorId: id, nombre: id ? proveedorName(id) : "Sin proveedor", items: [] })
      }
      groups.get(id)!.items.push(item)
    })
    return [...groups.values()]
  }, [projectedOrder, proveedorName])

  const orderTextFor = (list: typeof projectedOrder) => {
    const header = `🛒 Orden de compra — ${selectedCollection?.name || "Mi inventario"}`
    const footer = `\n📦 Pedir en resurte.me`
    const lines = list.map((item) => `• ${item.name}: ${item.toBuy} ${item.unit} × $${item.pricePerUnit} = $${item.cost.toFixed(0)}`)
    const total = `\n💰 Total estimado: $${list.reduce((s, i) => s + i.cost, 0).toFixed(0)}`
    return [header, ...lines, total, footer].join("\n")
  }

  const sendWhatsApp = (list: typeof projectedOrder, nombreProveedor: string) => {
    const text = `🧾 Orden de compra${nombreProveedor !== "Sin proveedor" ? ` — ${nombreProveedor}` : ""}\n\n${orderTextFor(list)}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer")
  }

  const adjustStock = (id: string, delta: number) => {
    const item = items.find((i) => i.id === id)
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, stock: Math.max(0, i.stock + delta) } : i
      )
    )
    if (item) {
      const tipo = delta > 0 ? "entrada" : "salida"
      logMovement({
        itemId: item.id,
        itemName: item.name,
        tipo,
        delta,
        motivo: `Ajuste manual (${delta > 0 ? "+" : ""}${delta})`,
      })
    }
  }

  const logMovement = (m: Omit<StockMovement, "fecha">) => {
    setMovements((prev) => {
      const entry: StockMovement = {
        ...m,
        fecha: new Date().toISOString(),
      }
      return [entry, ...prev].slice(0, 500)
    })
  }

  // Keyboard shortcuts: Ctrl+N new item, Escape closes modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault()
        openAddForm()
      }
      if (e.key === "Escape") {
        setDeleteConfirm(null)
        if (showForm) setShowForm(false)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [showForm])

  // Warn before leaving if the add/edit form has unsaved changes
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (showForm) {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [showForm])

  // ── Import from planificador ────────────────────────────
  const importFromPlanificador = () => {
    const planItems = Object.entries(manualQtys)
      .filter(([, m]) => m.qty > 0)
      .map(([name, m]) => ({
        name,
        qty: m.qty,
        unit: m.unit || "kg",
        price: m.price,
      }))

    const existingNames = new Set(items.map((i) => normalizeName(i.name)))
    const merged = items.map((i) => {
      const match = planItems.find((p) => normalizeName(p.name) === normalizeName(i.name))
      if (!match) return i
      // Convert the planned qty into the inventory item's unit when dimensions match
      const converted = convertQty(match.qty, match.unit, i.unit)
      const delta = converted !== null ? Math.max(1, Math.ceil(converted)) : Math.max(1, Math.ceil(match.qty))
      const price = match.price && match.price > 0 ? match.price : i.pricePerUnit
      return { ...i, stock: i.stock + delta, pricePerUnit: price }
    })
    const trulyNew: InventoryItem[] = planItems
      .filter((p) => !existingNames.has(normalizeName(p.name)))
      .map((p) => ({
        id: uid("item"),
        name: p.name,
        stock: Math.max(1, Math.ceil(p.qty)),
        minStock: Math.max(5, Math.ceil(p.qty / 2)),
        unit: p.unit,
        pricePerUnit: p.price ?? 0,
      }))
    setItems([...merged, ...trulyNew])
    const deltaNames = [...merged, ...trulyNew].filter((i) => planItems.some((p) => normalizeName(p.name) === normalizeName(i.name)))
    deltaNames.forEach((i) => {
      const plan = planItems.find((p) => normalizeName(p.name) === normalizeName(i.name))
      if (plan) {
        const converted = convertQty(plan.qty, plan.unit, i.unit)
        logMovement({
          itemId: i.id,
          itemName: i.name,
          tipo: "entrada",
          delta: converted !== null ? Math.max(1, Math.ceil(converted)) : Math.max(1, Math.ceil(plan.qty)),
          motivo: "Importación desde el planificador",
        })
      }
    })
    toast(`Se importaron ${trulyNew.length} productos nuevos y se actualizaron los existentes`, "success")
  }

  // ── Copy / Export ───────────────────────────────────────
  const copyOrder = () => {
    const lines = projectedOrder.map(
      (item) => `${item.name}: ${item.toBuy} ${item.unit} × $${item.pricePerUnit} = $${item.cost.toFixed(0)}`
    )
    const header = `🛒 Orden de compra — ${selectedCollection?.name || "Mi inventario"}`
    const total = `\n💰 Total estimado: $${projectedOrder.reduce((s, i) => s + i.cost, 0).toFixed(0)}`
    const footer = `\n📦 Pedir en resurte.me`
    navigator.clipboard.writeText([header, ...lines, total, footer].join("\n"))
    toast("Orden de compra copiada", "success")
  }

  const exportCSV = () => {
    const header = "Nombre,Stock,Stock mínimo,Unidad,Precio por unidad,Categoría,Estado"
    const rows = sortedItems.map((i) =>
      `${i.name},${i.stock},${i.minStock},${i.unit},${i.pricePerUnit},${i.category || ""},${getStatus(i).label}`
    )
    const csv = [header, ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `inventario-${slug}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast("Inventario exportado a CSV", "success")
  }

  if (!selectedCollection) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-600 mb-2">Selecciona tu tipo de restaurante</h2>
        <p className="text-sm text-gray-400">
          Usa el selector superior para elegir tu tipo de cocina y gestionar tu inventario.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-20">
    <InventarioHeader
      restaurantName={selectedCollection.name}
      itemCount={items.length}
      onExportCsv={exportCSV}
      onAddProduct={openAddForm}
    />

    <StatsRow
      itemCount={items.length}
      okCount={okStock.length}
      lowCount={lowStock.length}
      outCount={outOfStock.length}
    />

    <ValueCards
      totalValue={totalValue}
      weeklyCost={weeklyCost}
      okStock={okStock}
      lowStock={lowStock}
      outOfStock={outOfStock}
    />

    <SuppliersCatalog
      proveedores={proveedores}
      items={items}
      showSuppliers={showSuppliers}
      onToggle={() => setShowSuppliers(!showSuppliers)}
      supplierForm={supplierForm}
      onFormChange={(field, value) => setSupplierForm({ ...supplierForm, [field]: value })}
      onAdd={addSupplier}
      onDelete={deleteSupplier}
    />

    <ImportPlanificador
      hasPlanQtys={Object.values(manualQtys).some((m) => m.qty > 0)}
      onImport={importFromPlanificador}
    />

    <StockProjection
      projection={projection}
      covers={covers}
      missingCount={missingCount}
      projectionIncluded={projectionIncluded}
      onToggleProjection={() => {
        setProjectionIncluded(!projectionIncluded)
        toast(
          projectionIncluded
            ? "Se quitó la proyección de la orden de compra"
            : `Se agregaron ${missingCount} faltantes del menú a la orden de compra`,
          "success"
        )
      }}
      dishCount={sharedDishes.length}
    />

    <SortControls itemCount={items.length} sortBy={sortBy} onSortChange={setSortBy} />

    <ItemsTable
      items={items}
      sortedItems={sortedItems}
      getStatus={getStatus}
      proveedorName={proveedorName}
      onAddFirst={openAddForm}
      onEdit={openEditForm}
      onDelete={(id) => setDeleteConfirm(id)}
      onAdjustStock={adjustStock}
    />

    <PurchaseOrder
      orderExpanded={orderExpanded}
      onToggleExpanded={() => setOrderExpanded(!orderExpanded)}
      groupBySupplier={groupBySupplier}
      onToggleGroupBy={() => setGroupBySupplier(!groupBySupplier)}
      projectedOrder={projectedOrder}
      proveedoresCount={proveedores.length}
      groupedOrder={groupedOrder}
      getStatus={getStatus}
      proveedorName={proveedorName}
      onCopyOrder={copyOrder}
      onCopyGroup={(g) => navigator.clipboard.writeText(orderTextFor(g.items))}
      onSendWhatsApp={sendWhatsApp}
      onToast={toast}
    />

    <MovementHistory
      movements={movements}
      showMovements={showMovements}
      onToggle={() => setShowMovements(!showMovements)}
    />

    <InventarioTips />

    <AddEditModal
      showForm={showForm}
      editingId={editingId}
      formName={formName}
      setFormName={setFormName}
      formStock={formStock}
      setFormStock={setFormStock}
      formMinStock={formMinStock}
      setFormMinStock={setFormMinStock}
      formUnit={formUnit}
      setFormUnit={setFormUnit}
      formPrice={formPrice}
      setFormPrice={setFormPrice}
      formCategory={formCategory}
      setFormCategory={setFormCategory}
      formProveedorId={formProveedorId}
      setFormProveedorId={setFormProveedorId}
      proveedores={proveedores}
      onCancel={() => {
        setShowForm(false)
        setEditingId(null)
      }}
      onSave={saveItem}
    />

    <DeleteConfirm
      deleteConfirm={deleteConfirm}
      onCancel={() => setDeleteConfirm(null)}
      onConfirm={deleteItem}
    />
    </div>
  )
}
