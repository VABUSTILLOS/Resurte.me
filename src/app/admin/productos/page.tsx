"use client"

import { Suspense, useState, useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  Search,
  Package,
  Tag,
  Loader2,
  Pencil,
  Check,
  X,
  MapPin,
  Globe,
  ImagePlus,
  RefreshCw,
  AlertTriangle,
  PackageX,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface Product {
  id: number
  name: string
  slug: string
  brand: string | null
  category_id: number | null
  price: number | null
  sale_price: number | null
  stock_status: "in_stock" | "low_stock" | "out_of_stock"
  is_visible: boolean
  show_in_whatsapp: boolean | null
  image_url: string | null
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
type StockStatus = Product["stock_status"]

const STOCK_LABELS: Record<StockStatus, string> = {
  in_stock: "En stock",
  low_stock: "Stock bajo",
  out_of_stock: "Agotado",
}

/** Fase 5 — paginación del catálogo (424+ productos). */
const PAGE_SIZE = 50

const STOCK_FILTERS: { label: string; value: StockStatus | "all" }[] = [
  { label: "Todo el stock", value: "all" },
  { label: "En stock", value: "in_stock" },
  { label: "Stock bajo", value: "low_stock" },
  { label: "Agotados", value: "out_of_stock" },
]

function buildMap(rows: AvailabilityRow[]): AvailabilityMap {
  const map: AvailabilityMap = new Map()
  for (const row of rows) {
    const inner = map.get(row.product_id) ?? new Map<number, boolean>()
    inner.set(row.city_id, row.is_available)
    map.set(row.product_id, inner)
  }
  return map
}

export default function AdminProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Cargando productos...
        </div>
      }
    >
      <AdminProductsContent />
    </Suspense>
  )
}

