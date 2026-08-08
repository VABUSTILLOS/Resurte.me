import { BookOpen } from "lucide-react"
import RecipeCard from "./RecipeCard"
import { PRESET_RECIPES, type Recipe } from "./costeo-shared"

export default function RecipePickerModal({
  open,
  collectionName,
  slug,
  savedRecipes,
  recipeSearch,
  onSearchChange,
  estimateRecipeCost,
  onUseRecipe,
  onDeleteSaved,
  onClose,
  normalizeName,
}: {
  open: boolean
  collectionName: string
  slug: string | null
  savedRecipes: Recipe[]
  recipeSearch: string
  onSearchChange: (q: string) => void
  estimateRecipeCost: (r: Recipe) => number
  onUseRecipe: (r: Recipe) => void
  onDeleteSaved: (id: string) => void
  onClose: () => void
  normalizeName: (s: string) => string
}) {
  if (!open) return null
  const presets = (PRESET_RECIPES[slug || ""] || []).filter((r) => normalizeName(r.name).includes(normalizeName(recipeSearch.trim())))
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-600" />
            <h4 className="font-bold text-gray-900">Recetas para costear</h4>
            <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">
              {savedRecipes.length} guardadas
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Cerrar recetas">×</button>
        </div>

        <input
          type="text"
          value={recipeSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar receta por nombre…"
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm mb-4 shrink-0 focus:outline-none focus:border-purple-400"
        />

        <div className="overflow-y-auto flex-1 space-y-5">
          {/* Pregrabadas */}
          <div>
            <h5 className="text-[10px] font-semibold text-gray-400 uppercase mb-2 tracking-wide">
              📖 Pregrabadas · {collectionName}
            </h5>
            {presets.length === 0 ? (
              <p className="text-sm text-gray-400">No hay recetas pregrabadas que coincidan con tu búsqueda para este tipo de cocina.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {presets.map((r) => (
                  <RecipeCard key={r.id} recipe={r} cost={estimateRecipeCost(r)} onUse={() => onUseRecipe(r)} />
                ))}
              </div>
            )}
          </div>

          {/* Guardadas */}
          <div>
            <h5 className="text-[10px] font-semibold text-gray-400 uppercase mb-2 tracking-wide">
              🔖 Mis recetas guardadas
            </h5>
            {savedRecipes.length === 0 ? (
              <p className="text-sm text-gray-400">
                Aún no guardas recetas. Llena el formulario de un platillo y usa <strong>Guardar como receta</strong> para tenerla a mano.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {savedRecipes
                  .filter((r) => normalizeName(r.name).includes(normalizeName(recipeSearch.trim())))
                  .map((r) => (
                    <RecipeCard
                      key={r.id}
                      recipe={r}
                      cost={estimateRecipeCost(r)}
                      saved
                      onUse={() => onUseRecipe(r)}
                      onDelete={() => onDeleteSaved(r.id)}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
