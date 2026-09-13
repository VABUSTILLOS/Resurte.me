"use client"

// ============================================================
// Menú digital — CRUD de categorías y platillos + import desde costeo.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useSharedDishes } from "@/hooks/use-local-storage"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import {
  getFoodosPanelData,
  listCategories,
  listMenuItems,
  upsertCategory,
  deleteCategory,
  upsertMenuItem,
  deleteMenuItem,
  bulkUpsertMenuItems,
  importMenuCsv,
} from "../actions"
import { ItemOptionsManager } from "./_components/item-options-manager"
import { ItemBranchOverrides } from "./_components/item-branch-overrides"
import { formatMoney, itemMargin } from "@/lib/foodos"
import type {
  FoodosRestaurant,
  FoodosBranch,
  FoodosMenuCategory,
  FoodosMenuItem,
  FoodosItemOptionGroup,
  FoodosItemOptionValue,
  FoodosBranchMenuOverride,
} from "@/types/foodos"
import {
  UtensilsCrossed, Plus, Pencil, Trash2, Download, Check, X, Star, Loader2, Tag, ListPlus, Building2, Upload,
} from "lucide-react"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import { t } from "@/lib/i18n/es"

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
  const [optionGroups, setOptionGroups] = useState<FoodosItemOptionGroup[]>([])
  const [optionValues, setOptionValues] = useState<FoodosItemOptionValue[]>([])
  const [optionsItem, setOptionsItem] = useState<FoodosMenuItem | null>(null)
  const [overridesItem, setOverridesItem] = useState<FoodosMenuItem | null>(null)
  const [branches, setBranches] = useState<FoodosBranch[]>([])
  const [overrides, setOverrides] = useState<FoodosBranchMenuOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Forms
  const [newCategory, setNewCategory] = useState("")
  const [editingCategory, setEditingCategory] = useState<FoodosMenuCategory | null>(null)
  const [editingItem, setEditingItem] = useState<ItemForm | null>(null)
  const [showItemForm, setShowItemForm] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importingCsv, setImportingCsv] = useState(false)


  const [sharedDishes] = useSharedDishes(selectedCollection?.slug)

  const load = useCallback(async () => {
    try {
      const { restaurant: r, categories: cats, items: its, optionGroups: ogs, optionValues: ovs, branches: bs } = await getFoodosPanelData()
      setRestaurant(r)
      setCategories(cats)
      setItems(its)
      setOptionGroups(ogs)
      setOptionValues(ovs)
      setBranches(bs)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("foodos.menu.loadError"))
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
      map.get(key)?.push(item)
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
    if (!restaurant) return
    await deleteCategory(id)
    setCategories(await listCategories(restaurant.id))
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
    if (!restaurant) return
    await deleteMenuItem(id)
    setItems(await listMenuItems(restaurant.id))
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
      setError(t("foodos.menu.imported", { count: added }))
    } catch (e) {
      setError(e instanceof Error ? e.message : t("foodos.menu.importError"))
    } finally {
      setImporting(false)
    }
  }

  // CSV: categoria,nombre,descripcion,precio,costo,tags (tags separados por |)
  async function handleCsvFile(file: File) {
    if (!restaurant) return
    setImportingCsv(true)
    setError(null)
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      if (lines.length < 2) throw new Error("El CSV no tiene filas de datos")
      const rows = lines.slice(1).map((line) => {
        const c = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""))
        return {
          category_name: c[0] || null,
          name: c[1] ?? "",
          description: c[2] || null,
          price: Number(c[3]) || 0,
          cost: Number(c[4]) || 0,
          tags: c[5] ? c[5].split("|").map((tg) => tg.trim()).filter(Boolean) : [],
        }
      }).filter((r) => r.name)
      if (rows.length === 0) throw new Error("No se encontraron platillos válidos")
      const { added, categories } = await importMenuCsv(restaurant.id, rows)
      setItems(await listMenuItems(restaurant.id))
      setCategories(await listCategories(restaurant.id))
      setError(`Se importaron ${added} platillos${categories ? ` y ${categories} categorías nuevas` : ""}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al importar el CSV")
    } finally {
      setImportingCsv(false)
    }
  }

  function downloadCsvTemplate() {
    const csv = "categoria,nombre,descripcion,precio,costo,tags\nTacos,Taco al pastor,Con piña y cilantro,45,18,favorito\nBebidas,Agua de horchata,Vaso 500ml,35,8,"
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "plantilla-menu.csv"
    a.click()
    URL.revokeObjectURL(url)
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
        <h2 className="font-semibold text-gray-900">{t("foodos.menu.setupTitle")}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {t("foodos.menu.setupPre")} <Link href="/panel/foodos/restaurante" className="text-[#0E7A0E] font-semibold hover:underline">{t("foodos.menu.setupLink")}</Link> {t("foodos.menu.setupPost")}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("foodos.menu.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("foodos.menu.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
        <button
          onClick={downloadCsvTemplate}
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-xs font-semibold hover:bg-gray-50"
          title="Descargar plantilla CSV"
        >
          <Download className="w-3.5 h-3.5" /> Plantilla
        </button>
        <label className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[#0E7A0E]/30 text-[#0E7A0E] text-xs font-semibold hover:bg-[#F0FDF4] cursor-pointer ${importingCsv ? "opacity-40 pointer-events-none" : ""}`}>
          {importingCsv ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Importar CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleCsvFile(f)
              e.target.value = ""
            }}
          />
        </label>
        <button
          onClick={handleImportFromCosteo}
          disabled={importing || sharedDishes.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#0E7A0E]/30 text-[#0E7A0E] text-sm font-semibold hover:bg-[#F0FDF4] disabled:opacity-40 transition-colors"
          title={sharedDishes.length === 0 ? t("foodos.menu.importEmpty") : t("foodos.menu.importCount", { count: sharedDishes.length })}
        >
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {t("foodos.menu.importFromCosteo")}
        </button>
        </div>
      </div>

      {error && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${error.includes("importaron") ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Categorías */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-100 p-4 h-fit">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">{t("foodos.menu.categories")}</h2>
          <form onSubmit={handleAddCategory} className="flex gap-2 mb-3">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder={t("foodos.menu.newCategoryPlaceholder")}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
            />
            <button
              type="submit"
              className="p-2 rounded-lg bg-[#0E7A0E] text-white hover:bg-[#0e7a0e]"
              aria-label={t("foodos.menu.addCategoryLabel")}
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>
          <div className="space-y-1">
            <button
              onClick={() => { setEditingItem({ ...EMPTY_ITEM }); setShowItemForm(true) }}
              className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 text-left"
            >
              <Plus className="w-3.5 h-3.5" /> {t("foodos.menu.uncategorizedItem")}
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
                      aria-label={t("foodos.menu.saveCategoryLabel")}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingCategory(null)}
                      className="p-1 text-gray-400"
                      aria-label={t("foodos.menu.cancelCategoryLabel")}
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
                          onClick={() => setOptionsItem(item)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-[#0E7A0E]"
                          title="Opciones y extras"
                        >
                          <ListPlus className="w-3.5 h-3.5" />
                        </button>
                        {branches.length > 1 && (
                          <button
                            onClick={() => setOverridesItem(item)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-[#0E7A0E]"
                            title="Precio/disponibilidad por sucursal"
                          >
                            <Building2 className="w-3.5 h-3.5" />
                          </button>
                        )}
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
                        {item.cost > 0 && itemMargin(item) != null && (() => {
                          const margin = itemMargin(item) ?? 0
                          return (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${margin >= 0.3 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                              {t("foodos.menu.margin", { pct: (margin * 100).toFixed(0) })}
                            </span>
                          )
                        })()}
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${item.is_available ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {item.is_available ? t("foodos.menu.available") : t("foodos.menu.unavailable")}
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
                  <p className="text-xs text-gray-400 col-span-2 py-2">{t("foodos.menu.noDishesYet")}</p>
                )}
              </div>
            </div>
          ))}

          {/* Items sueltos */}
          {(itemsByCategory.get("sin-categoria") ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-2">{t("foodos.menu.uncategorized")}</h3>
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
                          onClick={() => setOptionsItem(item)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-[#0E7A0E]"
                          title="Opciones y extras"
                        >
                          <ListPlus className="w-3.5 h-3.5" />
                        </button>
                        {branches.length > 1 && (
                          <button
                            onClick={() => setOverridesItem(item)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-[#0E7A0E]"
                            title="Precio/disponibilidad por sucursal"
                          >
                            <Building2 className="w-3.5 h-3.5" />
                          </button>
                        )}
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
                      <div className="flex items-center gap-1.5">
                        {optionGroups.some((g) => g.item_id === item.id) && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                            {optionGroups.filter((g) => g.item_id === item.id).length} opciones
                          </span>
                        )}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${item.is_available ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {item.is_available ? t("foodos.menu.available") : t("foodos.menu.unavailable")}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {items.length === 0 && (
            <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-2xl">
              <Tag className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">{t("foodos.menu.emptyMenu")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Form de item */}
      <BottomSheet
        open={showItemForm && editingItem != null}
        onClose={() => setShowItemForm(false)}
        ariaLabelledby="menu-item-form-title"
        maxWidthClass="max-w-lg"
      >
        {editingItem && (
          <div className="p-6">
            <h3 id="menu-item-form-title" className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-[#0E7A0E]" />
              {editingItem.id ? t("foodos.menu.editItem") : t("foodos.menu.newItem")}
            </h3>
            <form onSubmit={handleSaveItem} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">{t("foodos.menu.nameLabel")}</label>
                  <input
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">{t("foodos.menu.priceLabel")}</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={editingItem.price}
                    onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">{t("foodos.menu.costLabel")}</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={editingItem.cost}
                    onChange={(e) => setEditingItem({ ...editingItem, cost: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">{t("foodos.menu.descriptionLabel")}</label>
                  <textarea
                    rows={2}
                    value={editingItem.description}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">{t("foodos.menu.categoryLabel")}</label>
                  <select
                    value={editingItem.category_id ?? ""}
                    onChange={(e) => setEditingItem({ ...editingItem, category_id: e.target.value || null })}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm"
                  >
                    <option value="">{t("foodos.menu.uncategorized")}</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t("foodos.menu.tagsLabel")}</label>
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
                  {t("foodos.menu.featured")}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingItem.is_available}
                    onChange={(e) => setEditingItem({ ...editingItem, is_available: e.target.checked })}
                    className="accent-[#0E7A0E]"
                  />
                  {t("foodos.menu.available")}
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowItemForm(false); setEditingItem(null) }}
                  className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={!editingItem.name.trim() || !Number(editingItem.price)}
                  className="px-5 py-2 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0e7a0e] disabled:opacity-50"
                >
                  {t("common.save")}
                </button>
              </div>
            </form>
          </div>
        )}
      </BottomSheet>
      {overridesItem && branches.length > 0 && (
        <ItemBranchOverrides
          item={overridesItem}
          branches={branches}
          overrides={overrides}
          onClose={async () => {
            setOverridesItem(null)
            if (restaurant) {
              const { listBranchMenuOverrides } = await import("../actions")
              const all = await Promise.all(branches.map((b) => listBranchMenuOverrides(b.id)))
              setOverrides(all.flat())
            }
          }}
        />
      )}
      {optionsItem && restaurant && (
        <ItemOptionsManager
          item={optionsItem}
          restaurantId={restaurant.id}
          groups={optionGroups}
          values={optionValues}
          onChange={(ogs, ovs) => { setOptionGroups(ogs); setOptionValues(ovs) }}
          onClose={() => setOptionsItem(null)}
        />
      )}
      <ToolGuideHost toolKey="menu" pathname="/panel/foodos/menu" slug={null} icon="🍔" title={t("foodos.menu.guideTitle")} />
    </div>
  )
}
