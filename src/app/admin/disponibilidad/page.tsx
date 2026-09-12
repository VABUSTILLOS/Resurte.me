"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Eye, EyeOff, Search, Loader2, Radio, Globe, MapPin } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface Product {
  id: number
  name: string
  slug: string
  brand: string
  category_id: number
  is_visible: boolean
  tags: string[] | null
}

interface Category {
  id: number
  name: string
  slug: string
}

interface City {
  id: number
  name: string
  slug: string
  state: string
}

interface AvailabilityRow {
  product_id: number
  city_id: number
  is_available: boolean
}

type AvailabilityMap = Map<number, Map<number, boolean>>

function buildMap(rows: AvailabilityRow[]): AvailabilityMap {
  const map: AvailabilityMap = new Map()
  for (const row of rows) {
    const inner = map.get(row.product_id) ?? new Map<number, boolean>()
    inner.set(row.city_id, row.is_available)
    map.set(row.product_id, inner)
  }
  return map
}

/**
 * Selector en vivo de productos por ciudad.
 *
 * Semántica (migración 00065): un producto SIN filas de disponibilidad está
 * disponible en TODAS las ciudades ("Global"). Al mover el primer interruptor
 * de ciudad, el producto pasa a estar restringido: solo disponible donde la
 * celda quede activa. "Todas" borra las filas y lo regresa a Global.
 *
 * Los cambios se guardan vía /api/admin/products/city-availability (admin)
 * y se reflejan en vivo en otras sesiones vía Supabase Realtime.
 */
