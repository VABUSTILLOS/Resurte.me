"use client"

import { useState, useMemo, useEffect } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { useToast } from "@/components/toast"
import {
  Package, Plus, Edit3, Trash2, ShoppingCart,
  ArrowDownToLine, Copy, AlertTriangle,
  Clock, Download, ChevronDown, ChevronUp, BarChart3, X,
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
}

type SortField = "name" | "stock" | "pricePerUnit" | "status"

export default function InventarioPage() {
  const { selectedCollection } = useRestaurant()
  const slug = selectedCollection?.slug || "default"
  const { toast } = useToast()

  const [items, setItems] = useLocalStorage<InventoryItem[]>("inventario-items", [], slug)
  const [sortBy, setSortBy] = useLocalStorage<SortField>("inventario-sort", "name", slug)
  const [manualQtys] = useLocalStorage<Record<string, number>>("planificador-qtys", {}, slug)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formStock, setFormStock] = useState("0")
  const [formMinStock, setFormMinStock] = useState("5")
  const [formUnit, setFormUnit] = useState("kg")
  const [formPrice, setFormPrice] = useState("0")
  const [formCategory, setFormCategory] = useState("")

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

  const totalOrder = useMemo(() => {
    return purchaseOrder.reduce((sum, item) => sum + item.cost, 0)
  }, [purchaseOrder])

  // ── CRUD ──────────────────────────────────────────────
  const openAddForm = () => {
    setEditingId(null)
    setFormName("")
    setFormStock("0")
    setFormMinStock("5")
    setFormUnit("kg")
    setFormPrice("0")
    setFormCategory("")
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
      setItems((prev) =>
        prev.map((i) =>
          i.id === editingId
            ? { ...i, name: formName.trim(), stock, minStock, unit: formUnit, pricePerUnit, category: formCategory || undefined }
            : i
        )
      )
      toast("Producto actualizado", "success")
    } else {
      const newItem: InventoryItem = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: formName.trim(),
        stock,
        minStock,
        unit: formUnit,
        pricePerUnit,
        category: formCategory || undefined,
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

  const adjustStock = (id: string, delta: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, stock: Math.max(0, i.stock + delta) } : i
      )
    )
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
      .filter(([, qty]) => qty > 0)
      .map(([name, qty]) => ({
        name,
        stock: Math.ceil(qty / 1000),
        minStock: Math.max(5, Math.ceil(qty / 500)),
      }))

    const existingNames = new Set(items.map((i) => i.name.toLowerCase()))
    const merged = items.map((i) => {
      const match = planItems.find((p) => p.name.toLowerCase() === i.name.toLowerCase())
      return match ? { ...i, stock: i.stock + match.stock } : i
    })
    const trulyNew: InventoryItem[] = planItems
      .filter((p) => !existingNames.has(p.name.toLowerCase()))
      .map((p) => ({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: p.name,
        stock: p.stock,
        minStock: p.minStock,
        unit: "kg",
        pricePerUnit: 20,
      }))
    setItems([...merged, ...trulyNew])
    toast(`Se importaron ${trulyNew.length} productos nuevos y se actualizaron los existentes`, "success")
  }

  // ── Copy / Export ───────────────────────────────────────
  const copyOrder = () => {
    const lines = purchaseOrder.map(
      (item) => `${item.name}: ${item.toBuy} ${item.unit} × $${item.pricePerUnit} = $${item.cost.toFixed(0)}`
    )
    const header = `🛒 Orden de compra — ${selectedCollection?.name || "Mi inventario"}`
    const total = `\n💰 Total estimado: $${totalOrder.toFixed(0)}`
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
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
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

      {/* ── Import from planificador ───────────────────── */}
      {Object.keys(manualQtys).some((k) => manualQtys[k] > 0) && (
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
          <p className="text-gray-400 font-medium mb-1">Inventario vacío</p>
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
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Estado</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Producto</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Stock</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Mínimo</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Unidad</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Precio/Unid</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Valor</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Ajuste</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Acción</th>
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
      {purchaseOrder.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-5">
          <button onClick={() => setOrderExpanded(!orderExpanded)} className="flex items-center justify-between w-full text-left">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-[#108910]" />
              <h3 className="font-bold text-gray-900 text-sm">Orden de compra sugerida ({purchaseOrder.length} productos)</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#108910]">${totalOrder.toFixed(0)}</span>
              {orderExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>
          </button>
          {orderExpanded && (
            <div className="mt-4">
              <div className="space-y-2 mb-4">
                {purchaseOrder.map((item) => (
                  <div key={item.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span>{getStatus(item).icon}</span>
                      <span className="font-semibold text-gray-700 truncate">{item.name}</span>
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
              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                <button onClick={copyOrder}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-200 transition-colors">
                  <Copy className="w-3.5 h-3.5" /> Copiar lista
                </button>
                <p className="text-[10px] text-gray-400">Pega en WhatsApp o notas</p>
                <span className="ml-auto text-xs font-bold text-gray-700">Total: ${totalOrder.toFixed(0)}</span>
              </div>
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
