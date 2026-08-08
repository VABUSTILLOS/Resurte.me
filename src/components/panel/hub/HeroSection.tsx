"use client"

import { ChefHat, Store } from "lucide-react"
import { COLLECTION_ICONS, type HubCollection } from "./hub-data"

interface HeroSectionProps {
  collections: HubCollection[]
  selectedCollection: HubCollection | null
  onSelect: (c: HubCollection) => void
}

export default function HeroSection({ collections, selectedCollection, onSelect }: HeroSectionProps) {
  if (selectedCollection) {
    return (
      <div className="bg-gradient-to-r from-[#F0FDF4] to-[#E8F5E8] rounded-2xl p-6 sm:p-8 border border-[#108910]/10">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-[#108910]/10 rounded-2xl flex items-center justify-center shrink-0">
            <ChefHat className="w-7 h-7 text-[#108910]" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Panel para {selectedCollection.name}
            </h2>
            <p className="text-gray-500 max-w-2xl">
              Todas las herramientas están calibradas para tu tipo de cocina. 
              Resurte.me es tu único proveedor: todos los precios, sugerencias 
              y cálculos usan nuestro catálogo real.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-sm">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center shrink-0">
          <Store className="w-7 h-7 text-amber-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            ¡Elige tu tipo de restaurante!
          </h2>
          <p className="text-gray-500 max-w-2xl">
            Selecciona el tipo de cocina de tu negocio. Así personalizamos 
            cada herramienta con sugerencias, precios e insumos relevantes 
            para ti. Todo basado en el catálogo real de Resurte.me.
          </p>
        </div>
      </div>

      {/* Collection picker grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {collections.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-100 hover:border-[#108910]/30 hover:bg-[#F0FDF4] transition-all text-center group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">
              {COLLECTION_ICONS[c.slug] || "🍽️"}
            </span>
            <span className="text-xs font-medium text-gray-600 group-hover:text-[#108910] leading-tight">
              {c.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
