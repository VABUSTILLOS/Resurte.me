"use client"

import { Suspense, useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
  LayoutGrid,
  LayoutList,
  HeartPulse,
  Trash2,
  History,
  ExternalLink,
  CheckCircle2,
  StickyNote,
  ClipboardList,
  Activity,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  Minus,
  Bookmark,
  QrCode,
  Sparkles,
  Store,
} from "lucide-react"
import { AUDIT_ACTION_LABEL, type AuditAction } from "@/lib/audit-log"
import { createClient } from "@/lib/supabase/client"
import { cropImageToSquare } from "@/lib/crop-image"

interface Product {
  id: number
  name: string
  slug: string
  brand: string | null
  category_id: number | null
  description: string | null
  unit: string | null
  price: number | null
  sale_price: number | null
  cost: number | null
  stock_quantity: number | null
  sort_order: number | null
  stock_status: "in_stock" | "low_stock" | "out_of_stock"
  is_visible: boolean
  show_in_whatsapp: boolean | null
  image_url: string | null
  images: string[] | null
  publish_at: string | null
  unpublish_at: string | null
  admin_note: string | null
  seo_title: string | null
  seo_description: string | null
  created_at: string | null
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
const DEFAULT_PAGE_SIZE = 50
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200]

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

/** Badge ✨ Nuevo: producto creado en los últimos 7 días. */
function isNewProduct(p: { created_at: string | null }): boolean {
  if (!p.created_at) return false
  return Date.now() - new Date(p.created_at).getTime() < 7 * 24 * 60 * 60 * 1000
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
  // Toast de éxito temporal (todas las acciones, no solo errores).
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  // Deep-link: los filtros se inicializan desde la URL y se sincronizan de
  // vuelta (vistas compartibles; las alertas del dashboard enlazan con ?stock=).
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get("q") ?? "")
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get("q") ?? "")

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
  // Vista previa grande de la imagen del producto.
  const [lightbox, setLightbox] = useState<{ id: number; url: string; name: string } | null>(null)

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
      // Recorte 1:1 opcional (canvas, client-side) antes de subir.
      let upload: File | Blob = file
      if (window.confirm("¿Recortar la imagen a formato cuadrado (1:1)?\n\nAceptar = recortar · Cancelar = usar original")) {
        try {
          upload = await cropImageToSquare(file)
        } catch {
          // si el crop falla, sube el original
        }
      }
      const form = new FormData()
      form.append("file", upload, file.name)
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
      setToast("Imagen actualizada")
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
  const searchRef = useRef<HTMLInputElement>(null)
  // Fase 16 — importación masiva vía CSV
  const [importOpen, setImportOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  // Alta/edición completa de producto y duplicado.
  const [productForm, setProductForm] = useState<"new" | Product | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [reorderingId, setReorderingId] = useState<number | null>(null)
  // Historial de cambios (audit log) del producto.
  const [historyFor, setHistoryFor] = useState<Product | null>(null)
  // Acciones en lote extra: cambio de categoría y ajuste de precio %.
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false)
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("")
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false)
  const [bulkPricePct, setBulkPricePct] = useState<string>("10")
  const [bulkPriceMode, setBulkPriceMode] = useState<"increase" | "decrease">("increase")
  // Ofertas en lote: descuento % sobre el precio base (sale_price).
  const [bulkSaleOpen, setBulkSaleOpen] = useState(false)
  const [bulkSalePct, setBulkSalePct] = useState<string>("10")
  const [bulkSaleMode, setBulkSaleMode] = useState<"apply" | "remove">("apply")
  // Unidad en lote.
  const [bulkUnitOpen, setBulkUnitOpen] = useState(false)
  const [bulkUnitValue, setBulkUnitValue] = useState("kg")
  // Oferta por margen objetivo (requiere cost).
  const [bulkMarginOpen, setBulkMarginOpen] = useState(false)
  const [bulkMarginPct, setBulkMarginPct] = useState("25")

  // Atajos de teclado: "/" enfoca búsqueda, "n" nuevo producto, Esc cierra
  // el modal más superficial abierto.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      if (e.key === "Escape") {
        if (lightbox) setLightbox(null)
        else if (historyFor) setHistoryFor(null)
        else if (productForm !== null) setProductForm(null)
        else if (bulkCategoryOpen) setBulkCategoryOpen(false)
        else if (bulkPriceOpen) setBulkPriceOpen(false)
        else if (cityModalOpen && !bulkSaving) setCityModalOpen(false)
        return
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === "/") {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === "n") {
        setProductForm("new")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lightbox, historyFor, productForm, bulkCategoryOpen, bulkPriceOpen, cityModalOpen, bulkSaving])

  // Fase 5 — filtros de categoría/stock (con deep-link ?stock= desde las
  // alertas del dashboard) y paginación.
  const initialStock = searchParams.get("stock")
  const initialSort = searchParams.get("sort")
  const [categoryFilter, setCategoryFilter] = useState<string>(
    searchParams.get("category") ?? "all"
  )
  const [stockFilter, setStockFilter] = useState<StockStatus | "all">(
    initialStock === "in_stock" || initialStock === "low_stock" || initialStock === "out_of_stock"
      ? initialStock
      : "all"
  )
  // Chips de estado de publicación + filtros de catálogo incompleto.
  const initialStatus = searchParams.get("status")
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "unpublished">(
    initialStatus === "published" || initialStatus === "unpublished" ? initialStatus : "all"
  )
  const [onlyNoImage, setOnlyNoImage] = useState(searchParams.get("noImage") === "1")
  const [onlyNoCities, setOnlyNoCities] = useState(searchParams.get("noCities") === "1")
  const [onlyNoPrice, setOnlyNoPrice] = useState(searchParams.get("noPrice") === "1")
  const [onlyNoCategory, setOnlyNoCategory] = useState(searchParams.get("noCategory") === "1")
  const [onlyWaMismatch, setOnlyWaMismatch] = useState(searchParams.get("waMismatch") === "1")
  const [onlyOnSale, setOnlyOnSale] = useState(searchParams.get("onSale") === "1")
  const [onlyDupNames, setOnlyDupNames] = useState(searchParams.get("dupNames") === "1")
  // Papelera (soft delete, 00099).
  const [onlyTrash, setOnlyTrash] = useState(searchParams.get("trash") === "1")
  // Filtros por ciudad y marca (server-side).
  const [cityFilter, setCityFilter] = useState(searchParams.get("city") ?? "all")
  const [brandFilter, setBrandFilter] = useState(searchParams.get("brand") ?? "all")
  const [brands, setBrands] = useState<string[]>([])
  // Vista tabla/grid (también viaja en la URL).
  const [view, setView] = useState<"table" | "grid">(
    searchParams.get("view") === "grid" ? "grid" : "table"
  )
  // Orden de la tabla (por defecto nombre asc, como la consulta inicial).
  const [sort, setSort] = useState<{ key: "name" | "price" | "stock"; dir: "asc" | "desc" }>({
    key: initialSort === "price" || initialSort === "stock" ? initialSort : "name",
    dir: searchParams.get("dir") === "desc" ? "desc" : "asc",
  })
  // Deshacer genérico de la última acción en lote (banner temporal).
  const [undoAction, setUndoAction] = useState<{
    message: string
    run: () => Promise<void>
  } | null>(null)
  const [page, setPage] = useState(Math.max(1, Number(searchParams.get("page")) || 1))
  const initialPageSize = Number(searchParams.get("pageSize"))
  const [pageSize, setPageSize] = useState(
    PAGE_SIZE_OPTIONS.includes(initialPageSize) ? initialPageSize : DEFAULT_PAGE_SIZE
  )

  // Sincroniza los filtros activos a la URL (sin recargar ni scroll).
  useEffect(() => {
    const sp = new URLSearchParams()
    if (debouncedSearch) sp.set("q", debouncedSearch)
    if (categoryFilter !== "all") sp.set("category", categoryFilter)
    if (stockFilter !== "all") sp.set("stock", stockFilter)
    if (statusFilter !== "all") sp.set("status", statusFilter)
    if (onlyNoImage) sp.set("noImage", "1")
    if (onlyNoCities) sp.set("noCities", "1")
    if (onlyNoPrice) sp.set("noPrice", "1")
    if (onlyNoCategory) sp.set("noCategory", "1")
    if (onlyWaMismatch) sp.set("waMismatch", "1")
    if (onlyOnSale) sp.set("onSale", "1")
    if (onlyDupNames) sp.set("dupNames", "1")
    if (onlyTrash) sp.set("trash", "1")
    if (cityFilter !== "all") sp.set("city", cityFilter)
    if (brandFilter !== "all") sp.set("brand", brandFilter)
    if (view === "grid") sp.set("view", "grid")
    if (sort.key !== "name") sp.set("sort", sort.key)
    if (sort.dir !== "asc") sp.set("dir", sort.dir)
    if (page > 1) sp.set("page", String(page))
    if (pageSize !== DEFAULT_PAGE_SIZE) sp.set("pageSize", String(pageSize))
    const qs = sp.toString()
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false })
  }, [
    debouncedSearch,
    categoryFilter,
    stockFilter,
    statusFilter,
    onlyNoImage,
    onlyNoCities,
    onlyNoPrice,
    onlyNoCategory,
    onlyWaMismatch,
    onlyOnSale,
    onlyDupNames,
    onlyTrash,
    cityFilter,
    brandFilter,
    view,
    sort,
    page,
    pageSize,
    router,
  ])

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
    noPrice: 0,
    noCategory: 0,
    waMismatch: 0,
    onSale: 0,
    dupNames: 0,
    trash: 0,
  })
  const [refreshing, setRefreshing] = useState(false)
  // true cuando la BD aún no tiene las migraciones 00096-00099: el panel
  // degrada (sin papelera, programación ni nota interna) en vez de fallar.
  const [schemaDrift, setSchemaDrift] = useState(false)
  // Metadatos por fila: sync WA pendiente y última edición (audit log).
  const [waPending, setWaPending] = useState<Set<number>>(new Set())
  const [lastEdit, setLastEdit] = useState<Record<number, { at: string; email: string | null }>>({})
  // Unidades vendidas por producto (columna Ventas, display only).
  const [sales, setSales] = useState<Record<number, number>>({})
  const [salesAmount, setSalesAmount] = useState<Record<number, number>>({})

  /** Query string compartida por la tabla, select-all y export. */
  const listParams = (extra: Record<string, string>) => {
    const sp = new URLSearchParams({
      q: debouncedSearch,
      category: categoryFilter,
      stock: stockFilter,
      status: statusFilter,
      noImage: onlyNoImage ? "1" : "0",
      noCities: onlyNoCities ? "1" : "0",
      noPrice: onlyNoPrice ? "1" : "0",
      noCategory: onlyNoCategory ? "1" : "0",
      waMismatch: onlyWaMismatch ? "1" : "0",
      onSale: onlyOnSale ? "1" : "0",
      dupNames: onlyDupNames ? "1" : "0",
      trash: onlyTrash ? "1" : "0",
      city: cityFilter,
      brand: brandFilter,
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
          `/api/admin/products/list?${listParams({ page: String(page), pageSize: String(pageSize) })}`
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
        if (data.brands) setBrands(data.brands)
        setSchemaDrift(data.schemaDrift === true)
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
            const salesById: Record<number, number> = {}
            for (const [id, v] of Object.entries(meta.sales ?? {})) {
              salesById[Number(id)] = v as number
            }
            setSales(salesById)
            const amountsById: Record<number, number> = {}
            for (const [id, v] of Object.entries(meta.salesAmount ?? {})) {
              amountsById[Number(id)] = v as number
            }
            setSalesAmount(amountsById)
          }
        } else if (!cancelled) {
          setWaPending(new Set())
          setLastEdit({})
          setSales({})
          setSalesAmount({})
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
    onlyNoPrice,
    onlyNoCategory,
    onlyWaMismatch,
    onlyOnSale,
    onlyDupNames,
    onlyTrash,
    cityFilter,
    brandFilter,
    sort,
    page,
    pageSize,
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
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
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
  const lastSelectedRef = useRef<number | null>(null)
  const toggleSelect = (id: number, shift: boolean) => {
    // Shift+clic: selecciona el rango entre el último clic y este (orden de página).
    if (shift && lastSelectedRef.current != null) {
      const ids = pageItems.map((p) => p.id)
      const a = ids.indexOf(lastSelectedRef.current)
      const b = ids.indexOf(id)
      if (a !== -1 && b !== -1) {
        const [from, to] = a < b ? [a, b] : [b, a]
        setSelected((prev) => {
          const next = new Set(prev)
          for (let i = from; i <= to; i++) {
            const pid = ids[i]
            if (pid !== undefined) next.add(pid)
          }
          return next
        })
        return
      }
    }
    lastSelectedRef.current = id
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
      setToast("Disponibilidad actualizada")
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

  /** Muestra/oculta en el catálogo de WhatsApp toda la selección. */
  async function bulkSetWhatsApp(show: boolean) {
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
            body: JSON.stringify({ productId, show_in_whatsapp: show }),
          })
          return res.ok
        })
      )
      const succeededIds = ids.filter((_, i) => results[i])
      setProducts((prev) =>
        prev.map((p) =>
          succeededIds.includes(p.id) ? { ...p, show_in_whatsapp: show } : p
        )
      )
      const failed = results.filter((ok) => !ok).length
      if (failed > 0) {
        setError(`${failed} producto${failed === 1 ? "" : "s"} no se pudieron actualizar`)
      }
      if (succeededIds.length > 0) {
        setToast(`${succeededIds.length} producto${succeededIds.length === 1 ? "" : "s"} actualizado${succeededIds.length === 1 ? "" : "s"} en WhatsApp`)
      }
      setSelected(new Set())
    } catch {
      setError("Error al actualizar WhatsApp en lote")
    } finally {
      setBulkSaving(false)
    }
  }

  /** Fase 5 — muestra/oculta en tienda todos los productos seleccionados. */
  async function bulkSetVisibility(isVisible: boolean) {
    if (selected.size === 0 || bulkSaving) return
    setBulkSaving(true)
    setError(null)
    try {
      const succeededIds = await applyVisibilityToIds([...selected], isVisible)
      setSelected(new Set())
      if (succeededIds.length > 0) {
        setToast(
          `${succeededIds.length} producto${succeededIds.length === 1 ? "" : "s"} ${
            isVisible ? "publicado" : "despublicado"
          }${succeededIds.length === 1 ? "" : "s"}`
        )
        // Ofrece deshacer la acción durante unos segundos.
        setUndoAction({
          message: `Se actualizaron ${succeededIds.length} producto${
            succeededIds.length === 1 ? "" : "s"
          }.`,
          run: () => applyVisibilityToIds(succeededIds, !isVisible).then(() => {}),
        })
      }
    } catch {
      setError("Error al actualizar la visibilidad en lote")
    } finally {
      setBulkSaving(false)
    }
  }

  /** Revierte la última acción en lote. */
  async function runUndo() {
    if (!undoAction || bulkSaving) return
    const action = undoAction
    setUndoAction(null)
    setBulkSaving(true)
    setError(null)
    try {
      await action.run()
      setToast("Cambios revertidos")
    } catch {
      setError("Error al deshacer la acción en lote")
    } finally {
      setBulkSaving(false)
    }
  }

  // El banner de deshacer expira a los 10 segundos.
  useEffect(() => {
    if (!undoAction) return
    const id = setTimeout(() => setUndoAction(null), 10_000)
    return () => clearTimeout(id)
  }, [undoAction])

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
    const header = "nombre,slug,marca,categoria,precio,precio_oferta,unidad,stock,visible"
    const lines = rows.map((p) =>
      [
        esc(p.name),
        p.slug,
        esc(p.brand ?? ""),
        catSlug(p.category_id),
        p.price ?? "",
        p.sale_price ?? "",
        p.unit ?? "",
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
    setToast(created ? `Producto creado: ${saved.name}` : "Cambios guardados")
    if (created) {
      setReloadKey((k) => k + 1)
    } else {
      setProducts((prev) => prev.map((p) => (p.id === saved.id ? { ...p, ...saved } : p)))
    }
  }

  /** Duplica un producto pidiendo nombre y categoría de la copia. */
  async function duplicateProduct(p: Product) {
    if (duplicatingId != null) return
    const name = window.prompt("Nombre de la copia:", `${p.name} (copia)`)
    if (name === null) return
    const catInput = window.prompt(
      `Categoría de la copia (número de la lista, vacío = misma):\n${categories
        .map((c, i) => `${i + 1}. ${c.name}`)
        .join("\n")}`
    )
    let categoryId: number | undefined
    if (catInput?.trim()) {
      const idx = parseInt(catInput.trim(), 10)
      const chosen = categories[idx - 1]
      if (!Number.isInteger(idx) || !chosen) {
        setError("Categoría inválida")
        return
      }
      categoryId = chosen.id
    }
    setDuplicatingId(p.id)
    setError(null)
    try {
      const res = await fetch("/api/admin/products/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: p.id,
          name: name.trim() || undefined,
          category_id: categoryId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Error al duplicar el producto")
      setToast(`Copia creada: ${data.product?.name ?? p.name}`)
      setReloadKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al duplicar el producto")
    } finally {
      setDuplicatingId(null)
    }
  }

  /** Mueve el producto una posición ↑/↓ en el orden manual del catálogo. */
  async function moveProduct(p: Product, direction: "up" | "down") {
    if (reorderingId != null) return
    setReorderingId(p.id)
    setError(null)
    try {
      const res = await fetch("/api/admin/products/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: p.id, direction }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Error al reordenar")
      if (data.moved) setToast("Orden del catálogo actualizado")
      setReloadKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reordenar")
    } finally {
      setReorderingId(null)
    }
  }

  /** Ajusta el stock numérico; el servidor deriva stock_status. */
  function adjustQuantity(p: Product, delta: number) {
    const next = Math.max(0, (p.stock_quantity ?? 0) + delta)
    const derived =
      next === 0 ? "out_of_stock" : next <= 5 ? "low_stock" : "in_stock"
    patchProduct(p.id, { stock_quantity: next, stock_status: derived })
  }

  /** Pausa temporal: despublica hoy y programa republicación en N días. */
  async function pauseProduct(p: Product) {
    const daysInput = window.prompt("¿En cuántos días se republica? (7, 14, 30…)", "7")
    if (daysInput === null) return
    const days = parseInt(daysInput.trim(), 10)
    if (!Number.isInteger(days) || days <= 0 || days > 365) {
      setError("Días inválidos (1-365)")
      return
    }
    const publishAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    setError(null)
    try {
      await patchProduct(p.id, { is_visible: false, publish_at: publishAt })
      setToast(`${p.name} en pausa; se republica en ${days} días`)
    } catch {
      // patchProduct ya reporta el error
    }
  }

  // Overrides de precio por tienda (product_stores).
  const [storePricesFor, setStorePricesFor] = useState<Product | null>(null)
  const [storeList, setStoreList] = useState<{ id: number; name: string }[]>([])
  const [storePrices, setStorePrices] = useState<Record<number, { price: string; sale: string }>>({})
  const [storePricesLoading, setStorePricesLoading] = useState(false)
  const [storePricesSaving, setStorePricesSaving] = useState(false)

  async function openStorePrices(p: Product) {
    setStorePricesFor(p)
    setStorePricesLoading(true)
    try {
      const res = await fetch(`/api/admin/products/store-prices?productId=${p.id}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Error al cargar tiendas")
      setStoreList(data.stores ?? [])
      const byStore: Record<number, { price: string; sale: string }> = {}
      for (const row of data.prices ?? []) {
        byStore[row.store_id] = {
          price: String(row.price ?? ""),
          sale: row.sale_price != null ? String(row.sale_price) : "",
        }
      }
      setStorePrices(byStore)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar tiendas")
      setStorePricesFor(null)
    } finally {
      setStorePricesLoading(false)
    }
  }

  async function saveStorePrices() {
    if (!storePricesFor || storePricesSaving) return
    setStorePricesSaving(true)
    setError(null)
    try {
      const prices = storeList.map((s) => {
        const row = storePrices[s.id]
        const price = row?.price?.trim()
        return {
          store_id: s.id,
          price: price ? parseFloat(price) : null,
          sale_price: row?.sale?.trim() ? parseFloat(row.sale) : null,
        }
      })
      const res = await fetch("/api/admin/products/store-prices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: storePricesFor.id, prices }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Error al guardar")
      setToast(`Precios por tienda guardados (${data.overrides ?? 0} overrides)`)
      setStorePricesFor(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setStorePricesSaving(false)
    }
  }

  /** Extrae la primera URL https de un record de tarea kie-ai. */
  function extractKieImageUrl(record: Record<string, unknown>): string | null {
    const candidates: unknown[] = []
    if (record.resultUrls) candidates.push(record.resultUrls)
    if (record.resultJson) candidates.push(record.resultJson)
    for (const c of candidates) {
      try {
        const parsed = typeof c === "string" ? JSON.parse(c) : c
        const urls: unknown = Array.isArray(parsed)
          ? parsed
          : (parsed as Record<string, unknown>).resultUrls ??
            (parsed as Record<string, unknown>).urls
        if (Array.isArray(urls)) {
          const first = urls.find((u) => typeof u === "string" && u.startsWith("https://"))
          if (first) return first as string
        }
        if (typeof urls === "string" && urls.startsWith("https://")) return urls
      } catch {
        // sigue con el siguiente candidato
      }
    }
    return null
  }

  /** Genera con IA la imagen de los productos SIN imagen de la selección
   *  (secuencial, máx 10 por corrida para no quemar rate limits). */
  const [bulkAiBusy, setBulkAiBusy] = useState(false)
  async function bulkGenerateImages() {
    if (selected.size === 0 || bulkAiBusy) return
    // Los sin imagen pueden estar en otras páginas: datos frescos del servidor.
    setBulkAiBusy(true)
    setError(null)
    try {
      const ids = [...selected]
      const listRes = await fetch(`/api/admin/products/list?ids=${ids.join(",")}`)
      const listData = await listRes.json().catch(() => ({}))
      if (!listRes.ok) throw new Error(listData.error ?? "Error al leer la selección")
      const missing = ((listData.rows ?? []) as Product[])
        .filter((p) => !p.image_url)
        .slice(0, 10)
      if (missing.length === 0) {
        setToast("Todos los seleccionados ya tienen imagen")
        return
      }
      let done = 0
      let failed = 0
      for (const p of missing) {
        try {
          const res = await fetch("/api/admin/kie-ai/image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: `Foto de producto: ${p.name}, fondo blanco, estudio, alta calidad`,
            }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.error ?? "error al crear tarea")
          const taskId = data.taskId as string
          const deadline = Date.now() + 90_000
          let url: string | null = null
          for (;;) {
            await new Promise((r) => setTimeout(r, 3000))
            const st = await fetch(`/api/admin/kie-ai/status?taskId=${encodeURIComponent(taskId)}`)
            const stData = await st.json().catch(() => ({}))
            const record = stData.record ?? {}
            if (record.state === "success" || record.state === "completed") {
              url = extractKieImageUrl(record)
              break
            }
            if (record.state === "fail" || record.state === "failed" || Date.now() > deadline) break
          }
          if (!url) throw new Error("sin imagen generada")
          const patch = await fetch("/api/admin/products/update", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: p.id, image_url: url, images: [url] }),
          })
          if (!patch.ok) throw new Error("error al guardar la imagen")
          done++
          setToast(`Imágenes IA: ${done}/${missing.length}…`)
        } catch {
          failed++
        }
      }
      setReloadKey((k) => k + 1)
      setSelected(new Set())
      setToast(`Imágenes IA: ${done} generada${done === 1 ? "" : "s"}`)
      if (failed > 0) {
        setError(`${failed} producto${failed === 1 ? "" : "s"} no se pudieron generar`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en la generación en lote")
    } finally {
      setBulkAiBusy(false)
    }
  }

  /** Descarga un QR PNG que apunta a la página pública del producto. */
  async function downloadQr(p: Product) {
    if (!cities[0]) return
    try {
      const QRCode = (await import("qrcode")).default
      const url = `https://resurte.me/${cities[0].slug}/producto/${p.slug}`
      const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 })
      const a = document.createElement("a")
      a.href = dataUrl
      a.download = `qr-${p.slug}.png`
      a.click()
      setToast("QR descargado")
    } catch {
      setError("No se pudo generar el QR")
    }
  }

  /** Elimina un producto (soft delete: va a la papelera, se puede restaurar). */
  async function deleteProduct(p: Product) {
    if (deletingId != null) return
    if (!window.confirm(`¿Mover "${p.name}" a la papelera? Se despublica y puedes restaurarlo después.`)) return
    setDeletingId(p.id)
    setError(null)
    try {
      const res = await fetch("/api/admin/products/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: p.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Error al eliminar el producto")
      setToast(`${p.name} movido a la papelera`)
      setReloadKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar el producto")
    } finally {
      setDeletingId(null)
    }
  }

  /** Restaura un producto de la papelera (queda despublicado). */
  async function restoreProduct(p: Product) {
    if (deletingId != null) return
    setDeletingId(p.id)
    setError(null)
    try {
      const res = await fetch("/api/admin/products/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: p.id, restore: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Error al restaurar el producto")
      setToast(`${p.name} restaurado (despublicado)`)
      setReloadKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al restaurar el producto")
    } finally {
      setDeletingId(null)
    }
  }

  // Historial (audit log) del producto abierto en el modal.
  const [historyEntries, setHistoryEntries] = useState<
    { action: string; actor_email: string | null; created_at: string; detail: Record<string, unknown> }[]
  >([])
  const [historyLoading, setHistoryLoading] = useState(false)
  // Drawer de actividad reciente (audit log de products, todos los productos).
  const [activityOpen, setActivityOpen] = useState(false)
  const [activityEntries, setActivityEntries] = useState<
    {
      action: string
      actor_email: string | null
      created_at: string
      detail: Record<string, unknown>
      entity_id: string | null
    }[]
  >([])
  const [activityLoading, setActivityLoading] = useState(false)

  async function openActivity() {
    setActivityOpen(true)
    setActivityEntries([])
    setActivityLoading(true)
    try {
      const res = await fetch("/api/admin/products/audit")
      const data = await res.json().catch(() => ({}))
      if (res.ok) setActivityEntries(data.entries ?? [])
    } finally {
      setActivityLoading(false)
    }
  }

  async function openHistory(p: Product) {
    setHistoryFor(p)
    setHistoryEntries([])
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/admin/products/audit?productId=${p.id}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) setHistoryEntries(data.entries ?? [])
    } finally {
      setHistoryLoading(false)
    }
  }

  /** Copia la selección al portapapeles ("Nombre — $precio" por línea). */
  async function copySelection() {
    if (selected.size === 0) return
    try {
      const res = await fetch(`/api/admin/products/list?ids=${[...selected].join(",")}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Error al leer la selección")
      const lines = (data.rows ?? []).map(
        (p: Product) =>
          `${p.name} — $${Number(p.sale_price ?? p.price ?? 0).toFixed(2)}${
            p.unit ? `/${p.unit}` : ""
          }`
      )
      if (lines.length === 0) return
      await navigator.clipboard.writeText(lines.join("\n"))
      setToast(`${lines.length} producto${lines.length === 1 ? "" : "s"} copiado${lines.length === 1 ? "" : "s"}`)
    } catch {
      setError("No se pudo copiar al portapapeles")
    }
  }

  // Reporte de ventas por rango de fechas.
  const [reportOpen, setReportOpen] = useState(false)
  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
  })
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [reportLoading, setReportLoading] = useState(false)

  async function downloadSalesReport() {
    if (reportLoading) return
    setReportLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/products/sales-report?from=${reportFrom}&to=${reportTo}`
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Error al generar el reporte")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `ventas-${reportFrom}_a_${reportTo}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setReportOpen(false)
      setToast("Reporte descargado")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar el reporte")
    } finally {
      setReportLoading(false)
    }
  }

  // Vistas guardadas de filtros (localStorage).
  interface SavedView {
    name: string
    params: Record<string, string>
  }
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => {
    if (typeof window === "undefined") return []
    try {
      return JSON.parse(localStorage.getItem("resurte-admin-product-views") ?? "[]")
    } catch {
      return []
    }
  })
  const [viewsOpen, setViewsOpen] = useState(false)

  function persistViews(views: SavedView[]) {
    setSavedViews(views)
    try {
      localStorage.setItem("resurte-admin-product-views", JSON.stringify(views))
    } catch {
      // sin espacio / modo privado: la vista vive solo en memoria
    }
  }

  function currentFilterParams(): Record<string, string> {
    const params: Record<string, string> = {}
    if (debouncedSearch) params.q = debouncedSearch
    if (categoryFilter !== "all") params.category = categoryFilter
    if (stockFilter !== "all") params.stock = stockFilter
    if (statusFilter !== "all") params.status = statusFilter
    if (onlyNoImage) params.noImage = "1"
    if (onlyNoCities) params.noCities = "1"
    if (onlyNoPrice) params.noPrice = "1"
    if (onlyNoCategory) params.noCategory = "1"
    if (onlyWaMismatch) params.waMismatch = "1"
    if (onlyOnSale) params.onSale = "1"
    if (onlyDupNames) params.dupNames = "1"
    if (onlyTrash) params.trash = "1"
    if (cityFilter !== "all") params.city = cityFilter
    if (brandFilter !== "all") params.brand = brandFilter
    if (view === "grid") params.view = "grid"
    if (sort.key !== "name") params.sort = sort.key
    if (sort.dir !== "asc") params.dir = sort.dir
    return params
  }

  function saveCurrentView() {
    const name = window.prompt("Nombre de la vista:")
    if (!name?.trim()) return
    const params = currentFilterParams()
    if (Object.keys(params).length === 0) {
      setError("No hay filtros activos para guardar")
      return
    }
    persistViews([...savedViews.filter((v) => v.name !== name.trim()), { name: name.trim(), params }])
    setToast(`Vista "${name.trim()}" guardada`)
  }

  function applyView(v: SavedView) {
    updateFilters(() => {
      setSearch(v.params.q ?? "")
      setDebouncedSearch(v.params.q ?? "")
      setCategoryFilter(v.params.category ?? "all")
      setStockFilter((v.params.stock as StockStatus | "all") ?? "all")
      setStatusFilter((v.params.status as "all" | "published" | "unpublished") ?? "all")
      setOnlyNoImage(v.params.noImage === "1")
      setOnlyNoCities(v.params.noCities === "1")
      setOnlyNoPrice(v.params.noPrice === "1")
      setOnlyNoCategory(v.params.noCategory === "1")
      setOnlyWaMismatch(v.params.waMismatch === "1")
      setOnlyOnSale(v.params.onSale === "1")
      setOnlyDupNames(v.params.dupNames === "1")
      setOnlyTrash(v.params.trash === "1")
      setCityFilter(v.params.city ?? "all")
      setBrandFilter(v.params.brand ?? "all")
      setView(v.params.view === "grid" ? "grid" : "table")
      setSort({
        key: (v.params.sort as "name" | "price" | "stock") ?? "name",
        dir: v.params.dir === "desc" ? "desc" : "asc",
      })
    })
    setViewsOpen(false)
    setToast(`Vista "${v.name}" aplicada`)
  }
  async function mergeSelected() {
    if (selected.size !== 2 || bulkSaving) return
    const [a, b] = [...selected].sort((x, y) => x - y)
    const target = products.find((p) => p.id === a)
    const source = products.find((p) => p.id === b)
    if (
      !window.confirm(
        `Fusionar duplicados:\n\n✔ Se conserva: ${target?.name ?? `#${a}`} (#${a})\n✖ Va a la papelera: ${source?.name ?? `#${b}`} (#${b})\n\nSe copian disponibilidad e imágenes faltantes. ¿Continuar?`
      )
    )
      return
    setBulkSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/products/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: b, targetId: a }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Error al fusionar")
      setToast(`Productos fusionados (#${b} → #${a})`)
      setSelected(new Set())
      setReloadKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al fusionar")
    } finally {
      setBulkSaving(false)
    }
  }

  /** Elimina la selección (soft delete: los productos van a la papelera). */
  async function bulkDelete() {
    if (selected.size === 0 || bulkSaving) return
    if (
      !window.confirm(
        `¿Mover ${selected.size} producto${selected.size === 1 ? "" : "s"} a la papelera? Se despublican y puedes restaurarlos después.`
      )
    )
      return
    setBulkSaving(true)
    setError(null)
    try {
      const ids = [...selected]
      let deleted = 0
      let failed = 0
      for (const productId of ids) {
        const res = await fetch("/api/admin/products/delete", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId }),
        })
        if (res.ok) deleted++
        else failed++
      }
      setSelected(new Set())
      setReloadKey((k) => k + 1)
      setToast(`${deleted} movido${deleted === 1 ? "" : "s"} a la papelera`)
      if (failed > 0) {
        setError(`${failed} producto${failed === 1 ? "" : "s"} no se pudieron eliminar`)
      }
    } catch {
      setError("Error al eliminar en lote")
    } finally {
      setBulkSaving(false)
    }
  }

  /** Duplica la selección (las copias nacen despublicadas). */
  async function bulkDuplicate() {
    if (selected.size === 0 || bulkSaving) return
    setBulkSaving(true)
    setError(null)
    try {
      const ids = [...selected]
      const results = await Promise.all(
        ids.map(async (productId) => {
          const res = await fetch("/api/admin/products/duplicate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId }),
          })
          return res.ok
        })
      )
      const ok = results.filter(Boolean).length
      const failed = results.filter((r) => !r).length
      setSelected(new Set())
      setReloadKey((k) => k + 1)
      setToast(`${ok} copia${ok === 1 ? "" : "s"} creada${ok === 1 ? "" : "s"} (despublicadas)`)
      if (failed > 0) {
        setError(`${failed} producto${failed === 1 ? "" : "s"} no se pudieron duplicar`)
      }
    } catch {
      setError("Error al duplicar en lote")
    } finally {
      setBulkSaving(false)
    }
  }

  /** Aplica o quita ofertas (sale_price) en la selección. */
  async function bulkSale() {
    if (selected.size === 0 || bulkSaving) return
    const pct = parseFloat(bulkSalePct)
    if (bulkSaleMode === "apply" && (!Number.isFinite(pct) || pct <= 0 || pct >= 100)) {
      setError("El descuento debe ser mayor que 0 y menor que 100")
      return
    }
    setBulkSaving(true)
    setError(null)
    try {
      const ids = [...selected]
      const listRes = await fetch(`/api/admin/products/list?ids=${ids.join(",")}`)
      const listData = await listRes.json().catch(() => ({}))
      if (!listRes.ok) throw new Error(listData.error ?? "Error al leer precios actuales")
      const current = new Map<number, Product>(
        (listData.rows ?? []).map((r: Product) => [r.id, r])
      )
      const factor = 1 - pct / 100
      const newSalePrices = new Map<number, number | null>()
      const results = await Promise.all(
        ids.map(async (productId) => {
          const p = current.get(productId)
          if (!p) return false
          const salePrice =
            bulkSaleMode === "remove"
              ? null
              : p.price != null
              ? Math.round(p.price * factor * 100) / 100
              : undefined
          if (salePrice === undefined) return false // sin precio base no aplica
          newSalePrices.set(productId, salePrice)
          const res = await fetch("/api/admin/products/update", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId, sale_price: salePrice }),
          })
          return res.ok
        })
      )
      const succeededIds = ids.filter((_, i) => results[i])
      setProducts((prev) =>
        prev.map((p) => {
          const sp = succeededIds.includes(p.id) ? newSalePrices.get(p.id) : undefined
          return sp !== undefined ? { ...p, sale_price: sp } : p
        })
      )
      const failed = results.filter((ok) => !ok).length
      if (failed > 0) {
        setError(
          `${failed} producto${failed === 1 ? "" : "s"} omitido${failed === 1 ? "" : "s"} (sin precio base o error)`
        )
      }
      if (succeededIds.length > 0) {
        setToast(
          bulkSaleMode === "apply"
            ? `Oferta aplicada en ${succeededIds.length} producto${succeededIds.length === 1 ? "" : "s"}`
            : `Ofertas quitadas en ${succeededIds.length} producto${succeededIds.length === 1 ? "" : "s"}`
        )
        setUndoAction({
          message: `Ofertas actualizadas en ${succeededIds.length} producto${
            succeededIds.length === 1 ? "" : "s"
          }.`,
          run: async () => {
            await Promise.all(
              succeededIds.map(async (productId) => {
                const prev = current.get(productId)
                if (!prev) return false
                const res = await fetch("/api/admin/products/update", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ productId, sale_price: prev.sale_price }),
                })
                return res.ok
              })
            )
            setProducts((prevList) =>
              prevList.map((p) => {
                const old = succeededIds.includes(p.id) ? current.get(p.id) : undefined
                return old ? { ...p, sale_price: old.sale_price } : p
              })
            )
          },
        })
      }
      setBulkSaleOpen(false)
      setSelected(new Set())
    } catch {
      setError("Error al actualizar ofertas en lote")
    } finally {
      setBulkSaving(false)
    }
  }

  /** Oferta por margen objetivo: sale_price = cost / (1 - margen). */
  async function bulkMarginSale() {
    if (selected.size === 0 || bulkSaving) return
    const margin = parseFloat(bulkMarginPct)
    if (!Number.isFinite(margin) || margin <= 0 || margin >= 100) {
      setError("El margen debe estar entre 1 y 99")
      return
    }
    setBulkSaving(true)
    setError(null)
    try {
      const ids = [...selected]
      const listRes = await fetch(`/api/admin/products/list?ids=${ids.join(",")}`)
      const listData = await listRes.json().catch(() => ({}))
      if (!listRes.ok) throw new Error(listData.error ?? "Error al leer costos")
      const current = new Map<number, Product>(
        (listData.rows ?? []).map((r: Product) => [r.id, r])
      )
      const newSalePrices = new Map<number, number>()
      const results = await Promise.all(
        ids.map(async (productId) => {
          const p = current.get(productId)
          if (!p || p.cost == null || p.cost <= 0) return false
          // Precio mínimo para conservar el margen objetivo; solo aplica si
          // queda por debajo del precio base (si no, no es oferta).
          const minPrice = p.cost / (1 - margin / 100)
          const salePrice = Math.round(minPrice * 100) / 100
          if (p.price != null && salePrice >= p.price) return false
          newSalePrices.set(productId, salePrice)
          const res = await fetch("/api/admin/products/update", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId, sale_price: salePrice }),
          })
          return res.ok
        })
      )
      const succeededIds = ids.filter((_, i) => results[i])
      setProducts((prev) =>
        prev.map((p) => {
          const sp = succeededIds.includes(p.id) ? newSalePrices.get(p.id) : undefined
          return sp !== undefined ? { ...p, sale_price: sp } : p
        })
      )
      const skipped = results.filter((ok) => !ok).length
      if (succeededIds.length > 0) {
        setToast(
          `Oferta con margen ≥${margin}% en ${succeededIds.length} producto${
            succeededIds.length === 1 ? "" : "s"
          }`
        )
      }
      if (skipped > 0) {
        setError(
          `${skipped} omitido${skipped === 1 ? "" : "s"} (sin costo o el precio ya está por debajo del mínimo)`
        )
      }
      setBulkMarginOpen(false)
      setSelected(new Set())
    } catch {
      setError("Error al aplicar oferta por margen")
    } finally {
      setBulkSaving(false)
    }
  }

  /** Asigna la unidad a toda la selección. */
  async function bulkSetUnit() {
    if (selected.size === 0 || bulkSaving) return
    const unit = bulkUnitValue.trim() || null
    setBulkSaving(true)
    setError(null)
    try {
      const ids = [...selected]
      const results = await Promise.all(
        ids.map(async (productId) => {
          const res = await fetch("/api/admin/products/update", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId, unit }),
          })
          return res.ok
        })
      )
      const succeededIds = ids.filter((_, i) => results[i])
      setProducts((prev) =>
        prev.map((p) => (succeededIds.includes(p.id) ? { ...p, unit } : p))
      )
      if (succeededIds.length > 0) {
        setToast(`Unidad "${unit ?? "—"}" en ${succeededIds.length} producto${succeededIds.length === 1 ? "" : "s"}`)
      }
      const failed = results.filter((ok) => !ok).length
      if (failed > 0) {
        setError(`${failed} producto${failed === 1 ? "" : "s"} no se pudieron actualizar`)
      }
      setBulkUnitOpen(false)
      setSelected(new Set())
    } catch {
      setError("Error al asignar la unidad en lote")
    } finally {
      setBulkSaving(false)
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
      // Estado previo para el Deshacer (la selección puede estar en otra página).
      const prevRes = await fetch(`/api/admin/products/list?ids=${ids.join(",")}`)
      const prevData = await prevRes.json().catch(() => ({}))
      const prevCategories = new Map<number, number | null>(
        (prevData.rows ?? []).map((r: Product) => [r.id, r.category_id])
      )
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
      if (succeededIds.length > 0) {
        setToast(`Categoría actualizada en ${succeededIds.length} producto${succeededIds.length === 1 ? "" : "s"}`)
        setUndoAction({
          message: `Categoría actualizada en ${succeededIds.length} producto${
            succeededIds.length === 1 ? "" : "s"
          }.`,
          run: async () => {
            await Promise.all(
              succeededIds.map(async (productId) => {
                const res = await fetch("/api/admin/products/update", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    productId,
                    category_id: prevCategories.get(productId) ?? null,
                  }),
                })
                return res.ok
              })
            )
            setProducts((prev) =>
              prev.map((p) =>
                succeededIds.includes(p.id)
                  ? { ...p, category_id: prevCategories.get(p.id) ?? null }
                  : p
              )
            )
          },
        })
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
      if (succeededIds.length > 0) {
        setToast(`Precios ajustados en ${succeededIds.length} producto${succeededIds.length === 1 ? "" : "s"}`)
        setUndoAction({
          message: `Precios ajustados en ${succeededIds.length} producto${
            succeededIds.length === 1 ? "" : "s"
          }.`,
          run: async () => {
            await Promise.all(
              succeededIds.map(async (productId) => {
                const prev = current.get(productId)
                if (!prev) return false
                const res = await fetch("/api/admin/products/update", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    productId,
                    price: prev.price,
                    sale_price: prev.sale_price,
                  }),
                })
                return res.ok
              })
            )
            setProducts((prevList) =>
              prevList.map((p) => {
                const old = succeededIds.includes(p.id) ? current.get(p.id) : undefined
                return old ? { ...p, price: old.price, sale_price: old.sale_price } : p
              })
            )
          },
        })
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
      setToast("Cambio guardado")
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
          <button
            type="button"
            onClick={openActivity}
            title="Últimas acciones sobre el catálogo"
            className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700"
          >
            <Activity className="w-4 h-4" />
            Actividad
          </button>
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
            onClick={() => setReportOpen(true)}
            title="Ventas por producto en un rango de fechas (CSV)"
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors text-sm"
          >
            <Activity className="w-4 h-4" />
            Reporte ventas
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
        <div
          role="alert"
          className="mb-4 px-4 py-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200"
        >
          {error}
        </div>
      )}

      {/* Aviso de esquema degradado: migraciones 00096-00099 sin aplicar */}
      {schemaDrift && (
        <div
          role="status"
          className="mb-4 flex items-center gap-2 px-4 py-3 bg-amber-50 text-amber-800 text-sm rounded-xl border border-amber-200"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Faltan migraciones por aplicar en Supabase (00096–00104). El panel funciona en modo
            limitado (sin papelera, publicación programada ni nota interna) hasta aplicarlas con{" "}
            <code className="font-mono text-xs">npx supabase db push</code>.
          </span>
        </div>
      )}

      {/* Toast de éxito (fijo, expira solo) */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-green-600 text-white text-sm font-semibold rounded-xl shadow-lg"
        >
          <CheckCircle2 className="w-4 h-4" />
          {toast}
        </div>
      )}

      {/* Deshacer de la última acción en lote */}
      {undoAction && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center gap-3 px-4 py-3 bg-brand-50 text-brand-900 text-sm rounded-xl border border-brand-200"
        >
          <span>{undoAction.message}</span>
          <button
            type="button"
            onClick={runUndo}
            disabled={bulkSaving}
            className="flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline disabled:opacity-50"
          >
            <Undo2 className="w-4 h-4" />
            Deshacer
          </button>
          <button
            type="button"
            onClick={() => setUndoAction(null)}
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
            ref={searchRef}
            type="text"
            placeholder="Buscar producto o categoría... ( / )"
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
        <select
          value={cityFilter}
          onChange={(e) => updateFilters(() => setCityFilter(e.target.value))}
          className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 bg-white focus:outline-none focus:border-brand-500"
          aria-label="Filtrar por ciudad disponible"
        >
          <option value="all">Todas las ciudades</option>
          {cities.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>
        {brands.length > 0 && (
          <select
            value={brandFilter}
            onChange={(e) => updateFilters(() => setBrandFilter(e.target.value))}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 bg-white focus:outline-none focus:border-brand-500"
            aria-label="Filtrar por marca"
          >
            <option value="all">Todas las marcas</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Salud del catálogo: problemas detectados; cada chip aplica su filtro */}
      {counts.noImage + counts.noCities + counts.noPrice + counts.noCategory + counts.waMismatch + counts.dupNames > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <HeartPulse className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-sm font-semibold text-amber-800">Salud del catálogo:</span>
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
        <button
          type="button"
          onClick={() => updateFilters(() => setOnlyNoPrice((v) => !v))}
          aria-pressed={onlyNoPrice}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            onlyNoPrice
              ? "bg-amber-600 text-white"
              : "bg-white border border-amber-200 text-amber-700 hover:bg-amber-50"
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          Sin precio
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              onlyNoPrice ? "bg-white/20 text-white" : "bg-amber-50 text-amber-600"
            }`}
          >
            {counts.noPrice}
          </span>
        </button>
        <button
          type="button"
          onClick={() => updateFilters(() => setOnlyNoCategory((v) => !v))}
          aria-pressed={onlyNoCategory}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            onlyNoCategory
              ? "bg-amber-600 text-white"
              : "bg-white border border-amber-200 text-amber-700 hover:bg-amber-50"
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          Sin categoría
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              onlyNoCategory ? "bg-white/20 text-white" : "bg-amber-50 text-amber-600"
            }`}
          >
            {counts.noCategory}
          </span>
        </button>
        <button
          type="button"
          onClick={() => updateFilters(() => setOnlyWaMismatch((v) => !v))}
          aria-pressed={onlyWaMismatch}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            onlyWaMismatch
              ? "bg-red-600 text-white"
              : "bg-white border border-red-200 text-red-700 hover:bg-red-50"
          }`}
          title="Activos en el catálogo de WhatsApp pero despublicados en tienda"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          WA sin publicar
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              onlyWaMismatch ? "bg-white/20 text-white" : "bg-red-50 text-red-600"
            }`}
          >
            {counts.waMismatch}
          </span>
        </button>
        <button
          type="button"
          onClick={() => updateFilters(() => setOnlyDupNames((v) => !v))}
          aria-pressed={onlyDupNames}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            onlyDupNames
              ? "bg-amber-600 text-white"
              : "bg-white border border-amber-200 text-amber-700 hover:bg-amber-50"
          }`}
          title="Productos que comparten el mismo nombre"
        >
          <Copy className="w-3.5 h-3.5" />
          Nombres duplicados
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              onlyDupNames ? "bg-white/20 text-white" : "bg-amber-50 text-amber-600"
            }`}
          >
            {counts.dupNames}
          </span>
        </button>
          </div>
        </div>
      )}

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
          onClick={() => updateFilters(() => setOnlyOnSale((v) => !v))}
          aria-pressed={onlyOnSale}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            onlyOnSale
              ? "bg-green-600 text-white"
              : "bg-white border border-green-200 text-green-700 hover:bg-green-50"
          }`}
          title="Productos con precio de oferta"
        >
          <Percent className="w-3.5 h-3.5" />
          En oferta
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              onlyOnSale ? "bg-white/20 text-white" : "bg-green-50 text-green-600"
            }`}
          >
            {counts.onSale}
          </span>
        </button>
        <button
          type="button"
          onClick={() => updateFilters(() => setOnlyTrash((v) => !v))}
          aria-pressed={onlyTrash}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            onlyTrash
              ? "bg-gray-700 text-white"
              : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
          title="Productos eliminados (soft delete, restaurables)"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Papelera
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              onlyTrash ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
            }`}
          >
            {counts.trash}
          </span>
        </button>
        {/* Vistas guardadas de filtros */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setViewsOpen((v) => !v)}
            aria-expanded={viewsOpen}
            title="Vistas guardadas de filtros"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Bookmark className="w-3.5 h-3.5" />
            Vistas
          </button>
          {viewsOpen && (
            <div className="absolute z-30 mt-1 w-56 rounded-xl border border-gray-200 bg-white shadow-lg p-2">
              <button
                type="button"
                onClick={() => {
                  setViewsOpen(false)
                  saveCurrentView()
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-brand-600 hover:bg-brand-50"
              >
                ＋ Guardar vista actual
              </button>
              {savedViews.length === 0 ? (
                <p className="px-3 py-2 text-[11px] text-gray-400">Sin vistas guardadas.</p>
              ) : (
                <ul className="mt-1 divide-y divide-gray-50">
                  {savedViews.map((v) => (
                    <li key={v.name} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => applyView(v)}
                        className="flex-1 text-left px-3 py-2 rounded-lg text-xs text-gray-700 hover:bg-gray-50 truncate"
                        title={`Aplicar vista ${v.name}`}
                      >
                        {v.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => persistViews(savedViews.filter((s) => s.name !== v.name))}
                        aria-label={`Borrar vista ${v.name}`}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        {/* Toggle tabla/grid */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setView("table")}
            aria-pressed={view === "table"}
            title="Vista de tabla"
            className={`p-1.5 rounded-md transition-colors ${
              view === "table" ? "bg-brand-600 text-white" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
            title="Vista de tarjetas"
            className={`p-1.5 rounded-md transition-colors ${
              view === "grid" ? "bg-brand-600 text-white" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
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
              onClick={() => setBulkUnitOpen(true)}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 text-xs font-semibold hover:bg-teal-100 disabled:opacity-50"
              title="Asignar unidad (kg, pieza…) a la selección"
            >
              <Package className="w-3.5 h-3.5" />
              Unidad…
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
              onClick={() => setBulkSaleOpen(true)}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-50 text-pink-700 border border-pink-200 text-xs font-semibold hover:bg-pink-100 disabled:opacity-50"
              title="Aplicar o quitar ofertas en la selección"
            >
              <Tag className="w-3.5 h-3.5" />
              Oferta…
            </button>
            <button
              onClick={() => setBulkMarginOpen(true)}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-50 text-lime-700 border border-lime-200 text-xs font-semibold hover:bg-lime-100 disabled:opacity-50"
              title="Oferta calculada para conservar un margen mínimo (requiere costo)"
            >
              <Percent className="w-3.5 h-3.5" />
              Margen…
            </button>
            <button
              onClick={() => bulkSetWhatsApp(true)}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50"
              title="Mostrar la selección en el catálogo de WhatsApp"
            >
              <Eye className="w-3.5 h-3.5" />
              WA sí
            </button>
            <button
              onClick={() => bulkSetWhatsApp(false)}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50"
              title="Ocultar la selección del catálogo de WhatsApp"
            >
              <EyeOff className="w-3.5 h-3.5" />
              WA no
            </button>
            <button
              onClick={copySelection}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold hover:bg-indigo-100 disabled:opacity-50"
              title="Copiar la selección como lista Nombre — $precio"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Copiar
            </button>
            <button
              onClick={bulkGenerateImages}
              disabled={bulkAiBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-xs font-semibold hover:bg-purple-100 disabled:opacity-50"
              title="Generar imagen con IA para los seleccionados sin imagen (máx 10)"
            >
              {bulkAiBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Imágenes IA
            </button>
            {selected.size === 2 && (
              <button
                onClick={mergeSelected}
                disabled={bulkSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 text-xs font-semibold hover:bg-fuchsia-100 disabled:opacity-50"
                title="Fusionar: conserva el de menor id, el otro va a la papelera"
              >
                <Copy className="w-3.5 h-3.5" />
                Fusionar
              </button>
            )}
            <button
              onClick={bulkDuplicate}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 text-xs font-semibold hover:bg-sky-100 disabled:opacity-50"
              title="Duplicar la selección (las copias nacen despublicadas)"
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicar
            </button>
            <button
              onClick={bulkDelete}
              disabled={bulkSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-semibold hover:bg-red-100 disabled:opacity-50"
              title="Eliminar la selección (los que tengan pedidos se omiten)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar
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

      {/* Products: tabla o grid */}
      {view === "table" ? (
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
                <th className="px-5 py-3" title="(precio de venta − costo) / precio de venta">
                  Margen
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
                <th className="px-5 py-3" title="Unidades vendidas (histórico)">
                  Ventas
                </th>
                <th className="px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.map((product) => {
                const global = isGlobal(product.id)
                const cityCount = citiesAvailableCount(product.id)
                const edit = lastEdit[product.id]
                const soldAmount = salesAmount[product.id] ?? 0
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
                        onChange={(e) => toggleSelect(product.id, (e.nativeEvent as MouseEvent).shiftKey ?? false)}
                        aria-label={`Seleccionar ${product.name}`}
                        className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            product.image_url
                              ? setLightbox({
                                  id: product.id,
                                  url: product.image_url,
                                  name: product.name,
                                })
                              : startImageUpload(product.id)
                          }
                          disabled={uploadingImageId === product.id}
                          title={product.image_url ? "Ver imagen" : "Subir imagen"}
                          aria-label={product.image_url ? `Ver imagen de ${product.name}` : `Subir imagen para ${product.name}`}
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
                          <p className="font-medium text-gray-900">
                            {product.name}
                            {product.admin_note && (
                              <StickyNote
                                className="inline w-3.5 h-3.5 ml-1.5 text-amber-500 align-text-top"
                                aria-label={`Nota interna: ${product.admin_note}`}
                              />
                            )}
                            {isNewProduct(product) && product.created_at && (
                              <span
                                className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200"
                                title={`Creado el ${new Date(product.created_at).toLocaleDateString("es-MX")}`}
                              >
                                ✨ Nuevo
                              </span>
                            )}
                          </p>
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
                      {(() => {
                        const selling = product.sale_price ?? product.price
                        if (selling == null || selling <= 0 || product.cost == null) {
                          return <span className="text-xs text-gray-300">—</span>
                        }
                        const margin = ((selling - product.cost) / selling) * 100
                        return (
                          <span
                            className={`text-xs font-semibold ${
                              margin >= 30
                                ? "text-green-700"
                                : margin >= 10
                                ? "text-amber-700"
                                : "text-red-700"
                            }`}
                            title={`Costo $${product.cost.toFixed(2)} · venta $${selling.toFixed(2)}`}
                          >
                            {margin.toFixed(0)}%
                          </span>
                        )
                      })()}
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
                      {/* Stock numérico (00101): ajuste ±, deriva el status */}
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => adjustQuantity(product, -1)}
                          disabled={saving.has(product.id) || (product.stock_quantity ?? 0) <= 0}
                          aria-label={`Quitar 1 unidad de ${product.name}`}
                          className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-[11px] text-gray-500 min-w-8 text-center" title="Unidades disponibles">
                          ×{product.stock_quantity ?? 0}
                        </span>
                        <button
                          type="button"
                          onClick={() => adjustQuantity(product, 1)}
                          disabled={saving.has(product.id)}
                          aria-label={`Agregar 1 unidad de ${product.name}`}
                          className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => toggleVisibility(product)}
                        disabled={saving.has(product.id)}
                        title="Clic para publicar/despublicar en tienda"
                        aria-label={`${product.is_visible ? "Despublicar" : "Publicar"} ${product.name}`}
                        className="inline-flex items-center gap-2 disabled:opacity-50 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
                      {(product.publish_at || product.unpublish_at) && (
                        <p
                          className="mt-1 text-[10px] font-medium text-purple-600"
                          title={
                            product.publish_at
                              ? `Se publicará el ${new Date(product.publish_at).toLocaleString("es-MX")}`
                              : product.unpublish_at
                              ? `Se despublicará el ${new Date(product.unpublish_at).toLocaleString("es-MX")}`
                              : ""
                          }
                        >
                          ⏱ {product.publish_at ? "Publicación" : "Despublicación"} programada
                        </p>
                      )}
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
                      <span
                        className={`text-xs font-semibold ${
                          (sales[product.id] ?? 0) > 0 ? "text-gray-900" : "text-gray-300"
                        }`}
                      >
                        {sales[product.id] ?? 0}
                      </span>
                      {soldAmount > 0 && (
                        <p className="text-[10px] text-gray-400">
                          ${soldAmount.toFixed(2)}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveProduct(product, "up")}
                          disabled={reorderingId === product.id}
                          title="Subir en el orden del catálogo"
                          aria-label={`Subir ${product.name} en el orden`}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50"
                        >
                          {reorderingId === product.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <ChevronUp className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => moveProduct(product, "down")}
                          disabled={reorderingId === product.id}
                          title="Bajar en el orden del catálogo"
                          aria-label={`Bajar ${product.name} en el orden`}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
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
                        <button
                          type="button"
                          onClick={() => openHistory(product)}
                          title={`Historial de cambios de ${product.name}`}
                          aria-label={`Historial de ${product.name}`}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        {cities[0] && (
                          <Link
                            href={`/${cities[0].slug}/producto/${product.slug}`}
                            target="_blank"
                            title={`Ver ${product.name} en la tienda`}
                            aria-label={`Ver ${product.name} en la tienda`}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        )}
                        {onlyTrash ? (
                          <button
                            type="button"
                            onClick={() => restoreProduct(product)}
                            disabled={deletingId === product.id}
                            title={`Restaurar ${product.name} (queda despublicado)`}
                            aria-label={`Restaurar ${product.name}`}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                          >
                            {deletingId === product.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RotateCcw className="w-4 h-4" />
                            )}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => pauseProduct(product)}
                              disabled={saving.has(product.id)}
                              title={`Pausar ${product.name} y republicar en N días`}
                              aria-label={`Pausar ${product.name}`}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors disabled:opacity-50"
                            >
                              <span className="text-sm leading-none">⏸</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadQr(product)}
                              title={`Descargar QR de ${product.name}`}
                              aria-label={`Descargar QR de ${product.name}`}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                              <QrCode className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openStorePrices(product)}
                              title={`Precios por tienda de ${product.name}`}
                              aria-label={`Precios por tienda de ${product.name}`}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                            >
                              <Store className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteProduct(product)}
                              disabled={deletingId === product.id}
                              title={`Eliminar ${product.name}`}
                              aria-label={`Eliminar ${product.name}`}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                              {deletingId === product.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </>
                        )}
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
      </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          {total === 0 && !refreshing ? (
            <div className="px-5 py-12 text-center text-gray-400 text-sm">
              No se encontraron productos
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {pageItems.map((product) => (
                <div
                  key={product.id}
                  className={`relative rounded-xl border transition-colors overflow-hidden ${
                    selected.has(product.id)
                      ? "border-brand-400 ring-2 ring-brand-100"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(product.id)}
                    onChange={(e) => toggleSelect(product.id, (e.nativeEvent as MouseEvent).shiftKey ?? false)}
                    aria-label={`Seleccionar ${product.name}`}
                    className="absolute top-2 left-2 z-10 w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      product.image_url
                        ? setLightbox({ id: product.id, url: product.image_url, name: product.name })
                        : startImageUpload(product.id)
                    }
                    title={product.image_url ? "Ver imagen" : "Subir imagen"}
                    className="w-full aspect-square bg-gray-50 flex items-center justify-center overflow-hidden"
                  >
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- thumb admin, URL dinámica de Storage
                      <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImagePlus className="w-6 h-6 text-gray-300" />
                    )}
                  </button>
                  <div className="p-3">
                    <p className="text-sm font-medium text-gray-900 truncate" title={product.name}>
                      {product.name}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{product.brand ?? "—"}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-900">
                        ${Number(product.sale_price ?? product.price ?? 0).toFixed(2)}
                        {product.unit ? (
                          <span className="text-xs font-normal text-gray-400">/{product.unit}</span>
                        ) : null}
                      </span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                          product.stock_status === "in_stock"
                            ? "bg-green-50 text-green-700"
                            : product.stock_status === "low_stock"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {STOCK_LABELS[product.stock_status]}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <button
                        onClick={() => toggleVisibility(product)}
                        disabled={saving.has(product.id)}
                        title="Clic para publicar/despublicar en tienda"
                        className="disabled:opacity-50"
                      >
                        <span
                          className={`relative inline-block w-8 h-4.5 rounded-full transition-colors ${
                            product.is_visible ? "bg-green-500" : "bg-gray-300"
                          }`}
                          style={{ height: "1.125rem" }}
                        >
                          <span
                            className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${
                              product.is_visible ? "translate-x-3.5" : "translate-x-0.5"
                            }`}
                          />
                        </span>
                      </button>
                      <div className="flex items-center gap-0.5">
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
                        <button
                          type="button"
                          onClick={() => openHistory(product)}
                          title={`Historial de ${product.name}`}
                          aria-label={`Historial de ${product.name}`}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        {cities[0] && (
                          <Link
                            href={`/${cities[0].slug}/producto/${product.slug}`}
                            target="_blank"
                            title={`Ver ${product.name} en la tienda`}
                            aria-label={`Ver ${product.name} en la tienda`}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        )}
                        {onlyTrash ? (
                          <button
                            type="button"
                            onClick={() => restoreProduct(product)}
                            disabled={deletingId === product.id}
                            title={`Restaurar ${product.name}`}
                            aria-label={`Restaurar ${product.name}`}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                          >
                            {deletingId === product.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RotateCcw className="w-4 h-4" />
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => deleteProduct(product)}
                            disabled={deletingId === product.id}
                            title={`Eliminar ${product.name}`}
                            aria-label={`Eliminar ${product.name}`}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            {deletingId === product.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fase 5 — paginación (compartida por ambas vistas) */}
      {total > pageSize && (
        <div className="mt-3 flex items-center justify-between px-5 py-3 bg-white rounded-xl border border-gray-200">
            <p className="text-xs text-gray-400">
              Mostrando {(currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, total)} de {total}
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
              <select
                value={pageSize}
                onChange={(e) => updateFilters(() => setPageSize(Number(e.target.value)))}
                aria-label="Productos por página"
                className="ml-2 px-2 py-1 border border-gray-200 rounded-lg text-xs text-gray-600 bg-white focus:outline-none focus:border-brand-500"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} / página
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

      {/* Input oculto para subir imagen de producto */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => void handleImageFile(e.target.files?.[0])}
      />

      {/* Lightbox: vista previa grande de la imagen */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900 truncate">{lightbox.name}</h2>
              <button
                onClick={() => setLightbox(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- preview admin, URL dinámica de Storage */}
            <img
              src={lightbox.url}
              alt={lightbox.name}
              className="w-full max-h-[60vh] object-contain bg-gray-50"
            />
            <div className="flex justify-end px-5 py-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  startImageUpload(lightbox.id)
                  setLightbox(null)
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
              >
                <ImagePlus className="w-4 h-4" />
                Cambiar imagen
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Modal: ofertas en lote (descuento % sobre precio base) */}
      {bulkSaleOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !bulkSaving && setBulkSaleOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Ofertas en lote</h2>
              <button
                onClick={() => setBulkSaleOpen(false)}
                disabled={bulkSaving}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-500">
                Se aplicará a {selected.size} producto{selected.size === 1 ? "" : "s"} (los que
                no tengan precio base se omiten).
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBulkSaleMode("apply")}
                  aria-pressed={bulkSaleMode === "apply"}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    bulkSaleMode === "apply"
                      ? "bg-pink-600 text-white"
                      : "bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100"
                  }`}
                >
                  Aplicar descuento
                </button>
                <button
                  type="button"
                  onClick={() => setBulkSaleMode("remove")}
                  aria-pressed={bulkSaleMode === "remove"}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    bulkSaleMode === "remove"
                      ? "bg-gray-700 text-white"
                      : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  Quitar ofertas
                </button>
              </div>
              {bulkSaleMode === "apply" && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="99"
                    step="0.5"
                    value={bulkSalePct}
                    onChange={(e) => setBulkSalePct(e.target.value)}
                    className="w-24 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500"
                    aria-label="Porcentaje de descuento"
                  />
                  <span className="text-sm text-gray-500">% de descuento</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setBulkSaleOpen(false)}
                disabled={bulkSaving}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={bulkSale}
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

      {/* Drawer: actividad reciente del catálogo */}
      {activityOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setActivityOpen(false)}>
          <div
            className="w-full max-w-sm h-full bg-white shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">Actividad reciente</h2>
                <p className="text-xs text-gray-500">Últimas 30 acciones sobre el catálogo</p>
              </div>
              <button
                onClick={() => setActivityOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {activityLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Cargando…
                </div>
              ) : activityEntries.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Sin actividad registrada.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {activityEntries.map((entry, i) => {
                    const productName =
                      (entry.detail?.name as string | undefined) ??
                      products.find((p) => String(p.id) === entry.entity_id)?.name ??
                      (entry.entity_id ? `#${entry.entity_id}` : "catálogo")
                    return (
                      <li key={i} className="py-2.5">
                        <p className="text-sm font-medium text-gray-900">
                          {AUDIT_ACTION_LABEL[entry.action as AuditAction] ?? entry.action}
                          <span className="font-normal text-gray-500"> · {productName}</span>
                        </p>
                        <p className="text-xs text-gray-400">
                          {timeAgo(entry.created_at)}
                          {entry.actor_email ? ` · ${entry.actor_email}` : ""}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: reporte de ventas por rango de fechas */}
      {reportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !reportLoading && setReportOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Reporte de ventas</h2>
              <button
                onClick={() => setReportOpen(false)}
                disabled={reportLoading}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-500">
                Unidades y monto por producto (pedidos no cancelados del rango).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="rep-from">
                    Desde
                  </label>
                  <input
                    id="rep-from"
                    type="date"
                    value={reportFrom}
                    onChange={(e) => setReportFrom(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="rep-to">
                    Hasta
                  </label>
                  <input
                    id="rep-to"
                    type="date"
                    value={reportTo}
                    onChange={(e) => setReportTo(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setReportOpen(false)}
                disabled={reportLoading}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={downloadSalesReport}
                disabled={reportLoading || !reportFrom || !reportTo}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
              >
                {reportLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Descargar CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: oferta por margen objetivo */}
      {bulkMarginOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !bulkSaving && setBulkMarginOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Oferta por margen</h2>
              <button
                onClick={() => setBulkMarginOpen(false)}
                disabled={bulkSaving}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-500">
                La oferta se calcula como <code className="font-mono">costo / (1 − margen)</code>{" "}
                en {selected.size} producto{selected.size === 1 ? "" : "s"}. Se omiten los que no
                tienen costo capturado o cuyo precio ya queda por debajo.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  value={bulkMarginPct}
                  onChange={(e) => setBulkMarginPct(e.target.value)}
                  className="w-24 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500"
                  aria-label="Margen mínimo objetivo"
                />
                <span className="text-sm text-gray-500">% de margen mínimo</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setBulkMarginOpen(false)}
                disabled={bulkSaving}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={bulkMarginSale}
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

      {/* Modal: asignar unidad a la selección */}
      {bulkUnitOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !bulkSaving && setBulkUnitOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Asignar unidad</h2>
              <button
                onClick={() => setBulkUnitOpen(false)}
                disabled={bulkSaving}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-gray-500 mb-3">
                Se aplicará a {selected.size} producto{selected.size === 1 ? "" : "s"} (vacío =
                sin unidad).
              </p>
              <input
                value={bulkUnitValue}
                onChange={(e) => setBulkUnitValue(e.target.value)}
                placeholder="kg, pieza, litro…"
                aria-label="Unidad"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setBulkUnitOpen(false)}
                disabled={bulkSaving}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={bulkSetUnit}
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

      {/* Modal: precios por tienda (product_stores) */}
      {storePricesFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !storePricesSaving && setStorePricesFor(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">Precios por tienda</h2>
                <p className="text-xs text-gray-500">
                  {storePricesFor.name} · vacío = usa el precio del catálogo
                </p>
              </div>
              <button
                onClick={() => setStorePricesFor(null)}
                disabled={storePricesSaving}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-3">
              {storePricesLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Cargando…
                </div>
              ) : storeList.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No hay tiendas activas.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {storeList.map((store) => {
                    const row = storePrices[store.id] ?? { price: "", sale: "" }
                    return (
                      <li key={store.id} className="py-2.5 grid grid-cols-[1fr_auto_auto] items-center gap-2">
                        <span className="text-sm text-gray-900">{store.name}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.price}
                          onChange={(e) =>
                            setStorePrices((prev) => ({
                              ...prev,
                              [store.id]: { ...row, price: e.target.value },
                            }))
                          }
                          placeholder="Precio"
                          aria-label={`Precio en ${store.name}`}
                          className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.sale}
                          onChange={(e) =>
                            setStorePrices((prev) => ({
                              ...prev,
                              [store.id]: { ...row, sale: e.target.value },
                            }))
                          }
                          placeholder="Oferta"
                          aria-label={`Precio de oferta en ${store.name}`}
                          className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500"
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setStorePricesFor(null)}
                disabled={storePricesSaving}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveStorePrices}
                disabled={storePricesSaving || storePricesLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
              >
                {storePricesSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: historial de cambios del producto (audit log) */}
      {historyFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setHistoryFor(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">Historial de cambios</h2>
                <p className="text-xs text-gray-500">{historyFor.name}</p>
              </div>
              <button
                onClick={() => setHistoryFor(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Sparkline de precio: puntos de los cambios registrados en la bitácora */}
            {(() => {
              const pts = historyEntries
                .filter((e) => typeof e.detail?.price === "number")
                .map((e) => ({ at: e.created_at, price: Number(e.detail.price) }))
                .reverse()
              if (pts.length < 2) return null
              const min = Math.min(...pts.map((p) => p.price))
              const max = Math.max(...pts.map((p) => p.price))
              const range = max - min || 1
              const W = 220
              const H = 40
              const coords = pts
                .map(
                  (p, i) =>
                    `${(i / (pts.length - 1)) * W},${H - ((p.price - min) / range) * (H - 4) - 2}`
                )
                .join(" ")
              return (
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-500 mb-1">
                    Historial de precio (${min.toFixed(2)} – ${max.toFixed(2)})
                  </p>
                  <svg
                    width={W}
                    height={H}
                    role="img"
                    aria-label={`Evolución del precio entre ${min.toFixed(2)} y ${max.toFixed(2)}`}
                  >
                    <polyline points={coords} fill="none" stroke="#7c3aed" strokeWidth="2" />
                  </svg>
                </div>
              )
            })()}
            <div className="overflow-y-auto px-5 py-3">
              {historyLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Cargando…
                </div>
              ) : historyEntries.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  Sin cambios registrados.
                </p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {historyEntries.map((entry, i) => (
                    <li key={i} className="py-2.5">
                      <p className="text-sm font-medium text-gray-900">
                        {AUDIT_ACTION_LABEL[entry.action as AuditAction] ?? entry.action}
                      </p>
                      <p className="text-xs text-gray-400">
                        {timeAgo(entry.created_at)}
                        {entry.actor_email ? ` · ${entry.actor_email}` : ""}
                      </p>
                      {Object.keys(entry.detail ?? {}).length > 0 && (
                        <p className="mt-0.5 text-[10px] font-mono text-gray-400 break-all">
                          {JSON.stringify(entry.detail)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alta / edición completa de producto */}
      {productForm !== null && (
        <ProductFormModal
          categories={categories}
          product={productForm === "new" ? null : productForm}
          onClose={() => setProductForm(null)}
          onSaved={handleFormSaved}
          onCategoryCreated={(cat) =>
            setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name, "es")))
          }
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
