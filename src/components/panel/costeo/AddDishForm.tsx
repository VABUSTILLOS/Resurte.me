import { Plus, Trash2, Save } from "lucide-react"
import NumberInput from "@/components/panel/NumberInput"
import { DISH_CATEGORIES, type DishIngredient, type IngredientOption, type InventarioItem } from "./costeo-shared"
import { t } from "@/lib/i18n/es"

export default function AddDishForm({
  showForm,
  editingDishId,
  newDishName,
  setNewDishName,
  newDishCategory,
  setNewDishCategory,
  newDishPortions,
  setNewDishPortions,
  newDishIngredients,
  updateIngredient,
  removeIngredient,
  addIngredient,
  showCustom,
  setShowCustom,
  customName,
  setCustomName,
  customUnit,
  setCustomUnit,
  customPrice,
  setCustomPrice,
  addCustomIngredient,
  newDishModifiers,
  removeModifier,
  modName,
  setModName,
  modPrice,
  setModPrice,
  addModifier,
  saveDish,
  saveCurrentAsRecipe,
  resetForm,
  setShowForm,
  ingredients,
  inventarioItems,
  normalizeName,
}: {
  showForm: boolean
  editingDishId: string | null
  newDishName: string
  setNewDishName: (v: string) => void
  newDishCategory: string
  setNewDishCategory: (v: string) => void
  newDishPortions: number
  setNewDishPortions: (v: number) => void
  newDishIngredients: DishIngredient[]
  updateIngredient: (idx: number, field: "ingredientName" | "unitPrice" | "quantity", value: string | number) => void
  removeIngredient: (idx: number) => void
  addIngredient: () => void
  showCustom: boolean
  setShowCustom: (v: boolean) => void
  customName: string
  setCustomName: (v: string) => void
  customUnit: string
  setCustomUnit: (v: string) => void
  customPrice: string
  setCustomPrice: (v: string) => void
  addCustomIngredient: () => void
  newDishModifiers: { id: string; nombre: string; precio: number }[]
  removeModifier: (id: string) => void
  modName: string
  setModName: (v: string) => void
  modPrice: string
  setModPrice: (v: string) => void
  addModifier: () => void
  saveDish: () => void
  saveCurrentAsRecipe: () => void
  resetForm: () => void
  setShowForm: (v: boolean) => void
  ingredients: IngredientOption[]
  inventarioItems: InventarioItem[]
  normalizeName: (s: string) => string
}) {
  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-[#108910] hover:text-[#108910] transition-colors font-medium"
      >
        <Plus className="w-5 h-5" />
        Agregar platillo
      </button>
    )
  }
  return (
    <div className="bg-white rounded-2xl border border-[#108910]/30 p-5 mb-6">
      <h4 className="font-semibold text-gray-900 mb-4">
        {editingDishId ? t("costeo.editDish") : t("costeo.newDish")}
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
        <NumberInput
          value={newDishPortions}
          onChange={(v) => setNewDishPortions(Math.max(1, v))}
          min={1}
          ariaLabel="Porciones"
          className="w-20 text-center"
        />
        <span className="text-xs text-gray-400">porciones</span>
      </div>

      <div className="space-y-3 mb-4">
        {newDishIngredients.map((ing, idx) => {
          const invMatch = inventarioItems.find((i) => normalizeName(i.name) === normalizeName(ing.ingredientName))
          return (
            <div key={idx}>
              <div className="flex items-center gap-2">
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
                    <span className="text-[10px] text-amber-600">⚠ precio desactualizado — click para usar ${invMatch.pricePerUnit}</span>
                  )}
                </div>
              )}
            </div>
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
              aria-label="Agregar ingrediente"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modificadores del platillo (sin cebolla, extra queso, etc.) */}
      <div className="mb-4">
        <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">
          Modificadores opcionales
          <span className="ml-1 normal-case font-normal text-gray-300">(se suman al precio en Ventas y aparecen en Comanda)</span>
        </label>
        <div className="space-y-2">
          {newDishModifiers.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="flex-1 px-3 py-2 rounded-lg bg-amber-50 text-sm text-amber-800 font-medium">
                {m.nombre}
                <span className="text-amber-600 font-semibold ml-1">{m.precio > 0 ? `+$${m.precio.toFixed(0)}` : "(sin costo)"}</span>
              </span>
              <button
                onClick={() => removeModifier(m.id)}
                className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                aria-label={`Quitar modificador ${m.nombre}`}
                title="Quitar modificador"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={modName}
            onChange={(e) => setModName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addModifier() } }}
            placeholder="Ej. Sin cebolla, extra queso, término medio"
            className="flex-1 px-3 py-2 rounded-lg border border-amber-200 text-sm focus:outline-none focus:border-amber-400"
            aria-label="Nombre del modificador"
          />
          <input
            type="number"
            value={modPrice}
            onChange={(e) => setModPrice(e.target.value)}
            placeholder="$"
            min="0"
            step="0.5"
            className="w-20 px-2 py-2 rounded-lg border border-amber-200 text-sm text-center focus:outline-none focus:border-amber-400"
            aria-label="Precio del modificador"
          />
          <button
            onClick={addModifier}
            disabled={!modName.trim()}
            className="px-3 py-2 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-40 transition-colors"
            title="Agregar modificador"
            aria-label="Agregar modificador"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={saveDish} className="flex-1 bg-[#108910] text-white font-semibold py-2.5 rounded-xl hover:bg-[#0D720D] transition-colors">
          {editingDishId ? "Guardar cambios" : "Guardar platillo"}
        </button>
        <button
          onClick={saveCurrentAsRecipe}
          disabled={!newDishName.trim() || newDishIngredients.length === 0}
          className="flex items-center gap-1.5 px-4 py-2.5 border border-purple-200 text-purple-700 rounded-xl text-sm font-semibold hover:bg-purple-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
          title="Guardar el platillo actual como receta reutilizable"
        >
          <Save className="w-4 h-4" />
          Guardar como receta
        </button>
        <button onClick={resetForm} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
          Cancelar
        </button>
      </div>
    </div>
  )
}
