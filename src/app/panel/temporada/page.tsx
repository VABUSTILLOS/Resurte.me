"use client"

import { useState, useMemo } from "react"
import { useRestaurant } from "@/contexts/restaurant-context"
import Link from "next/link"
import {
  Calendar, ArrowLeft, Sun, Leaf, DollarSign, TrendingDown,
  ChevronLeft, ChevronRight,
} from "lucide-react"

// Mexican seasonal produce calendar (when things are abundant/cheapest)
const SEASONS: Record<string, { name: string; months: number[]; icon: string }> = {
  aguacate: { name: "Aguacate", months: [1, 2, 6, 7, 8, 9, 10, 11], icon: "🥑" },
  jitomate: { name: "Jitomate", months: [1, 2, 3, 7, 8, 9, 10, 11, 12], icon: "🍅" },
  cebolla: { name: "Cebolla", months: [1, 2, 3, 4, 5, 9, 10, 11, 12], icon: "🧅" },
  limon: { name: "Limón", months: [1, 2, 3, 4, 5, 6, 7, 8], icon: "🍋" },
  chile: { name: "Chile serrano", months: [1, 2, 3, 7, 8, 9, 10, 11, 12], icon: "🌶️" },
  cilantro: { name: "Cilantro", months: [1, 2, 3, 10, 11, 12], icon: "🌿" },
  mango: { name: "Mango", months: [3, 4, 5, 6, 7], icon: "🥭" },
  fresa: { name: "Fresa", months: [1, 2, 3, 11, 12], icon: "🍓" },
  calabaza: { name: "Calabaza", months: [6, 7, 8, 9, 10], icon: "🎃" },
  elote: { name: "Elote", months: [6, 7, 8, 9], icon: "🌽" },
  nopal: { name: "Nopal", months: [1, 2, 3, 4, 5, 6, 7, 8, 9], icon: "🌵" },
  papaya: { name: "Papaya", months: [2, 3, 4, 5, 6], icon: "🍈" },
  pina: { name: "Piña", months: [3, 4, 5, 6, 7], icon: "🍍" },
  sandia: { name: "Sandía", months: [4, 5, 6, 7], icon: "🍉" },
  guayaba: { name: "Guayaba", months: [10, 11, 12], icon: "🍐" },
  naranja: { name: "Naranja", months: [11, 12, 1, 2, 3], icon: "🍊" },
}

