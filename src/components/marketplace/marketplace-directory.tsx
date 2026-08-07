"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Search,
  MapPin,
  Bike,
  Store,
  UtensilsCrossed,
  ArrowRight,
} from "lucide-react"
import type { PublicMarketplaceEntry } from "@/lib/foodos-public"
import { formatMoney } from "@/lib/foodos"

interface Props {
  entries: PublicMarketplaceEntry[]
}

export function MarketplaceDirectory({ entries }: Props) {
  const [query, setQuery] = useState("")
  const [city, setCity] = useState<string | null>(null)
  const [category, setCategory] = useState<string | null>(null)

  const cities = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries) {
      for (const b of e.branches) {
        if (b.city) set.add(b.city)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"))
  }, [entries])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries) {
      for (const c of e.categories) set.add(c.name)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"))
  }, [entries])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((e) => {
      if (city && !e.branches.some((b) => b.city === city)) return false
      if (
        category &&
        !e.categories.some((c) => c.name.toLowerCase() === category.toLowerCase())
      ) {
        return false
      }
      if (!q) return true
      const name = e.restaurant.name.toLowerCase()
      const desc = (e.restaurant.description ?? "").toLowerCase()
      const dish = e.items.some((i) => i.name.toLowerCase().includes(q))
      const cat = e.categories.some((c) => c.name.toLowerCase().includes(q))
      const branchCity = e.branches.some((b) => (b.city ?? "").toLowerCase().includes(q))
      return name.includes(q) || desc.includes(q) || dish || cat || branchCity
    })
  }, [entries, query, city, category])

  return (
    <div className="min-h-screen bg-[#F7FAF7]">
      {/* Hero */}
      <div className="bg-gradient-to-br from-[#0B5D1F] via-[#108910] to-[#16A34A] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <div className="flex items-center gap-2 text-emerald-100/90 text-sm font-semibold tracking-wide mb-4">
            <UtensilsCrossed className="w-4 h-4" />
            hoyquecomemos.mx · de Resurte.me
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Hoy ¿qué comemos?
          </h1>
          <p className="text-emerald-50/90 text-lg max-w-2xl mb-8">
            Pide directo a tu restaurante favorito: sin comisiones para ellos,
            sin filas para ti. Cada menú se atiende por su propio negocio.
          </p>

          {/* Search */}
          <div className="relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busca restaurante, platillo, cocina o ciudad…"
              className="w-full rounded-2xl bg-white pl-12 pr-4 py-4 text-gray-800 text-base shadow-lg placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-white/30"
            />
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="sticky top-0 z-20 bg-[#F7FAF7]/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setCity(null)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              city === null
                ? "bg-[#108910] text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:border-[#108910]/40"
            }`}
          >
            Todas las ciudades
          </button>
          {cities.map((c) => (
            <button
              key={c}
              onClick={() => setCity(city === c ? null : c)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                city === c
                  ? "bg-[#108910] text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-[#108910]/40"
              }`}
            >
              📍 {c}
            </button>
          ))}
        </div>
      </div>

      {/* Categorías */}
      {categories.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex gap-2 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(category === cat ? null : cat)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                category === cat
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Lista */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pb-20">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">
            {filtered.length}{" "}
            {filtered.length === 1 ? "restaurante disponible" : "restaurantes disponibles"}
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <UtensilsCrossed className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No encontramos restaurantes con esos filtros</p>
            <p className="text-gray-400 text-sm mt-1">Prueba otra búsqueda o quita los filtros.</p>
            <button
              onClick={() => {
                setQuery("")
                setCity(null)
                setCategory(null)
              }}
              className="mt-6 rounded-xl bg-[#108910] text-white text-sm font-semibold px-5 py-2.5 hover:bg-[#0e7a0e]"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((entry) => (
              <RestaurantCard key={entry.restaurant.id} entry={entry} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function RestaurantCard({ entry }: { entry: PublicMarketplaceEntry }) {
  const { restaurant, branches, categories } = entry
  const primary = branches[0]
  const hasDelivery = branches.some((b) => b.delivery_active)
  const hasPickup = branches.some((b) => b.pickup_active)
  const deliveryFee = branches.reduce(
    (min, b) => (b.delivery_active ? Math.min(min, b.delivery_fee) : min),
    Number.POSITIVE_INFINITY
  )

  return (
    <Link
      href={`/r/${restaurant.slug}`}
      className="group flex flex-col rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm hover:shadow-lg hover:border-[#108910]/30 transition-all"
    >
      {/* Cover */}
      <div className="h-32 bg-gradient-to-br from-gray-100 to-gray-200 relative flex items-center justify-center overflow-hidden">
        {restaurant.logo_url ? (
          <img
            src={restaurant.logo_url}
            alt={restaurant.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <UtensilsCrossed className="w-10 h-10 text-gray-400" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h2 className="text-lg font-bold text-gray-900 group-hover:text-[#108910] transition-colors">
          {restaurant.name}
        </h2>
        {primary?.city && (
          <p className="flex items-center gap-1 text-xs text-gray-500 mt-1">
            <MapPin className="w-3.5 h-3.5" /> {primary.city}
          </p>
        )}
        {restaurant.description && (
          <p className="text-sm text-gray-500 mt-2 line-clamp-2">{restaurant.description}</p>
        )}

        {/* Categories */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {categories.slice(0, 4).map((c) => (
              <span
                key={c.id}
                className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
              >
                {c.name}
              </span>
            ))}
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
          {hasPickup && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded-full">
              <Store className="w-3 h-3" /> Para llevar
            </span>
          )}
          {hasDelivery && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
              <Bike className="w-3 h-3" /> Delivery
            </span>
          )}
        </div>
        {hasDelivery && deliveryFee !== Number.POSITIVE_INFINITY && (
          <p className="text-xs text-gray-500 mt-2">
            {deliveryFee > 0 ? `Envío desde ${formatMoney(deliveryFee)}` : "Envío gratis"}
          </p>
        )}

        <div className="flex items-center justify-between mt-auto pt-3">
          <span className="text-sm font-semibold text-[#108910]">Ver menú</span>
          <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#108910] group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </Link>
  )
}
