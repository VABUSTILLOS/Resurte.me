"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, MapPin, X } from "lucide-react"
import { useCity } from "@/contexts/city-context"
import { CITIES_BY_STATE } from "@/lib/cities"

interface CitySelectorProps {
  onClose: () => void
}

export function CitySelector({ onClose }: CitySelectorProps) {
  const { city: currentCity, setCity } = useCity()
  const [search, setSearch] = useState("")
  const router = useRouter()

  const filtered = search
    ? Object.entries(CITIES_BY_STATE).reduce(
        (acc, [state, cities]) => {
          const filteredCities = cities.filter((c) =>
            c.name.toLowerCase().includes(search.toLowerCase())
          )
          if (filteredCities.length > 0) {
            acc[state] = filteredCities
          }
          return acc
        },
        {} as typeof CITIES_BY_STATE
      )
    : CITIES_BY_STATE

  const handleSelect = (slug: string) => {
    setCity(slug)
    onClose()
    router.push(`/${slug}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[calc(5rem+var(--header-inset-top))] px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[70vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[#E8E9EB] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#242529]">
            Seleccionar ciudad
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[#F7F5F0] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-[#E8E9EB]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
            <input
              type="text"
              placeholder="Busca tu ciudad..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#F7F5F0] rounded-[10px] text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E] focus:bg-white transition-colors"
              autoFocus
            />
          </div>
        </div>

        {/* City list */}
        <div className="overflow-y-auto flex-1 p-4">
          {Object.keys(filtered).length === 0 ? (
            <p className="text-center text-[var(--text-secondary)] py-8">
              No se encontraron ciudades.
            </p>
          ) : (
            Object.entries(filtered).map(([state, cities]) => (
              <div key={state} className="mb-6">
                <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                  {state}
                </h3>
                <div className="space-y-1">
                  {cities.map((c) => {
                    const isActive = currentCity?.slug === c.slug
                    return (
                      <button
                        key={c.slug}
                        onClick={() => handleSelect(c.slug)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm text-left transition-colors ${
                          isActive
                            ? "bg-brand-50 text-brand-700 font-medium"
                            : "hover:bg-[#F7F5F0] text-[#343538]"
                        }`}
                      >
                        <MapPin
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? "text-[#0E7A0E]" : "text-[var(--text-secondary)]"
                          }`}
                        />
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