const MONTHS = [
  "", "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

// Seasonal suggestions per collection
const SEASONAL_TIPS: Record<string, { season: string; months: string; tip: string; savings: string }[]> = {
  "hamburguesas-hot-dogs": [
    { season: "Primavera-Verano", months: "Mar-Ago", tip: "Aprovecha el jitomate y cebolla de temporada. Ofrece hamburguesas con guacamole fresco cuando el aguacate esté barato.", savings: "~15% en verdura" },
    { season: "Otoño-Invierno", months: "Sep-Feb", tip: "Lanza una hamburguesa con chiles asados de temporada. Agrega opciones con queso fundido.", savings: "~10% en complementos" },
  ],
  "taquerias-antojitos": [
    { season: "Primavera-Verano", months: "Mar-Ago", tip: "Temporada alta de limón, cebolla y cilantro. Es momento de promociones en tacos y aguas frescas de fruta.", savings: "~20% en acompañamientos" },
    { season: "Otoño-Invierno", months: "Sep-Feb", tip: "Ofrece tacos de guisado con calabaza y nopales de temporada. Caldos calientes como complemento.", savings: "~12% en verdura" },
  ],
  "mariscos-pescados": [
    { season: "Primavera", months: "Mar-May", tip: "Cuaresma: máxima demanda. Aprovecha mango y piña de temporada para ceviches y aguachiles.", savings: "~18% en fruta para acompañamiento" },
    { season: "Verano", months: "Jun-Ago", tip: "Temporada de aguacate barato. Ideal para promocionar tostadas y platillos con aguacate.", savings: "~25% en aguacate" },
  ],
}

const DEFAULT_TIPS = [
  { season: "Primavera-Verano", months: "Mar-Ago", tip: "Aprovecha frutas y verduras de temporada para reducir costos y ofrecer platillos más frescos.", savings: "~15% en insumos frescos" },
  { season: "Otoño-Invierno", months: "Sep-Feb", tip: "Incluye caldos, guisos y platillos calientes que aprovechen verduras de temporada fría.", savings: "~10% en verdura" },
]

export default function TemporadaPage() {
  const { selectedCollection } = useRestaurant()
  const today = new Date()
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1) // 1-12

  const tips = selectedCollection
    ? (SEASONAL_TIPS[selectedCollection.slug] || DEFAULT_TIPS)
    : DEFAULT_TIPS

  const inSeasonNow = useMemo(() => {
    return Object.entries(SEASONS)
      .filter(([, data]) => data.months.includes(viewMonth))
      .map(([key, data]) => ({ key, ...data }))
  }, [viewMonth])

  if (!selectedCollection) {
    return (
      <div className="text-center py-16">
        <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Selecciona tu tipo de cocina</h3>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          Selecciona tu tipo de restaurante para recibir recomendaciones estacionales personalizadas.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/panel" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Planificador de temporada</h2>
          <p className="text-sm text-gray-400">{selectedCollection.name}</p>
        </div>
      </div>

      {/* Month selector */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setViewMonth(viewMonth === 1 ? 12 : viewMonth - 1)}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-400" />
          </button>
          <div className="text-center">
            <span className="text-2xl font-bold text-gray-900">{MONTHS[viewMonth]}</span>
            <p className="text-xs text-gray-400 mt-0.5">
              {viewMonth === today.getMonth() + 1 ? "Mes actual" : ""}
            </p>
          </div>
          <button
            onClick={() => setViewMonth(viewMonth === 12 ? 1 : viewMonth + 1)}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* In-season items */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Leaf className="w-4 h-4 text-emerald-600" />
            <h4 className="text-sm font-semibold text-gray-700">De temporada en {MONTHS[viewMonth]}</h4>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {inSeasonNow.map((item) => (
              <div key={item.key} className="flex items-center gap-2 bg-emerald-50 rounded-xl px-3 py-2.5 border border-emerald-100">
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm font-medium text-emerald-800">{item.name}</span>
              </div>
            ))}
            {inSeasonNow.length === 0 && (
              <p className="col-span-full text-sm text-gray-400 text-center py-4">
                Pocos productos de temporada este mes. Buen momento para enfocarte en proteínas y secos.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Seasonal tips for this collection */}
      <div className="space-y-4 mb-6">
        {tips.map((tip, idx) => (
          <div key={idx} className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-2">
              {idx === 0 ? <Sun className="w-5 h-5 text-amber-500" /> : <Leaf className="w-5 h-5 text-purple-500" />}
              <h4 className="font-semibold text-gray-900">{tip.season}</h4>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{tip.months}</span>
            </div>
            <p className="text-sm text-gray-500 mb-3">{tip.tip}</p>
            <div className="flex items-center gap-2 text-xs">
              <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-semibold text-emerald-700">
                Ahorro estimado: {tip.savings}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Full year quick view */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 overflow-x-auto">
        <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-purple-600" />
          Calendario anual rápido
        </h4>
        <div className="min-w-[600px]">
          {/* Header */}
          <div className="grid grid-cols-[120px_repeat(12,1fr)] gap-1 text-center mb-2">
            <div />
            {MONTHS.slice(1).map((m) => (
              <div key={m} className={`text-[10px] font-bold py-1 rounded ${viewMonth === MONTHS.indexOf(m) ? "bg-purple-100 text-purple-700" : "text-gray-400"}`}>
                {m}
              </div>
            ))}
          </div>
          {/* Rows */}
          {Object.entries(SEASONS).slice(0, 10).map(([key, item]) => (
            <div key={key} className="grid grid-cols-[120px_repeat(12,1fr)] gap-1 items-center mb-1">
              <span className="text-xs text-gray-600 truncate">{item.icon} {item.name}</span>
              {Array.from({ length: 12 }, (_, i) => (
                <div
                  key={i}
                  className={`h-5 rounded ${item.months.includes(i + 1) ? "bg-emerald-200" : "bg-gray-100"}`}
                  title={item.months.includes(i + 1) ? `${item.name} — Temporada alta` : "Fuera de temporada"}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="mt-4 bg-purple-50 rounded-xl p-4 border border-purple-100">
        <div className="flex items-start gap-3">
          <DollarSign className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-purple-800 mb-1">
              Arma tu menú de temporada con Resurte.me
            </p>
            <p className="text-xs text-purple-600">
              Nuestro catálogo se actualiza con disponibilidad real. Los productos de temporada 
              suelen tener mejor precio porque hay mayor oferta. Revisa cada mes para ajustar tu menú.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
