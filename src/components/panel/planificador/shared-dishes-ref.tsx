"use client"

import Link from "next/link"
import { Calculator, Package } from "lucide-react"
import { getAllRecipes } from "@/lib/recipes"

interface SharedDishesRefProps {
  collectionName: string
  collectionSlug: string
}

// Empty state: "Empieza en 3 pasos" + suggested recipes for this collection.
export default function SharedDishesRef({ collectionName, collectionSlug }: SharedDishesRefProps) {
  const recipes = getAllRecipes()[collectionSlug] ?? []
  return (
    <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl border border-emerald-100 p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Package className="w-4 h-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-gray-700">Empieza en 3 pasos</h3>
      </div>
      <ol className="space-y-2 text-xs text-gray-600">
        {[
          <>1. <Link href="/panel/costeo" className="text-emerald-700 font-semibold hover:underline">Costea tu menú</Link> para tener precios reales de insumos.</>,
          <>2. Vuelve aquí: tus platillos costeados aparecerán arriba con sus ingredientes.</>,
          <>3. Escribe las cantidades por persona y envía el pedido a tu inventario.</>,
        ].map((step, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <span className="leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
      <Link
        href="/panel/costeo"
        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-[11px] font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
      >
        <Calculator className="w-3.5 h-3.5" />
        Ir al Costeador
      </Link>

      {recipes.length > 0 && (
        <details className="mt-4 border-t border-emerald-100 pt-3">
          <summary className="text-xs font-semibold text-emerald-700 cursor-pointer hover:text-emerald-800 transition-colors">
            🍳 Recetas sugeridas para {collectionName} ({recipes.length})
          </summary>
          <div className="mt-2 space-y-2">
            {recipes.slice(0, 5).map((r) => (
              <div key={r.name} className="bg-white rounded-xl border border-emerald-100 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-gray-800">{r.name}</p>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">
                    {r.prep_time} · {r.servings}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{r.description}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {r.ingredients.map((ing) => (
                    <span key={ing} className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                      {ing}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
