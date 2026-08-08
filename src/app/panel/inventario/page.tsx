"use client"

import { useState, useMemo, useEffect } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage, useSharedDishes } from "@/hooks/use-local-storage"
import { useToast } from "@/components/toast"
import { normalizeName } from "@/lib/normalize"
import { uid } from "@/lib/ids"
import { convertQty, ManualQty, readManualQtys } from "@/lib/panel-units"
import { t } from "@/lib/i18n/es"
import {
  Package, Plus, Edit3, Trash2, ShoppingCart,
  ArrowDownToLine, Copy, AlertTriangle, CheckCircle2,
  Clock, Download, ChevronDown, ChevronUp, BarChart3, X,
  Truck, MessageCircle, Users, Layers,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────
interface InventoryItem {
  id: string
  name: string
  stock: number
  minStock: number
  unit: string
  pricePerUnit: number
  category?: string
  proveedorId?: string
}

interface Proveedor {
  id: string
  nombre: string
  contacto?: string
  telefono?: string
}

interface StockMovement {
  fecha: string
  itemId: string
  itemName: string
  tipo: "entrada" | "salida" | "ajuste"
  delta: number
  motivo: string
}

type SortField = "name" | "stock" | "pricePerUnit" | "status"

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

  const proveedorName = (id?: string) => proveedores.find((p) => p.id === id)?.nombre || "Sin proveedor"

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
  }, [projectedOrder, proveedores])

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
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-1">📦 Mi inventario</h1>
          <p className="text-sm text-gray-400">
            {selectedCollection.name} — {items.length} productos registrados
          </p>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={exportCSV}
              className="p-2 text-gray-400 hover:text-[#108910] hover:bg-green-50 rounded-xl transition-colors"
              title="Exportar CSV"
              aria-label="Exportar inventario a CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={openAddForm}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar producto
          </button>
        </div>
      </div>

      {/* ── Stats row ──────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <p className="text-2xl font-extrabold text-gray-800">{items.length}</p>
          <p className="text-[10px] text-gray-400">Productos</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-100 p-3 text-center">
          <p className="text-2xl font-extrabold text-green-700">{okStock.length}</p>
          <p className="text-[10px] text-green-600">🟢 Suficiente</p>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-100 p-3 text-center">
          <p className="text-2xl font-extrabold text-amber-700">{lowStock.length}</p>
          <p className="text-[10px] text-amber-600">🟡 Bajo</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-3 text-center">
          <p className="text-2xl font-extrabold text-red-700">{outOfStock.length}</p>
          <p className="text-[10px] text-red-600">🔴 Agotado</p>
        </div>
      </div>

      {/* ── Value cards ────────────────────────────────── */}
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-[#108910] shrink-0" />
          <div>
            <p className="text-[10px] text-gray-400">Valor total del inventario</p>
            <p className="font-bold text-lg text-gray-900">${totalValue.toFixed(0)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-indigo-600 shrink-0" />
          <div>
            <p className="text-[10px] text-gray-400">Costo semanal estimado</p>
            <p className="font-bold text-lg text-indigo-700">${weeklyCost.toFixed(0)}</p>
          </div>
        </div>
      </div>
      {items.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
          <p className="text-[10px] text-gray-400 mb-2">Valor por estado</p>
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="bg-green-50 rounded-lg py-2">
              <p className="text-gray-500">🟢 Suficiente</p>
              <p className="font-bold text-green-700">${okStock.reduce((s, i) => s + i.stock * i.pricePerUnit, 0).toFixed(0)}</p>
            </div>
            <div className="bg-amber-50 rounded-lg py-2">
              <p className="text-gray-500">🟡 Bajo</p>
              <p className="font-bold text-amber-700">${lowStock.reduce((s, i) => s + i.stock * i.pricePerUnit, 0).toFixed(0)}</p>
            </div>
            <div className="bg-red-50 rounded-lg py-2">
              <p className="text-gray-500">🔴 Agotado</p>
              <p className="font-bold text-red-700">${outOfStock.reduce((s, i) => s + i.stock * i.pricePerUnit, 0).toFixed(0)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Suppliers catalog ──────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <button onClick={() => setShowSuppliers(!showSuppliers)} className="flex items-center justify-between w-full text-left">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#108910]" />
            <h3 className="font-bold text-gray-900 text-sm">Proveedores ({proveedores.length})</h3>
            <p className="text-[10px] text-gray-400 hidden sm:block">Asigna un proveedor a cada producto para agrupar tus órdenes</p>
          </div>
          {showSuppliers ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {showSuppliers && (
          <div className="mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2">
              <input
                type="text"
                value={supplierForm.nombre}
                onChange={(e) => setSupplierForm({ ...supplierForm, nombre: e.target.value })}
                placeholder="Nombre del proveedor"
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]"
                aria-label="Nombre del proveedor"
              />
              <input
                type="text"
                value={supplierForm.contacto}
                onChange={(e) => setSupplierForm({ ...supplierForm, contacto: e.target.value })}
                placeholder="Contacto (opcional)"
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]"
                aria-label="Contacto del proveedor"
              />
              <input
                type="text"
                value={supplierForm.telefono}
                onChange={(e) => setSupplierForm({ ...supplierForm, telefono: e.target.value })}
                placeholder="Teléfono (opcional)"
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]"
                aria-label="Teléfono del proveedor"
              />
              <button
                onClick={addSupplier}
                disabled={!supplierForm.nombre.trim()}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar
              </button>
            </div>
            {proveedores.length === 0 && (
              <p className="text-[10px] text-gray-400">
                Agrega tus proveedores (p. ej. "Distribuidora Lácteos" o "Carnicería El Norte") para después asignarlos a cada producto.
              </p>
            )}
            {proveedores.length > 0 && (
              <div className="space-y-1.5 mt-3">
                {proveedores.map((p) => {
                  const assigned = items.filter((i) => i.proveedorId === p.id).length
                  return (
                    <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-700 truncate">{p.nombre}</p>
                        <p className="text-[10px] text-gray-400">
                          {[p.contacto, p.telefono].filter(Boolean).join(" · ") || "Sin contacto"}
                          {assigned > 0 && ` · ${assigned} producto${assigned > 1 ? "s" : ""}`}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteSupplier(p.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar proveedor"
                        aria-label={`Eliminar proveedor ${p.nombre}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Import from planificador ───────────────────── */}
      {Object.values(manualQtys).some((m) => m.qty > 0) && (
        <div className="bg-gradient-to-r from-indigo-50 to-white rounded-xl border border-indigo-100 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowDownToLine className="w-4 h-4 text-indigo-600" />
              <p className="text-xs font-semibold text-indigo-700">
                Importar productos desde el Planificador
              </p>
            </div>
            <button
              onClick={importFromPlanificador}
              className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
            >
              Importar ahora
            </button>
          </div>
          <p className="text-[10px] text-indigo-400 mt-2">
            Los productos con cantidades manuales del planificador se agregarán al inventario.
            Los que ya existen se actualizarán con stock adicional.
          </p>
        </div>
      )}

      {/* ── Recipe-aware stock projection ──────────────── */}
      {projection.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#108910]" />
              <h3 className="font-bold text-gray-900 text-sm">Tu menú planeado para {covers} comensales</h3>
            </div>
            {missingCount > 0 && (
              <button
                onClick={() => {
                  setProjectionIncluded(!projectionIncluded)
                  toast(
                    projectionIncluded
                      ? "Se quitó la proyección de la orden de compra"
                      : `Se agregaron ${missingCount} faltantes del menú a la orden de compra`,
                    "success"
                  )
                }}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                  projectionIncluded ? "bg-[#108910] text-white" : "bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
                }`}
                title="Agregar los faltantes calculados a la orden de compra"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                {projectionIncluded ? "En la orden de compra ✓" : "Agregar faltantes a la orden"}
              </button>
            )}
          </div>
          <div className="space-y-1.5 mb-2">
            {projection.map((p) => (
              <div key={p.key} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 text-xs">
                <span className="shrink-0 text-sm">{p.icon}</span>
                <span className="font-semibold text-gray-700 truncate">{p.name}</span>
                <span className={`ml-auto shrink-0 font-medium ${
                  p.status === "ok" ? "text-green-600" : p.status === "justo" ? "text-amber-600" : "text-red-600"
                }`}>
                  {p.label}
                </span>
                <span className="text-gray-400 shrink-0">
                  {p.stockQty === null ? "—" : `${p.stockQty} ${p.stockUnit}`} / {p.neededQty.toFixed(1)} {p.neededUnit}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400">
            Proyección = ingredientes de tus {sharedDishes.length} platillos costeados × {covers} comensales (con su unidad).
            Compara contra tu inventario actual para no quedarte corto en el servicio.
          </p>
        </div>
      )}

      {/* ── Sort ───────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-gray-400">Ordenar:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortField)}
            className="text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg px-2 py-1"
          >
            <option value="name">Nombre</option>
            <option value="stock">Stock</option>
            <option value="pricePerUnit">Precio</option>
            <option value="status">Estado</option>
          </select>
        </div>
      )}

      {/* ── Items table ────────────────────────────────── */}
      {items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Package className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 font-medium mb-1">{t("inventario.emptyTitle")}</p>
          <p className="text-xs text-gray-300 mb-4">
            Agrega productos manualmente o impórtalos desde el planificador
          </p>
          <button
            onClick={openAddForm}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar primer producto
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs" aria-label={t("inventario.title")}>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th scope="col" className="text-left px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Estado</th>
                  <th scope="col" className="text-left px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Producto</th>
                  <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Stock</th>
                  <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Mínimo</th>
                  <th scope="col" className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Unidad</th>
                  <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Precio/Unid</th>
                  <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Valor</th>
                  <th scope="col" className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Ajuste</th>
                  <th scope="col" className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Acción</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => {
                  const status = getStatus(item)
                  return (
                    <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <span title={status.label} className="text-lg">{status.icon}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800">{item.name}</p>
                        {item.category && <p className="text-[10px] text-gray-400">{item.category}</p>}
                        {item.proveedorId && (
                          <p className="text-[10px] text-emerald-600 font-medium truncate max-w-[160px]">
                            🚚 {proveedorName(item.proveedorId)}
                          </p>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${
                        item.stock === 0 ? "text-red-600" : item.stock <= item.minStock ? "text-amber-600" : "text-green-700"
                      }`}>
                        {item.stock}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{item.minStock}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{item.unit}</td>
                      <td className="px-4 py-3 text-right text-gray-700 font-medium">${item.pricePerUnit}</td>
                      <td className="px-4 py-3 text-right text-gray-700 font-medium">
                        ${(item.stock * item.pricePerUnit).toFixed(0)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => adjustStock(item.id, -1)}
                            className="w-6 h-6 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 text-xs font-bold transition-colors"
                            disabled={item.stock <= 0}
                            aria-label={`Disminuir stock de ${item.name}`}
                          >−</button>
                          <button
                            onClick={() => adjustStock(item.id, 1)}
                            className="w-6 h-6 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 text-xs font-bold transition-colors"
                            aria-label={`Aumentar stock de ${item.name}`}
                          >+</button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEditForm(item)} className="p-1.5 text-gray-400 hover:text-[#108910] hover:bg-green-50 rounded-lg transition-colors" title="Editar" aria-label={`Editar ${item.name}`}>
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteConfirm(item.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar" aria-label={`Eliminar ${item.name}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Purchase order section ─────────────────────── */}
      {(projectedOrder.length > 0) && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-5">
          <button onClick={() => setOrderExpanded(!orderExpanded)} className="flex items-center justify-between w-full text-left">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-[#108910]" />
              <h3 className="font-bold text-gray-900 text-sm">Orden de compra sugerida ({projectedOrder.length} productos)</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#108910]">${projectedOrder.reduce((s, i) => s + i.cost, 0).toFixed(0)}</span>
              {orderExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>
          </button>
          {orderExpanded && (
            <div className="mt-4">
              {proveedores.length > 0 && groupedOrder.length > 1 && (
                <div className="flex items-center gap-2 mb-4">
                  <label className="flex items-center gap-2 text-[11px] text-gray-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={groupBySupplier}
                      onChange={(e) => setGroupBySupplier(e.target.checked)}
                      className="accent-[#108910]"
                    />
                    <span className="font-semibold text-gray-700">Agrupar por proveedor</span>
                  </label>
                  <Layers className="w-3.5 h-3.5 text-gray-400" />
                </div>
              )}

              {groupBySupplier && proveedores.length > 0 ? (
                <div className="space-y-4 mb-4">
                  {groupedOrder.map((group) => (
                    <div key={group.proveedorId || "sin"} className="rounded-xl border border-gray-100 overflow-hidden">
                      <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-[#108910]" />
                          <span className="text-xs font-bold text-gray-700">{group.nombre}</span>
                          <span className="text-[9px] text-gray-400">{group.items.length} producto{group.items.length > 1 ? "s" : ""}</span>
                        </div>
                        <span className="text-xs font-bold text-[#108910]">
                          ${group.items.reduce((s, i) => s + i.cost, 0).toFixed(0)}
                        </span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {group.items.map((item) => (
                          <div key={item.id} className="flex items-center justify-between px-3 py-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span>{item.id.startsWith("proj-") ? "🔍" : getStatus(item).icon}</span>
                              <span className="font-semibold text-gray-700 truncate">{item.name}</span>
                              {item.id.startsWith("proj-") && (
                                <span className="text-[9px] bg-cyan-50 text-cyan-600 px-1.5 py-0.5 rounded-full font-medium">Proyección</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-gray-500">Comprar {item.toBuy} {item.unit}</span>
                              <span className="font-bold text-[#108910]">${item.cost.toFixed(0)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(orderTextFor(group.items))
                            toast(`Orden de ${group.nombre} copiada`, "success")
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 text-gray-700 text-[10px] font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                          aria-label={`Copiar orden de ${group.nombre}`}
                        >
                          <Copy className="w-3 h-3" /> Copiar
                        </button>
                        <button
                          onClick={() => sendWhatsApp(group.items, group.nombre)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 text-green-700 text-[10px] font-semibold rounded-lg hover:bg-green-100 transition-colors"
                          aria-label={`Enviar orden de ${group.nombre} por WhatsApp`}
                        >
                          <MessageCircle className="w-3 h-3" /> WhatsApp
                        </button>
                        <span className="ml-auto text-[10px] text-gray-400">{group.nombre}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 mb-4">
                  {projectedOrder.map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span>{item.id.startsWith("proj-") ? "🔍" : getStatus(item).icon}</span>
                        <span className="font-semibold text-gray-700 truncate">{item.name}</span>
                        {item.id.startsWith("proj-") && (
                          <span className="text-[9px] bg-cyan-50 text-cyan-600 px-1.5 py-0.5 rounded-full font-medium">Proyección</span>
                        )}
                        {item.proveedorId && (
                          <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium hidden sm:inline">
                            {proveedorName(item.proveedorId)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-gray-500">Comprar {item.toBuy} {item.unit}</span>
                        <span className="font-bold text-[#108910]">${item.cost.toFixed(0)}</span>
                        <a href="https://resurte.me" target="_blank" rel="noopener noreferrer"
                          className="text-[10px] bg-[#108910] text-white px-2 py-0.5 rounded-full font-medium hover:bg-green-800 transition-colors">
                          Comprar
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 pt-3 border-t border-gray-100 flex-wrap">
                <button onClick={copyOrder}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-200 transition-colors">
                  <Copy className="w-3.5 h-3.5" /> Copiar lista
                </button>
                <button
                  onClick={() => sendWhatsApp(projectedOrder, "general")}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 text-xs font-semibold rounded-xl hover:bg-green-100 transition-colors"
                  aria-label="Enviar orden de compra por WhatsApp"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> Enviar por WhatsApp
                </button>
                <p className="text-[10px] text-gray-400">Pega en WhatsApp o notas</p>
                <span className="ml-auto text-xs font-bold text-gray-700">Total: ${projectedOrder.reduce((s, i) => s + i.cost, 0).toFixed(0)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Movement history ───────────────────────────── */}
      {movements.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-5">
          <button onClick={() => setShowMovements(!showMovements)} className="flex items-center justify-between w-full text-left">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-gray-900 text-sm">Historial de movimientos ({movements.length})</h3>
            </div>
            {showMovements ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {showMovements && (
            <div className="mt-4 space-y-1.5 max-h-64 overflow-y-auto">
              {movements.slice(0, 20).map((m, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 text-xs">
                  <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    m.tipo === "entrada" ? "bg-green-100 text-green-700" : m.tipo === "salida" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {m.tipo === "entrada" ? "+" : m.tipo === "salida" ? "−" : "±"}
                  </span>
                  <span className="font-semibold text-gray-700 truncate">{m.itemName}</span>
                  <span className="text-gray-400 shrink-0">{m.motivo}</span>
                  <span className={`ml-auto shrink-0 font-bold ${m.delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {m.delta > 0 ? "+" : ""}{m.delta}
                  </span>
                  <span className="text-[10px] text-gray-300 shrink-0 w-24 text-right">
                    {new Date(m.fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })} {new Date(m.fecha).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tips ───────────────────────────────────────── */}
      <div className="mt-6 bg-gradient-to-r from-[#F0FDF4] to-white rounded-2xl border border-[#108910]/10 p-5">
        <div className="flex items-start gap-3">
          <Package className="w-5 h-5 text-[#108910] mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold text-gray-900 mb-1 text-sm">Consejos de inventario</h4>
            <p className="text-xs text-gray-500 leading-relaxed">
              Mantén al menos 2× el stock mínimo de cada producto. Revisa el inventario semanalmente.
              Los productos importados del planificador se actualizan al reimportar.
              Usa la orden de compra sugerida para pedir todo lo que necesitas en resurte.me.
            </p>
          </div>
        </div>
      </div>

      {/* ── Add/Edit Modal ─────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">{editingId ? "Editar producto" : "Agregar producto"}</h3>
              <button onClick={() => { setShowForm(false); setEditingId(null) }} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Nombre</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ej: Harina de trigo"
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Stock actual</label>
                  <input type="number" value={formStock} onChange={(e) => setFormStock(e.target.value)} min="0"
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Stock mínimo</label>
                  <input type="number" value={formMinStock} onChange={(e) => setFormMinStock(e.target.value)} min="1"
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Unidad</label>
                  <select value={formUnit} onChange={(e) => setFormUnit(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]">
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="L">L</option>
                    <option value="ml">ml</option>
                    <option value="pieza">pieza</option>
                    <option value="caja">caja</option>
                    <option value="paquete">paquete</option>
                    <option value="litro">litro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Precio por unidad</label>
                  <input type="number" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} min="0" step="0.01"
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">
                  Categoría <span className="text-gray-300">(opcional)</span>
                </label>
                <input type="text" value={formCategory} onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="Ej: Lácteos"
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">
                  Proveedor <span className="text-gray-300">(opcional)</span>
                </label>
                <select value={formProveedorId} onChange={(e) => setFormProveedorId(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910] bg-white"
                  aria-label="Proveedor del producto">
                  <option value="">Sin proveedor</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
                {proveedores.length === 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Agrega proveedores en la sección "Proveedores" de esta página para agrupar tus órdenes de compra.
                  </p>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => { setShowForm(false); setEditingId(null) }}
                  className="flex-1 px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors font-medium">
                  Cancelar
                </button>
                <button onClick={saveItem} disabled={!formName.trim()}
                  className="flex-1 px-4 py-2 text-sm text-white bg-[#108910] rounded-xl hover:bg-green-800 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
                  {editingId ? "Guardar cambios" : "Agregar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ───────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h3 className="font-bold text-gray-900">¿Eliminar producto?</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">Esta acción no se puede deshacer.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors font-medium">
                Cancelar
              </button>
              <button onClick={() => deleteItem(deleteConfirm)}
                className="flex-1 px-4 py-2 text-sm text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors font-semibold">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
