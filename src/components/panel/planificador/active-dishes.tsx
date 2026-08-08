"use client"

import { Package } from "lucide-react"
import { convertQty, unitDimension } from "@/lib/panel-units"
import type { SharedDish } from "@/hooks/use-local-storage"

interface ActiveDishesProps {
  sharedDishes: SharedDish[]
  covers: number
  avgWastePct: number
  isImported: (dish: SharedDish) => boolean
  onToggleImport: (dish: SharedDish) => void
}

// Active dishes from Costeo with import-to-planner buttons.
export default function ActiveDishes({
  sharedDishes,
  covers,
  avgWastePct,
  isImported,
  onToggleImport,
}: ActiveDishesProps) {
  return (
    <div className="bg-white rounded-2xl border border-green-100 p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Package className="w-4 h-4 text-green-600" />
        <h3 className="text-sm font-semibold text-gray-700">
          Tus platillos activos ({sharedDishes.length})
        </h3>
        <span className="text-[10px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full ml-auto">
          Del Costeador
        </span>
      </div>
      <div className="grid sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
        {sharedDishes.map((dish) => {
          const totals = dish.ingredients.reduce(
            (acc, ing) => {
              const qty = ing.quantity || 0
              const dim = unitDimension(ing.unit)
              if (dim === "mass") acc.mass += (convertQty(qty, ing.unit, "kg") ?? 0) * covers
              else if (dim === "volume") acc.volume += (convertQty(qty, ing.unit, "L") ?? 0) * covers
              else acc.count += qty * covers
              return acc
            },
            { mass: 0, volume: 0, count: 0 },
          )
          const summary = [
            totals.mass > 0 ? `${totals.mass.toFixed(1)} kg` : "",
            totals.volume > 0 ? `${totals.volume.toFixed(1)} L` : "",
            totals.count > 0 ? `${Math.round(totals.count)} pza` : "",
          ].filter(Boolean).join(" · ")
          return (
            <div key={dish.id} className="flex items-center justify-between bg-green-50/50 rounded-xl px-3 py-2 text-xs">
              <span className="font-medium text-gray-700 truncate mr-2">{dish.name}</span>
              <span className="text-green-700 whitespace-nowrap font-medium">
                ~{summary} para {covers} pax
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-2">
        Estimación basada en las cantidades por platillo × {covers} comensales. Agrega ~{avgWastePct}% de merma promedio.
      </p>
      <details className="mt-3">
        <summary className="text-xs font-semibold text-[#0E7A0E] cursor-pointer hover:text-green-800 transition-colors">
          + Importar ingredientes de un platillo al planificador
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sharedDishes.map((dish) => {
            const imported = isImported(dish)
            return (
              <button
                key={dish.id}
                onClick={() => onToggleImport(dish)}
                className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
                  imported
                    ? "bg-green-200 text-green-800"
                    : "bg-white border border-green-200 text-green-700 hover:bg-green-50"
                }`}
              >
                {imported ? "✓ " : "+ "}
                {dish.name} ({dish.ingredients.length} ing.)
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          Al importar un platillo, sus ingredientes se agregan como cantidades manuales (resaltadas en ámbar). 
          Click de nuevo para quitar. Las cantidades se escalan a {covers} comensales.
        </p>
      </details>
    </div>
  )
}