function AdminProductsContent() {
  // Lazy browser-only client: creating it during SSR would throw when
  // NEXT_PUBLIC_SUPABASE_URL is a placeholder/unset.
  const [supabase] = useState(() => (typeof window === "undefined" ? null : createClient()))

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [availability, setAvailability] = useState<AvailabilityMap>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  // Debounce: filtrar cientos de filas en cada tecla re-renderiza toda la tabla.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])
  const [editingPrice, setEditingPrice] = useState<number | null>(null)
  const [draftPrice, setDraftPrice] = useState<string>("")

  // Upload de imagen de producto (bucket público `productos`, 00076).
  const [uploadingImageId, setUploadingImageId] = useState<number | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageTargetRef = useRef<number | null>(null)

  const startImageUpload = (productId: number) => {
    imageTargetRef.current = productId
    imageInputRef.current?.click()
  }

  const handleImageFile = async (file: File | undefined | null) => {
    const productId = imageTargetRef.current
    if (!file || !productId) return
    setUploadingImageId(productId)
    setError(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const up = await fetch("/api/admin/products/upload-image", { method: "POST", body: form })
      const upData = await up.json()
      if (!up.ok) throw new Error(upData.detail ?? upData.error ?? "Error al subir la imagen")

      const res = await fetch("/api/admin/products/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, image_url: upData.url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error al guardar la imagen")
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, image_url: upData.url } : p))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la imagen")
    } finally {
      setUploadingImageId(null)
      imageTargetRef.current = null
      if (imageInputRef.current) imageInputRef.current.value = ""
    }
  }

  // Selección múltiple y asignación de ciudades (bulk).
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [cityModalOpen, setCityModalOpen] = useState(false)
  const [draftCities, setDraftCities] = useState<Set<number>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)

  // Fase 5 — filtros de categoría/stock (con deep-link ?stock= desde las
  // alertas del dashboard) y paginación.
  const searchParams = useSearchParams()
  const initialStock = searchParams.get("stock")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [stockFilter, setStockFilter] = useState<StockStatus | "all">(
    initialStock === "in_stock" || initialStock === "low_stock" || initialStock === "out_of_stock"
      ? initialStock
      : "all"
  )
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    ;(async () => {
      const [prodRes, catRes, cityRes, availRes] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id,name,slug,brand,category_id,price,sale_price,stock_status,is_visible,show_in_whatsapp,image_url"
          )
          .order("name"),
        supabase.from("categories").select("id,name,slug").order("name"),
        supabase.from("cities").select("id,name,slug,state").eq("is_active", true).order("name"),
        supabase
          .from("product_city_availability")
          .select("product_id,city_id,is_available"),
      ])
      if (cancelled) return
      if (prodRes.error) setError(prodRes.error.message)
      if (prodRes.data) setProducts(prodRes.data)
      if (catRes.data) setCategories(catRes.data)
      if (cityRes.data) setCities(cityRes.data)
      if (availRes.data) setAvailability(buildMap(availRes.data as AvailabilityRow[]))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const categoryName = (id: number | null) =>
    categories.find((c) => c.id === id)?.name ?? "Sin categoría"

  const stockCounts = useMemo(() => {
    let low = 0
    let out = 0
    for (const p of products) {
      if (p.stock_status === "low_stock") low++
      else if (p.stock_status === "out_of_stock") out++
    }
    return { low, out }
  }, [products])

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    const categoryName = (id: number | null) =>
      categories.find((c) => c.id === id)?.name ?? "Sin categoría"
    return products.filter((p) => {
      if (categoryFilter !== "all" && String(p.category_id ?? "") !== categoryFilter) return false
      if (stockFilter !== "all" && p.stock_status !== stockFilter) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q) ||
        categoryName(p.category_id).toLowerCase().includes(q)
      )
    })
  }, [products, debouncedSearch, categories, categoryFilter, stockFilter])

  // Fase 5 — paginación sobre los resultados filtrados
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function updateFilters(next: () => void) {
    next()
    setPage(1)
  }

  // ---------- Disponibilidad por ciudad ----------
  // Sin filas en product_city_availability = "Global" (todas las ciudades).
  const isGlobal = (productId: number) => !availability.has(productId)

  const citiesAvailableCount = (productId: number): number => {
    const rows = availability.get(productId)
    if (!rows) return cities.length
    let count = 0
    for (const city of cities) {
      if (rows.get(city.id)) count++
    }
    return count
  }

  // ---------- Selección ----------
  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => selected.has(p.id))

  const toggleSelectAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        for (const p of filtered) next.delete(p.id)
      } else {
        for (const p of filtered) next.add(p.id)
      }
      return next
    })
  }

  // ---------- Modal de ciudades ----------
  const openCityModal = (onlyProductId?: number) => {
    const ids = onlyProductId != null ? [onlyProductId] : [...selected]
    if (ids.length === 0) return
    if (onlyProductId != null) setSelected(new Set([onlyProductId]))
    // Pre-marcar: una ciudad queda activa si TODOS los productos del grupo la
    // tienen disponible (los globales cuentan como disponibles en todas).
    const pre = new Set<number>()
    for (const city of cities) {
      const all = ids.every((id) => {
        const rows = availability.get(id)
        return rows ? rows.get(city.id) === true : true
      })
      if (all) pre.add(city.id)
    }
    setDraftCities(pre)
    setCityModalOpen(true)
  }

  // "mixto": la ciudad está activa en unos productos seleccionados y en otros no.
  const cityMixed = (cityId: number): boolean => {
    const ids = [...selected]
    if (ids.length <= 1) return false
    const states = ids.map((id) => {
      const rows = availability.get(id)
      return rows ? rows.get(cityId) === true : true
    })
    return states.some(Boolean) && states.some((s) => !s)
  }

  // ---------- Acciones bulk ----------
  const applyBulk = async (
    body: Record<string, unknown>,
    apply: (prev: AvailabilityMap) => AvailabilityMap
  ) => {
    if (selected.size === 0) return
    setBulkSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/products/city-availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [...selected], ...body }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Error al actualizar disponibilidad")
      }
      setAvailability(apply)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar disponibilidad")
    } finally {
      setBulkSaving(false)
    }
  }

  const applyAllCities = (available: boolean) =>
    applyBulk({ scope: "all", isAvailable: available }, (prev) => {
      const next: AvailabilityMap = new Map(prev)
      for (const id of selected) {
        if (available) next.delete(id) // sin filas = Global
        else next.set(id, new Map(cities.map((c) => [c.id, false])))
      }
      return next
    })

  const applyDraftCities = async () => {
    if (draftCities.size === cities.length) {
      // Todas marcadas = Global (sin restricciones).
      await applyAllCities(true)
    } else if (draftCities.size === 0) {
      await applyAllCities(false)
    } else {
      const changes = cities.map((c) => ({
        cityId: c.id,
        isAvailable: draftCities.has(c.id),
      }))
      await applyBulk({ changes }, (prev) => {
        const next: AvailabilityMap = new Map(prev)
        for (const id of selected) {
          next.set(id, new Map(cities.map((c) => [c.id, draftCities.has(c.id)])))
        }
        return next
      })
    }
    setCityModalOpen(false)
  }

  /** Fase 5 — muestra/oculta en tienda todos los productos seleccionados. */
  async function bulkSetVisibility(isVisible: boolean) {
    if (selected.size === 0 || bulkSaving) return
    setBulkSaving(true)
    setError(null)
    try {
      const ids = [...selected]
      const results = await Promise.all(
        ids.map(async (productId) => {
          const res = await fetch("/api/admin/products/update", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId, is_visible: isVisible }),
          })
          return res.ok
        })
      )
      const failed = results.filter((ok) => !ok).length
      const succeededIds = ids.filter((_, i) => results[i])
      setProducts((prev) =>
        prev.map((p) => (succeededIds.includes(p.id) ? { ...p, is_visible: isVisible } : p))
      )
      setSelected(new Set())
      if (failed > 0) {
        setError(`${failed} producto${failed === 1 ? "" : "s"} no se pudieron actualizar`)
      }
    } catch {
      setError("Error al actualizar la visibilidad en lote")
    } finally {
      setBulkSaving(false)
    }
  }

  // ---------- Edición por producto (precio, stock, WhatsApp) ----------
  const patchProduct = async (productId: number, fields: Record<string, unknown>) => {
    setSaving((prev) => new Set(prev).add(productId))
    setError(null)
    try {
      const res = await fetch("/api/admin/products/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, ...fields }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Error al actualizar")
      }
      // Aplica el cambio localmente
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, ...fields } : p))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar")
    } finally {
      setSaving((prev) => {
        const next = new Set(prev)
        next.delete(productId)
        return next
      })
    }
  }

  const cycleStock = (p: Product) => {
    const order: StockStatus[] = ["in_stock", "low_stock", "out_of_stock"]
    const next = order[(order.indexOf(p.stock_status) + 1) % order.length]
    patchProduct(p.id, { stock_status: next })
  }

  const toggleWhatsApp = (p: Product) => {
    patchProduct(p.id, { show_in_whatsapp: !p.show_in_whatsapp })
  }

  const startEditPrice = (p: Product) => {
    setEditingPrice(p.id)
    setDraftPrice(String(p.sale_price ?? p.price ?? ""))
  }

  const savePrice = async (p: Product) => {
    const parsed = parseFloat(draftPrice)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Precio inválido")
      return
    }
    // Guarda como precio normal; si hay sale_price distinto, conservarlo.
    const fields: Record<string, unknown> = { price: parsed }
    if (p.sale_price !== null && p.sale_price !== undefined) {
      fields.sale_price = p.sale_price
    }
    await patchProduct(p.id, fields)
    setEditingPrice(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Cargando productos...
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          <p className="text-sm text-gray-500">
            {filtered.length === products.length
              ? `${products.length} productos registrados`
              : `${filtered.length} de ${products.length} productos`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/admin/disponibilidad"
            className="flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            <MapPin className="w-4 h-4" />
            Matriz por ciudad
          </Link>
          <button
            disabled
            title="Próximamente"
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition-colors text-sm opacity-60 cursor-not-allowed"
          >
            <Package className="w-4 h-4" />
            Nuevo producto
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200">
          {error}
        </div>
      )}

      {/* Alertas de stock: conteo de productos con stock bajo o agotado;
          cada chip filtra la tabla. */}
      {(stockCounts.low > 0 || stockCounts.out > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-sm font-semibold text-amber-800">Alertas de inventario:</span>
          <button
            type="button"
            onClick={() => updateFilters(() => setStockFilter((f) => (f === "low_stock" ? "all" : "low_stock")))}
            aria-pressed={stockFilter === "low_stock"}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              stockFilter === "low_stock"
                ? "bg-amber-600 text-white"
                : "bg-white border border-amber-200 text-amber-700 hover:bg-amber-100"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {stockCounts.low} con stock bajo
          </button>
          <button
            type="button"
            onClick={() => updateFilters(() => setStockFilter((f) => (f === "out_of_stock" ? "all" : "out_of_stock")))}
            aria-pressed={stockFilter === "out_of_stock"}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              stockFilter === "out_of_stock"
                ? "bg-red-600 text-white"
                : "bg-white border border-red-200 text-red-700 hover:bg-red-100"
            }`}
          >
            <PackageX className="w-3.5 h-3.5" />
            {stockCounts.out} agotado{stockCounts.out === 1 ? "" : "s"}
          </button>
          {stockFilter !== "all" && (
            <button
              type="button"
              onClick={() => updateFilters(() => setStockFilter("all"))}
              className="text-xs font-semibold text-amber-700 hover:underline"
            >
              Ver todos
            </button>
          )}
        </div>
      )}

      {/* Fase 5 — búsqueda + filtros de categoría y stock */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar producto o categoría..."
            value={search}
            onChange={(e) => updateFilters(() => setSearch(e.target.value))}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => updateFilters(() => setCategoryFilter(e.target.value))}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 bg-white focus:outline-none focus:border-brand-500"
          aria-label="Filtrar por categoría"
        >
          <option value="all">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={stockFilter}
          onChange={(e) => updateFilters(() => setStockFilter(e.target.value as StockStatus | "all"))}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 bg-white focus:outline-none focus:border-brand-500"
          aria-label="Filtrar por stock"
        >
          {STOCK_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {/* Barra de acciones para la selección */}
      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <span className="text-sm font-semibold text-brand-900">
            {selected.size} seleccionado{selected.size === 1 ? "" : "s"}
          </span>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button
              onClick={() => openCityModal()}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50"
            >
              <MapPin className="w-3.5 h-3.5" />
              Elegir ciudades…
            </button>
            <button
              onClick={() => applyAllCities(true)}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold hover:bg-blue-100 disabled:opacity-50"
              title="Disponibles en todas las ciudades (Global)"
            >
              <Globe className="w-3.5 h-3.5" />
              Todas
            </button>
            <button
              onClick={() => applyAllCities(false)}
              disabled={bulkSaving}
              className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-semibold hover:bg-red-100 disabled:opacity-50"
              title="No disponibles en ninguna ciudad"
            >
              Ninguna
            </button>
            {/* Fase 5 — visibilidad en tienda en lote */}
            <button
              onClick={() => bulkSetVisibility(true)}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 text-xs font-semibold hover:bg-green-100 disabled:opacity-50"
            >
              <Eye className="w-3.5 h-3.5" />
              Mostrar en tienda
            </button>
            <button
              onClick={() => bulkSetVisibility(false)}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 border border-gray-200 text-xs font-semibold hover:bg-gray-200 disabled:opacity-50"
            >
              <EyeOff className="w-3.5 h-3.5" />
              Ocultar de tienda
            </button>
            <button
              onClick={() => setSelected(new Set())}
              disabled={bulkSaving}
              className="px-2 py-1.5 text-xs font-semibold text-gray-500 hover:underline disabled:opacity-50"
            >
              Limpiar
            </button>
            {bulkSaving && <Loader2 className="w-4 h-4 animate-spin text-brand-600" />}
          </div>
        </div>
      )}

      {/* Products table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-400 font-medium">
                <th className="pl-4 pr-1 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    aria-label="Seleccionar todos los productos filtrados"
                    className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                </th>
                <th className="px-3 py-3">Producto</th>
                <th className="px-5 py-3">Categoría</th>
                <th className="px-5 py-3">Precio</th>
                <th className="px-5 py-3">Stock</th>
                <th className="px-5 py-3">Visible</th>
                <th className="px-5 py-3">WhatsApp</th>
                <th className="px-5 py-3">Ciudades</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.map((product) => {
                const global = isGlobal(product.id)
                const cityCount = citiesAvailableCount(product.id)
                return (
                  <tr
                    key={product.id}
                    className={`transition-colors ${
                      selected.has(product.id) ? "bg-brand-50/60" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="pl-4 pr-1 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(product.id)}
                        onChange={() => toggleSelect(product.id)}
                        aria-label={`Seleccionar ${product.name}`}
                        className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => startImageUpload(product.id)}
                          disabled={uploadingImageId === product.id}
                          title={product.image_url ? "Cambiar imagen" : "Subir imagen"}
                          aria-label={product.image_url ? `Cambiar imagen de ${product.name}` : `Subir imagen para ${product.name}`}
                          className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-brand-300 transition-shadow disabled:opacity-50"
                        >
                          {uploadingImageId === product.id ? (
                            <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
                          ) : product.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- thumb admin, URL dinámica de Storage
                            <img
                              src={product.image_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImagePlus className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                        <div>
                          <p className="font-medium text-gray-900">{product.name}</p>
                          <p className="text-xs text-gray-400">{product.brand ?? "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                        <Tag className="w-3 h-3" />
                        {categoryName(product.category_id)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {editingPrice === product.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draftPrice}
                            onChange={(e) => setDraftPrice(e.target.value)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-brand-500"
                          />
                          <button
                            onClick={() => savePrice(product)}
                            disabled={saving.has(product.id)}
                            className="p-1 rounded-lg text-green-600 hover:bg-green-50"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingPrice(null)}
                            className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditPrice(product)}
                          className="group flex items-center gap-1.5"
                          title="Editar precio"
                        >
                          {product.sale_price ? (
                            <div className="flex items-center">
                              <span className="font-semibold text-brand-600">
                                ${Number(product.sale_price).toFixed(2)}
                              </span>
                              <span className="ml-1.5 text-xs text-gray-400 line-through">
                                ${Number(product.price ?? 0).toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <span className="font-semibold text-gray-900">
                              ${Number(product.price ?? 0).toFixed(2)}
                            </span>
                          )}
                          <Pencil className="w-3.5 h-3.5 text-gray-300 group-hover:text-brand-500" />
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => cycleStock(product)}
                        disabled={saving.has(product.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          product.stock_status === "in_stock"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : product.stock_status === "low_stock"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}
                        title="Clic para cambiar stock"
                      >
                        {saving.has(product.id) ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : null}
                        {STOCK_LABELS[product.stock_status]}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          product.is_visible
                            ? "bg-green-50 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {product.is_visible ? "Visible" : "Oculto"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => toggleWhatsApp(product)}
                        disabled={saving.has(product.id)}
                        className={`relative w-9 h-5 rounded-full transition-colors ${
                          product.show_in_whatsapp ? "bg-green-500" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                            product.show_in_whatsapp ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => openCityModal(product.id)}
                        disabled={cities.length === 0}
                        title="Elegir en qué ciudades se ve este producto"
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          global
                            ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                            : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                        }`}
                      >
                        {global ? (
                          <>
                            <Globe className="w-3 h-3" />
                            Global
                          </>
                        ) : (
                          <>
                            <MapPin className="w-3 h-3" />
                            {cityCount}/{cities.length} ciudades
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="px-5 py-12 text-center text-gray-400 text-sm">
              No se encontraron productos
            </div>
          )}
        </div>

        {/* Fase 5 — paginación */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label="Página anterior"
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-gray-600 px-2">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                aria-label="Página siguiente"
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Input oculto para subir imagen de producto */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => void handleImageFile(e.target.files?.[0])}
      />

      {/* Modal: elegir ciudades para la selección */}
      {cityModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !bulkSaving && setCityModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">Ciudades visibles</h2>
                <p className="text-xs text-gray-500">
                  {selected.size} producto{selected.size === 1 ? "" : "s"} · marca en qué
                  ciudades se pueden ver
                </p>
              </div>
              <button
                onClick={() => setCityModalOpen(false)}
                disabled={bulkSaving}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto px-5 py-2 divide-y divide-gray-50">
              {cities.map((city) => {
                const checked = draftCities.has(city.id)
                const mixed = cityMixed(city.id)
                return (
                  <label key={city.id} className="flex items-center gap-3 py-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setDraftCities((prev) => {
                          const next = new Set(prev)
                          if (next.has(city.id)) next.delete(city.id)
                          else next.add(city.id)
                          return next
                        })
                      }
                      className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-gray-900">
                      {city.name} <span className="text-gray-400">· {city.state}</span>
                    </span>
                    {mixed && (
                      <span className="ml-auto text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                        mixto
                      </span>
                    )}
                  </label>
                )
              })}
              {cities.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">No hay ciudades activas.</p>
              )}
            </div>
            <div className="px-5 pt-2 pb-1">
              <p className="text-[11px] text-gray-400">
                Marcar todas equivale a <strong>Global</strong> (sin restricciones); desmarcar
                todas deja el producto sin ciudad disponible.
              </p>
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
              <div className="flex gap-3">
                <button
                  onClick={() => setDraftCities(new Set(cities.map((c) => c.id)))}
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  Todas
                </button>
                <button
                  onClick={() => setDraftCities(new Set())}
                  className="text-xs font-semibold text-gray-500 hover:underline"
                >
                  Ninguna
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCityModalOpen(false)}
                  disabled={bulkSaving}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={applyDraftCities}
                  disabled={bulkSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
                >
                  {bulkSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