export default function AdminAvailabilityPage() {
  // Lazy browser-only client (mismo patrón que /admin/visibilidad).
  const [supabase] = useState(() => (typeof window === "undefined" ? null : createClient()))

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [availability, setAvailability] = useState<AvailabilityMap>(new Map())
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(false)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null)
  const [onlyArranque, setOnlyArranque] = useState(false)

  // ---------- Carga inicial ----------
  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    ;(async () => {
      const [prodRes, catRes, cityRes, availRes] = await Promise.all([
        supabase
          .from("products")
          .select("id,name,slug,brand,category_id,is_visible,tags")
          .order("name"),
        supabase.from("categories").select("id,name,slug").order("name"),
        supabase.from("cities").select("id,name,slug,state").eq("is_active", true).order("name"),
        supabase
          .from("product_city_availability")
          .select("product_id,city_id,is_available"),
      ])
      if (cancelled) return
      if (prodRes.data) setProducts(prodRes.data as Product[])
      if (catRes.data) setCategories(catRes.data)
      if (cityRes.data) setCities(cityRes.data)
      if (availRes.data) setAvailability(buildMap(availRes.data as AvailabilityRow[]))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  // ---------- Realtime: cambios hechos desde otras sesiones ----------
  useEffect(() => {
    if (!supabase) return
    const channel = supabase
      .channel("product-city-availability-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "product_city_availability" },
        (payload) => {
          setAvailability((prev) => {
            const next: AvailabilityMap = new Map(prev)
            if (payload.eventType === "DELETE") {
              const old = payload.old as Partial<AvailabilityRow>
              if (old.product_id != null && old.city_id != null) {
                const inner = new Map(next.get(old.product_id) ?? [])
                inner.delete(old.city_id)
                if (inner.size === 0) next.delete(old.product_id)
                else next.set(old.product_id, inner)
              }
              return next
            }
            const row = payload.new as AvailabilityRow
            const inner = new Map(next.get(row.product_id) ?? [])
            inner.set(row.city_id, row.is_available)
            next.set(row.product_id, inner)
            return next
          })
        }
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"))
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  // ---------- Helpers de estado ----------
  const cellAvailable = useCallback(
    (productId: number, cityId: number): boolean => {
      const rows = availability.get(productId)
      if (!rows) return true // default global
      return rows.get(cityId) ?? false
    },
    [availability]
  )

  const isGlobal = useCallback(
    (productId: number): boolean => !availability.has(productId),
    [availability]
  )

  const markPending = (key: string, on: boolean) =>
    setPending((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  // ---------- Acciones ----------
  const toggleCell = async (product: Product, city: City) => {
    const key = `${product.id}:${city.id}`
    markPending(key, true)
    const current = cellAvailable(product.id, city.id)

    // Optimista
    setAvailability((prev) => {
      const next: AvailabilityMap = new Map(prev)
      const inner = new Map(next.get(product.id) ?? [])
      inner.set(city.id, !current)
      next.set(product.id, inner)
      return next
    })

    let body: Record<string, unknown>
    if (isGlobal(product.id)) {
      // Pasar de global a restringido: filas explícitas en todas las
      // ciudades, con la ciudad tocada invertida.
      body = {
        productId: product.id,
        changes: cities.map((c) => ({
          cityId: c.id,
          isAvailable: c.id === city.id ? !current : true,
        })),
      }
    } else {
      body = { productId: product.id, cityId: city.id, isAvailable: !current }
    }

    const res = await fetch("/api/admin/products/city-availability", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      // Revertir el cambio optimista recargando la verdad del servidor
      if (supabase) {
        const { data } = await supabase
          .from("product_city_availability")
          .select("product_id,city_id,is_available")
        if (data) setAvailability(buildMap(data as AvailabilityRow[]))
      }
    }
    markPending(key, false)
  }

  const setAll = async (product: Product, available: boolean) => {
    const key = `${product.id}:all`
    markPending(key, true)
    const res = await fetch("/api/admin/products/city-availability", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, scope: "all", isAvailable: available }),
    })
    if (res.ok) {
      setAvailability((prev) => {
        const next: AvailabilityMap = new Map(prev)
        if (available) {
          next.delete(product.id) // sin filas = global
        } else {
          next.set(
            product.id,
            new Map(cities.map((c) => [c.id, false]))
          )
        }
        return next
      })
    }
    markPending(key, false)
  }

  const toggleVisible = async (product: Product) => {
    const key = `${product.id}:vis`
    markPending(key, true)
    const res = await fetch("/api/admin/products/toggle-visibility", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, isVisible: !product.is_visible }),
    })
    if (res.ok) {
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_visible: !p.is_visible } : p))
      )
    }
    markPending(key, false)
  }

  // ---------- Filtros y estadísticas ----------
  const filtered = products.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    if (categoryFilter !== null && p.category_id !== categoryFilter) return false
    if (onlyArranque && !(p.tags ?? []).includes("arranque")) return false
    return true
  })

  const stats = useMemo(() => {
    let global = 0
    let restricted = 0
    let hidden = 0
    for (const p of products) {
      if (isGlobal(p.id)) global++
      else restricted++
      if (!p.is_visible) hidden++
    }
    return { global, restricted, hidden, total: products.length }
  }, [products, isGlobal])

  const cityAbbrev = (name: string) =>
    name
      .replace(/Ciudad de México/i, "CDMX")
      .slice(0, 4)
      .toUpperCase()

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      {/* Encabezado */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-brand-600" aria-hidden="true" />
            Disponibilidad por ciudad
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {stats.global} globales · {stats.restricted} restringidos · {stats.hidden} ocultos ·{" "}
            {stats.total} productos · {cities.length} ciudades
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              live ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-500"
            }`}
            title={live ? "Cambios en vivo activos" : "Conectando a Realtime…"}
          >
            <Radio className={`w-3.5 h-3.5 ${live ? "animate-pulse" : ""}`} aria-hidden="true" />
            {live ? "En vivo" : "Conectando…"}
          </span>
          <button
            onClick={() => setOnlyArranque((v) => !v)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              onlyArranque ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Arranque (35)
          </button>
        </div>
      </div>

      {/* Leyenda de semántica */}
      <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-900 flex items-start gap-2">
        <Globe className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          <strong>Global</strong> = disponible en todas las ciudades (sin restricciones). Al apagar
          o encender una ciudad específica, el producto pasa a <strong>restringido</strong>: solo
          se vende donde la celda esté activa. El ojo controla la visibilidad general del producto
          en la tienda; las celdas controlan en qué ciudades aplica.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar producto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium self-start max-w-full overflow-x-auto">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`px-3 py-1.5 whitespace-nowrap ${categoryFilter === null ? "bg-gray-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >
            Todas
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id === categoryFilter ? null : cat.id)}
              className={`px-3 py-1.5 whitespace-nowrap ${cat.id === categoryFilter ? "bg-gray-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Matriz producto × ciudad */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-auto max-h-[72vh]">
            <table className="text-sm border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs text-gray-400 font-medium">
                  <th className="sticky top-0 left-0 z-20 bg-gray-50 px-4 py-3 min-w-[260px] border-b border-r border-gray-200">
                    Producto
                  </th>
                  <th className="sticky top-0 z-10 bg-gray-50 px-2 py-3 text-center border-b border-gray-200 w-16">
                    Tienda
                  </th>
                  <th className="sticky top-0 z-10 bg-gray-50 px-2 py-3 text-center border-b border-gray-200 w-24">
                    Acciones
                  </th>
                  {cities.map((city) => (
                    <th
                      key={city.id}
                      title={`${city.name}, ${city.state}`}
                      className="sticky top-0 z-10 bg-gray-50 px-2 py-3 text-center border-b border-gray-200 w-14"
                    >
                      <span className="block text-[10px] font-bold tracking-wide text-gray-500">
                        {cityAbbrev(city.name)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const global = isGlobal(product.id)
                  return (
                    <tr
                      key={product.id}
                      className={`group ${!product.is_visible ? "opacity-50" : ""}`}
                    >
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-4 py-2 border-b border-r border-gray-100">
                        <p className="font-medium text-gray-900 text-sm leading-tight">
                          {product.name}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {global ? (
                            <span className="inline-flex items-center gap-1 text-blue-600 font-semibold">
                              <Globe className="w-3 h-3" aria-hidden="true" /> Global
                            </span>
                          ) : (
                            <span className="text-amber-600 font-semibold">Restringido</span>
                          )}
                          {" · "}
                          {categories.find((c) => c.id === product.category_id)?.name ??
                            `Cat ${product.category_id}`}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-center border-b border-gray-100">
                        <button
                          onClick={() => toggleVisible(product)}
                          disabled={pending.has(`${product.id}:vis`)}
                          title={product.is_visible ? "Visible en tienda" : "Oculto en tienda"}
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                            product.is_visible
                              ? "bg-green-50 text-green-700 hover:bg-green-100"
                              : "bg-red-50 text-red-600 hover:bg-red-100"
                          }`}
                        >
                          {pending.has(`${product.id}:vis`) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : product.is_visible ? (
                            <Eye className="w-4 h-4" />
                          ) : (
                            <EyeOff className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-2 py-2 text-center border-b border-gray-100 whitespace-nowrap">
                        <button
                          onClick={() => setAll(product, true)}
                          disabled={pending.has(`${product.id}:all`)}
                          className="text-[11px] font-semibold text-blue-700 hover:underline disabled:opacity-40"
                        >
                          Todas
                        </button>
                        <span className="text-gray-300 mx-1">·</span>
                        <button
                          onClick={() => setAll(product, false)}
                          disabled={pending.has(`${product.id}:all`)}
                          className="text-[11px] font-semibold text-red-600 hover:underline disabled:opacity-40"
                        >
                          Ninguna
                        </button>
                      </td>
                      {cities.map((city) => {
                        const on = cellAvailable(product.id, city.id)
                        const key = `${product.id}:${city.id}`
                        const busy = pending.has(key)
                        return (
                          <td key={city.id} className="px-2 py-2 text-center border-b border-gray-100">
                            <button
                              onClick={() => toggleCell(product, city)}
                              disabled={busy}
                              aria-label={`${product.name} en ${city.name}: ${on ? "disponible" : "no disponible"}`}
                              aria-pressed={on}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                on ? (global ? "bg-blue-300" : "bg-green-500") : "bg-gray-200"
                              } ${busy ? "opacity-50" : ""}`}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                  on ? "translate-x-4.5" : "translate-x-1"
                                }`}
                              />
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={3 + cities.length}
                      className="px-5 py-10 text-center text-sm text-gray-400"
                    >
                      Sin productos que coincidan con el filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
