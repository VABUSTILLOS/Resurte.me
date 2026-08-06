"use client"

import { useState, useEffect, useMemo } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import { useLocalStorage, useSharedDishes } from "@/hooks/use-local-storage"
import { useToast } from "@/components/toast"
import Link from "next/link"
import {
  Calculator, Plus, Trash2, PieChart, ArrowLeft,
  Percent, TrendingDown, AlertCircle, Edit3, Download, CheckSquare,
} from "lucide-react"

// Mock ingredients per collection type — in production this comes from Resurte.me catalog
const MOCK_INGREDIENTS: Record<string, { name: string; unit: string; price: number }[]> = {
  "hamburguesas-hot-dogs": [
    { name: "Carne molida sirloin 80/20", unit: "kg", price: 189 },
    { name: "Pan brioche para hamburguesa", unit: "pza", price: 8.5 },
    { name: "Queso cheddar rebanado", unit: "rebanada", price: 6 },
    { name: "Tocino ahumado", unit: "kg", price: 210 },
    { name: "Papas congeladas", unit: "kg", price: 52 },
    { name: "Lechuga iceberg", unit: "pza", price: 18 },
    { name: "Jitomate bola", unit: "kg", price: 35 },
    { name: "Cebolla blanca", unit: "kg", price: 28 },
  ],
  "taquerias-antojitos": [
    { name: "Bistec de res para asada", unit: "kg", price: 220 },
    { name: "Carne de cerdo para pastor", unit: "kg", price: 165 },
    { name: "Tortilla de maíz taquera", unit: "kg", price: 32 },
    { name: "Cilantro fresco", unit: "manojo", price: 8 },
    { name: "Cebolla blanca", unit: "kg", price: 28 },
    { name: "Limón", unit: "kg", price: 30 },
    { name: "Queso asadero", unit: "kg", price: 145 },
    { name: "Salsa verde preparada", unit: "L", price: 48 },
  ],
  "pizzas-comida-italiana": [
    { name: "Harina de fuerza 00", unit: "kg", price: 42 },
    { name: "Queso mozzarella rallado", unit: "kg", price: 160 },
    { name: "Pepperoni rebanado", unit: "kg", price: 195 },
    { name: "Puré de tomate enlatado", unit: "lata 2.5kg", price: 65 },
    { name: "Aceite de oliva extra virgen", unit: "L", price: 180 },
    { name: "Albahaca fresca", unit: "manojo", price: 15 },
  ],
  "comida-mexicana-corrida": [
    { name: "Pechuga de pollo", unit: "kg", price: 120 },
    { name: "Arroz grano largo", unit: "kg", price: 28 },
    { name: "Frijol negro", unit: "kg", price: 35 },
    { name: "Jitomate bola", unit: "kg", price: 35 },
    { name: "Chile serrano", unit: "kg", price: 40 },
    { name: "Tortilla de maíz", unit: "kg", price: 28 },
    { name: "Aceite vegetal", unit: "L", price: 45 },
  ],
  "mariscos-pescados": [
    { name: "Camarón mediano crudo", unit: "kg", price: 320 },
    { name: "Filete de pescado blanco", unit: "kg", price: 180 },
    { name: "Pulpo cocido", unit: "kg", price: 380 },
    { name: "Tostadas de maíz", unit: "paquete 20pz", price: 22 },
    { name: "Aguacate hass", unit: "kg", price: 65 },
    { name: "Limón", unit: "kg", price: 30 },
  ],
  "pollo-alitas": [
    { name: "Alitas de pollo", unit: "kg", price: 95 },
    { name: "Boneless de pollo", unit: "kg", price: 130 },
    { name: "Salsa Buffalo", unit: "L", price: 85 },
    { name: "Salsa BBQ", unit: "L", price: 78 },
    { name: "Aceite por bidón", unit: "L", price: 42 },
    { name: "Aderezo blue cheese", unit: "L", price: 95 },
  ],
  "sushi-comida-asiatica": [
    { name: "Salmón grado sushi", unit: "kg", price: 480 },
    { name: "Arroz para sushi", unit: "kg", price: 55 },
    { name: "Alga nori", unit: "paquete 50h", price: 120 },
    { name: "Aguacate hass", unit: "kg", price: 65 },
    { name: "Queso crema Philadelphia", unit: "kg", price: 150 },
    { name: "Salsa de soya", unit: "L", price: 72 },
  ],
  "cortes-carne-asaderos": [
    { name: "Ribeye importado", unit: "kg", price: 580 },
    { name: "Arrachera marinada", unit: "kg", price: 320 },
    { name: "Chorizo argentino", unit: "kg", price: 185 },
    { name: "Papa para asar", unit: "kg", price: 35 },
    { name: "Chile morrón", unit: "kg", price: 45 },
    { name: "Sal de grano", unit: "kg", price: 28 },
  ],
  "cafeterias-crepas-desayunos": [
    { name: "Huevo fresco", unit: "docena", price: 48 },
    { name: "Harina para hot cakes", unit: "kg", price: 38 },
    { name: "Café en grano", unit: "kg", price: 220 },
    { name: "Leche entera", unit: "L", price: 28 },
    { name: "Jarabe de maple", unit: "L", price: 130 },
    { name: "Nutella", unit: "kg", price: 180 },
  ],
  "saludable-ensaladas-pokes": [
    { name: "Salmón fresco", unit: "kg", price: 450 },
    { name: "Atún fresco", unit: "kg", price: 380 },
    { name: "Quinoa", unit: "kg", price: 85 },
    { name: "Mix de lechugas baby", unit: "kg", price: 72 },
    { name: "Edamame", unit: "kg", price: 65 },
    { name: "Aderezo de jengibre", unit: "L", price: 95 },
  ],
  "postres-panaderia-helados": [
    { name: "Harina de trigo", unit: "kg", price: 32 },
    { name: "Mantequilla sin sal", unit: "kg", price: 160 },
    { name: "Chocolate belga", unit: "kg", price: 280 },
    { name: "Crema para batir", unit: "L", price: 75 },
    { name: "Azúcar glass", unit: "kg", price: 35 },
    { name: "Vainilla natural", unit: "L", price: 350 },
  ],
  "comida-arabe-griega": [
    { name: "Carne de cordero", unit: "kg", price: 340 },
    { name: "Pechuga de pollo", unit: "kg", price: 120 },
    { name: "Garbanzo seco", unit: "kg", price: 42 },
    { name: "Tahini", unit: "kg", price: 160 },
    { name: "Pan pita", unit: "paquete 10pz", price: 38 },
    { name: "Yogur griego natural", unit: "L", price: 65 },
  ],
  "comida-venezolana-latina": [
    { name: "Harina P.A.N.", unit: "kg", price: 45 },
    { name: "Carne mechada", unit: "kg", price: 195 },
    { name: "Plátano macho", unit: "kg", price: 30 },
    { name: "Queso blanco duro", unit: "kg", price: 140 },
    { name: "Frijol negro", unit: "kg", price: 35 },
    { name: "Aguacate hass", unit: "kg", price: 65 },
  ],
  "bebidas-bares-botanas": [
    { name: "Cacahuate japonés", unit: "kg", price: 72 },
    { name: "Cueritos encurtidos", unit: "kg", price: 55 },
    { name: "Alitas de pollo", unit: "kg", price: 95 },
    { name: "Limón", unit: "kg", price: 30 },
    { name: "Sal de grano", unit: "kg", price: 28 },
    { name: "Chile en polvo", unit: "kg", price: 85 },
  ],
}

