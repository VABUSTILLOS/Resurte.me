"use client"

// ============================================================
// Menú digital — CRUD de categorías y platillos + import desde costeo.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useSharedDishes } from "@/hooks/use-local-storage"
import {
  getFoodosPanelData,
  listCategories,
  listMenuItems,
  upsertCategory,
  deleteCategory,
  upsertMenuItem,
  deleteMenuItem,
  bulkUpsertMenuItems,
} from "../actions"
import { formatMoney, itemMargin } from "@/lib/foodos"
import type {
  FoodosRestaurant,
  FoodosMenuCategory,
  FoodosMenuItem,
} from "@/types/foodos"
import {
  UtensilsCrossed, Plus, Pencil, Trash2, Download, Check, X, Star, Loader2, Tag,
} from "lucide-react"

interface ItemForm {
  id?: string
  category_id: string | null
  name: string
  description: string
  price: string
  cost: string
  tags: string[]
  is_featured: boolean
  is_available: boolean
}

const EMPTY_ITEM: ItemForm = {
  category_id: null,
  name: "",
  description: "",
  price: "",
  cost: "",
  tags: [],
  is_featured: false,
  is_available: true,
}

const TAG_OPTIONS = ["favorito", "para compartir", "nuevo", "picante", "vegano"]

export default function MenuPage() {
  const { selectedCollection } = useRestaurant()
  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [categories, setCategories] = useState<FoodosMenuCategory[]>([])
  const [items, setItems] = useState<FoodosMenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Forms
  const [newCategory, setNewCategory] = useState("")
  const [editingCategory, setEditingCategory] = useState<FoodosMenuCategory | null>(null)
  const [editingItem, setEditingItem] = useState<ItemForm | null>(null)
  const [showItemForm, setShowItemForm] = useState(false)
  const [importing, setImporting] = useState(false)

  const [sharedDishes] = useSharedDishes(selectedCollection?.slug)

  const load = useCallback(async () => {
    try {
      const { restaurant: r, categories: cats, items: its } = await getFoodosPanelData()
      setRestaurant(r)
      setCategories(cats)
      setItems(its)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el menú")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, FoodosMenuItem[]>()
    for (const item of items) {
      const key = item.category_id ?? "sin-categoria"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return map
  }, [items])

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    if (!restaurant || !newCategory.trim()) return
    await upsertCategory({
      restaurant_id: restaurant.id,
      name: newCategory.trim(),
      sort_order: categories.length,
    })
    setNewCategory("")
    setCategories(await listCategories(restaurant.id))
  }

  async function handleRenameCategory() {
    if (!editingCategory || !editingCategory.name.trim()) return
    await upsertCategory({
      id: editingCategory.id,
      restaurant_id: editingCategory.restaurant_id,
      name: editingCategory.name.trim(),
      sort_order: editingCategory.sort_order,
    })
    setEditingCategory(null)
    setCategories(await listCategories(editingCategory.restaurant_id))
  }

  async function handleDeleteCategory(id: string) {
    await deleteCategory(id)
    setCategories(await listCategories(restaurant!.id))
  }

  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault()
    if (!restaurant || !editingItem || !editingItem.name.trim()) return
    await upsertMenuItem({
      id: editingItem.id,
      restaurant_id: restaurant.id,
      category_id: editingItem.category_id,
      name: editingItem.name.trim(),
      description: editingItem.description || null,
      price: Number(editingItem.price) || 0,
      cost: Number(editingItem.cost) || 0,
      tags: editingItem.tags,
      is_featured: editingItem.is_featured,
      is_available: editingItem.is_available,
      sort_order: items.length,
    })
    setShowItemForm(false)
    setEditingItem(null)
    setItems(await listMenuItems(restaurant.id))
  }

  async function handleDeleteItem(id: string) {
    await deleteMenuItem(id)
    setItems(await listMenuItems(restaurant!.id))
  }

  async function handleImportFromCosteo() {
    if (!restaurant || sharedDishes.length === 0) return
    setImporting(true)
    setError(null)
    try {
      const mapped = sharedDishes.map((d) => ({
        name: d.name,
        description: `Costo: ${formatMoney(
          d.ingredients.reduce((s, i) => s + (i.quantity ?? 0) * (i.unitPrice ?? 0), 0)
        )} · Food cost ${Math.round(d.foodCostPercent)}%`,
        price: d.sellingPrice,
        cost: d.ingredients.reduce((s, i) => s + (i.quantity ?? 0) * (i.unitPrice ?? 0), 0),
        tags: d.modificadores?.length ? ["favorito"] : [],
      }))
      const { added } = await bulkUpsertMenuItems(restaurant.id, mapped)
      setItems(await listMenuItems(restaurant.id))
      setError(`Se importaron ${added} platillos desde "Costeando mi menú".`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al importar")
    } finally {
      setImporting(false)
    }
  }

  function toggleTag(tag: string) {
    if (!editingItem) return
    setEditingItem({
      ...editingItem,
      tags: editingItem.tags.includes(tag)
        ? editingItem.tags.filter((t) => t !== tag)
        : [...editingItem.tags, tag],
    })
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
        <UtensilsCrossed className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h2 className="font-semibold text-gray-900">Primero crea tu restaurante</h2>
        <p className="text-sm text-gray-500 mt-1">
          Ve a <Link href="/panel/foodos/restaurante" className="text-[#0E7A0E] font-semibold hover:underline">Mi restaurante</Link> para configurar tu perfil público.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menú digital</h1>
          <p className="text-sm text-gray-500 mt-1">
            Arma tu menú público. Los cambios se ven al instante en tu micrositio.
          </p>
        </div>
        <button
          onClick={handleImportFromCosteo}
          disabled={importing || sharedDishes.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#0E7A0E]/30 text-[#0E7A0E] text-sm font-semibold hover:bg-[#F0FDF4] disabled:opacity-40 transition-colors"
          title={sharedDishes.length === 0 ? "No hay platillos en Costeando mi menú" : `Importar ${sharedDishes.length} platillo(s)`}
        >
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Importar desde costeo
        </button>
      </div>

      {error && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${error.includes("importaron") ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Categorías */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-100 p-4 h-fit">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Categorías</h2>
          <form onSubmit={handleAddCategory} className="flex gap-2 mb-3">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Nueva categoría"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
            />
            <button
              type="submit"
              className="p-2 rounded-lg bg-[#0E7A0E] text-white hover:bg-[#0e7a0e]"
              aria-label="Agregar categoría"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>
          <div className="space-y-1">
            <button
              onClick={() => { setEditingItem({ ...EMPTY_ITEM }); setShowItemForm(true) }}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 text-left"
            >
              <Plus className="w-3.5 h-3.5" /> Sin categoría (item suelto)
            </button>
            {categories.map((c) => (
              <div key={c.id} className="group rounded-lg">
                {editingCategory?.id === c.id ? (
                  <div className="flex gap-1 items-center">
                    <input
                      value={editingCategory.name}
                      onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                      className="flex-1 rounded-lg border border-[#0E7A0E] px-2 py-1.5 text-sm"
                    />
                    <button
                      onClick={handleRenameCategory}
                      className="p-1 text-[#0E7A0E]"
                      aria-label="Guardar nombre de categoría"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingCategory(null)}
                      className="p-1 text-gray-400"
                      aria-label="Cancelar edición de categoría"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 group">
                    <button
                      onClick={() => { setEditingItem({ ...EMPTY_ITEM, category_id: c.id }); setShowItemForm(true) }}
                      className="flex items-center gap-2 text-sm text-gray-700 flex-1 text-left"
                    >
                      <span>{c.name}</span>
                      <span className="text-[10px] text-gray-400">({itemsByCategory.get(c.id)?.length ?? 0})</span>
                    </button>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingCategory(c)} className="p-1 text-gray-400 hover:text-[#0E7A0E]"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDeleteCategory(c.id)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Platillos */}
        <div className="lg:col-span-3 space-y-4">
          {categories.map((c) => (
            <div key={c.id}>
              <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                {c.name}
                <button
                  onClick={() => { setEditingItem({ ...EMPTY_ITEM, category_id: c.id }); setShowItemForm(true) }}
                  className="p-1 rounded-md text-gray-400 hover:text-[#0E7A0E] hover:bg-[#F0FDF4]"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(itemsByCategory.get(c.id) ?? []).map((item) => (
                  <div key={item.id} className={`bg-white rounded-xl border p-4 ${!item.is_available ? "opacity-60" : "border-gray-100"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {item.is_featured && <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />}
                        <h4 className="font-medium text-gray-900 text-sm truncate">{item.name}</h4>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => setEditingItem({
                            id: item.id, category_id: item.category_id, name: item.name,
                            description: item.description ?? "", price: String(item.price), cost: String(item.cost),
                            tags: item.tags ?? [], is_featured: item.is_featured, is_available: item.is_available,
                          })}
                          className="p-1.5 rounded-md text-gray-400 hover:text-[#0E7A0E]"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 rounded-md text-gray-400 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {item.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>}
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">{formatMoney(item.price)}</span>
                        {item.cost > 0 && itemMargin(item) != null && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${itemMargin(item)! >= 0.3 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                            {(itemMargin(item)! * 100).toFixed(0)}% margen
                          </span>
                        )}
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${item.is_available ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {item.is_available ? "Disponible" : "Agotado"}
                      </span>
                    </div>
                    {item.tags.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {item.tags.map((t) => (
                          <span key={t} className="text-[10px] bg-[#0E7A0E]/10 text-[#0E7A0E] px-1.5 py-0.5 rounded-full">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {(itemsByCategory.get(c.id) ?? []).length === 0 && (
                  <p className="text-xs text-gray-400 col-span-2 py-2">Sin platillos aún.</p>
                )}
              </div>
            </div>
          ))}

          {/* Items sueltos */}
          {(itemsByCategory.get("sin-categoria") ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Sin categoría</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(itemsByCategory.get("sin-categoria") ?? []).map((item) => (
                  <div key={item.id} className={`bg-white rounded-xl border p-4 ${!item.is_available ? "opacity-60" : "border-gray-100"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {item.is_featured && <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />}
                        <h4 className="font-medium text-gray-900 text-sm truncate">{item.name}</h4>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => setEditingItem({
                            id: item.id, category_id: item.category_id, name: item.name,
                            description: item.description ?? "", price: String(item.price), cost: String(item.cost),
                            tags: item.tags ?? [], is_featured: item.is_featured, is_available: item.is_available,
                          })}
                          className="p-1.5 rounded-md text-gray-400 hover:text-[#0E7A0E]"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 rounded-md text-gray-400 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-sm font-bold text-gray-900">{formatMoney(item.price)}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${item.is_available ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {item.is_available ? "Disponible" : "Agotado"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {items.length === 0 && (
            <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-2xl">
              <Tag className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Agrega platillos o impórtalos desde &ldquo;Costeando mi menú&rdquo;.</p>
            </div>
          )}
        </div>
      </div>

      {/* Form de item */}
      {showItemForm && editingItem && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowItemForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-[#0E7A0E]" />
              {editingItem.id ? "Editar platillo" : "Nuevo platillo"}
            </h3>
            <form onSubmit={handleSaveItem} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Nombre *</label>
                  <input
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Precio *</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={editingItem.price}
                    onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Costo</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={editingItem.cost}
                    onChange={(e) => setEditingItem({ ...editingItem, cost: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Descripción</label>
                  <textarea
                    rows={2}
                    value={editingItem.description}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Categoría</label>
                  <select
                    value={editingItem.category_id ?? ""}
                    onChange={(e) => setEditingItem({ ...editingItem, category_id: e.target.value || null })}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm"
                  >
                    <option value="">Sin categoría</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Etiquetas</label>
                  <div className="flex flex-wrap gap-1.5">
                    {TAG_OPTIONS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTag(t)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          editingItem.tags.includes(t)
                            ? "bg-[#0E7A0E]/10 border-[#0E7A0E]/30 text-[#0E7A0E]"
                            : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingItem.is_featured}
                    onChange={(e) => setEditingItem({ ...editingItem, is_featured: e.target.checked })}
                    className="accent-[#0E7A0E]"
                  />
                  Destacado
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingItem.is_available}
                    onChange={(e) => setEditingItem({ ...editingItem, is_available: e.target.checked })}
                    className="accent-[#0E7A0E]"
                  />
                  Disponible
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowItemForm(false); setEditingItem(null) }}
                  className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!editingItem.name.trim() || !Number(editingItem.price)}
                  className="px-5 py-2 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0e7a0e] disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
