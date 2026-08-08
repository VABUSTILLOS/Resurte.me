import { Plus, Edit3, Trash2, TrendingDown, AlertCircle } from "lucide-react"
import { DISH_CATEGORIES, type Dish } from "./costeo-shared"
import { t } from "@/lib/i18n/es"

export default function DishesList({
  dishes,
  selectedIds,
  onToggleSelect,
  onDuplicate,
  onEdit,
  onRemove,
}: {
  dishes: Dish[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onDuplicate: (dish: Dish) => void
  onEdit: (dish: Dish) => void
  onRemove: (id: string) => void
}) {
  if (dishes.length === 0) return null
  return (
    <div className="space-y-3 mb-6">
      {dishes.map((dish) => {
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
                  checked={selectedIds.has(dish.id)}
                  onChange={() => onToggleSelect(dish.id)}
                  className="w-4 h-4 rounded accent-[#0E7A0E] cursor-pointer shrink-0"
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
                <button onClick={() => onDuplicate(dish)} className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-500 transition-colors" title="Duplicar platillo" aria-label={`Duplicar ${dish.name}`}>
                  <Plus className="w-4 h-4" />
                </button>
                <button onClick={() => onEdit(dish)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors" title={t("costeo.editDish")} aria-label={`Editar ${dish.name}`}>
                  <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={() => onRemove(dish.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Eliminar platillo" aria-label={`Eliminar ${dish.name}`}>
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
                <p className="font-bold text-[#0E7A0E]">${dish.sellingPrice.toFixed(2)}</p>
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
                  <p className="font-semibold text-[#0E7A0E]">${(dish.sellingPrice / (dish.portions || 4)).toFixed(2)}</p>
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
            {dish.modificadores && dish.modificadores.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {dish.modificadores.map((m) => (
                  <span key={m.id} className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">
                    +{m.nombre}{m.precio > 0 ? ` $${m.precio.toFixed(0)}` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
