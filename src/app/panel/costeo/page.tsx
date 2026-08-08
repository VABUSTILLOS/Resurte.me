"use client"

import { useState, useEffect, useMemo } from "react"
import { getCatalogProducts, mergeWithCatalog, type CatalogProduct } from "@/lib/catalog"
import { usePanelConfig } from "@/lib/panel-config"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage, useSharedDishes } from "@/hooks/use-local-storage"
import { useToast } from "@/components/toast"
import { normalizeName } from "@/lib/normalize"
import { uid } from "@/lib/ids"
import { Calculator } from "lucide-react"
import {
  MOCK_INGREDIENTS,
  DEFAULT_INGREDIENTS,
  DISH_CATEGORIES,
  type Recipe,
  type Dish,
  type DishIngredient,
  type Combo,
  type ComboItem,
} from "@/components/panel/costeo/costeo-shared"
import CosteoHeader from "@/components/panel/costeo/CosteoHeader"
import FoodCostTarget from "@/components/panel/costeo/FoodCostTarget"
import CategoryTabs from "@/components/panel/costeo/CategoryTabs"
import SearchBar from "@/components/panel/costeo/SearchBar"
import BatchToolbar from "@/components/panel/costeo/BatchToolbar"
import MenuDigitalView from "@/components/panel/costeo/MenuDigitalView"
import DishesList from "@/components/panel/costeo/DishesList"
import AddDishForm from "@/components/panel/costeo/AddDishForm"
import CombosSection from "@/components/panel/costeo/CombosSection"
import CosteoSummary from "@/components/panel/costeo/CosteoSummary"
import RecipePickerModal from "@/components/panel/costeo/RecipePickerModal"
import DeleteModals from "@/components/panel/costeo/DeleteModals"
import ShortcutsOverlay from "@/components/panel/costeo/ShortcutsOverlay"

let dishCounter = 0
function nextId() { dishCounter++; return `dish-${Date.now()}-${dishCounter}` }

