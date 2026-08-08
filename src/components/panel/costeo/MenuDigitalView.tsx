import { Copy, Printer } from "lucide-react"
import { CATEGORY_EMOJI, DISH_CATEGORIES, type Dish } from "./costeo-shared"

export default function MenuDigitalView({
  dishes,
  restaurantName,
  onCopyCarta,
}: {
  dishes: Dish[]
  restaurantName: string
  onCopyCarta: () => void
}) {
  if (dishes.length === 0) return null
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 print:hidden">
        <p className="text-xs text-gray-400">
          Vista previa de tu carta — {dishes.length} platillo{dishes.length !== 1 ? "s" : ""}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onCopyCarta}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#108910] bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            Copiar carta
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
            aria-label="Imprimir menú digital"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir
          </button>
        </div>
      </div>
      <div className="max-w-md mx-auto bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden">
        <div className="bg-gradient-to-br from-[#108910] to-green-800 px-6 py-5 text-center">
          <p className="text-[10px] tracking-widest uppercase text-green-100">Bienvenido a</p>
          <h3 className="text-lg font-extrabold text-white">{restaurantName || "Mi menú"}</h3>
          <p className="text-[10px] text-green-200 mt-0.5">Hecho con Resurte.me</p>
        </div>
        <div className="p-5">
          {DISH_CATEGORIES.filter((c) => c.key !== "todas").map((cat) => {
            const inCat = dishes.filter((d) => (d.category || "plato-fuerte") === cat.key)
            if (inCat.length === 0) return null
            return (
              <div key={cat.key} className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{CATEGORY_EMOJI[cat.key] || "🍽️"}</span>
                  <h4 className="font-bold text-gray-900 text-sm uppercase tracking-wide">{cat.label}</h4>
                  <div className="flex-1 border-t border-dashed border-gray-200 mx-1" />
                </div>
                <div className="space-y-2.5">
                  {inCat.map((dish) => {
                    const suggested = dish.sellingPrice
                    const portions = dish.portions || 4
                    return (
                      <div key={dish.id} className="flex items-center gap-3">
                        <div className="w-12 h-12 shrink-0 rounded-xl bg-gradient-to-br from-green-50 to-gray-50 border border-gray-100 flex items-center justify-center text-xl">
                          {CATEGORY_EMOJI[dish.category] || "🍽️"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="font-semibold text-gray-800 text-sm truncate">{dish.name}</p>
                            <p className="font-bold text-[#108910] text-sm shrink-0">${suggested.toFixed(0)}</p>
                          </div>
                          <p className="text-[10px] text-gray-400 truncate">
                            {dish.ingredients.slice(0, 3).map((i) => i.ingredientName).join(" · ")}
                            {dish.ingredients.length > 3 && " · …"}
                            {portions > 1 && ` · ${portions} porc.`}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
