import { Trash2 } from "lucide-react"
import { CATEGORY_EMOJI, DISH_CATEGORIES, type Recipe } from "./costeo-shared"

export default function RecipeCard({ recipe, cost, onUse, onDelete, saved }: {
  recipe: Recipe
  cost: number
  onUse: () => void
  onDelete?: () => void
  saved?: boolean
}) {
  const catLabel = DISH_CATEGORIES.find((c) => c.key === recipe.category)?.label || recipe.category
  const catEmoji = CATEGORY_EMOJI[recipe.category] || "🍽️"
  return (
    <div className="border border-gray-100 rounded-xl p-3 flex flex-col gap-2 hover:border-purple-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{catEmoji} {recipe.name}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {catLabel} · {recipe.portions} porción(es) · {recipe.ingredients.length} ingredientes
          </p>
        </div>
        {onDelete && (
          <button
            onClick={onDelete}
            className="text-gray-300 hover:text-red-500 transition-colors p-1 shrink-0"
            aria-label={`Eliminar receta ${recipe.name}`}
            title="Eliminar receta guardada"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-700">
          Costo est. <span className="text-[#0E7A0E]">${cost.toFixed(2)}</span>
        </span>
        <button
          onClick={onUse}
          className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
            saved
              ? "bg-purple-600 text-white hover:bg-purple-700"
              : "bg-[#0E7A0E] text-white hover:bg-[#0D720D]"
          }`}
        >
          Usar
        </button>
      </div>
    </div>
  )
}