export default function CosteoPage() {
  const { selectedCollection } = useRestaurant()
  const { toast } = useToast()
  const slug = selectedCollection?.slug || null

  const mockIngredients = selectedCollection
    ? (MOCK_INGREDIENTS[selectedCollection.slug] || DEFAULT_INGREDIENTS)
    : DEFAULT_INGREDIENTS

  // Real catalog products (Supabase) merged with mocks as fallback
  const [catalogIngredients, setCatalogIngredients] = useState<CatalogProduct[]>([])
  useEffect(() => {
    let alive = true
    getCatalogProducts().then((products) => {
      if (alive) setCatalogIngredients(products)
    })
    return () => { alive = false }
  }, [])

  const ingredients = useMemo(
    () => mergeWithCatalog(mockIngredients, catalogIngredients),
    [mockIngredients, catalogIngredients],
  )

  // Persist dishes per collection
  const [dishes, setDishes] = useLocalStorage<Dish[]>("costeo-dishes", [], slug)
  // Sync with shared cross-tool store
  const [, setSharedDishes] = useSharedDishes(slug)
  const [showForm, setShowForm] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [editingDishId, setEditingDishId] = useState<string | null>(null)
  const [newDishName, setNewDishName] = useState("")
  const [newDishIngredients, setNewDishIngredients] = useState<DishIngredient[]>([
    { ingredientName: ingredients[0]?.name || "", quantity: 0, unit: ingredients[0]?.unit || "", unitPrice: ingredients[0]?.price || 0 },
  ])
  const [targetFoodCost, setTargetFoodCost] = useLocalStorage<number>("costeo-target-fc", 30, slug)
  // Custom ingredient mode
  const [customName, setCustomName] = useState("")
  const [customUnit, setCustomUnit] = useState("kg")
  const [customPrice, setCustomPrice] = useState("")
  const [showCustom, setShowCustom] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("todas")
  const [viewMode, setViewMode] = useLocalStorage<string>("costeo-view", "lista", slug)
  const [newDishCategory, setNewDishCategory] = useState("plato-fuerte")
  const [newDishPortions, setNewDishPortions] = useState(4)
  const [newDishModifiers, setNewDishModifiers] = useState<{ id: string; nombre: string; precio: number }[]>([])
  const [modName, setModName] = useState("")
  const [modPrice, setModPrice] = useState("")
  const [inventarioItems] = useLocalStorage<{ name: string; stock: number; minStock: number; unit: string; pricePerUnit: number }[]>("inventario-items", [], slug)
  const panelCfg = usePanelConfig(slug)
  const [undoStack, setUndoStack] = useState<Dish[][]>([])
  const [undoIndex, setUndoIndex] = useState(-1)
  const [selectedDishes, setSelectedDishes] = useState<Set<string>>(new Set())
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false)
  // Recetas guardadas + selector
  const [savedRecipes, setSavedRecipes] = useLocalStorage<Recipe[]>("costeo-recetas", [], slug)
  const [showRecipes, setShowRecipes] = useState(false)
  const [recipeSearch, setRecipeSearch] = useState("")
  const [recipeConfirmDelete, setRecipeConfirmDelete] = useState<string | null>(null)
  // Combos y promociones
  const [combos, setCombos] = useLocalStorage<Combo[]>("costeo-combos", [], slug)
  const [showComboForm, setShowComboForm] = useState(false)
  const [newComboName, setNewComboName] = useState("")
  const [newComboItems, setNewComboItems] = useState<ComboItem[]>([])
  const [newComboPrice, setNewComboPrice] = useState("")
  const [comboDeleteConfirm, setComboDeleteConfirm] = useState<string | null>(null)

  // Filtered dishes by search query and category
  const filteredDishes = useMemo(() => {
    let result = dishes
    if (categoryFilter !== "todas") {
      result = result.filter((d) => d.category === categoryFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((d) =>
        d.name.toLowerCase().includes(q) ||
        d.ingredients.some((i) => i.ingredientName.toLowerCase().includes(q))
      )
    }
    return result
  }, [dishes, searchQuery, categoryFilter])

  // Keep shared dishes in sync
  useEffect(() => {
    setSharedDishes(dishes)
  }, [dishes, setSharedDishes])

  // Wrapped setter with undo history
  function pushHistory(newDishes: Dish[]) {
    setUndoStack((prev) => {
      const trimmed = prev.slice(0, undoIndex + 1)
      return [...trimmed.slice(-19), newDishes]
    })
    setUndoIndex((prev) => Math.min(prev + 1, 19))
    setDishes(newDishes)
  }

  function undo() {
    if (undoIndex > 0) {
      const newIdx = undoIndex - 1
      setUndoIndex(newIdx)
      setDishes(undoStack[newIdx]!)
    }
  }

  function redo() {
    if (undoIndex < undoStack.length - 1) {
      const newIdx = undoIndex + 1
      setUndoIndex(newIdx)
      setDishes(undoStack[newIdx]!)
    }
  }

  // Batch selection
  function toggleSelect(id: string) {
    setSelectedDishes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function selectAllFiltered() {
    setSelectedDishes(new Set(filteredDishes.map((d) => d.id)))
  }

  function deselectAll() {
    setSelectedDishes(new Set())
  }

  function batchDelete() {
    const keep = dishes.filter((d) => !selectedDishes.has(d.id))
    pushHistory(keep)
    setSelectedDishes(new Set())
    setBatchDeleteConfirm(false)
  }

  // ── Combos y promociones ──────────────────────────────
  const dishCostById = (id: string) => {
    const d = dishes.find((dish) => dish.id === id)
    if (!d) return 0
    return d.ingredients.reduce((s, i) => s + (i.quantity * i.unitPrice), 0)
  }

  const comboCost = (items: ComboItem[]) =>
    items.reduce((s, it) => s + dishCostById(it.dishId) * it.qty, 0)

  const comboMissingDishes = (items: ComboItem[]) =>
    items.filter((it) => !dishes.some((d) => d.id === it.dishId))

  const suggestedComboPrice = (items: ComboItem[]) => {
    const cost = comboCost(items)
    return targetFoodCost > 0 ? Math.round((cost / (targetFoodCost / 100)) * 100) / 100 : 0
  }

  function toggleComboDish(dishId: string, dishName: string) {
    setNewComboItems((prev) => {
      const exists = prev.find((it) => it.dishId === dishId)
      if (exists) return prev.filter((it) => it.dishId !== dishId)
      return [...prev, { dishId, dishName, qty: 1 }]
    })
  }

  function setComboQty(dishId: string, qty: number) {
    setNewComboItems((prev) => prev.map((it) => (it.dishId === dishId ? { ...it, qty: Math.max(1, qty) } : it)))
  }

  function addCombo() {
    if (!newComboName.trim()) {
      toast("Ponle un nombre al combo", "warning")
      return
    }
    if (newComboItems.length < 2) {
      toast("Selecciona al menos 2 platillos", "warning")
      return
    }
    const price = parseFloat(newComboPrice)
    if (!price || price <= 0) {
      toast("Define un precio de venta para el combo", "warning")
      return
    }
    const combo: Combo = {
      id: uid("combo"),
      name: newComboName.trim(),
      items: newComboItems.map((it) => ({ ...it })),
      price,
    }
    setCombos([...combos, combo])
    setShowComboForm(false)
    setNewComboName("")
    setNewComboItems([])
    setNewComboPrice("")
    toast(`Combo "${combo.name}" guardado`, "success")
  }

  function removeCombo(id: string) {
    setComboDeleteConfirm(id)
  }

  function confirmDeleteCombo() {
    if (comboDeleteConfirm) {
      const name = combos.find((c) => c.id === comboDeleteConfirm)?.name || "Combo"
      setCombos(combos.filter((c) => c.id !== comboDeleteConfirm))
      toast(`Combo "${name}" eliminado`, "warning")
      setComboDeleteConfirm(null)
    }
  }

  // Export CSV
  function exportCSV() {
    const dishesToExport = filteredDishes
    if (dishesToExport.length === 0) return
    const header = "Nombre,Categoría,Porciones,Costo por porción,Precio por porción,Ingredientes,Costo Total,Precio Venta,Margen,Food Cost %"
    const rows = dishesToExport.map((d) => {
      const cost = d.ingredients.reduce((s, i) => s + (i.quantity * i.unitPrice), 0)
      const margin = d.sellingPrice - cost
      const fc = d.sellingPrice > 0 ? ((cost / d.sellingPrice) * 100).toFixed(1) : "0"
      const portions = d.portions || 4
      const ingList = d.ingredients.map((i) => `${i.ingredientName} (${i.quantity}${i.unit})`).join("; ")
      return `"${d.name}","${d.category}",${portions},${(cost / portions).toFixed(2)},${(d.sellingPrice / portions).toFixed(2)},"${ingList}",${cost.toFixed(2)},${d.sellingPrice.toFixed(2)},${margin.toFixed(2)},${fc}%`
    })
    const csv = [header, ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `costeo-menu-${slug || "menu"}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Copy menu (carta) to clipboard in menu view
  function copyCarta() {
    const sections = new Map<string, string[]>()
    filteredDishes.forEach((d) => {
      const catKey = d.category && d.category !== "todas" ? d.category : "plato-fuerte"
      const label = DISH_CATEGORIES.find((c) => c.key === catKey)?.label || "Plato fuerte"
      if (!sections.has(label)) sections.set(label, [])
      sections.get(label)!.push(`  ${d.name} .................................. $${d.sellingPrice.toFixed(0)}`)
    })
    const lines: string[] = [`📋 Carta — ${selectedCollection?.name || "Mi menú"}`]
    sections.forEach((items, label) => {
      lines.push(`\n${label.toUpperCase()}`)
      lines.push(...items)
    })
    navigator.clipboard.writeText(lines.join("\n"))
    toast("Carta copiada al portapapeles", "success")
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo() }
        if ((e.key === "y") || (e.key === "z" && e.shiftKey)) { e.preventDefault(); redo() }
        if (e.key === "n") {
          e.preventDefault()
          setShowForm(true)
          setEditingDishId(null)
          setNewDishName("")
        }
      }
      if (e.key === "Escape" && showForm) resetForm()
      if (e.key === "Escape" && showShortcuts) setShowShortcuts(false)
      if (e.key === "Escape" && batchDeleteConfirm) setBatchDeleteConfirm(false)
      if (e.key === "Escape" && comboDeleteConfirm) setComboDeleteConfirm(null)
      if (e.key === "?") {
        const el = e.target as HTMLElement
        const isTyping = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)
        if (!isTyping) {
          e.preventDefault()
          setShowShortcuts((s) => !s)
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })
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

  function resetForm() {
    setNewDishName("")
    setNewDishIngredients([{
      ingredientName: ingredients[0]?.name || "",
      quantity: 0,
      unit: ingredients[0]?.unit || "",
      unitPrice: ingredients[0]?.price || 0,
    }])
    setEditingDishId(null)
    setShowForm(false)
    setNewDishCategory("plato-fuerte")
    setNewDishPortions(4)
    setNewDishModifiers([])
    setModName("")
    setModPrice("")
  }

  function duplicateDish(dish: Dish) {
    const copy: Dish = {
      ...dish,
      id: nextId(),
      name: `${dish.name} (copia)`,
      ingredients: dish.ingredients.map((i) => ({ ...i })),
      modificadores: (dish.modificadores || []).map((m) => ({ ...m })),
    }
    pushHistory([...dishes, copy])
  }

  function addIngredient() {
    setNewDishIngredients([...newDishIngredients, {
      ingredientName: "",
      quantity: 0,
      unit: "",
      unitPrice: 0,
    }])
  }

  function removeIngredient(idx: number) {
    setNewDishIngredients(newDishIngredients.filter((_, i) => i !== idx))
  }

  function addModifier() {
    const nombre = modName.trim()
    if (!nombre) return
    setNewDishModifiers([...newDishModifiers, { id: uid("mod"), nombre, precio: Math.max(0, parseFloat(modPrice) || 0) }])
    setModName("")
    setModPrice("")
  }

  function removeModifier(id: string) {
    setNewDishModifiers(newDishModifiers.filter((m) => m.id !== id))
  }

  function updateIngredient(idx: number, field: keyof DishIngredient, value: string | number) {
    const updated = [...newDishIngredients]
    const current = updated[idx]
    if (!current) return
    if (field === "ingredientName" && typeof value === "string") {
      const found = ingredients.find((ing) => ing.name === value)
      updated[idx] = {
        ...current,
        ingredientName: value,
        unit: found?.unit || current.unit,
        unitPrice: found?.price || current.unitPrice,
      }
    } else {
      updated[idx] = { ...current, [field]: value }
    }
    setNewDishIngredients(updated)
  }

  function addCustomIngredient() {
    const name = customName.trim()
    const price = parseFloat(customPrice)
    if (!name || !price || price <= 0) return
    setNewDishIngredients([...newDishIngredients, {
      ingredientName: name,
      quantity: 1,
      unit: customUnit,
      unitPrice: price,
    }])
    setCustomName("")
    setCustomPrice("")
    setShowCustom(false)
  }

  function startEditDish(dish: Dish) {
    setEditingDishId(dish.id)
    setNewDishName(dish.name)
    setNewDishIngredients(dish.ingredients.map((ing) => ({ ...ing })))
    setNewDishPortions(dish.portions || 4)
    setNewDishCategory(dish.category || "plato-fuerte")
    setNewDishModifiers((dish.modificadores || []).map((m) => ({ ...m })))
    setShowForm(true)
  }

  function saveDish() {
    if (!newDishName.trim() || newDishIngredients.length === 0) return
    const totalCost = newDishIngredients.reduce((sum, ing) => sum + (ing.quantity * ing.unitPrice), 0)
    const sellingPrice = targetFoodCost > 0 ? totalCost / (targetFoodCost / 100) : 0

    const dish: Dish = {
      id: editingDishId || nextId(),
      name: newDishName.trim(),
      ingredients: [...newDishIngredients],
      foodCostPercent: targetFoodCost,
      sellingPrice: Math.round(sellingPrice * 100) / 100,
      category: newDishCategory,
      portions: newDishPortions,
      modificadores: newDishModifiers.length > 0 ? newDishModifiers.map((m) => ({ ...m })) : undefined,
    }

    if (editingDishId) {
      pushHistory(dishes.map((d) => (d.id === editingDishId ? dish : d)))
      toast("Platillo actualizado", "success")
    } else {
      pushHistory([...dishes, dish])
      toast("Platillo agregado al menú", "success")
    }
    resetForm()
  }

  function loadRecipe(recipe: Recipe) {
    const recipeIngredients: DishIngredient[] = recipe.ingredients.map((ing) => {
      const found = ingredients.find((opt) => normalizeName(opt.name) === normalizeName(ing.name))
      return {
        ingredientName: ing.name,
        quantity: ing.quantity,
        unit: found?.unit || ing.unit,
        unitPrice: found?.price || 0,
      }
    })
    setEditingDishId(null)
    setNewDishName(recipe.name)
    setNewDishCategory(recipe.category)
    setNewDishPortions(recipe.portions)
    setNewDishIngredients(recipeIngredients)
    setNewDishModifiers([])
    setModName("")
    setModPrice("")
    setShowRecipes(false)
    setShowForm(true)
    toast(`Receta "${recipe.name}" cargada — ajusta cantidades y guarda el platillo`, "success")
  }

  function estimateRecipeCost(recipe: Recipe): number {
    return recipe.ingredients.reduce((sum, ing) => {
      const found = ingredients.find((opt) => normalizeName(opt.name) === normalizeName(ing.name))
      return sum + ing.quantity * (found?.price || 0)
    }, 0)
  }

  function saveCurrentAsRecipe() {
    const name = newDishName.trim()
    if (!name) { toast("Escribe un nombre para la receta", "warning"); return }
    if (newDishIngredients.length === 0) { toast("Agrega al menos un ingrediente", "warning"); return }
    const exists = savedRecipes.some((r) => normalizeName(r.name) === normalizeName(name))
    if (exists) { toast("Ya existe una receta con ese nombre", "warning"); return }
    const recipe: Recipe = {
      id: uid("rec"),
      name,
      category: newDishCategory,
      portions: newDishPortions,
      ingredients: newDishIngredients.map((ing) => ({
        name: ing.ingredientName,
        quantity: ing.quantity,
        unit: ing.unit,
      })),
    }
    setSavedRecipes([...savedRecipes, recipe])
    toast("Receta guardada — disponible en el selector", "success")
  }

  function removeSavedRecipe(id: string) {
    const name = savedRecipes.find((r) => r.id === id)?.name || "Receta"
    setSavedRecipes(savedRecipes.filter((r) => r.id !== id))
    toast(`Receta "${name}" eliminada`, "warning")
    setRecipeConfirmDelete(null)
  }

  function removeDish(id: string) {
    setDeleteConfirmId(id)
  }

  function confirmDeleteDish() {
    if (deleteConfirmId) {
      const name = dishes.find((d) => d.id === deleteConfirmId)?.name || "Platillo"
      pushHistory(dishes.filter((d) => d.id !== deleteConfirmId))
      toast(`"${name}" eliminado`, "warning")
      setDeleteConfirmId(null)
    }
  }

  if (!selectedCollection) {
    return (
      <div className="text-center py-16">
        <Calculator className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Selecciona tu tipo de cocina</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          Usa el selector de arriba para elegir tu tipo de restaurante y acceder a precios reales del catálogo de Resurte.me.
        </p>
      </div>
    )
  }

  return (
    <div>
    <CosteoHeader
      restaurantName={selectedCollection.name}
      dishCount={dishes.length}
      viewMode={viewMode}
      onToggleView={() => setViewMode(viewMode === "lista" ? "menu" : "lista")}
      onOpenShortcuts={() => setShowShortcuts(true)}
      onExportCsv={exportCSV}
      onOpenRecipes={() => setShowRecipes(true)}
    />

    <FoodCostTarget
      targetFoodCost={targetFoodCost}
      onDecrease={() => setTargetFoodCost(Math.max(panelCfg.costeoTargetFcMin, targetFoodCost - 5))}
      onIncrease={() => setTargetFoodCost(Math.min(panelCfg.costeoTargetFcMax, targetFoodCost + 5))}
    />

    <CategoryTabs
      dishCount={dishes.length}
      viewMode={viewMode}
      categoryFilter={categoryFilter}
      onSelectCategory={setCategoryFilter}
      onCreateFirst={() => setShowForm(true)}
    />

    <SearchBar
      dishCount={dishes.length}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      filteredCount={filteredDishes.length}
    />

    <BatchToolbar
      filteredCount={filteredDishes.length}
      selectedCount={selectedDishes.size}
      onToggleAll={selectedDishes.size > 0 ? deselectAll : selectAllFiltered}
      onDeleteSelected={() => setBatchDeleteConfirm(true)}
    />

    {viewMode === "menu" && (
      <MenuDigitalView
        dishes={filteredDishes}
        restaurantName={selectedCollection.name}
        onCopyCarta={copyCarta}
      />
    )}

    {viewMode === "lista" && (
      <DishesList
        dishes={filteredDishes}
        selectedIds={selectedDishes}
        onToggleSelect={toggleSelect}
        onDuplicate={duplicateDish}
        onEdit={startEditDish}
        onRemove={removeDish}
      />
    )}

    <AddDishForm
      showForm={showForm}
      editingDishId={editingDishId}
      newDishName={newDishName}
      setNewDishName={setNewDishName}
      newDishCategory={newDishCategory}
      setNewDishCategory={setNewDishCategory}
      newDishPortions={newDishPortions}
      setNewDishPortions={setNewDishPortions}
      newDishIngredients={newDishIngredients}
      updateIngredient={updateIngredient}
      removeIngredient={removeIngredient}
      addIngredient={addIngredient}
      showCustom={showCustom}
      setShowCustom={setShowCustom}
      customName={customName}
      setCustomName={setCustomName}
      customUnit={customUnit}
      setCustomUnit={setCustomUnit}
      customPrice={customPrice}
      setCustomPrice={setCustomPrice}
      addCustomIngredient={addCustomIngredient}
      newDishModifiers={newDishModifiers}
      removeModifier={removeModifier}
      modName={modName}
      setModName={setModName}
      modPrice={modPrice}
      setModPrice={setModPrice}
      addModifier={addModifier}
      saveDish={saveDish}
      saveCurrentAsRecipe={saveCurrentAsRecipe}
      resetForm={resetForm}
      setShowForm={setShowForm}
      ingredients={ingredients}
      inventarioItems={inventarioItems}
      normalizeName={normalizeName}
    />

    <CombosSection
      combos={combos}
      showComboForm={showComboForm}
      setShowComboForm={setShowComboForm}
      comboCost={comboCost}
      comboMissingDishes={comboMissingDishes}
      suggestedComboPrice={suggestedComboPrice}
      onRemoveCombo={removeCombo}
      dishes={dishes}
      newComboName={newComboName}
      setNewComboName={setNewComboName}
      newComboItems={newComboItems}
      setNewComboItems={setNewComboItems}
      toggleComboDish={toggleComboDish}
      setComboQty={setComboQty}
      newComboPrice={newComboPrice}
      setNewComboPrice={setNewComboPrice}
      addCombo={addCombo}
      targetFoodCost={targetFoodCost}
    />

    <CosteoSummary dishes={dishes} />

    <RecipePickerModal
      open={showRecipes}
      collectionName={selectedCollection.name}
      slug={slug}
      savedRecipes={savedRecipes}
      recipeSearch={recipeSearch}
      onSearchChange={setRecipeSearch}
      estimateRecipeCost={estimateRecipeCost}
      onUseRecipe={loadRecipe}
      onDeleteSaved={setRecipeConfirmDelete}
      onClose={() => setShowRecipes(false)}
      normalizeName={normalizeName}
    />

    <DeleteModals
      recipeConfirmDelete={recipeConfirmDelete}
      onConfirmDeleteRecipe={removeSavedRecipe}
      onCancelDeleteRecipe={() => setRecipeConfirmDelete(null)}
      deleteConfirmId={deleteConfirmId}
      onConfirmDeleteDish={confirmDeleteDish}
      onCancelDeleteDish={() => setDeleteConfirmId(null)}
      comboDeleteConfirm={comboDeleteConfirm}
      onConfirmDeleteCombo={confirmDeleteCombo}
      onCancelDeleteCombo={() => setComboDeleteConfirm(null)}
      batchDeleteConfirm={batchDeleteConfirm}
      selectedCount={selectedDishes.size}
      onConfirmBatchDelete={batchDelete}
      onCancelBatchDelete={() => setBatchDeleteConfirm(false)}
    />

    <ShortcutsOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  )
}