const DEFAULT_INGREDIENTS = [
  { name: "Ingrediente 1", unit: "kg", price: 0 },
  { name: "Ingrediente 2", unit: "kg", price: 0 },
]

interface DishIngredient {
  ingredientName: string
  quantity: number
  unit: string
  unitPrice: number
}

interface Dish {
  id: string
  name: string
  ingredients: DishIngredient[]
  foodCostPercent: number
  sellingPrice: number
  category: string
  portions: number
}

const DISH_CATEGORIES = [
  { key: "todas", label: "Todas", color: "bg-gray-100 text-gray-700" },
  { key: "entrada", label: "Entrada", color: "bg-amber-100 text-amber-700" },
  { key: "plato-fuerte", label: "Plato fuerte", color: "bg-red-100 text-red-700" },
  { key: "postre", label: "Postre", color: "bg-pink-100 text-pink-700" },
  { key: "bebida", label: "Bebida", color: "bg-blue-100 text-blue-700" },
  { key: "acompanamiento", label: "Acompañamiento", color: "bg-green-100 text-green-700" },
]

let dishCounter = 0
function nextId() { dishCounter++; return `dish-${Date.now()}-${dishCounter}` }

export default function CosteoPage() {
  const { selectedCollection } = useRestaurant()
  const { toast } = useToast()
  const slug = selectedCollection?.slug || null

  const ingredients = selectedCollection
    ? (MOCK_INGREDIENTS[selectedCollection.slug] || DEFAULT_INGREDIENTS)
    : DEFAULT_INGREDIENTS

  // Persist dishes per collection
  const [dishes, setDishes] = useLocalStorage<Dish[]>("costeo-dishes", [], slug)
  // Sync with shared cross-tool store
  const [, setSharedDishes] = useSharedDishes(slug)
  const [showForm, setShowForm] = useState(false)
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
  const [newDishCategory, setNewDishCategory] = useState("plato-fuerte")
  const [newDishPortions, setNewDishPortions] = useState(4)
  const [inventarioItems] = useLocalStorage<{ name: string; stock: number; minStock: number; unit: string; pricePerUnit: number }[]>("inventario-items", [], slug)
  const [undoStack, setUndoStack] = useState<Dish[][]>([])
  const [undoIndex, setUndoIndex] = useState(-1)
  const [selectedDishes, setSelectedDishes] = useState<Set<string>>(new Set())
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false)

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
      setDishes(undoStack[newIdx])
    }
  }

  function redo() {
    if (undoIndex < undoStack.length - 1) {
      const newIdx = undoIndex + 1
      setUndoIndex(newIdx)
      setDishes(undoStack[newIdx])
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
  }

  function duplicateDish(dish: Dish) {
    const copy: Dish = {
      ...dish,
      id: nextId(),
      name: `${dish.name} (copia)`,
      ingredients: dish.ingredients.map((i) => ({ ...i })),
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

  function updateIngredient(idx: number, field: keyof DishIngredient, value: string | number) {
    const updated = [...newDishIngredients]
    if (field === "ingredientName" && typeof value === "string") {
      const found = ingredients.find((ing) => ing.name === value)
      updated[idx] = {
        ...updated[idx],
        ingredientName: value,
        unit: found?.unit || updated[idx].unit,
        unitPrice: found?.price || updated[idx].unitPrice,
      }
    } else {
      updated[idx] = { ...updated[idx], [field]: value }
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
      {/* Back link and title */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/panel" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">Costeando mi menú</h2>
            {dishes.length > 0 && (
              <button
                onClick={exportCSV}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
                title="Exportar platillos del filtro activo a CSV"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </button>
            )}
          </div>
          <p className="text-sm text-gray-400">{selectedCollection.name}</p>
        </div>
      </div>

      {/* Food cost target */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Percent className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Food Cost objetivo</h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTargetFoodCost(Math.max(20, targetFoodCost - 5))}
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 transition-colors"
            >
              −
            </button>
            <span className="text-2xl font-bold text-[#108910]">{targetFoodCost}%</span>
            <button
              onClick={() => setTargetFoodCost(Math.min(45, targetFoodCost + 5))}
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 transition-colors"
            >
              +
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Tus platillos se preciarán para alcanzar este % de costo sobre el precio de venta.
          Lo ideal en México está entre 28% y 35%.
        </p>
      </div>

      {/* Category filter tabs */}
      {dishes.length > 0 && (
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {DISH_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategoryFilter(cat.key)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                categoryFilter === cat.key
                  ? cat.color
                  : "bg-gray-50 text-gray-500 hover:bg-gray-100"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Search bar */}
      {dishes.length > 0 && (
        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar platillo o ingrediente..."
            className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#108910]/20 focus:border-[#108910] placeholder-gray-400"
          />
          {searchQuery.trim() && (
            <p className="text-xs text-gray-400 mt-1.5">
              {filteredDishes.length} de {dishes.length} platillos
            </p>
          )}
        </div>
      )}

      {/* Batch selection toolbar */}
      {filteredDishes.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={selectedDishes.size > 0 ? deselectAll : selectAllFiltered}
            className="text-xs font-semibold text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            {selectedDishes.size > 0 ? `Deseleccionar (${selectedDishes.size})` : "Seleccionar todos"}
          </button>
          {selectedDishes.size > 0 && (
            <button
              onClick={() => setBatchDeleteConfirm(true)}
              className="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Eliminar {selectedDishes.size} seleccionado{selectedDishes.size > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* Dishes list */}
      {filteredDishes.length > 0 && (
        <div className="space-y-3 mb-6">
          {filteredDishes.map((dish) => {
            const totalCost = dish.ingredients.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0)
            const margin = dish.sellingPrice - totalCost
            const actualFoodCost = dish.sellingPrice > 0 ? (totalCost / dish.sellingPrice) * 100 : 0
            const isGood = actualFoodCost <= 32
            const isOk = actualFoodCost <= 38

            return (
              <div key={dish.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedDishes.has(dish.id)}
                      onChange={() => toggleSelect(dish.id)}
                      className="w-4 h-4 rounded accent-[#108910] cursor-pointer shrink-0"
                    />
                    <h4 className="font-bold text-gray-900 truncate">{dish.name}</h4>
                    {(() => {
                      const cat = DISH_CATEGORIES.find((c) => c.key === dish.category)
                      return cat && cat.key !== "todas" ? (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${cat.color}`}>
                          {cat.label}
                        </span>
                      ) : null
                    })()}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => duplicateDish(dish)} className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-500 transition-colors" title="Duplicar platillo" aria-label={`Duplicar ${dish.name}`}>
                      <Plus className="w-4 h-4" />
                    </button>
                    <button onClick={() => startEditDish(dish)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors" title="Editar platillo" aria-label={`Editar ${dish.name}`}>
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button onClick={() => removeDish(dish.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Eliminar platillo" aria-label={`Eliminar ${dish.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5 mb-3">
                  {dish.ingredients.map((ing, i) => (
                    <div key={i} className="flex justify-between text-sm text-gray-500">
                      <span>{ing.ingredientName} ({ing.quantity} {ing.unit})</span>
                      <span className="font-mono">${(ing.quantity * ing.unitPrice).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-100 pt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-gray-400">Costo total</p>
                    <p className="font-bold text-gray-900">${totalCost.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Precio venta</p>
                    <p className="font-bold text-[#108910]">${dish.sellingPrice.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Margen</p>
                    <p className={`font-bold ${margin > 0 ? "text-green-600" : "text-red-600"}`}>
                      ${margin.toFixed(2)}
                    </p>
                  </div>
                </div>
                {(dish.portions || 4) > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-center text-[10px] bg-gray-50 rounded-xl px-3 py-2">
                    <div>
                      <span className="text-gray-400">Costo por porción</span>
                      <p className="font-semibold text-gray-700">${(totalCost / (dish.portions || 4)).toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Precio por porción</span>
                      <p className="font-semibold text-[#108910]">${(dish.sellingPrice / (dish.portions || 4)).toFixed(2)}</p>
                    </div>
                  </div>
                )}
                <div className={`mt-2 flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-1.5 ${
                  isGood ? "bg-green-50 text-green-700" : isOk ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                }`}>
                  {isGood ? <TrendingDown className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  Food cost real: {actualFoodCost.toFixed(1)}%
                  {isGood ? " — ¡Excelente!" : isOk ? " — Aceptable" : " — ¡Revisa tus precios!"}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add dish form */}
      {showForm ? (
        <div className="bg-white rounded-2xl border border-[#108910]/30 p-5 mb-6">
          <h4 className="font-semibold text-gray-900 mb-4">
            {editingDishId ? "Editar platillo" : "Nuevo platillo"}
          </h4>
          <input
            type="text"
            value={newDishName}
            onChange={(e) => setNewDishName(e.target.value)}
            placeholder="Nombre del platillo"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm mb-3 focus:outline-none focus:border-[#108910]"
          />

          {/* Category selector */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-gray-400">Categoría:</span>
            <div className="flex flex-wrap gap-1.5">
              {DISH_CATEGORIES.filter((c) => c.key !== "todas").map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setNewDishCategory(cat.key)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                    newDishCategory === cat.key
                      ? cat.color
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Portions input */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-gray-400">Rinde:</span>
            <input
              type="number"
              value={newDishPortions || ""}
              onChange={(e) => setNewDishPortions(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 px-3 py-2 rounded-lg border border-gray-200 text-sm text-center focus:outline-none focus:border-[#108910]"
              min="1"
            />
            <span className="text-xs text-gray-400">porciones</span>
          </div>

          <div className="space-y-3 mb-4">
            {newDishIngredients.map((ing, idx) => {
              const invMatch = inventarioItems.find((i) => i.name.toLowerCase() === ing.ingredientName.toLowerCase())
              return (
              <>
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={ing.ingredientName}
                  onChange={(e) => updateIngredient(idx, "ingredientName", e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#108910] bg-white"
                >
                  <option value="">Seleccionar ingrediente</option>
                  {ingredients.map((opt) => (
                    <option key={opt.name} value={opt.name}>
                      {opt.name} — ${opt.price}/{opt.unit}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={ing.quantity || ""}
                  onChange={(e) => updateIngredient(idx, "quantity", parseFloat(e.target.value) || 0)}
                  placeholder="Cant."
                  className="w-20 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
                  min="0"
                  step="0.01"
                />
                <span className="text-xs text-gray-400 w-10 text-center">{ing.unit}</span>
                <button
                  onClick={() => removeIngredient(idx)}
                  className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                  disabled={newDishIngredients.length === 1}
                  aria-label="Quitar ingrediente"
                  title="Quitar ingrediente"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {invMatch && (
                <div className="flex items-center gap-1 ml-0.5 -mt-1 mb-1">
                  <button
                    type="button"
                    onClick={() => updateIngredient(idx, "unitPrice", invMatch.pricePerUnit)}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                      ing.unitPrice === invMatch.pricePerUnit
                        ? "bg-cyan-100 text-cyan-700 border border-cyan-300"
                        : "bg-cyan-50 text-cyan-600 border border-cyan-200 hover:bg-cyan-100"
                    }`}
                    title="Click para usar el precio de tu inventario"
                  >
                    📦 Inv: ${invMatch.pricePerUnit}/{invMatch.unit}
                    {ing.unitPrice === invMatch.pricePerUnit && " ✓"}
                  </button>
                  {ing.unitPrice !== invMatch.pricePerUnit && (
                    <span className="text-[10px] text-gray-400">→ click para usar precio de inventario</span>
                  )}
                </div>
              )}
              </>
              )
            })}
          </div>

          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <button
              onClick={addIngredient}
              className="text-sm text-[#108910] font-semibold hover:underline"
            >
              + Agregar ingrediente del catálogo
            </button>
            <button
              onClick={() => setShowCustom(!showCustom)}
              className="text-sm text-blue-600 font-semibold hover:underline"
            >
              + Ingrediente personalizado
            </button>
          </div>

          {/* Custom ingredient mini-form */}
          {showCustom && (
            <div className="bg-blue-50 rounded-xl p-3 mb-4 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Nombre del ingrediente"
                  className="flex-1 px-3 py-2 rounded-lg border border-blue-200 text-sm focus:outline-none focus:border-blue-400 bg-white"
                />
                <select
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  className="w-24 px-2 py-2 rounded-lg border border-blue-200 text-sm bg-white"
                >
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="L">L</option>
                  <option value="mL">mL</option>
                  <option value="pza">pza</option>
                  <option value="docena">docena</option>
                  <option value="manojo">manojo</option>
                  <option value="rebanada">rebanada</option>
                </select>
                <input
                  type="number"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="$ precio"
                  className="w-24 px-3 py-2 rounded-lg border border-blue-200 text-sm focus:outline-none focus:border-blue-400 bg-white"
                  min="0"
                  step="0.5"
                />
                <button
                  onClick={addCustomIngredient}
                  className="px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={saveDish} className="flex-1 bg-[#108910] text-white font-semibold py-2.5 rounded-xl hover:bg-[#0D720D] transition-colors">
              {editingDishId ? "Guardar cambios" : "Guardar platillo"}
            </button>
            <button onClick={resetForm} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-[#108910] hover:text-[#108910] transition-colors font-medium"
        >
          <Plus className="w-5 h-5" />
          Agregar platillo
        </button>
      )}

      {/* Summary */}
      {dishes.length > 0 && (
        <div className="mt-6 bg-gradient-to-r from-[#F0FDF4] to-white rounded-2xl border border-[#108910]/10 p-5">
          <div className="flex items-center gap-2 mb-3">
            <PieChart className="w-5 h-5 text-[#108910]" />
            <h3 className="font-semibold text-gray-900">Resumen de menú</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-white rounded-xl p-3">
              <p className="text-xs text-gray-400">Platillos</p>
              <p className="text-xl font-bold text-gray-900">{dishes.length}</p>
            </div>
            <div className="bg-white rounded-xl p-3">
              <p className="text-xs text-gray-400">Costo total menú</p>
              <p className="text-xl font-bold text-gray-900">
                ${dishes.reduce((s, d) => s + d.ingredients.reduce((si, i) => si + (i.quantity * i.unitPrice), 0), 0).toFixed(0)}
              </p>
            </div>
            <div className="bg-white rounded-xl p-3">
              <p className="text-xs text-gray-400">Ingreso potencial</p>
              <p className="text-xl font-bold text-[#108910]">
                ${dishes.reduce((s, d) => s + d.sellingPrice, 0).toFixed(0)}
              </p>
            </div>
            <div className="bg-white rounded-xl p-3">
              <p className="text-xs text-gray-400">Food cost promedio</p>
              <p className="text-xl font-bold text-gray-900">
                {(() => {
                  const totalCost = dishes.reduce((s, d) => s + d.ingredients.reduce((si, i) => si + (i.quantity * i.unitPrice), 0), 0)
                  const totalPrice = dishes.reduce((s, d) => s + d.sellingPrice, 0)
                  return totalPrice > 0 ? `${((totalCost / totalPrice) * 100).toFixed(1)}%` : "—"
                })()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tip */}
      <div className="mt-4 bg-blue-50 rounded-xl p-4 border border-blue-100">
        <p className="text-xs text-blue-700">
          <strong>💡 Tip:</strong> Todos los precios mostrados son del catálogo real de Resurte.me. 
          Cuando los precios cambien en nuestra plataforma, regresa aquí para actualizar tus costos automáticamente.
        </p>
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-xl">
            <h4 className="font-bold text-gray-900 mb-2">¿Eliminar este platillo?</h4>
            <p className="text-sm text-gray-500 mb-4">Esta acción no se puede deshacer. Perderás todos los ingredientes y precios de este platillo.</p>
            <div className="flex gap-3">
              <button onClick={confirmDeleteDish} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-xl hover:bg-red-700 text-sm">
                Sí, eliminar
              </button>
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch delete confirmation modal */}
      {batchDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-xl">
            <h4 className="font-bold text-gray-900 mb-2">¿Eliminar {selectedDishes.size} platillo{selectedDishes.size > 1 ? "s" : ""}?</h4>
            <p className="text-sm text-gray-500 mb-4">
              Esta acción no se puede deshacer. Perderás todos los ingredientes y precios de los platillos seleccionados.
              Puedes deshacer con Ctrl+Z después de eliminar.
            </p>
            <div className="flex gap-3">
              <button onClick={batchDelete} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-xl hover:bg-red-700 text-sm">
                Sí, eliminar
              </button>
              <button onClick={() => setBatchDeleteConfirm(false)} className="flex-1 border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
