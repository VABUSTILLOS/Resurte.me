"use client"

import { Suspense, useState, useEffect, useRef } from "react"
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
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Download,
  Undo2,
  Copy,
  SquarePen,
  Percent,
  Plus,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface Product {
  id: number
  name: string
  slug: string
  brand: string | null
  category_id: number | null
  description: string | null
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

/** Tiempo relativo en español para "última edición" de la fila. */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "ahora"
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `hace ${d} d`
  return new Date(iso).toLocaleDateString("es-MX")
}

function buildMap(rows: AvailabilityRow[]): AvailabilityMap {  const map: AvailabilityMap = new Map()
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

import { RestockPanel } from "../components/RestockPanel"
import { ImportProductsModal } from "../components/ImportProductsModal"
import { ProductFormModal } from "../components/ProductFormModal"

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
  // Fase 16 — importación masiva vía CSV
  const [importOpen, setImportOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  // Alta/edición completa de producto y duplicado.
  const [productForm, setProductForm] = useState<"new" | Product | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null)
  // Acciones en lote extra: cambio de categoría y ajuste de precio %.
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false)
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("")
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false)
  const [bulkPricePct, setBulkPricePct] = useState<string>("10")
  const [bulkPriceMode, setBulkPriceMode] = useState<"increase" | "decrease">("increase")

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
  // Chips de estado de publicación + filtros de catálogo incompleto.
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "unpublished">("all")
  const [onlyNoImage, setOnlyNoImage] = useState(false)
  const [onlyNoCities, setOnlyNoCities] = useState(false)
  // Orden de la tabla (por defecto nombre asc, como la consulta inicial).
  const [sort, setSort] = useState<{ key: "name" | "price" | "stock"; dir: "asc" | "desc" }>({
    key: "name",
    dir: "asc",
  })
  // Deshacer de la última acción de visibilidad en lote (banner temporal).
  const [undoBulk, setUndoBulk] = useState<{ ids: number[]; restore: boolean } | null>(null)
  const [page, setPage] = useState(1)

  // Paginación server-side: total + conteos de chips vienen del API.
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState({
    catalogTotal: 0,
    published: 0,
    unpublished: 0,
    noImage: 0,
    lowStock: 0,
    outStock: 0,
    noCities: 0,
  })
  const [refreshing, setRefreshing] = useState(false)
  // Metadatos por fila: sync WA pendiente y última edición (audit log).
  const [waPending, setWaPending] = useState<Set<number>>(new Set())
  const [lastEdit, setLastEdit] = useState<Record<number, { at: string; email: string | null }>>({})

  /** Query string compartida por la tabla, select-all y export. */
  const listParams = (extra: Record<string, string>) => {
    const sp = new URLSearchParams({
      q: debouncedSearch,
      category: categoryFilter,
      stock: stockFilter,
      status: statusFilter,
      noImage: onlyNoImage ? "1" : "0",
      noCities: onlyNoCities ? "1" : "0",
      sort: sort.key,
      dir: sort.dir,
      ...extra,
    })
    return sp.toString()
  }

  // Datos estáticos: categorías, ciudades y disponibilidad por ciudad.
  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    ;(async () => {
      const [catRes, cityRes, availRes] = await Promise.all([
        supabase.from("categories").select("id,name,slug").order("name"),
        supabase.from("cities").select("id,name,slug,state").eq("is_active", true).order("name"),
        supabase
          .from("product_city_availability")
          .select("product_id,city_id,is_available"),
      ])
      if (cancelled) return
      if (catRes.data) setCategories(catRes.data)
      if (cityRes.data) setCities(cityRes.data)
      if (availRes.data) setAvailability(buildMap(availRes.data as AvailabilityRow[]))
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, reloadKey])

  // Filas de la tabla: búsqueda/filtros/orden/paginación en el servidor.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setRefreshing(true)
        const res = await fetch(
          `/api/admin/products/list?${listParams({ page: String(page), pageSize: String(PAGE_SIZE) })}`
        )
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setError(data.error ?? "Error al cargar productos")
          return
        }
        setProducts(data.rows ?? [])
        setTotal(data.total ?? 0)
        if (data.counts) setCounts(data.counts)
        // Metadatos por fila (sync WA + última edición), best-effort.
        const ids = (data.rows ?? []).map((r: Product) => r.id)
        if (ids.length > 0) {
          const metaRes = await fetch(`/api/admin/products/row-meta?ids=${ids.join(",")}`)
          const meta = await metaRes.json().catch(() => ({}))
          if (!cancelled && metaRes.ok) {
            setWaPending(new Set(meta.waPending ?? []))
            const byId: Record<number, { at: string; email: string | null }> = {}
            for (const [id, v] of Object.entries(meta.lastEdit ?? {})) {
              byId[Number(id)] = v as { at: string; email: string | null }
            }
            setLastEdit(byId)
          }
        } else if (!cancelled) {
          setWaPending(new Set())
          setLastEdit({})
        }
      } finally {
        if (!cancelled) {
          setRefreshing(false)
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    reloadKey,
    debouncedSearch,
    categoryFilter,
    stockFilter,
    statusFilter,
    onlyNoImage,
    onlyNoCities,
    sort,
    page,
  ])

  const categoryName = (id: number | null) =>
    categories.find((c) => c.id === id)?.name ?? "Sin categoría"

  const toggleSort = (key: "name" | "price" | "stock") =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    )

  const sortIcon = (key: "name" | "price" | "stock") =>
    sort.key !== key ? (
      <ArrowUpDown className="w-3 h-3 text-gray-300" />
    ) : sort.dir === "asc" ? (
      <ArrowUp className="w-3 h-3 text-brand-600" />
    ) : (
      <ArrowDown className="w-3 h-3 text-brand-600" />
    )

  // Paginación server-side: las filas actuales son la página completa.
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = products

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

  // "Seleccionar todo" abarca TODOS los resultados del filtro (todas las
  // páginas): los ids se piden al servidor.
  const allFilteredSelected = total > 0 && selected.size >= total

  const toggleSelectAllFiltered = async () => {
    if (allFilteredSelected) {
      setSelected(new Set())
      return
    }
    const ids: number[] = []
    let pageIdx = 1
    for (;;) {
      const res = await fetch(
        `/api/admin/products/list?${listParams({ idsOnly: "1", page: String(pageIdx), pageSize: "1000" })}`
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) break
      ids.push(...(data.ids ?? []))
      if (ids.length >= (data.total ?? 0) || (data.ids ?? []).length === 0) break
      pageIdx++
    }
    setSelected(new Set(ids))
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

  /** Aplica is_visible a un conjunto de ids; devuelve los que se guardaron. */
  async function applyVisibilityToIds(ids: number[], isVisible: boolean): Promise<number[]> {
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
    const succeededIds = ids.filter((_, i) => results[i])
    setProducts((prev) =>
      prev.map((p) => (succeededIds.includes(p.id) ? { ...p, is_visible: isVisible } : p))
    )
    const failed = results.filter((ok) => !ok).length
    if (failed > 0) {
      setError(`${failed} producto${failed === 1 ? "" : "s"} no se pudieron actualizar`)
    }
    return succeededIds
  }

  /** Fase 5 — muestra/oculta en tienda todos los productos seleccionados. */
  async function bulkSetVisibility(isVisible: boolean) {
    if (selected.size === 0 || bulkSaving) return
    setBulkSaving(true)
    setError(null)
    try {
      const succeededIds = await applyVisibilityToIds([...selected], isVisible)
      setSelected(new Set())
      // Ofrece deshacer la acción durante unos segundos.
      if (succeededIds.length > 0) {
        setUndoBulk({ ids: succeededIds, restore: !isVisible })
      }
    } catch {
      setError("Error al actualizar la visibilidad en lote")
    } finally {
      setBulkSaving(false)
    }
  }

  /** Revierte la última acción de visibilidad en lote. */
  async function undoBulkVisibility() {
    if (!undoBulk || bulkSaving) return
    const { ids, restore } = undoBulk
    setUndoBulk(null)
    setBulkSaving(true)
    setError(null)
    try {
      await applyVisibilityToIds(ids, restore)
    } catch {
      setError("Error al deshacer la visibilidad en lote")
    } finally {
      setBulkSaving(false)
    }
  }

  // El banner de deshacer expira a los 10 segundos.
  useEffect(() => {
    if (!undoBulk) return
    const id = setTimeout(() => setUndoBulk(null), 10_000)
    return () => clearTimeout(id)
  }, [undoBulk])

  /** Exporta los productos filtrados a un CSV re-importable (mismas columnas
   *  que acepta la importación masiva). Pide todas las páginas al servidor. */
  async function exportCsv() {
    const rows: Product[] = []
    let pageIdx = 1
    for (;;) {
      const res = await fetch(
        `/api/admin/products/list?${listParams({ page: String(pageIdx), pageSize: "1000" })}`
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? "Error al exportar")
        return
      }
      rows.push(...(data.rows ?? []))
      if (rows.length >= (data.total ?? 0) || (data.rows ?? []).length === 0) break
      pageIdx++
    }
    if (rows.length === 0) return
    const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const catSlug = (id: number | null) => categories.find((c) => c.id === id)?.slug ?? ""
    const header = "nombre,slug,marca,categoria,precio,precio_oferta,stock,visible"
    const lines = rows.map((p) =>
      [
        esc(p.name),
        p.slug,
        esc(p.brand ?? ""),
        catSlug(p.category_id),
        p.price ?? "",
        p.sale_price ?? "",
        p.stock_status,
        p.is_visible ? "si" : "no",
      ].join(",")
    )
    // BOM para que Excel respete los acentos.
    const blob = new Blob(["﻿" + [header, ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `productos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Alta/edición completa: creación y duplicado recargan para traer
   *  disponibilidad por ciudad; la edición se aplica localmente. */
  function handleFormSaved(saved: Product, created: boolean) {
    setProductForm(null)
    if (created) {
      setReloadKey((k) => k + 1)
    } else {
      setProducts((prev) => prev.map((p) => (p.id === saved.id ? { ...p, ...saved } : p)))
    }
  }

  /** Duplica un producto (la copia nace despublicada). */
  async function duplicateProduct(p: Product) {
    if (duplicatingId != null) return
    setDuplicatingId(p.id)
    setError(null)
    try {
      const res = await fetch("/api/admin/products/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: p.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Error al duplicar el producto")
      setReloadKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al duplicar el producto")
    } finally {
      setDuplicatingId(null)
    }
  }

  /** Cambia la categoría de todos los productos seleccionados. */
  async function bulkSetCategory() {
    if (selected.size === 0 || bulkSaving) return
    const categoryId = bulkCategoryId === "" ? null : Number(bulkCategoryId)
    setBulkSaving(true)
    setError(null)
    try {
      const ids = [...selected]
      const results = await Promise.all(
        ids.map(async (productId) => {
          const res = await fetch("/api/admin/products/update", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId, category_id: categoryId }),
          })
          return res.ok
        })
      )
      const succeededIds = ids.filter((_, i) => results[i])
      setProducts((prev) =>
        prev.map((p) => (succeededIds.includes(p.id) ? { ...p, category_id: categoryId } : p))
      )
      const failed = results.filter((ok) => !ok).length
      if (failed > 0) {
        setError(`${failed} producto${failed === 1 ? "" : "s"} no se pudieron actualizar`)
      }
      setBulkCategoryOpen(false)
      setSelected(new Set())
    } catch {
      setError("Error al cambiar la categoría en lote")
    } finally {
      setBulkSaving(false)
    }
  }

  /** Ajusta el precio (y oferta, si existe) de la selección en ±%. */
  async function bulkAdjustPrice() {
    if (selected.size === 0 || bulkSaving) return
    const pct = parseFloat(bulkPricePct)
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      setError("El porcentaje debe estar entre 0 y 100")
      return
    }
    const factor = bulkPriceMode === "increase" ? 1 + pct / 100 : 1 - pct / 100
    setBulkSaving(true)
    setError(null)
    try {
      const ids = [...selected]
      // Los seleccionados pueden estar en otras páginas: precios frescos del servidor.
      const listRes = await fetch(`/api/admin/products/list?ids=${ids.join(",")}`)
      const listData = await listRes.json().catch(() => ({}))
      if (!listRes.ok) throw new Error(listData.error ?? "Error al leer precios actuales")
      const current = new Map<number, Product>(
        (listData.rows ?? []).map((r: Product) => [r.id, r])
      )
      const newPrices = new Map<number, { price: number | null; sale_price: number | null }>()
      const results = await Promise.all(
        ids.map(async (productId) => {
          const p = current.get(productId)
          if (!p) return false
          const price = p.price != null ? Math.round(p.price * factor * 100) / 100 : null
          const salePrice =
            p.sale_price != null ? Math.round(p.sale_price * factor * 100) / 100 : null
          newPrices.set(productId, { price, sale_price: salePrice })
          const res = await fetch("/api/admin/products/update", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId, price, sale_price: salePrice }),
          })
          return res.ok
        })
      )
      const succeededIds = ids.filter((_, i) => results[i])
      setProducts((prev) =>
        prev.map((p) => {
          const next = succeededIds.includes(p.id) ? newPrices.get(p.id) : undefined
          return next ? { ...p, ...next } : p
        })
      )
      const failed = results.filter((ok) => !ok).length
      if (failed > 0) {
        setError(`${failed} producto${failed === 1 ? "" : "s"} no se pudieron actualizar`)
      }
      setBulkPriceOpen(false)
      setSelected(new Set())
    } catch {
      setError("Error al ajustar precios en lote")
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

  const toggleVisibility = (p: Product) => {
    patchProduct(p.id, { is_visible: !p.is_visible })
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
            {total === counts.catalogTotal
              ? `${counts.catalogTotal} productos registrados`
              : `${total} de ${counts.catalogTotal} productos`}
            {refreshing && <Loader2 className="inline w-3.5 h-3.5 ml-2 animate-spin text-brand-500" />}
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
          {/* Fase 16 — importación masiva CSV */}
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors text-sm"
          >
            <Package className="w-4 h-4" />
            Importar CSV
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={total === 0}
            title="Descarga los productos filtrados en CSV (re-importable)"
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={() => setProductForm("new")}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Nuevo producto
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200">
          {error}
        </div>
      )}

      {/* Deshacer de la última acción de visibilidad en lote */}
      {undoBulk && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-brand-50 text-brand-900 text-sm rounded-xl border border-brand-200">
          <span>
            Se actualizaron {undoBulk.ids.length} producto{undoBulk.ids.length === 1 ? "" : "s"}.
          </span>
          <button
            type="button"
            onClick={undoBulkVisibility}
            disabled={bulkSaving}
            className="flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline disabled:opacity-50"
          >
            <Undo2 className="w-4 h-4" />
            Deshacer
          </button>
          <button
            type="button"
            onClick={() => setUndoBulk(null)}
            className="ml-auto p-1 rounded-lg text-brand-400 hover:bg-brand-100"
            aria-label="Cerrar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Fase 12 — sugerencias de reabasto + historial de ajustes */}
      <RestockPanel
        onRestocked={(productId) =>
          setProducts((prev) =>
            prev.map((p) => (p.id === productId ? { ...p, stock_status: "in_stock" } : p))
          )
        }
      />
      {/* Alertas de stock: conteo de productos con stock bajo o agotado;
          cada chip filtra la tabla. */}
      {(counts.lowStock > 0 || counts.outStock > 0) && (
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
            {counts.lowStock} con stock bajo
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
            {counts.outStock} agotado{counts.outStock === 1 ? "" : "s"}
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

      {/* Chips de estado de publicación y catálogo incompleto (con conteos) */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(
          [
            { label: "Todos", value: "all" as const, count: counts.catalogTotal },
            { label: "Publicados", value: "published" as const, count: counts.published },
            { label: "Despublicados", value: "unpublished" as const, count: counts.unpublished },
          ]
        ).map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => updateFilters(() => setStatusFilter(chip.value))}
            aria-pressed={statusFilter === chip.value}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === chip.value
                ? "bg-brand-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {chip.label}
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                statusFilter === chip.value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
              }`}
            >
              {chip.count}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => updateFilters(() => setOnlyNoImage((v) => !v))}
          aria-pressed={onlyNoImage}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            onlyNoImage
              ? "bg-amber-600 text-white"
              : "bg-white border border-amber-200 text-amber-700 hover:bg-amber-50"
          }`}
        >
          <ImagePlus className="w-3.5 h-3.5" />
          Sin imagen
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              onlyNoImage ? "bg-white/20 text-white" : "bg-amber-50 text-amber-600"
            }`}
          >
            {counts.noImage}
          </span>
        </button>
        <button
          type="button"
          onClick={() => updateFilters(() => setOnlyNoCities((v) => !v))}
          aria-pressed={onlyNoCities}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            onlyNoCities
              ? "bg-amber-600 text-white"
              : "bg-white border border-amber-200 text-amber-700 hover:bg-amber-50"
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          Sin ciudades
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              onlyNoCities ? "bg-white/20 text-white" : "bg-amber-50 text-amber-600"
            }`}
          >
            {counts.noCities}
          </span>
        </button>
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
              onClick={() => setBulkCategoryOpen(true)}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-xs font-semibold hover:bg-purple-100 disabled:opacity-50"
              title="Cambiar la categoría de la selección"
            >
              <Tag className="w-3.5 h-3.5" />
              Categoría…
            </button>
            <button
              onClick={() => setBulkPriceOpen(true)}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 text-xs font-semibold hover:bg-orange-100 disabled:opacity-50"
              title="Ajustar precios de la selección en ±%"
            >
              <Percent className="w-3.5 h-3.5" />
              Precio %…
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
                <th className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort("name")}
                    className="inline-flex items-center gap-1 hover:text-gray-600"
                    aria-label="Ordenar por nombre"
                  >
                    Producto {sortIcon("name")}
                  </button>
                </th>
                <th className="px-5 py-3">Categoría</th>
                <th className="px-5 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort("price")}
                    className="inline-flex items-center gap-1 hover:text-gray-600"
                    aria-label="Ordenar por precio"
                  >
                    Precio {sortIcon("price")}
                  </button>
                </th>
                <th className="px-5 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort("stock")}
                    className="inline-flex items-center gap-1 hover:text-gray-600"
                    aria-label="Ordenar por stock"
                  >
                    Stock {sortIcon("stock")}
                  </button>
                </th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">WhatsApp</th>
                <th className="px-5 py-3">Ciudades</th>
                <th className="px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.map((product) => {
                const global = isGlobal(product.id)
                const cityCount = citiesAvailableCount(product.id)
                const edit = lastEdit[product.id]
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
                          {edit && (
                            <p className="text-[10px] text-gray-400">
                              Editado {timeAgo(edit.at)}
                              {edit.email ? ` por ${edit.email}` : ""}
                            </p>
                          )}
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
                      <button
                        onClick={() => toggleVisibility(product)}
                        disabled={saving.has(product.id)}
                        title="Clic para publicar/despublicar en tienda"
                        aria-label={`${product.is_visible ? "Despublicar" : "Publicar"} ${product.name}`}
                        className="inline-flex items-center gap-2 disabled:opacity-50"
                      >
                        <span
                          className={`relative w-9 h-5 rounded-full transition-colors ${
                            product.is_visible ? "bg-green-500" : "bg-gray-300"
                          }`}
                        >
                          {saving.has(product.id) ? (
                            <Loader2 className="absolute top-0.5 left-0.5 w-4 h-4 text-gray-500 animate-spin" />
                          ) : (
                            <span
                              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                product.is_visible ? "translate-x-4" : "translate-x-0.5"
                              }`}
                            />
                          )}
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            product.is_visible ? "text-green-700" : "text-gray-500"
                          }`}
                        >
                          {product.is_visible ? "Publicado" : "Despublicado"}
                        </span>
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
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
                        {waPending.has(product.id) && (
                          <span
                            title="Cambios pendientes de sincronizar con WhatsApp"
                            className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"
                          />
                        )}
                      </div>
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
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setProductForm(product)}
                          title={`Editar ${product.name}`}
                          aria-label={`Editar ${product.name}`}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        >
                          <SquarePen className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateProduct(product)}
                          disabled={duplicatingId === product.id}
                          title={`Duplicar ${product.name} (nace despublicado)`}
                          aria-label={`Duplicar ${product.name}`}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50"
                        >
                          {duplicatingId === product.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {total === 0 && !refreshing && (
            <div className="px-5 py-12 text-center text-gray-400 text-sm">
              No se encontraron productos
            </div>
          )}
        </div>

        {/* Fase 5 — paginación */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentPage * PAGE_SIZE, total)} de {total}
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

      {/* Fase 16 — modal de importación masiva */}
      {importOpen && (
        <ImportProductsModal
          onClose={() => setImportOpen(false)}
          onImported={() => setReloadKey((k) => k + 1)}
        />
      )}

      {/* Alta / edición completa de producto */}
      {productForm !== null && (
        <ProductFormModal
          categories={categories}
          product={productForm === "new" ? null : productForm}
          onClose={() => setProductForm(null)}
          onSaved={handleFormSaved}
        />
      )}

      {/* Modal: cambiar categoría de la selección */}
      {bulkCategoryOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !bulkSaving && setBulkCategoryOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Cambiar categoría</h2>
              <button
                onClick={() => setBulkCategoryOpen(false)}
                disabled={bulkSaving}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-gray-500 mb-3">
                Se aplicará a {selected.size} producto{selected.size === 1 ? "" : "s"}.
              </p>
              <select
                value={bulkCategoryId}
                onChange={(e) => setBulkCategoryId(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-brand-500"
                aria-label="Nueva categoría"
              >
                <option value="">Sin categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setBulkCategoryOpen(false)}
                disabled={bulkSaving}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={bulkSetCategory}
                disabled={bulkSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
              >
                {bulkSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: ajuste de precio porcentual de la selección */}
      {bulkPriceOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !bulkSaving && setBulkPriceOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Ajustar precios</h2>
              <button
                onClick={() => setBulkPriceOpen(false)}
                disabled={bulkSaving}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-500">
                Se aplicará a {selected.size} producto{selected.size === 1 ? "" : "s"} (precio y
                precio de oferta, si existe).
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBulkPriceMode("increase")}
                  aria-pressed={bulkPriceMode === "increase"}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    bulkPriceMode === "increase"
                      ? "bg-green-600 text-white"
                      : "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                  }`}
                >
                  Aumentar
                </button>
                <button
                  type="button"
                  onClick={() => setBulkPriceMode("decrease")}
                  aria-pressed={bulkPriceMode === "decrease"}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    bulkPriceMode === "decrease"
                      ? "bg-red-600 text-white"
                      : "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                  }`}
                >
                  Disminuir
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={bulkPricePct}
                  onChange={(e) => setBulkPricePct(e.target.value)}
                  className="w-24 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500"
                  aria-label="Porcentaje de ajuste"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setBulkPriceOpen(false)}
                disabled={bulkSaving}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={bulkAdjustPrice}
                disabled={bulkSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
              >
                {bulkSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
