"use client"

import { Suspense, useMemo, useState, useEffect, useRef, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import type { RowMetaSource } from "@/lib/admin-product-row-meta"
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
  ChevronsLeft,
  ChevronsRight,
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
  Clock,
  QrCode,
  Pause,
  Sparkles,
  Store,
  ImageOff,
  Link2,
  ScanSearch,
  MoreHorizontal,
  SlidersHorizontal,
} from "lucide-react"
import { AUDIT_ACTION_LABEL, type AuditAction } from "@/lib/audit-log"
import { auditDiffRows, auditExtraFields, priceSeries } from "@/lib/audit-diff"
import { resolveSalePrice, saleState } from "@/lib/sale-window"
import { TRASH_RETENTION_DAYS, purgeLabel } from "@/lib/trash"
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, seoBatchSummary } from "@/lib/seo-batch"
import {
  bulkPatch,
  bulkPatchEach,
  runPerId,
  type BulkResult,
} from "@/lib/admin-product-bulk-run"
import type { BulkFailure } from "@/lib/product-bulk"
import {
  activeProductFilterCount,
  clearedProductFilters,
  parseProductFilters,
  productFilterApiParams,
  productFiltersToSearchParams,
  type ProductFilters,
  type PublicationFilter,
  type StockStatus,
} from "@/lib/admin-product-filters"
import {
  IDS_PER_REQUEST,
  buildMap,
  chunkIds,
  isNewProduct,
  productCount,
  timeAgo,
  type AvailabilityMap,
  type AvailabilityRow,
} from "@/lib/admin-product-list"
import { useProductSelection } from "./use-product-selection"
import { useBulkRunner } from "./use-bulk-runner"
import {
  DEFAULT_PRODUCT_SORT,
  PRODUCT_SORT_KEYS,
  PRODUCT_SORT_LABEL,
  ariaSortFor,
  defaultProductSortDir,
  nextProductSort,
  parseProductSort,
  productSortDirLabel,
  productSortSearchParams,
  type ProductSort,
  type ProductSortKey,
} from "@/lib/admin-product-sort"
import { type SalesReportInsights } from "@/lib/sales-report"
import { deriveStockStatus } from "@/lib/stock"
import { createClient } from "@/lib/supabase/client"
import { cropImageToSquare } from "@/lib/crop-image"
import { getCategoryIcon } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog"
import {
  MOBILE_VIEW_MEDIA_QUERY,
  resolveProductsView,
  type ProductsView,
} from "@/lib/admin-products-view"
import { downloadCsv, toCsv } from "@/lib/csv"
import { PRODUCT_CSV_HEADER, productCsvCells } from "@/lib/product-csv"
import { conflictFromResponse } from "@/lib/product-conflict"
import {
  describeProductPreset,
  isActiveProductPreset,
  makeProductPreset,
  MAX_PRODUCT_PRESETS,
  parseLegacyProductPresets,
  parseProductPresets,
  productPresetFilterCount,
  PRODUCT_PRESETS_LEGACY_KEY,
  PRODUCT_PRESETS_STORAGE_KEY,
  removeProductPreset,
  serializeProductPresets,
  upsertProductPreset,
  type ProductPreset,
} from "@/lib/product-filter-presets"

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
  sale_starts_at: string | null
  sale_ends_at: string | null
  cost: number | null
  stock_quantity: number | null
  low_stock_threshold: number | null
  sku: string | null
  barcode: string | null
  tags: string[] | null
  related_product_ids: number[] | null
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
  /** Versión de la fila (B19). La envía cada escritura y la devuelve el
   *  listado; el panel la manda como precondición para no pisar cambios
   *  ajenos. Opcional para no romper la asignabilidad con otros tipos. */
  updated_at?: string | null
  /** Solo presente en la papelera (00099). Opcional para no romper la
   *  asignabilidad con `ProductFormProduct` del modal. */
  deleted_at?: string | null
}

interface Category {
  id: number
  name: string
  slug: string
  icon: string | null
}

/** R7-10 — propuesta de SEO editable en el preview del lote. */
interface SeoDraft {
  id: number
  name: string
  seo_title: string
  seo_description: string
}

/** R7-10 — producto omitido o sin respuesta de la IA. */
interface SeoNote {
  id: number
  name: string
  reason: string
}

interface City {
  id: number
  name: string
  slug: string
  state: string
}

const STOCK_LABELS: Record<StockStatus, string> = {
  in_stock: "En stock",
  low_stock: "Stock bajo",
  out_of_stock: "Agotado",
}

/** Fase 5 — paginación del catálogo (424+ productos).
 *  Sin virtualización: cada fila es DOM real, así que 200 es el techo que
 *  mantiene el render fluido en móvil (el endpoint admite más, la UI no). */
const DEFAULT_PAGE_SIZE = 50
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200]

/** Columnas decorativas de `row-meta`, para nombrar lo que degradó. */
const META_SOURCE_LABELS: Record<RowMetaSource, string> = {
  queue: "los pendientes de WhatsApp",
  audit: "la última edición",
  sales: "las ventas",
}

const STOCK_FILTERS: { label: string; value: StockStatus | "all" }[] = [
  { label: "Todo el stock", value: "all" },
  { label: "En stock", value: "in_stock" },
  { label: "Stock bajo", value: "low_stock" },
  { label: "Agotados", value: "out_of_stock" },
]

/**
 * Valor previo de un campo para los ids dados. La selección puede abarcar
 * otras páginas, así que el estado anterior se pide al servidor.
 *
 * Devuelve `null` si no se pudo leer completo: sin estado previo fiable no se
 * ofrece Deshacer, en vez de restaurar valores inventados.
 */
async function fetchPreviousField<K extends keyof Product>(
  ids: number[],
  field: K
): Promise<Map<number, Product[K]> | null> {
  const previous = new Map<number, Product[K]>()
  for (const chunk of chunkIds(ids)) {
    const res = await fetch(`/api/admin/products/list?ids=${chunk.join(",")}`)
    if (!res.ok) return null
    const data = await res.json().catch(() => ({}))
    for (const row of (data.rows ?? []) as Product[]) previous.set(row.id, row[field])
  }
  return ids.every((id) => previous.has(id)) ? previous : null
}

/**
 * Productos completos de los ids dados, por bloques. Se usa cuando la acción
 * necesita valores frescos del servidor (p. ej. ajustar precios en %): leerlos
 * de una sola vez truncaría la selección al tope del endpoint.
 *
 * `null` si algún bloque falla: el llamador aborta en vez de operar a medias.
 */
async function fetchProductsByIds(ids: number[]): Promise<Product[] | null> {
  const rows: Product[] = []
  for (const chunk of chunkIds(ids)) {
    const res = await fetch(`/api/admin/products/list?ids=${chunk.join(",")}`)
    if (!res.ok) return null
    const data = await res.json().catch(() => ({}))
    rows.push(...((data.rows ?? []) as Product[]))
  }
  return rows
}

/**
 * Celdas de disponibilidad actuales de los ids, tal cual las devuelve el
 * servidor. Es el estado que reproduce el "Deshacer" de las acciones por
 * ciudad (la ausencia de filas significa "global").
 *
 * Se pide por bloques porque el endpoint acota la consulta: sin trocear, una
 * selección grande devolvía solo las primeras celdas y el resto se leía como
 * "global", que es justo lo contrario de lo que hay. `null` si algún bloque
 * falla o el servidor marca la respuesta como truncada.
 */
async function fetchAvailabilityRows(ids: number[]): Promise<AvailabilityRow[] | null> {
  const rows: AvailabilityRow[] = []
  for (const chunk of chunkIds(ids)) {
    const res = await fetch(
      `/api/admin/products/city-availability?ids=${encodeURIComponent(chunk.join(","))}`
    )
    if (!res.ok) return null
    const data = await res.json().catch(() => ({}))
    if (data.truncated) return null
    rows.push(...((data.rows ?? []) as AvailabilityRow[]))
  }
  return rows
}

/**
 * Envuelve un bloque para que en móvil se pueda plegar y en escritorio se
 * muestre siempre. Un solo árbol de render (el mismo nodo se oculta con
 * `hidden`), así que no hay desajuste de hidratación.
 */
function MobileCollapsible({
  id,
  label,
  badge,
  icon,
  open,
  onToggle,
  children,
}: {
  id: string
  label: string
  badge?: number
  icon?: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="mb-3 sm:mb-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="touch-target mb-1.5 flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 sm:hidden"
      >
        {icon ?? <SlidersHorizontal className="w-4 h-4 text-gray-400" />}
        <span className="flex-1 text-left">
          {label}
          {badge !== undefined && badge > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
              {badge}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      <div id={id} className={open ? "block" : "hidden sm:block"}>
        {children}
      </div>
    </div>
  )
}

export default function AdminProductsPage() {
  return (
    <Suspense fallback={<ProductsSkeleton />}>
      <AdminProductsContent />
    </Suspense>
  )
}

import { RestockPanel } from "../components/RestockPanel"
import { ImportProductsModal } from "../components/ImportProductsModal"
import { ProductFormModal } from "../components/ProductFormModal"
import { ProductsSkeleton } from "../components/ProductsSkeleton"
import { RowActionMenu, type RowActionItem } from "../components/RowActionMenu"
import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"

function AdminProductsContent() {
  // Lazy browser-only client: creating it during SSR would throw when
  // NEXT_PUBLIC_SUPABASE_URL is a placeholder/unset.
  const [supabase] = useState(() => (typeof window === "undefined" ? null : createClient()))

  // Sustituye `window.confirm` / `window.prompt`: diálogo con foco atrapado,
  // Escape, `aria-modal` y restauración del foco. `confirmDialog` se monta una
  // sola vez al final del árbol.
  const { confirm, prompt, dialog: confirmDialog } = useConfirmDialog()

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [cities, setCities] = useState<City[]>([])
  /** Disponibilidad por ciudad SOLO de las filas visibles (la sirve el
   *  listado): clave ausente = "Global". Antes se descargaba la tabla
   *  `product_city_availability` completa en el navegador. */
  const [availability, setAvailability] = useState<Record<number, number>>({})
  /** Disponibilidad de los ids seleccionados, cargada al abrir el modal de
   *  ciudades (la selección puede abarcar todas las páginas). */
  const [modalAvailability, setModalAvailability] = useState<AvailabilityMap>(new Map())
  const [cityModalLoading, setCityModalLoading] = useState(false)
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
  // Parseo único de los filtros de la URL (`@/lib/admin-product-filters`): el
  // mismo módulo serializa la URL, construye la query de la API y cuenta los
  // filtros activos, así que un filtro nuevo no se puede olvidar en un lado.
  const initialFilters = parseProductFilters(searchParams)
  const [search, setSearch] = useState(initialFilters.search)
  const [debouncedSearch, setDebouncedSearch] = useState(initialFilters.search)

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
      const shouldCrop = await confirm({
        title: "¿Recortar la imagen a cuadrado (1:1)?",
        message: "Se recorta el encuadre para que la ficha no se deforme.",
        confirmLabel: "Recortar",
        cancelLabel: "Usar original",
      })
      if (shouldCrop) {
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
        body: JSON.stringify({
          productId,
          expectedUpdatedAt: products.find((p) => p.id === productId)?.updated_at ?? undefined,
          image_url: upData.url,
        }),
      })
      const data = await res.json()
      if (handleStaleWrite(productId, res, data)) return
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

  // Selección múltiple y asignación de ciudades (bulk). El estado de la
  // selección y el de la ejecución en lote viven en sus hooks (abajo, cuando ya
  // se conocen la página y el total); aquí queda solo el modal de ciudades.
  const [cityModalOpen, setCityModalOpen] = useState(false)
  const [draftCities, setDraftCities] = useState<Set<number>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  // Scroll interno de la tabla (vista tabla). Se vuelve al principio al cambiar
  // de página o de filtros para no aterrizar a mitad del listado.
  const tableScrollRef = useRef<HTMLDivElement>(null)
  // Fila sticky de categorías: su alto se publica en `--admin-catbar-h` para
  // que la barra de acciones masivas se ancle justo debajo y no la tape.
  const categoryBarRef = useRef<HTMLDivElement>(null)
  // Fase 16 — importación masiva vía CSV
  const [importOpen, setImportOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  /** B19 — aviso de conflicto de versión (409) con botón para recargar. */
  const [staleNotice, setStaleNotice] = useState<{ message: string } | null>(null)
  // Alta/edición completa de producto y duplicado.
  const [productForm, setProductForm] = useState<"new" | Product | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [purging, setPurging] = useState(false)
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
  const [bulkSaleStart, setBulkSaleStart] = useState("")
  const [bulkSaleEnd, setBulkSaleEnd] = useState("")
  const [bulkTagOpen, setBulkTagOpen] = useState(false)
  const [bulkTagValue, setBulkTagValue] = useState("")
  const [bulkTagMode, setBulkTagMode] = useState<"add" | "remove">("add")
  // Unidad en lote.
  const [bulkUnitOpen, setBulkUnitOpen] = useState(false)
  const [bulkUnitValue, setBulkUnitValue] = useState("kg")
  // Oferta por margen objetivo (requiere cost).
  const [bulkMarginOpen, setBulkMarginOpen] = useState(false)
  const [bulkMarginPct, setBulkMarginPct] = useState("25")
  // SEO con IA en lote (R7-10): propuestas editables antes de aplicar.
  const [seoOpen, setSeoOpen] = useState(false)
  const [seoGenerating, setSeoGenerating] = useState(false)
  const [seoApplying, setSeoApplying] = useState(false)
  const [seoOverwrite, setSeoOverwrite] = useState(false)
  const [seoProposals, setSeoProposals] = useState<SeoDraft[]>([])
  const [seoSkipped, setSeoSkipped] = useState<SeoNote[]>([])
  const [seoFailed, setSeoFailed] = useState<SeoNote[]>([])

  // Publica el alto real de la fila sticky de categorías en la var CSS
  // `--admin-catbar-h`, para que la barra de acciones masivas (que comparte el
  // mismo offset sticky) se ancle debajo en vez de solaparse. El default de la
  // var es 0px porque la fila solo se monta cuando hay categorías cargadas; el
  // efecto se re-ejecuta al llegar la primera categoría para medir el nodo.
  useEffect(() => {
    const el = categoryBarRef.current
    if (!el) return
    const root = document.documentElement
    const publish = () => root.style.setProperty("--admin-catbar-h", `${el.offsetHeight}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty("--admin-catbar-h")
    }
  }, [categories.length])

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
        else if (seoOpen && !seoApplying) setSeoOpen(false)
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
  }, [
    lightbox,
    historyFor,
    productForm,
    bulkCategoryOpen,
    bulkPriceOpen,
    cityModalOpen,
    bulkSaving,
    seoOpen,
    seoApplying,
  ])

  // Fase 5 — filtros de categoría/stock (con deep-link ?stock= desde las
  // alertas del dashboard) y paginación.
  const initialSort = parseProductSort(searchParams.get("sort"), searchParams.get("dir"))
  const [categoryFilter, setCategoryFilter] = useState<string>(initialFilters.category)
  const [stockFilter, setStockFilter] = useState<StockStatus | "all">(initialFilters.stock)
  // Chips de estado de publicación + filtros de catálogo incompleto.
  const [statusFilter, setStatusFilter] = useState<PublicationFilter>(initialFilters.status)
  const [onlyNoImage, setOnlyNoImage] = useState(initialFilters.noImage)
  const [onlyNoCities, setOnlyNoCities] = useState(initialFilters.noCities)
  const [onlyNoPrice, setOnlyNoPrice] = useState(initialFilters.noPrice)
  const [onlyNoCategory, setOnlyNoCategory] = useState(initialFilters.noCategory)
  const [onlyWaMismatch, setOnlyWaMismatch] = useState(initialFilters.waMismatch)
  const [onlyOnSale, setOnlyOnSale] = useState(initialFilters.onSale)
  const [onlyDupNames, setOnlyDupNames] = useState(initialFilters.dupNames)
  // Papelera (soft delete, 00099).
  const [onlyTrash, setOnlyTrash] = useState(initialFilters.trash)
  // Ronda 7 — ofertas vencidas y etiqueta (colecciones de la tienda).
  const [onlyStaleSale, setOnlyStaleSale] = useState(initialFilters.staleSale)
  const [onlyUnderThreshold, setOnlyUnderThreshold] = useState(initialFilters.underThreshold)
  const [tagFilter, setTagFilter] = useState(initialFilters.tag)
  const [tagList, setTagList] = useState<{ tag: string; count: number }[]>([])
  // Ronda 7 — imágenes rotas detectadas por el sondeo del servidor. El filtro
  // es local a la página cargada (el sondeo trabaja sobre filas concretas).
  const [imageIssues, setImageIssues] = useState<
    Record<number, { url: string | null; status: number | null; reason: string }>
  >({})
  const [checkingImages, setCheckingImages] = useState(false)
  const [onlyBrokenImage, setOnlyBrokenImage] = useState(initialFilters.brokenImage)
  const [imagesModalOpen, setImagesModalOpen] = useState(false)
  // Estado de los desplegables de móvil: el encabezado no cabe a 375px, así que
  // las acciones secundarias van a un menú "Más" y los bloques de filtros y
  // diagnóstico se colapsan para que el listado quede dentro del primer pantallazo.
  const [moreOpen, setMoreOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  // Filtros por ciudad y marca (server-side).
  const [cityFilter, setCityFilter] = useState(initialFilters.city)
  const [brandFilter, setBrandFilter] = useState(initialFilters.brand)
  const [brands, setBrands] = useState<string[]>([])
  // Vista tabla/grid (también viaja en la URL).
  // La vista efectiva se deriva en render: `useMediaQuery` devuelve `false` en
  // SSR y en el primer render del cliente, así que el HTML prerenderizado
  // (tabla) coincide con la hidratación y luego se ajusta a tarjetas en móvil.
  const viewParam = searchParams.get("view")
  const isMobileViewport = useMediaQuery(MOBILE_VIEW_MEDIA_QUERY)
  const [viewOverride, setView] = useState<ProductsView | null>(null)
  const view = resolveProductsView(viewParam, isMobileViewport, viewOverride)
  // Orden de la tabla (por defecto nombre asc, como la consulta inicial). El
  // parseo lo comparte con la API (`@/lib/admin-product-sort`), así que un
  // `?sort=` desconocido cae al default en ambos lados.
  const [sort, setSort] = useState<ProductSort>(initialSort)
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

  // Vista única de los filtros. El parseo, la serialización a URL, la query de
  // la API y el conteo de filtros activos leen todos de este objeto
  // (`@/lib/admin-product-filters`), así que añadir un filtro no puede dejarlo
  // fuera de uno de los tres sitios.
  const filters = useMemo<ProductFilters>(
    () => ({
      search: debouncedSearch,
      category: categoryFilter,
      stock: stockFilter,
      status: statusFilter,
      tag: tagFilter,
      city: cityFilter,
      brand: brandFilter,
      noImage: onlyNoImage,
      noCities: onlyNoCities,
      noPrice: onlyNoPrice,
      noCategory: onlyNoCategory,
      waMismatch: onlyWaMismatch,
      onSale: onlyOnSale,
      dupNames: onlyDupNames,
      trash: onlyTrash,
      staleSale: onlyStaleSale,
      underThreshold: onlyUnderThreshold,
      brokenImage: onlyBrokenImage,
    }),
    [
      debouncedSearch,
      categoryFilter,
      stockFilter,
      statusFilter,
      tagFilter,
      cityFilter,
      brandFilter,
      onlyNoImage,
      onlyNoCities,
      onlyNoPrice,
      onlyNoCategory,
      onlyWaMismatch,
      onlyOnSale,
      onlyDupNames,
      onlyTrash,
      onlyStaleSale,
      onlyUnderThreshold,
      onlyBrokenImage,
    ]
  )

  // Sincroniza los filtros activos a la URL (sin recargar ni scroll).
  useEffect(() => {
    const sp = new URLSearchParams()
    productFiltersToSearchParams(filters, sp)
    // Solo se persiste una vista elegida (o un `?view=` ya presente): el
    // default de móvil (tarjetas) no contamina la URL.
    if ((viewOverride ?? viewParam) === "grid") sp.set("view", "grid")
    for (const [k, v] of Object.entries(productSortSearchParams(sort))) sp.set(k, v)
    if (page > 1) sp.set("page", String(page))
    if (pageSize !== DEFAULT_PAGE_SIZE) sp.set("pageSize", String(pageSize))
    const qs = sp.toString()
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false })
  }, [filters, viewOverride, viewParam, sort, page, pageSize, router])

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
    staleSale: 0,
    underThreshold: 0,
  })
  const [refreshing, setRefreshing] = useState(false)
  // Conteo de productos por categoría (chips de categoría del listado).
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
  // true cuando la BD aún no tiene las migraciones 00096-00099: el panel
  // degrada (sin papelera, programación ni nota interna) en vez de fallar.
  const [schemaDrift, setSchemaDrift] = useState(false)
  // Metadatos por fila: sync WA pendiente y última edición (audit log).
  const [waPending, setWaPending] = useState<Set<number>>(new Set())
  const [lastEdit, setLastEdit] = useState<Record<number, { at: string; email: string | null }>>({})
  // Unidades vendidas por producto (columna Ventas, display only).
  const [sales, setSales] = useState<Record<number, number>>({})
  const [salesAmount, setSalesAmount] = useState<Record<number, number>>({})
  // Fuentes decorativas de row-meta que no llegaron: el listado se pinta igual,
  // pero se avisa en vez de dejar columnas vacías sin explicación.
  const [metaDegraded, setMetaDegraded] = useState<RowMetaSource[]>([])

  /** Query string compartida por la tabla, select-all y export. */
  const listParams = (extra: Record<string, string>) => {
    const sp = new URLSearchParams({
      ...productFilterApiParams(filters),
      sort: sort.key,
      dir: sort.dir,
      ...extra,
    })
    return sp.toString()
  }

  // Datos estáticos: categorías y ciudades. La disponibilidad por ciudad de las
  // filas visibles llega con el listado (ya no se descarga la tabla completa).
  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    ;(async () => {
      const [catRes, cityRes] = await Promise.all([
        supabase.from("categories").select("id,name,slug,icon").order("name"),
        supabase.from("cities").select("id,name,slug,state").eq("is_active", true).order("name"),
      ])
      if (cancelled) return
      if (catRes.data) setCategories(catRes.data)
      if (cityRes.data) setCities(cityRes.data)
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
        setAvailability(data.availability ?? {})
        if (data.counts) setCounts(data.counts)
        if (data.brands) setBrands(data.brands)
        setCategoryCounts(data.categoryCounts ?? {})
        if (data.tags) setTagList(data.tags)
        setSchemaDrift(data.schemaDrift === true)
        // Metadatos por fila (sync WA + última edición), best-effort.
        const ids = (data.rows ?? []).map((r: Product) => r.id)
        if (ids.length > 0) {
          const metaRes = await fetch(`/api/admin/products/row-meta?ids=${ids.join(",")}`)
          const meta = await metaRes.json().catch(() => ({}))
          if (!cancelled && metaRes.ok) {
            setMetaDegraded((meta.degraded ?? []) as RowMetaSource[])
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
          } else if (!cancelled) {
            // La lectura entera falló: ninguna de las tres columnas decorativas
            // tiene datos, así que se declaran las tres en vez de mentir con
            // ceros. Las filas del listado ya se pintaron.
            setMetaDegraded(["queue", "audit", "sales"])
            setWaPending(new Set())
            setLastEdit({})
            setSales({})
            setSalesAmount({})
          }
        } else if (!cancelled) {
          setMetaDegraded([])
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
  }, [reloadKey, filters, sort, page, pageSize])

  const categoryName = (id: number | null) =>
    categories.find((c) => c.id === id)?.name ?? "Sin categoría"

  const toggleSort = (key: ProductSortKey) => setSort((prev) => nextProductSort(prev, key))

  const sortIcon = (key: ProductSortKey) =>
    sort.key !== key ? (
      <ArrowUpDown className="w-3 h-3 text-gray-300" aria-hidden="true" />
    ) : sort.dir === "asc" ? (
      <ArrowUp className="w-3 h-3 text-brand-600" aria-hidden="true" />
    ) : (
      <ArrowDown className="w-3 h-3 text-brand-600" aria-hidden="true" />
    )

  // Paginación server-side: las filas actuales son la página completa.
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageItems = products
  // Selección de filas y ejecución de acciones en lote: se instancian aquí
  // porque necesitan la página visible y el total que reporta la API.
  const {
    selected,
    setSelected,
    toggleSelect,
    toggleSelectAllFiltered,
    allFilteredSelected,
    clearSelection,
  } = useProductSelection({
    pageIds: pageItems.map((p) => p.id),
    total,
    buildListQuery: listParams,
    idsPerRequest: IDS_PER_REQUEST,
  })
  const {
    bulkProgress,
    setBulkProgress,
    bulkFailures,
    setBulkFailures,
    bulkCancelling,
    beginBulk,
    cancelBulk,
    bulkRunOptions,
    finishBulk,
    isCancelled,
  } = useBulkRunner({ notify: setToast })
  // Incidencias de imagen de la página cargada (el sondeo es bajo demanda).
  const brokenItems = pageItems.filter((p) => imageIssues[p.id])
  const filterBroken = onlyBrokenImage && brokenItems.length > 0

  function updateFilters(next: () => void) {
    next()
    setPage(1)
    resetListScroll()
  }

  // El scroll del listado vive dentro de la tarjeta en la vista tabla (para
  // que el <thead> sea sticky) y en la ventana en la vista grid. Volver al
  // inicio evita aterrizar a mitad de un listado que el admin no pidió.
  function resetListScroll() {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollTo({ top: 0 })
      return
    }
    if (typeof window !== "undefined") window.scrollTo({ top: 0 })
  }

  // Salto de página con acotado: la entrada libre del paginador puede llegar
  // vacía, con decimales o fuera de rango.
  function goToPage(next: number) {
    const target = Number.isFinite(next)
      ? Math.max(1, Math.min(totalPages, Math.trunc(next)))
      : currentPage
    setPage(target)
    resetListScroll()
    return target
  }

  // Deja el listado sin ningún filtro. La lista de filtros a limpiar sale del
  // módulo compartido, el mismo que los cuenta: si se agrega uno nuevo, el
  // estado vacío no puede volverse un callejón sin salida.
  function clearFilters() {
    const cleared = clearedProductFilters()
    updateFilters(() => {
      setSearch(cleared.search)
      setDebouncedSearch(cleared.search)
      setCategoryFilter(cleared.category)
      setStockFilter(cleared.stock)
      setStatusFilter(cleared.status)
      setOnlyNoImage(cleared.noImage)
      setOnlyNoCities(cleared.noCities)
      setOnlyNoPrice(cleared.noPrice)
      setOnlyNoCategory(cleared.noCategory)
      setOnlyWaMismatch(cleared.waMismatch)
      setOnlyOnSale(cleared.onSale)
      setOnlyStaleSale(cleared.staleSale)
      setOnlyUnderThreshold(cleared.underThreshold)
      setOnlyDupNames(cleared.dupNames)
      setOnlyTrash(cleared.trash)
      setOnlyBrokenImage(cleared.brokenImage)
      setTagFilter(cleared.tag)
      setCityFilter(cleared.city)
      setBrandFilter(cleared.brand)
      setSort(DEFAULT_PRODUCT_SORT)
    })
  }

  // ---------- Disponibilidad por ciudad ----------
  // Clave ausente en `availability` = sin filas en product_city_availability =
  // "Global" (visible en todas las ciudades).
  const isGlobal = (productId: number) => !(productId in availability)

  const citiesAvailableCount = (productId: number): number =>
    availability[productId] ?? cities.length

  // ---------- Modal de ciudades ----------
  // La selección puede abarcar todas las páginas, así que la disponibilidad de
  // esos ids se pide al abrir (antes se tenía el mapa completo en memoria).
  const openCityModal = async (onlyProductId?: number) => {
    const ids = onlyProductId != null ? [onlyProductId] : [...selected]
    if (ids.length === 0) return
    if (onlyProductId != null) setSelected(new Set([onlyProductId]))
    setCityModalLoading(true)
    setError(null)
    try {
      const rows = await fetchAvailabilityRows(ids)
      if (!rows) throw new Error("Error al cargar la disponibilidad")
      const map = buildMap(rows)
      setModalAvailability(map)
      // Pre-marcar: una ciudad queda activa si TODOS los productos del grupo la
      // tienen disponible (los globales cuentan como disponibles en todas).
      const pre = new Set<number>()
      for (const city of cities) {
        const all = ids.every((id) => {
          const rows = map.get(id)
          return rows ? rows.get(city.id) === true : true
        })
        if (all) pre.add(city.id)
      }
      setDraftCities(pre)
      setCityModalOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar la disponibilidad")
    } finally {
      setCityModalLoading(false)
    }
  }

  // "mixto": la ciudad está activa en unos productos seleccionados y en otros no.
  const cityMixed = (cityId: number): boolean => {
    const ids = [...selected]
    if (ids.length <= 1) return false
    const states = ids.map((id) => {
      const rows = modalAvailability.get(id)
      return rows ? rows.get(cityId) === true : true
    })
    return states.some(Boolean) && states.some((s) => !s)
  }

  // ---------- Acciones bulk ----------
  const applyBulk = async (body: Record<string, unknown>) => {
    if (selected.size === 0) return
    const ids = [...selected]
    setBulkSaving(true)
    setError(null)
    try {
      // Estado previo para el Deshacer: el servidor es la única fuente de la
      // disponibilidad, así que se captura antes de escribir.
      const previous = await fetchAvailabilityRows(ids)
      const res = await fetch("/api/admin/products/city-availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: ids, ...body }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Error al actualizar disponibilidad")
      }
      setToast("Disponibilidad actualizada")
      if (previous) {
        setUndoAction({
          message: `Disponibilidad actualizada en ${productCount(ids.length)}.`,
          run: async () => {
            const undoRes = await fetch("/api/admin/products/city-availability", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ productIds: ids, restore: previous }),
            })
            if (!undoRes.ok) {
              const data = await undoRes.json().catch(() => ({}))
              throw new Error(data.error ?? "Error al restaurar la disponibilidad")
            }
            setReloadKey((k) => k + 1)
          },
        })
      }
      setReloadKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar disponibilidad")
    } finally {
      setBulkSaving(false)
    }
  }

  const applyAllCities = (available: boolean) =>
    applyBulk({ scope: "all", isAvailable: available })

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
      await applyBulk({ changes })
    }
    setCityModalOpen(false)
  }

  /** Aplica is_visible a un conjunto de ids y devuelve el resultado del lote. */
  async function applyVisibilityToIds(ids: number[], isVisible: boolean): Promise<BulkResult> {
    const result = await bulkPatch(ids, { is_visible: isVisible }, bulkRunOptions())
    setProducts((prev) =>
      prev.map((p) => (result.updated.includes(p.id) ? { ...p, is_visible: isVisible } : p))
    )
    return result
  }

  /** Muestra/oculta en el catálogo de WhatsApp toda la selección. */
  async function bulkSetWhatsApp(show: boolean) {
    if (selected.size === 0 || bulkSaving) return
    const ids = [...selected]
    setBulkSaving(true)
    setError(null)
    beginBulk()
    try {
      const previous = await fetchPreviousField(ids, "show_in_whatsapp")
      const result = await bulkPatch(ids, { show_in_whatsapp: show }, bulkRunOptions())
      const { updated } = result
      setProducts((prev) =>
        prev.map((p) => (updated.includes(p.id) ? { ...p, show_in_whatsapp: show } : p))
      )
      if (finishBulk(result) && updated.length > 0) {
        setToast(`${productCount(updated.length)} actualizado${updated.length === 1 ? "" : "s"} en WhatsApp`)
        if (previous) {
          setUndoAction({
            message: `WhatsApp actualizado en ${productCount(updated.length)}.`,
            run: async () => {
              await bulkPatchEach(
                updated.map((id) => ({ id, show_in_whatsapp: previous.get(id) ?? false })),
                (p) => ({ show_in_whatsapp: p.show_in_whatsapp })
              )
              setProducts((prev) =>
                prev.map((p) =>
                  updated.includes(p.id)
                    ? { ...p, show_in_whatsapp: previous.get(p.id) ?? false }
                    : p
                )
              )
            },
          })
        }
      }
      clearSelection()
    } catch {
      setBulkProgress(null)
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
    beginBulk()
    try {
      const result = await applyVisibilityToIds([...selected], isVisible)
      const succeededIds = result.updated
      clearSelection()
      if (finishBulk(result) && succeededIds.length > 0) {
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
      setBulkProgress(null)
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
    const catSlug = (id: number | null) => categories.find((c) => c.id === id)?.slug ?? ""
    // Columnas y escapado compartidos con la importación (product-csv.ts), así
    // que la exportación siempre es re-importable.
    const exportRows = rows.map((p) => ({ ...p, category_slug: catSlug(p.category_id) }))
    downloadCsv(
      `productos-${dayKeyOf(DEFAULT_TIMEZONE)}.csv`,
      toCsv([...PRODUCT_CSV_HEADER], productCsvCells(exportRows))
    )
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
    const name = await prompt({
      title: "Nombre de la copia",
      defaultValue: `${p.name} (copia)`,
      confirmLabel: "Continuar",
    })
    if (name === null) return
    const catInput = await prompt({
      title: "Categoría de la copia",
      message: `Número de la lista (vacío = misma categoría):\n${categories
        .map((c, i) => `${i + 1}. ${c.name}`)
        .join("\n")}`,
      placeholder: "Vacío = misma categoría",
      confirmLabel: "Duplicar",
      validate: (value) => {
        const trimmed = value.trim()
        if (!trimmed) return null
        const idx = parseInt(trimmed, 10)
        if (!Number.isInteger(idx) || !categories[idx - 1]) return "Categoría inválida"
        return null
      },
    })
    if (catInput === null) return
    let categoryId: number | undefined
    if (catInput.trim()) {
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
    // El umbral es por producto (Ronda 7); sin umbral se usa el default.
    const derived = deriveStockStatus(next, p.low_stock_threshold)
    patchProduct(p.id, { stock_quantity: next, stock_status: derived })
  }

  /** Pausa temporal: despublica hoy y programa republicación en N días. */
  async function pauseProduct(p: Product) {
    const daysInput = await prompt({
      title: "¿En cuántos días se republica?",
      defaultValue: "7",
      placeholder: "7, 14, 30…",
      confirmLabel: "Pausar",
      validate: (value) => {
        const days = parseInt(value.trim(), 10)
        if (!Number.isInteger(days) || days <= 0 || days > 365) {
          return "Días inválidos (1-365)"
        }
        return null
      },
    })
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

  /** Revisa con el servidor si las imágenes responden (ronda 7). */
  async function checkImages() {
    if (checkingImages) return
    // Con selección se revisa la selección (puede estar en otras páginas);
    // sin selección, las filas visibles.
    const targets = selected.size > 0 ? [...selected] : pageItems.map((p) => p.id)
    if (targets.length === 0) {
      setToast("No hay productos que revisar")
      return
    }
    setCheckingImages(true)
    setError(null)
    try {
      const found: typeof imageIssues = {}
      let checked = 0
      let ok = 0
      let skipped = 0
      const CHUNK = 60
      for (let i = 0; i < targets.length; i += CHUNK) {
        const res = await fetch("/api/admin/products/check-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: targets.slice(i, i + CHUNK) }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? "Error al revisar las imágenes")
        checked += Number(data.checked ?? 0)
        ok += Number(data.ok ?? 0)
        skipped += Number(data.skipped ?? 0)
        const broken = (data.broken ?? []) as {
          id: number
          image_url: string | null
          status: number | null
          reason: string
        }[]
        for (const b of broken) {
          found[b.id] = { url: b.image_url, status: b.status, reason: b.reason }
        }
      }
      setImageIssues(found)
      const brokenCount = Object.keys(found).length
      if (brokenCount > 0) setImagesModalOpen(true)
      setToast(
        brokenCount === 0
          ? `Imágenes revisadas: ${ok} correcta${ok === 1 ? "" : "s"}${
              skipped > 0 ? `, ${skipped} sin URL externa` : ""
            }`
          : `${brokenCount} imagen${brokenCount === 1 ? "" : "es"} rota${
              brokenCount === 1 ? "" : "s"
            } de ${checked} revisada${checked === 1 ? "" : "s"}`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al revisar las imágenes")
    } finally {
      setCheckingImages(false)
    }
  }

  /** Guarda (o quita con null) la imagen principal del producto. */
  async function saveProductImage(p: Product, url: string | null) {
    setSaving((prev) => new Set(prev).add(p.id))
    setError(null)
    try {
      const gallery = (p.images ?? []).filter((u) => u !== p.image_url)
      const res = await fetch("/api/admin/products/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: p.id,
          expectedUpdatedAt: p.updated_at ?? undefined,
          image_url: url,
          images: url ? [...gallery, url] : gallery,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (handleStaleWrite(p.id, res, data)) return
      if (!res.ok) throw new Error(data.error ?? "Error al guardar la imagen")
      // La incidencia ya no aplica: el sondeo vuelve a decidir en la próxima revisión.
      setImageIssues((prev) => {
        const next = { ...prev }
        delete next[p.id]
        return next
      })
      setProducts((prev) =>
        prev.map((row) =>
          row.id === p.id
            ? { ...row, image_url: url, images: url ? [...gallery, url] : gallery }
            : row
        )
      )
      setToast(url ? `${p.name}: imagen actualizada` : `${p.name}: imagen eliminada`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la imagen")
    } finally {
      setSaving((prev) => {
        const next = new Set(prev)
        next.delete(p.id)
        return next
      })
    }
  }

  /** Reemplaza la imagen rota pegando una URL nueva. */
  async function replaceBrokenImage(p: Product) {
    const raw = await prompt({
      title: "Nueva URL de imagen",
      message: `Para "${p.name}". Debe empezar por https:// o ser una ruta local (/).`,
      defaultValue: p.image_url ?? "",
      placeholder: "https://…",
      confirmLabel: "Guardar",
      validate: (value) => {
        const url = value.trim()
        if (!url.startsWith("https://") && !url.startsWith("/")) {
          return "La URL debe empezar por https:// o ser una ruta local (/)"
        }
        return null
      },
    })
    if (raw == null) return
    const url = raw.trim()
    if (!url.startsWith("https://") && !url.startsWith("/")) {
      setError("La URL debe empezar por https:// o ser una ruta local (/)")
      return
    }
    await saveProductImage(p, url)
  }

  /** Quita la imagen rota: el producto queda sin foto en la tienda. */
  async function removeBrokenImage(p: Product) {
    const ok = await confirm({
      title: "¿Quitar la imagen?",
      message: `"${p.name}" queda sin foto en la tienda.`,
      confirmLabel: "Quitar imagen",
      danger: true,
    })
    if (!ok) return
    await saveProductImage(p, null)
  }

  /** Genera con IA la imagen de los productos SIN imagen de la selección
   *  (secuencial, máx 10 por corrida para no quemar rate limits). */
  const [bulkAiBusy, setBulkAiBusy] = useState(false)
  async function bulkGenerateImages() {
    if (selected.size === 0 || bulkAiBusy) return
    // Los sin imagen pueden estar en otras páginas: datos frescos del servidor.
    setBulkAiBusy(true)
    setError(null)
    beginBulk()
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
      const doneIds: number[] = []
      const failures: BulkFailure[] = []
      let cancelled = false
      for (const p of missing) {
        if (isCancelled()) {
          cancelled = true
          break
        }
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
            body: JSON.stringify({
              productId: p.id,
              expectedUpdatedAt: p.updated_at ?? undefined,
              image_url: url,
              images: [url],
            }),
          })
          if (!patch.ok) {
            // Incluye el 409 de versión (B19): el motivo queda por id en el
            // resumen de fallos en vez de perderse.
            const patchData = await patch.json().catch(() => ({}))
            throw new Error(patchData.error ?? "error al guardar la imagen")
          }
          doneIds.push(p.id)
          setBulkProgress({ done: doneIds.length, total: missing.length })
        } catch (err) {
          failures.push({ id: p.id, reason: err instanceof Error ? err.message : "Error al generar" })
        }
      }
      setReloadKey((k) => k + 1)
      clearSelection()
      if (finishBulk({ cancelled, failed: failures, ok: doneIds })) {
        setToast(`Imágenes IA: ${doneIds.length} generada${doneIds.length === 1 ? "" : "s"}`)
      }
    } catch (err) {
      setBulkProgress(null)
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
    const ok = await confirm({
      title: "¿Mover a la papelera?",
      message: `"${p.name}" se despublica y puedes restaurarlo después.`,
      confirmLabel: "Mover a la papelera",
      danger: true,
    })
    if (!ok) return
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

  /**
   * Purga definitiva de la papelera (ronda 7). Con `productIds` vacía solo esos
   * productos; sin argumentos vacía toda la papelera vencida. `ignoreRetention`
   * salta los 30 días de retención (requiere doble confirmación).
   */
  async function purgeTrash(opts: { productIds?: number[]; ignoreRetention?: boolean } = {}) {
    if (purging) return
    const scope = opts.productIds ? `${opts.productIds.length} producto(s)` : "la papelera"
    const extra = opts.ignoreRetention ? " (sin esperar la retención de 30 días)" : ""
    const ok = await confirm({
      title: "¿Borrar definitivamente?",
      message: `Se borra ${scope}${extra}. Esta acción no se puede deshacer.`,
      confirmLabel: "Borrar definitivamente",
      danger: true,
    })
    if (!ok) return
    setPurging(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/products/purge-trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(opts.productIds ? { productIds: opts.productIds } : { all: true }),
          ...(opts.ignoreRetention ? { ignoreRetention: true } : {}),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        purged?: number
        keptWithOrders?: number[]
        keptNotDue?: number[]
      }
      if (!res.ok) throw new Error(data.error ?? "Error al vaciar la papelera")
      const purged = data.purged ?? 0
      const withOrders = data.keptWithOrders?.length ?? 0
      const notDue = data.keptNotDue?.length ?? 0
      if (purged === 0 && (withOrders > 0 || notDue > 0)) {
        setToast(
          `Nada que borrar: ${withOrders} con pedidos y ${notDue} dentro de la retención de ${TRASH_RETENTION_DAYS} días`
        )
      } else {
        setToast(
          [
            `${purged} producto(s) borrado(s) definitivamente`,
            withOrders > 0 ? `${withOrders} conservado(s) por pedidos` : null,
            notDue > 0 ? `${notDue} aún en retención` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        )
      }
      setReloadKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al vaciar la papelera")
    } finally {
      setPurging(false)
    }
  }

  // Historial (audit log) del producto abierto en el modal.
  const [historyEntries, setHistoryEntries] = useState<
    { action: string; actor_email: string | null; created_at: string; detail: Record<string, unknown> }[]
  >([])
  const [historyLoading, setHistoryLoading] = useState(false)
  // B31: `admin_audit_log` es una lectura decorativa; si el route degrada
  // (tabla ausente, PostgREST rechaza), distinguimos "sin cambios" de
  // "historial no disponible" en vez de mentir con una lista vacía.
  const [historyDegraded, setHistoryDegraded] = useState(false)
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
  const [activityDegraded, setActivityDegraded] = useState(false)

  async function openActivity() {
    setActivityOpen(true)
    setActivityEntries([])
    setActivityLoading(true)
    setActivityDegraded(false)
    try {
      const res = await fetch("/api/admin/products/audit")
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setActivityEntries(data.entries ?? [])
        setActivityDegraded(data.degraded === true)
      } else {
        setActivityDegraded(true)
      }
    } finally {
      setActivityLoading(false)
    }
  }

  async function openHistory(p: Product) {
    setHistoryFor(p)
    setHistoryEntries([])
    setHistoryLoading(true)
    setHistoryDegraded(false)
    try {
      const res = await fetch(`/api/admin/products/audit?productId=${p.id}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setHistoryEntries(data.entries ?? [])
        setHistoryDegraded(data.degraded === true)
      } else {
        setHistoryDegraded(true)
      }
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
  // UTC a propósito: el servidor filtra el rango en UTC
  // (`sales-report/route.ts`: `T00:00:00Z` … `T23:59:59Z`), así que `to` debe
  // ser el día UTC. Con el día local se recortarían las ventas de la tarde.
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [reportLoading, setReportLoading] = useState(false)
  const [reportInsights, setReportInsights] = useState<SalesReportInsights | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)

  // Los insights se recalculan al abrir el modal y cuando cambia el rango.
  useEffect(() => {
    if (!reportOpen) return
    let cancelled = false
    ;(async () => {
      try {
        setInsightsLoading(true)
        const res = await fetch(
          `/api/admin/products/sales-report?from=${reportFrom}&to=${reportTo}&format=json`
        )
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        setReportInsights(res.ok ? (data.insights ?? null) : null)
      } catch {
        if (!cancelled) setReportInsights(null)
      } finally {
        if (!cancelled) setInsightsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reportOpen, reportFrom, reportTo])

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

  // Vistas guardadas de filtros: la query canónica del listado (filtros + orden
  // + vista + tamaño de página) en `localStorage`. La lógica vive en
  // `@/lib/product-filter-presets`, la misma fuente que la URL.
  const [savedViews, setSavedViews] = useState<ProductPreset[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const stored = parseProductPresets(localStorage.getItem(PRODUCT_PRESETS_STORAGE_KEY))
      if (stored.length > 0) return stored
      // Vistas del formato anterior del panel: se migran al leerlas y se
      // reescriben en la clave nueva en el primer guardado.
      return parseLegacyProductPresets(localStorage.getItem(PRODUCT_PRESETS_LEGACY_KEY))
    } catch {
      return []
    }
  })
  const [viewsOpen, setViewsOpen] = useState(false)

  function persistViews(views: ProductPreset[]) {
    const next = views.slice(0, MAX_PRODUCT_PRESETS)
    setSavedViews(next)
    try {
      localStorage.setItem(PRODUCT_PRESETS_STORAGE_KEY, serializeProductPresets(next))
      localStorage.removeItem(PRODUCT_PRESETS_LEGACY_KEY)
    } catch {
      // sin espacio / modo privado: la vista vive solo en memoria
    }
  }

  /** Query canónica de lo que se está viendo, idéntica a la que escribe la URL. */
  function currentPresetQuery(): string {
    const sp = new URLSearchParams()
    productFiltersToSearchParams(filters, sp)
    if (view === "grid") sp.set("view", "grid")
    for (const [key, value] of Object.entries(productSortSearchParams(sort))) sp.set(key, value)
    if (pageSize !== DEFAULT_PAGE_SIZE) sp.set("pageSize", String(pageSize))
    return sp.toString()
  }

  async function saveCurrentView() {
    const name = await prompt({
      title: "Nombre de la vista",
      placeholder: "Ej.: Sin imagen y sin stock",
      confirmLabel: "Guardar vista",
    })
    if (!name?.trim()) return
    // La vista sin filtros también se guarda: "Catálogo completo" es un atajo
    // legítimo para volver al estado inicial.
    const preset = makeProductPreset(name, currentPresetQuery())
    if (!preset) return
    persistViews(upsertProductPreset(savedViews, preset))
    setToast(`Vista "${preset.name}" guardada`)
  }

  function deleteView(name: string) {
    persistViews(removeProductPreset(savedViews, name))
  }

  function applyView(preset: ProductPreset) {
    const sp = new URLSearchParams(preset.query)
    const next = parseProductFilters(sp)
    updateFilters(() => {
      setSearch(next.search)
      setDebouncedSearch(next.search)
      setCategoryFilter(next.category)
      setStockFilter(next.stock)
      setStatusFilter(next.status)
      setTagFilter(next.tag)
      setCityFilter(next.city)
      setBrandFilter(next.brand)
      setOnlyNoImage(next.noImage)
      setOnlyNoCities(next.noCities)
      setOnlyNoPrice(next.noPrice)
      setOnlyNoCategory(next.noCategory)
      setOnlyWaMismatch(next.waMismatch)
      setOnlyOnSale(next.onSale)
      setOnlyDupNames(next.dupNames)
      setOnlyTrash(next.trash)
      setOnlyStaleSale(next.staleSale)
      setOnlyUnderThreshold(next.underThreshold)
      setOnlyBrokenImage(next.brokenImage)
    })
    setView(sp.get("view") === "grid" ? "grid" : "table")
    setSort(parseProductSort(sp.get("sort"), sp.get("dir")))
    const size = Number(sp.get("pageSize"))
    setPageSize(PAGE_SIZE_OPTIONS.includes(size) ? size : DEFAULT_PAGE_SIZE)
    setViewsOpen(false)
    setToast(`Vista "${preset.name}" aplicada`)
  }
  async function mergeSelected() {
    if (selected.size !== 2 || bulkSaving) return
    const [a, b] = [...selected].sort((x, y) => x - y)
    const target = products.find((p) => p.id === a)
    const source = products.find((p) => p.id === b)
    if (
      !(await confirm({
        title: "Fusionar duplicados",
        message: `✔ Se conserva: ${target?.name ?? `#${a}`} (#${a})\n✖ Va a la papelera: ${source?.name ?? `#${b}`} (#${b})\n\nSe copian disponibilidad e imágenes faltantes.`,
        confirmLabel: "Fusionar",
        danger: true,
      }))
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
      clearSelection()
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
      !(await confirm({
        title: "¿Mover a la papelera?",
        message: `${selected.size} producto${selected.size === 1 ? "" : "s"} se despublican y puedes restaurarlos después.`,
        confirmLabel: "Mover a la papelera",
        danger: true,
      }))
    )
      return
    setBulkSaving(true)
    setError(null)
    beginBulk()
    try {
      const ids = [...selected]
      const result = await runPerId(
        ids,
        (productId) =>
          fetch("/api/admin/products/delete", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId }),
          }),
        bulkRunOptions()
      )
      clearSelection()
      setReloadKey((k) => k + 1)
      if (finishBulk(result)) {
        setToast(`${result.ok.length} movido${result.ok.length === 1 ? "" : "s"} a la papelera`)
      }
    } catch {
      setBulkProgress(null)
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
    beginBulk()
    try {
      const result = await runPerId(
        [...selected],
        (productId) =>
          fetch("/api/admin/products/duplicate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId }),
          }),
        bulkRunOptions()
      )
      clearSelection()
      setReloadKey((k) => k + 1)
      if (finishBulk(result)) {
        setToast(
          `${result.ok.length} copia${result.ok.length === 1 ? "" : "s"} creada${
            result.ok.length === 1 ? "" : "s"
          } (despublicadas)`
        )
      }
    } catch {
      setBulkProgress(null)
      setError("Error al duplicar en lote")
    } finally {
      setBulkSaving(false)
    }
  }

  /**
   * R7-10 — propone `seo_title`/`seo_description` con IA para la selección.
   * Corre en tandas (`SEO_BATCH_SIZE`) para acotar cada respuesta, y solo
   * genera propuestas: el admin las revisa/edita antes de aplicar.
   */
  async function generateSeoBatch() {
    if (selected.size === 0 || seoGenerating) return
    setSeoGenerating(true)
    setError(null)
    setSeoProposals([])
    setSeoSkipped([])
    setSeoFailed([])
    try {
      const proposals: SeoDraft[] = []
      const skipped: SeoNote[] = []
      const failed: SeoNote[] = []
      for (const batch of chunkIds([...selected])) {
        const res = await fetch("/api/admin/products/bulk-seo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: batch, overwrite: seoOverwrite }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? "Error al generar SEO")
        proposals.push(...((data.proposals ?? []) as SeoDraft[]))
        skipped.push(...((data.skipped ?? []) as SeoNote[]))
        failed.push(...((data.failed ?? []) as SeoNote[]))
      }
      setSeoProposals(proposals)
      setSeoSkipped(skipped)
      setSeoFailed(failed)
      if (proposals.length === 0) {
        setError("La IA no devolvió propuestas para la selección")
        return
      }
      setSeoOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar SEO")
    } finally {
      setSeoGenerating(false)
    }
  }

  /** R7-10 — aplica las propuestas (ya editadas) vía el PATCH de producto. */
  async function applySeoBatch() {
    if (seoApplying) return
    const drafts = seoProposals.filter(
      (p) => p.seo_title.trim().length > 0 || p.seo_description.trim().length > 0
    )
    if (drafts.length === 0) {
      setError("No hay propuestas que aplicar")
      return
    }
    setSeoApplying(true)
    setError(null)
    try {
      const results = await Promise.all(
        drafts.map(async (draft) => {
          const res = await fetch("/api/admin/products/update", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productId: draft.id,
              expectedUpdatedAt: products.find((p) => p.id === draft.id)?.updated_at ?? undefined,
              seo_title: draft.seo_title.trim() || null,
              seo_description: draft.seo_description.trim() || null,
            }),
          })
          return res.ok ? draft : null
        })
      )
      const applied = results.filter((r): r is SeoDraft => r !== null)
      const appliedById = new Map(applied.map((d) => [d.id, d]))
      setProducts((prev) =>
        prev.map((p) => {
          const draft = appliedById.get(p.id)
          return draft
            ? {
                ...p,
                seo_title: draft.seo_title.trim() || null,
                seo_description: draft.seo_description.trim() || null,
              }
            : p
        })
      )
      setToast(
        seoBatchSummary({
          applied: applied.length,
          skipped: seoSkipped.length,
          failed: seoFailed.length + (drafts.length - applied.length),
        })
      )
      setSeoOpen(false)
      setSeoProposals([])
      setSeoSkipped([])
      setSeoFailed([])
      clearSelection()
      setReloadKey((k) => k + 1)
    } catch {
      setError("Error al aplicar el SEO en lote")
    } finally {
      setSeoApplying(false)
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
    beginBulk()
    try {
      const ids = [...selected]
      const listRes = await fetch(`/api/admin/products/list?ids=${ids.join(",")}`)
      const listData = await listRes.json().catch(() => ({}))
      if (!listRes.ok) throw new Error(listData.error ?? "Error al leer precios actuales")
      const current = new Map<number, Product>(
        (listData.rows ?? []).map((r: Product) => [r.id, r])
      )
      const factor = 1 - pct / 100
      const nextStart =
        bulkSaleMode === "remove" || !bulkSaleStart
          ? null
          : new Date(bulkSaleStart).toISOString()
      const nextEnd =
        bulkSaleMode === "remove" || !bulkSaleEnd ? null : new Date(bulkSaleEnd).toISOString()
      const newSalePrices = new Map<number, number | null>()
      const rows = ids
        .map((id) => current.get(id))
        .filter((p): p is Product => p !== undefined)
      const result = await bulkPatchEach(
        rows,
        (p) => {
          const salePrice =
            bulkSaleMode === "remove"
              ? null
              : p.price != null
              ? Math.round(p.price * factor * 100) / 100
              : undefined
          if (salePrice === undefined) return null // sin precio base no aplica
          newSalePrices.set(p.id, salePrice)
          return {
            sale_price: salePrice,
            // Quitar la oferta también borra su ventana; al aplicarla se
            // reemplaza por la capturada (vacío = sin límite).
            sale_starts_at: nextStart,
            sale_ends_at: nextEnd,
          }
        },
        bulkRunOptions()
      )
      const { updated } = result
      setProducts((prev) =>
        prev.map((p) => {
          const sp = updated.includes(p.id) ? newSalePrices.get(p.id) : undefined
          return sp !== undefined
            ? { ...p, sale_price: sp, sale_starts_at: nextStart, sale_ends_at: nextEnd }
            : p
        })
      )
      const finished = finishBulk(result)
      // Los omitidos son los que no están en la página o no tienen precio base.
      const skipped = ids.length - updated.length
      if (finished && skipped > 0) {
        setError(
          `${productCount(skipped)} omitido${skipped === 1 ? "" : "s"} (sin precio base)`
        )
      }
      if (finished && updated.length > 0) {
        setToast(
          bulkSaleMode === "apply"
            ? `Oferta aplicada en ${productCount(updated.length)}`
            : `Ofertas quitadas en ${productCount(updated.length)}`
        )
        const undoRows = updated
          .map((id) => current.get(id))
          .filter((p): p is Product => p !== undefined)
        setUndoAction({
          message: `Ofertas actualizadas en ${productCount(updated.length)}.`,
          run: async () => {
            await bulkPatchEach(undoRows, (prev) => ({
              sale_price: prev.sale_price,
              sale_starts_at: prev.sale_starts_at,
              sale_ends_at: prev.sale_ends_at,
            }))
            setProducts((prevList) =>
              prevList.map((p) => {
                const old = updated.includes(p.id) ? current.get(p.id) : undefined
                return old
                  ? {
                      ...p,
                      sale_price: old.sale_price,
                      sale_starts_at: old.sale_starts_at,
                      sale_ends_at: old.sale_ends_at,
                    }
                  : p
              })
            )
          },
        })
      }
      setBulkSaleOpen(false)
      clearSelection()
    } catch {
      setBulkProgress(null)
      setError("Error al actualizar ofertas en lote")
    } finally {
      setBulkSaving(false)
    }
  }

  /** Suma o quita una etiqueta en toda la selección. */
  async function bulkTag() {
    if (selected.size === 0 || bulkSaving) return
    const value = bulkTagValue.trim().toLowerCase()
    if (!value) {
      setError("Escribe la etiqueta")
      return
    }
    if (value.length > 40) {
      setError("La etiqueta debe tener máximo 40 caracteres")
      return
    }
    setBulkSaving(true)
    setError(null)
    beginBulk()
    try {
      const ids = [...selected]
      const listRes = await fetch(`/api/admin/products/list?ids=${ids.join(",")}`)
      const listData = await listRes.json().catch(() => ({}))
      if (!listRes.ok) throw new Error(listData.error ?? "Error al leer etiquetas actuales")
      const current = new Map<number, Product>(
        (listData.rows ?? []).map((r: Product) => [r.id, r])
      )
      const nextTags = new Map<number, string[]>()
      const rows = ids
        .map((id) => current.get(id))
        .filter((p): p is Product => p !== undefined)
      const result = await bulkPatchEach(
        rows,
        (p) => {
          const prev = p.tags ?? []
          const tags =
            bulkTagMode === "add"
              ? prev.includes(value)
                ? prev
                : [...prev, value].slice(0, 20)
              : prev.filter((t) => t !== value)
          nextTags.set(p.id, tags)
          return { tags }
        },
        bulkRunOptions()
      )
      const { updated } = result
      setProducts((prev) =>
        prev.map((p) => {
          const tags = updated.includes(p.id) ? nextTags.get(p.id) : undefined
          return tags ? { ...p, tags } : p
        })
      )
      if (finishBulk(result) && updated.length > 0) {
        setToast(
          bulkTagMode === "add"
            ? `Etiqueta "${value}" agregada a ${productCount(updated.length)}`
            : `Etiqueta "${value}" quitada de ${productCount(updated.length)}`
        )
        const undoRows = updated
          .map((id) => current.get(id))
          .filter((p): p is Product => p !== undefined)
        setUndoAction({
          message: `Etiquetas actualizadas en ${productCount(updated.length)}.`,
          run: async () => {
            await bulkPatchEach(undoRows, (prev) => ({ tags: prev.tags ?? [] }))
            setProducts((prevList) =>
              prevList.map((p) => {
                const old = updated.includes(p.id) ? current.get(p.id) : undefined
                return old ? { ...p, tags: old.tags ?? [] } : p
              })
            )
          },
        })
        // La lista de etiquetas del filtro puede haber ganado una nueva.
        setReloadKey((k) => k + 1)
      }
      setBulkTagOpen(false)
      setBulkTagValue("")
    } catch {
      setBulkProgress(null)
      setError("Error al actualizar etiquetas en lote")
    } finally {
      setBulkSaving(false)
    }
  }

  /** Borra precio de oferta y ventana de los productos con oferta ya vencida. */
  async function clearExpiredSales() {
    if (bulkSaving) return
    const stale = products.filter((p) => saleState(p) === "expired")
    if (stale.length === 0) {
      setToast("No hay ofertas vencidas en esta página")
      return
    }
    if (
      !(await confirm({
        title: "¿Limpiar ofertas vencidas?",
        message: `Se borrará el precio de oferta y su ventana en ${stale.length} producto${
          stale.length === 1 ? "" : "s"
        }. La tienda ya cobra el precio normal.`,
        confirmLabel: "Limpiar ofertas",
      }))
    ) {
      return
    }
    setBulkSaving(true)
    setError(null)
    beginBulk()
    try {
      const result = await bulkPatchEach(
        stale,
        () => ({
          sale_price: null,
          sale_starts_at: null,
          sale_ends_at: null,
        }),
        bulkRunOptions()
      )
      const ids = result.updated
      setProducts((prev) =>
        prev.map((p) =>
          ids.includes(p.id)
            ? { ...p, sale_price: null, sale_starts_at: null, sale_ends_at: null }
            : p
        )
      )
      if (!finishBulk(result)) {
        setReloadKey((k) => k + 1)
        return
      }
      setToast(`Ofertas vencidas limpiadas en ${productCount(ids.length)}`)
      setUndoAction({
        message: `Ofertas vencidas limpiadas en ${productCount(ids.length)}.`,
        run: async () => {
          await bulkPatchEach(
            stale.filter((p) => ids.includes(p.id)),
            (p) => ({
              sale_price: p.sale_price,
              sale_starts_at: p.sale_starts_at,
              sale_ends_at: p.sale_ends_at,
            })
          )
          setProducts((prev) =>
            prev.map((p) => {
              const old = ids.includes(p.id) ? stale.find((s) => s.id === p.id) : undefined
              return old
                ? {
                    ...p,
                    sale_price: old.sale_price,
                    sale_starts_at: old.sale_starts_at,
                    sale_ends_at: old.sale_ends_at,
                  }
                : p
            })
          )
        },
      })
      setReloadKey((k) => k + 1)
    } catch {
      setBulkProgress(null)
      setError("Error al limpiar ofertas vencidas")
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
    beginBulk()
    try {
      const ids = [...selected]
      const listRes = await fetch(`/api/admin/products/list?ids=${ids.join(",")}`)
      const listData = await listRes.json().catch(() => ({}))
      if (!listRes.ok) throw new Error(listData.error ?? "Error al leer costos")
      const current = new Map<number, Product>(
        (listData.rows ?? []).map((r: Product) => [r.id, r])
      )
      const newSalePrices = new Map<number, number>()
      const rows = ids
        .map((id) => current.get(id))
        .filter((p): p is Product => p !== undefined)
      const result = await bulkPatchEach(
        rows,
        (p) => {
          if (p.cost == null || p.cost <= 0) return null
          // Precio mínimo para conservar el margen objetivo; solo aplica si
          // queda por debajo del precio base (si no, no es oferta).
          const minPrice = p.cost / (1 - margin / 100)
          const salePrice = Math.round(minPrice * 100) / 100
          if (p.price != null && salePrice >= p.price) return null
          newSalePrices.set(p.id, salePrice)
          return { sale_price: salePrice }
        },
        bulkRunOptions()
      )
      const { updated } = result
      setProducts((prev) =>
        prev.map((p) => {
          const sp = updated.includes(p.id) ? newSalePrices.get(p.id) : undefined
          return sp !== undefined ? { ...p, sale_price: sp } : p
        })
      )
      const finished = finishBulk(result)
      const skipped = ids.length - updated.length
      if (finished && updated.length > 0) {
        setToast(`Oferta con margen ≥${margin}% en ${productCount(updated.length)}`)
      }
      if (finished && skipped > 0) {
        setError(
          `${skipped} omitido${skipped === 1 ? "" : "s"} (sin costo o el precio ya está por debajo del mínimo)`
        )
      }
      setBulkMarginOpen(false)
      clearSelection()
    } catch {
      setBulkProgress(null)
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
    beginBulk()
    try {
      const ids = [...selected]
      const previous = await fetchPreviousField(ids, "unit")
      const result = await bulkPatch(ids, { unit }, bulkRunOptions())
      const { updated } = result
      setProducts((prev) => prev.map((p) => (updated.includes(p.id) ? { ...p, unit } : p)))
      if (finishBulk(result) && updated.length > 0) {
        setToast(`Unidad "${unit ?? "—"}" en ${productCount(updated.length)}`)
        if (previous) {
          setUndoAction({
            message: `Unidad asignada a ${productCount(updated.length)}.`,
            run: async () => {
              await bulkPatchEach(
                updated.map((id) => ({ id, unit: previous.get(id) ?? null })),
                (p) => ({ unit: p.unit })
              )
              setProducts((prev) =>
                prev.map((p) =>
                  updated.includes(p.id) ? { ...p, unit: previous.get(p.id) ?? null } : p
                )
              )
            },
          })
        }
      }
      setBulkUnitOpen(false)
      clearSelection()
    } catch {
      setBulkProgress(null)
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
    beginBulk()
    try {
      const ids = [...selected]
      // Estado previo para el Deshacer (la selección puede estar en otra página).
      const previous = await fetchPreviousField(ids, "category_id")
      const result = await bulkPatch(ids, { category_id: categoryId }, bulkRunOptions())
      const { updated } = result
      setProducts((prev) =>
        prev.map((p) => (updated.includes(p.id) ? { ...p, category_id: categoryId } : p))
      )
      if (finishBulk(result) && updated.length > 0) {
        setToast(`Categoría actualizada en ${productCount(updated.length)}`)
        if (previous) {
          setUndoAction({
            message: `Categoría actualizada en ${productCount(updated.length)}.`,
            run: async () => {
              await bulkPatchEach(
                updated.map((id) => ({ id, category_id: previous.get(id) ?? null })),
                (p) => ({ category_id: p.category_id })
              )
              setProducts((prev) =>
                prev.map((p) =>
                  updated.includes(p.id)
                    ? { ...p, category_id: previous.get(p.id) ?? null }
                    : p
                )
              )
            },
          })
        }
      }
      setBulkCategoryOpen(false)
      clearSelection()
    } catch {
      setBulkProgress(null)
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
    beginBulk()
    try {
      const ids = [...selected]
      // Los seleccionados pueden estar en otras páginas: precios frescos del servidor.
      const freshRows = await fetchProductsByIds(ids)
      if (!freshRows) throw new Error("Error al leer precios actuales")
      const current = new Map<number, Product>(freshRows.map((r) => [r.id, r]))
      const newPrices = new Map<number, { price: number | null; sale_price: number | null }>()
      const rows = ids
        .map((id) => current.get(id))
        .filter((p): p is Product => p !== undefined)
      const result = await bulkPatchEach(
        rows,
        (p) => {
          const price = p.price != null ? Math.round(p.price * factor * 100) / 100 : null
          const salePrice =
            p.sale_price != null ? Math.round(p.sale_price * factor * 100) / 100 : null
          newPrices.set(p.id, { price, sale_price: salePrice })
          return { price, sale_price: salePrice }
        },
        bulkRunOptions()
      )
      const { updated } = result
      setProducts((prev) =>
        prev.map((p) => {
          const next = updated.includes(p.id) ? newPrices.get(p.id) : undefined
          return next ? { ...p, ...next } : p
        })
      )
      if (finishBulk(result) && updated.length > 0) {
        setToast(`Precios ajustados en ${productCount(updated.length)}`)
        const undoRows = updated
          .map((id) => current.get(id))
          .filter((p): p is Product => p !== undefined)
        setUndoAction({
          message: `Precios ajustados en ${productCount(updated.length)}.`,
          run: async () => {
            await bulkPatchEach(undoRows, (prev) => ({
              price: prev.price,
              sale_price: prev.sale_price,
            }))
            setProducts((prevList) =>
              prevList.map((p) => {
                const old = updated.includes(p.id) ? current.get(p.id) : undefined
                return old ? { ...p, price: old.price, sale_price: old.sale_price } : p
              })
            )
          },
        })
      }
      setBulkPriceOpen(false)
      clearSelection()
    } catch {
      setBulkProgress(null)
      setError("Error al ajustar precios en lote")
    } finally {
      setBulkSaving(false)
    }
  }

  // ---------- Edición por producto (precio, stock, WhatsApp) ----------
  /**
   * B19 — concurrencia optimista. El servidor responde 409 `stale_write`
   * cuando la fila cambió desde que el panel la leyó. Se adopta la versión
   * vigente (así un reintento no vuelve a chocar consigo mismo) y se avisa con
   * un botón para recargar el listado. Devuelve `true` si era ese conflicto.
   */
  const handleStaleWrite = (productId: number, res: Response, body: unknown) => {
    if (res.status !== 409) return false
    if ((body as { code?: unknown } | null)?.code !== "stale_write") return false
    const conflict = conflictFromResponse(body)
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId ? { ...p, updated_at: conflict?.currentUpdatedAt ?? null } : p
      )
    )
    setStaleNotice({
      message:
        (body as { error?: string }).error ?? "Otro usuario modificó este producto mientras lo editabas",
    })
    return true
  }

  const patchProduct = async (productId: number, fields: Record<string, unknown>) => {
    setSaving((prev) => new Set(prev).add(productId))
    setError(null)
    setStaleNotice(null)
    // La versión que el panel leyó viaja como precondición: el servidor la
    // compara y rechaza la escritura si la fila ya cambió.
    const expectedUpdatedAt = products.find((p) => p.id === productId)?.updated_at ?? undefined
    try {
      const res = await fetch("/api/admin/products/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, expectedUpdatedAt, ...fields }),
      })
      const data = await res.json().catch(() => ({}))
      if (handleStaleWrite(productId, res, data)) return
      if (!res.ok) {
        throw new Error(data.error ?? "Error al actualizar")
      }
      // El servidor devuelve la versión nueva: sin ella la siguiente edición
      // del mismo producto chocaría con su propia escritura anterior.
      const updatedAt = typeof data.updated_at === "string" ? data.updated_at : null
      // Aplica el cambio localmente
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId ? { ...p, ...fields, ...(updatedAt ? { updated_at: updatedAt } : {}) } : p
        )
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

  // La edición inline opera SIEMPRE sobre el precio base (`price`), no sobre la
  // oferta. Antes precargaba `sale_price ?? price` y guardaba en `price`: editar
  // un producto en oferta sobrescribía el precio base con el valor de la oferta
  // y conservaba la oferta vieja. La oferta se edita en el formulario.
  const startEditPrice = (p: Product) => {
    setEditingPrice(p.id)
    setDraftPrice(String(p.price ?? ""))
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
      <>
        <ProductsSkeleton />
        {confirmDialog}
      </>
    )
  }

  // Acciones del encabezado. En escritorio se muestran todas; en móvil solo la
  // primaria y el resto detrás de "Más": la barra completa mide ~720px y el
  // `overflow-x: clip` global dejaría los botones recortados e inalcanzables.
  const headerActions: {
    key: string
    label: string
    title?: string
    icon: ReactNode
    variant: "link" | "button" | "primary"
    tone?: "brand" | "gray"
    href?: string
    onClick?: () => void
    disabled?: boolean
  }[] = [
    {
      key: "activity",
      label: "Actividad",
      title: "Últimas acciones sobre el catálogo",
      icon: <Activity className="w-4 h-4" />,
      variant: "link",
      tone: "gray",
      onClick: openActivity,
    },
    {
      key: "import",
      label: "Importar CSV",
      icon: <Package className="w-4 h-4" />,
      variant: "button",
      onClick: () => setImportOpen(true),
    },
    {
      key: "export",
      label: "Exportar CSV",
      title: "Descarga los productos filtrados en CSV (re-importable)",
      icon: <Download className="w-4 h-4" />,
      variant: "button",
      onClick: exportCsv,
      disabled: total === 0,
    },
    {
      key: "report",
      label: "Reporte ventas",
      title: "Ventas por producto en un rango de fechas (CSV)",
      icon: <Activity className="w-4 h-4" />,
      variant: "button",
      onClick: () => setReportOpen(true),
    },
    {
      key: "images",
      label: checkingImages ? "Revisando…" : "Revisar imágenes",
      title:
        selected.size > 0
          ? `Revisar si responden las imágenes de ${selected.size} producto(s) seleccionado(s)`
          : "Revisar si responden las imágenes de los productos de esta página",
      icon: checkingImages ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <ScanSearch className="w-4 h-4" />
      ),
      variant: "button",
      onClick: checkImages,
      disabled: checkingImages || (selected.size === 0 && pageItems.length === 0),
    },
    {
      key: "new",
      label: "Nuevo producto",
      icon: <Plus className="w-4 h-4" />,
      variant: "primary",
      onClick: () => setProductForm("new"),
    },
  ]

  const renderHeaderAction = (
    action: (typeof headerActions)[number],
    mode: "desktop" | "mobilePrimary" | "mobileMenu",
  ) => {
    const className =
      mode === "desktop"
        ? action.variant === "primary"
          ? "flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition-colors text-sm"
          : action.variant === "link"
            ? `flex items-center gap-1.5 text-sm font-semibold ${
                action.tone === "brand"
                  ? "text-brand-600 hover:text-brand-700"
                  : "text-gray-500 hover:text-gray-700"
              }`
            : "flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
        : mode === "mobilePrimary"
          ? "touch-target flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white font-semibold rounded-xl text-sm"
          : "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"

    const content = (
      <>
        {action.icon}
        {action.label}
      </>
    )

    if (action.href) {
      return (
        <Link
          key={action.key}
          href={action.href}
          title={action.title}
          className={className}
          onClick={mode === "mobileMenu" ? () => setMoreOpen(false) : undefined}
        >
          {content}
        </Link>
      )
    }

    return (
      <button
        key={action.key}
        type="button"
        title={action.title}
        onClick={() => {
          if (mode === "mobileMenu") setMoreOpen(false)
          action.onClick?.()
        }}
        disabled={action.disabled}
        className={className}
      >
        {content}
      </button>
    )
  }

  // Porcentaje de la acción en lote en curso. Mientras el primer bloque no ha
  // respondido el total es 0: ahí la barra se queda en 0 y el texto ya informa.
  const bulkPercent =
    bulkProgress && bulkProgress.total > 0
      ? Math.min(100, Math.round((bulkProgress.done / bulkProgress.total) * 100))
      : 0

  // Filtros secundarios plegados en móvil: se revelan con el mismo botón
  // "Filtros" que los selects. En escritorio (sm+) quedan siempre visibles.
  const secondaryFilterClass = filtersOpen ? "inline-flex" : "hidden sm:inline-flex"
  const activeFilterCount = activeProductFilterCount(filters)
  // Query de lo que se ve ahora, para marcar la vista guardada activa.
  const activePresetQuery = currentPresetQuery()

  // Chips de filtros activos: explican por qué el listado está recortado y
  // permiten quitar UN filtro sin abrir el panel "Filtros" (que en móvil está
  // plegado). Cada chip reutiliza el setter del control original y pasa por
  // `updateFilters`, así que quitar un chip vuelve a la página 1 igual que
  // cambiar el filtro a mano.
  type ActiveFilterChip = { key: string; label: string; onRemove: () => void }
  const activeFilterChips: ActiveFilterChip[] = []
  const addChip = (active: boolean, chip: ActiveFilterChip) => {
    if (active) activeFilterChips.push(chip)
  }
  addChip(debouncedSearch.trim() !== "", {
    key: "q",
    label: `Búsqueda: “${debouncedSearch.trim()}”`,
    onRemove: () =>
      updateFilters(() => {
        setSearch("")
        setDebouncedSearch("")
      }),
  })
  addChip(categoryFilter !== "all", {
    key: "category",
    label: `Categoría: ${
      categories.find((c) => String(c.id) === categoryFilter)?.name ?? categoryFilter
    }`,
    onRemove: () =>
      updateFilters(() => {
        setCategoryFilter("all")
      }),
  })
  addChip(stockFilter !== "all", {
    key: "stock",
    label: STOCK_FILTERS.find((f) => f.value === stockFilter)?.label ?? stockFilter,
    onRemove: () => updateFilters(() => setStockFilter("all")),
  })
  addChip(statusFilter !== "all", {
    key: "status",
    label: statusFilter === "published" ? "Publicados" : "Despublicados",
    onRemove: () => updateFilters(() => setStatusFilter("all")),
  })
  addChip(cityFilter !== "all", {
    key: "city",
    label: `Ciudad: ${cities.find((c) => String(c.id) === cityFilter)?.name ?? cityFilter}`,
    onRemove: () => updateFilters(() => setCityFilter("all")),
  })
  addChip(brandFilter !== "all", {
    key: "brand",
    label: `Marca: ${brandFilter}`,
    onRemove: () => updateFilters(() => setBrandFilter("all")),
  })
  addChip(tagFilter !== "all", {
    key: "tag",
    label: `Etiqueta: ${tagFilter}`,
    onRemove: () => updateFilters(() => setTagFilter("all")),
  })
  addChip(onlyNoImage, {
    key: "noImage",
    label: "Sin imagen",
    onRemove: () => updateFilters(() => setOnlyNoImage(false)),
  })
  addChip(onlyNoCities, {
    key: "noCities",
    label: "Sin ciudades",
    onRemove: () => updateFilters(() => setOnlyNoCities(false)),
  })
  addChip(onlyNoPrice, {
    key: "noPrice",
    label: "Sin precio",
    onRemove: () => updateFilters(() => setOnlyNoPrice(false)),
  })
  addChip(onlyNoCategory, {
    key: "noCategory",
    label: "Sin categoría",
    onRemove: () => updateFilters(() => setOnlyNoCategory(false)),
  })
  addChip(onlyWaMismatch, {
    key: "waMismatch",
    label: "WA sin publicar",
    onRemove: () => updateFilters(() => setOnlyWaMismatch(false)),
  })
  addChip(onlyOnSale, {
    key: "onSale",
    label: "En oferta",
    onRemove: () => updateFilters(() => setOnlyOnSale(false)),
  })
  addChip(onlyStaleSale, {
    key: "staleSale",
    label: "Ofertas vencidas",
    onRemove: () => updateFilters(() => setOnlyStaleSale(false)),
  })
  addChip(onlyUnderThreshold, {
    key: "underThreshold",
    label: "Bajo umbral",
    onRemove: () => updateFilters(() => setOnlyUnderThreshold(false)),
  })
  addChip(onlyDupNames, {
    key: "dupNames",
    label: "Nombres duplicados",
    onRemove: () => updateFilters(() => setOnlyDupNames(false)),
  })
  addChip(onlyTrash, {
    key: "trash",
    label: "Papelera",
    onRemove: () => updateFilters(() => setOnlyTrash(false)),
  })
  addChip(onlyBrokenImage, {
    key: "brokenImage",
    label: "Imagen rota",
    onRemove: () => updateFilters(() => setOnlyBrokenImage(false)),
  })

  // El estado vacío debe explicar POR QUÉ no hay filas: con filtros activos un
  // listado vacío no es un catálogo vacío, y sin una salida "Limpiar filtros" el
  // panel solo muestra una pantalla en blanco sin error (el síntoma reportado).
  const emptyListState = (
    <div className="px-5 py-12 text-center text-gray-400 text-sm">
      <p>
        {activeFilterCount > 0
          ? "Ningún producto coincide con los filtros activos"
          : "No se encontraron productos"}
      </p>
      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={clearFilters}
          className="touch-target mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <SlidersHorizontal className="w-4 h-4 text-gray-400" />
          Limpiar filtros
        </button>
      )}
    </div>
  )
  const healthIssues =
    counts.noImage +
    counts.noCities +
    counts.noPrice +
    counts.noCategory +
    counts.waMismatch +
    counts.dupNames +
    counts.underThreshold +
    brokenItems.length
  const stockAlertCount = (counts.lowStock ?? 0) + (counts.outStock ?? 0)

  // Estilos compartidos de las píldoras de categoría (activo/inactivo) y de su
  // contador, para no repetir el mismo ternario en cada píldora de la fila.
  // Mismo lenguaje visual que las píldoras de categoría del catálogo que ve el
  // cliente (`/r/[slug]`, `/admin/whatsapp`): píldora redonda, blanca con borde
  // en reposo y verde WhatsApp (`brand-500` = #0E7A0E) sólido al activo, con el
  // emoji de la categoría al frente. Se conserva el contador de productos, que
  // el catálogo no tiene, porque en el admin es información de trabajo. El gris
  // del texto es explícito (no `--text-secondary`) porque el admin es una
  // superficie clara fija y ese token se aclara en tema oscuro.
  const categoryChipClass = (active: boolean) =>
    `touch-target inline-flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
      active
        ? "bg-brand-500 text-white shadow-md shadow-brand-500/20"
        : "border border-[#E8E9EB] bg-white text-[#5C6068] hover:border-brand-500/30 hover:text-brand-600"
    }`
  const chipCountClass = (active: boolean) =>
    `text-[11px] font-bold tabular-nums ${
      active ? "text-white/90" : "text-[#6E737B]"
    }`

  // Acciones secundarias de una fila/tarjeta. Se agrupan en un menú "⋯"
  // para que cada fila no acumule ~10 iconos idénticos e indistinguibles.
  const productMenuItems = (product: Product): RowActionItem[] =>
    onlyTrash
      ? [
          {
            key: "restore",
            label: "Restaurar (queda despublicado)",
            icon: <RotateCcw className="w-4 h-4" />,
            onSelect: () => restoreProduct(product),
            disabled: deletingId === product.id,
          },
          {
            key: "purge",
            label: "Borrar definitivamente",
            icon: <Trash2 className="w-4 h-4" />,
            destructive: true,
            separatorBefore: true,
            onSelect: () => purgeTrash({ productIds: [product.id], ignoreRetention: true }),
            disabled: purging,
          },
        ]
      : [
          {
            key: "up",
            label: "Subir en el orden",
            icon: <ChevronUp className="w-4 h-4" />,
            onSelect: () => moveProduct(product, "up"),
            disabled: reorderingId === product.id,
          },
          {
            key: "down",
            label: "Bajar en el orden",
            icon: <ChevronDown className="w-4 h-4" />,
            onSelect: () => moveProduct(product, "down"),
            disabled: reorderingId === product.id,
          },
          {
            key: "duplicate",
            label: "Duplicar (nace despublicado)",
            icon: <Copy className="w-4 h-4" />,
            onSelect: () => duplicateProduct(product),
            disabled: duplicatingId === product.id,
          },
          {
            key: "history",
            label: "Historial de cambios",
            icon: <History className="w-4 h-4" />,
            onSelect: () => openHistory(product),
          },
          {
            key: "pause",
            label: "Pausar y republicar en N días",
            icon: <Pause className="w-4 h-4" />,
            onSelect: () => pauseProduct(product),
            disabled: saving.has(product.id),
          },
          {
            key: "qr",
            label: "Descargar QR",
            icon: <QrCode className="w-4 h-4" />,
            onSelect: () => downloadQr(product),
          },
          {
            key: "store-prices",
            label: "Precios por tienda",
            icon: <Store className="w-4 h-4" />,
            onSelect: () => openStorePrices(product),
          },
          {
            key: "delete",
            label: "Eliminar (va a la papelera)",
            icon: <Trash2 className="w-4 h-4" />,
            destructive: true,
            separatorBefore: true,
            onSelect: () => deleteProduct(product),
            disabled: deletingId === product.id,
          },
        ]

  const primaryAction = headerActions.find((a) => a.variant === "primary")
  const secondaryActions = headerActions.filter((a) => a.variant !== "primary")

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-6 sm:py-6">
      <div className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          {/* Región viva: anuncia el resultado del filtro/orden sin mover el
              foco. El texto del orden va en `sr-only` para que un cambio de
              orden (que no altera el conteo) también se anuncie. */}
          <p className="text-sm text-gray-500" role="status">
            <span>
              {total === counts.catalogTotal
                ? `${counts.catalogTotal} productos registrados`
                : `${total} de ${counts.catalogTotal} productos`}
            </span>
            <span className="sr-only">
              {`. Orden: ${PRODUCT_SORT_LABEL[sort.key]}, ${productSortDirLabel(sort.dir).toLowerCase()}`}
            </span>
            {refreshing && (
              <>
                <Loader2
                  aria-hidden="true"
                  className="inline w-3.5 h-3.5 ml-2 animate-spin text-brand-500"
                />
                <span className="sr-only">Actualizando el listado…</span>
              </>
            )}
          </p>
        </div>

        {/* Escritorio: barra completa de acciones */}
        <div className="hidden items-center gap-4 sm:flex">
          {headerActions.map((action) => renderHeaderAction(action, "desktop"))}
        </div>

        {/* Móvil: acción primaria siempre visible + menú con el resto */}
        <div className="relative flex items-center gap-2 sm:hidden">
          {primaryAction && renderHeaderAction(primaryAction, "mobilePrimary")}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            className="touch-target flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl text-sm"
          >
            <MoreHorizontal className="w-4 h-4" />
            Más
          </button>
          {moreOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-2 flex w-56 flex-col gap-1 rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
            >
              {secondaryActions.map((action) => renderHeaderAction(action, "mobileMenu"))}
            </div>
          )}
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

      {/* B19 — la fila cambió mientras se editaba: se explica y se ofrece
          recargar en vez de reintentar en silencio (lo que pisaría el cambio
          del otro usuario). */}
      {staleNotice && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 px-4 py-3 bg-amber-50 text-amber-900 text-sm rounded-xl border border-amber-200"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">El producto cambió mientras lo editabas</p>
            <p className="mt-0.5 break-words">{staleNotice.message}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setStaleNotice(null)
              setReloadKey((k) => k + 1)
            }}
            className="touch-target shrink-0 px-3 py-2 text-sm font-semibold text-amber-900 bg-white border border-amber-300 rounded-xl hover:bg-amber-100"
          >
            Recargar
          </button>
        </div>
      )}

      {/* Progreso de la acción en lote: barra + cancelar. Una acción sobre
          cientos de productos puede tardar; sin esto el panel parecía colgado
          y no había forma de pararla. */}
      {bulkProgress && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-white text-gray-700 text-sm rounded-xl border border-gray-200">
          <div className="flex-1 min-w-0">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-gray-600">
              <span>Aplicando cambios en lote…</span>
              <span aria-hidden="true">
                {bulkProgress.done} / {bulkProgress.total || "?"}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Productos actualizados"
              aria-valuemin={0}
              aria-valuemax={bulkProgress.total || undefined}
              aria-valuenow={bulkProgress.total > 0 ? bulkProgress.done : undefined}
              className="h-2 w-full overflow-hidden rounded-full bg-gray-100"
            >
              <div
                className="h-full rounded-full bg-brand-600 transition-[width] duration-200 motion-reduce:transition-none"
                style={{ width: `${bulkPercent}%` }}
              />
            </div>
            <p role="status" aria-live="polite" className="sr-only">
              {bulkProgress.done} de {bulkProgress.total || "?"} productos actualizados
            </p>
          </div>
          <button
            type="button"
            onClick={cancelBulk}
            disabled={bulkCancelling}
            className="touch-target flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-700 border border-gray-200 rounded-xl disabled:opacity-50"
          >
            <X className="w-4 h-4" />
            {bulkCancelling ? "Cancelando…" : "Cancelar"}
          </button>
        </div>
      )}

      {/* Fallos parciales de la última acción en lote, agrupados por motivo:
          antes se perdían en un toast de éxito engañoso. */}
      {bulkFailures && (
        <div
          role="alert"
          className="mb-4 px-4 py-3 bg-amber-50 text-amber-900 text-sm rounded-xl border border-amber-200"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold">
                {bulkFailures.count} {bulkFailures.count === 1 ? "producto" : "productos"} no se
                pudieron actualizar
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {bulkFailures.reasons.map((r) => (
                  <li key={r.reason} className="flex items-baseline gap-1.5">
                    <span className="font-semibold tabular-nums">{r.count}×</span>
                    <span className="min-w-0 break-words">{r.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setBulkFailures(null)}
              className="p-1 rounded-lg text-amber-700 hover:bg-amber-100"
              aria-label="Cerrar aviso de fallos"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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
            Faltan migraciones por aplicar en Supabase (00096–00116). El panel funciona en modo
            limitado (sin papelera, publicación programada, nota interna ni orden por más vendidos)
            hasta aplicarlas con{" "}
            <code className="font-mono text-xs">npx supabase db push</code>.
          </span>
        </div>
      )}

      {/* Aviso de metadatos degradados: row-meta entrega lo que pudo y declara
          qué fuente falló, para no mostrar columnas vacías sin explicación. */}
      {metaDegraded.length > 0 && (
        <div
          role="status"
          className="mb-4 flex items-center gap-2 px-4 py-3 bg-amber-50 text-amber-800 text-sm rounded-xl border border-amber-200"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            No se pudieron cargar todos los metadatos del listado
            {metaDegraded.length < 3
              ? `: ${metaDegraded.map((s) => META_SOURCE_LABELS[s]).join(", ")} aparecen vacíos.`
              : "."}{" "}
            Los datos del producto (precio, stock, estado) no se ven afectados.
          </span>
        </div>
      )}

      {/* Toast de éxito (fijo, expira solo) */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-green-700 text-white text-sm font-semibold rounded-xl shadow-lg"
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

      {/* Fase 12 — sugerencias de reabasto + historial de ajustes.
          En móvil van plegados: son diagnóstico, no el contenido principal. */}
      <MobileCollapsible
        id="alertas-inventario"
        label="Alertas de inventario"
        badge={stockAlertCount}
        icon={<AlertTriangle className="w-4 h-4 text-amber-700" />}
        open={alertsOpen}
        onToggle={() => setAlertsOpen((v) => !v)}
      >
        <RestockPanel
          onRestocked={(productId) =>
            setProducts((prev) =>
              prev.map((p) => (p.id === productId ? { ...p, stock_status: "in_stock" } : p))
            )
          }
        />
        {/* Alertas de stock: conteo de productos con stock bajo o agotado;
            cada chip filtra la tabla. */}
        {stockAlertCount > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="text-sm font-semibold text-amber-800">Alertas de inventario:</span>
            <button
              type="button"
              onClick={() => updateFilters(() => setStockFilter((f) => (f === "low_stock" ? "all" : "low_stock")))}
              aria-pressed={stockFilter === "low_stock"}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                stockFilter === "low_stock"
                  ? "bg-amber-700 text-white"
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
      </MobileCollapsible>

      {/* Fase 5 — búsqueda + filtros de categoría y stock.
          La búsqueda queda siempre visible; los selects se pliegan en móvil. */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 sm:flex-1">
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
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-controls="filtros-catalogo"
            className="touch-target flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 sm:hidden"
          >
            <SlidersHorizontal className="w-4 h-4 text-gray-400" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700">
                {activeFilterCount}
              </span>
            )}
            {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        <div
          id="filtros-catalogo"
          className={`${filtersOpen ? "flex" : "hidden sm:flex"} flex-col gap-3 sm:flex-row`}
        >
          <select
            value={categoryFilter}
            onChange={(e) =>
              updateFilters(() => {
                setCategoryFilter(e.target.value)
                // Igual que en los chips: elegir categoría limpia "Sin
                // categoría" para no dejar el listado vacío.
                setOnlyNoCategory(false)
              })
            }
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 bg-white focus:outline-none focus:border-brand-500"
            aria-label="Filtrar por categoría"
          >
            <option value="all">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {getCategoryIcon(c.icon, c.slug)} {c.name}
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
      </div>

      {/* Salud del catálogo: problemas detectados; cada chip aplica su filtro.
          En móvil va plegado tras el botón "Salud del catálogo". */}
      {healthIssues > 0 && (
        <MobileCollapsible
          id="salud-catalogo"
          label="Salud del catálogo"
          badge={healthIssues}
          icon={<HeartPulse className="w-4 h-4 text-amber-700" />}
          open={healthOpen}
          onToggle={() => setHealthOpen((v) => !v)}
        >
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <HeartPulse className="w-4 h-4 text-amber-700 shrink-0" />
              <span className="text-sm font-semibold text-amber-800">Salud del catálogo:</span>
          <button
            type="button"
            onClick={() => updateFilters(() => setOnlyNoImage((v) => !v))}
            aria-pressed={onlyNoImage}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              onlyNoImage
                ? "bg-amber-700 text-white"
                : "bg-white border border-amber-200 text-amber-700 hover:bg-amber-50"
            }`}
          >
            <ImagePlus className="w-3.5 h-3.5" />
            Sin imagen
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                onlyNoImage ? "bg-black/20 text-white" : "bg-amber-50 text-amber-700"
              }`}
            >
              {counts.noImage}
            </span>
          </button>
          {brokenItems.length > 0 && (
            <button
              type="button"
              onClick={() => setOnlyBrokenImage((v) => !v)}
              aria-pressed={onlyBrokenImage}
              title="Imágenes de esta página que no responden (revisadas con «Revisar imágenes»)"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                onlyBrokenImage
                  ? "bg-red-600 text-white"
                  : "bg-white border border-red-200 text-red-700 hover:bg-red-50"
              }`}
            >
              <ImageOff className="w-3.5 h-3.5" />
              Imagen rota
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  onlyBrokenImage ? "bg-black/20 text-white" : "bg-red-50 text-red-700"
                }`}
              >
                {brokenItems.length}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => updateFilters(() => setOnlyNoCities((v) => !v))}
            aria-pressed={onlyNoCities}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              onlyNoCities
                ? "bg-amber-700 text-white"
                : "bg-white border border-amber-200 text-amber-700 hover:bg-amber-50"
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Sin ciudades
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                onlyNoCities ? "bg-black/20 text-white" : "bg-amber-50 text-amber-700"
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
                ? "bg-amber-700 text-white"
                : "bg-white border border-amber-200 text-amber-700 hover:bg-amber-50"
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            Sin precio
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                onlyNoPrice ? "bg-black/20 text-white" : "bg-amber-50 text-amber-700"
              }`}
            >
              {counts.noPrice}
            </span>
          </button>
          <button
            type="button"
            onClick={() =>
              updateFilters(() => {
                const next = !onlyNoCategory
                setOnlyNoCategory(next)
                // Un producto sin categoría nunca cae en una categoría
                // concreta: activar este chip limpia el chip de categoría
                // para que la combinación no deje el listado vacío.
                if (next) setCategoryFilter("all")
              })
            }
            aria-pressed={onlyNoCategory}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              onlyNoCategory
                ? "bg-amber-700 text-white"
                : "bg-white border border-amber-200 text-amber-700 hover:bg-amber-50"
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Sin categoría
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                onlyNoCategory ? "bg-black/20 text-white" : "bg-amber-50 text-amber-700"
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
                onlyWaMismatch ? "bg-black/20 text-white" : "bg-red-50 text-red-700"
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
                ? "bg-amber-700 text-white"
                : "bg-white border border-amber-200 text-amber-700 hover:bg-amber-50"
            }`}
            title="Productos que comparten el mismo nombre"
          >
            <Copy className="w-3.5 h-3.5" />
            Nombres duplicados
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                onlyDupNames ? "bg-black/20 text-white" : "bg-amber-50 text-amber-700"
              }`}
            >
              {counts.dupNames}
            </span>
          </button>
            </div>
          </div>
        </MobileCollapsible>
      )}

      {/* Píldoras de categoría con el conteo de productos y el emoji de la
          categoría: atajo de un toque para escoger categoría sin abrir el
          `<select>` (y en móvil, donde los filtros van plegados). La fila es
          sticky debajo del sub-nav para poder cambiar de categoría en
          cualquier punto del listado, hace scroll horizontal (con máscara de
          degradado) y su alto se publica en `--admin-catbar-h`. */}
      {categories.length > 0 && (
        <div
          ref={categoryBarRef}
          className="sticky z-30 top-[calc(var(--header-top-offset)+var(--admin-subnav-h))] -mx-4 mb-3 border-b border-gray-200 bg-gray-50/95 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:mb-4 sm:px-6"
        >
          <div
            role="group"
            aria-label="Filtros rápidos por categoría"
            className="scrollbar-hide scroll-fade-x flex snap-x snap-mandatory items-center gap-2 overflow-x-auto"
          >
            <button
              type="button"
              onClick={() =>
                updateFilters(() => {
                  setCategoryFilter("all")
                  setOnlyNoCategory(false)
                })
              }
              aria-pressed={categoryFilter === "all" && !onlyNoCategory}
              className={categoryChipClass(categoryFilter === "all" && !onlyNoCategory)}
            >
              <LayoutGrid className="w-4 h-4" aria-hidden="true" />
              Todas
              <span className={chipCountClass(categoryFilter === "all" && !onlyNoCategory)}>
                {counts.catalogTotal}
              </span>
            </button>
            {categories.map((c) => {
              const active = categoryFilter === String(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    updateFilters(() => {
                      setCategoryFilter(String(c.id))
                      // Un producto sin categoría nunca cae en una categoría
                      // concreta: elegir una limpia ese filtro para que la
                      // combinación no deje el listado vacío.
                      setOnlyNoCategory(false)
                    })
                  }
                  aria-pressed={active}
                  title={`Ver solo los productos de ${c.name}`}
                  className={categoryChipClass(active)}
                >
                  {/* Mismo icono que la tienda (`getCategoryIcon`): la categoría
                      trae su emoji en `categories.icon` y el helper resuelve el
                      fallback por slug y el genérico cuando falta. */}
                  <span aria-hidden="true" className="text-base leading-none">
                    {getCategoryIcon(c.icon, c.slug)}
                  </span>
                  {c.name}
                  <span className={chipCountClass(active)}>{categoryCounts[String(c.id)] ?? 0}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Chips de estado de publicación y catálogo incompleto (con conteos) */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3 sm:gap-2 sm:mb-4">
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
                statusFilter === chip.value ? "bg-black/20 text-white" : "bg-gray-100 text-gray-600"
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
          className={`${secondaryFilterClass} items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            onlyOnSale
              ? "bg-green-700 text-white"
              : "bg-white border border-green-200 text-green-700 hover:bg-green-50"
          }`}
          title="Productos con precio de oferta"
        >
          <Percent className="w-3.5 h-3.5" />
          En oferta
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              onlyOnSale ? "bg-black/20 text-white" : "bg-green-50 text-green-700"
            }`}
          >
            {counts.onSale}
          </span>
        </button>
        <button
          type="button"
          onClick={() => updateFilters(() => setOnlyStaleSale((v) => !v))}
          aria-pressed={onlyStaleSale}
          className={`${secondaryFilterClass} items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            onlyStaleSale
              ? "bg-amber-700 text-white"
              : "bg-white border border-amber-200 text-amber-700 hover:bg-amber-50"
          }`}
          title="Ofertas con fecha de fin ya vencida (el precio de oferta sigue guardado)"
        >
          <Clock className="w-3.5 h-3.5" />
          Ofertas vencidas
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              onlyStaleSale ? "bg-black/20 text-white" : "bg-amber-50 text-amber-700"
            }`}
          >
            {counts.staleSale}
          </span>
        </button>
        {onlyStaleSale && counts.staleSale > 0 && (
          <button
            type="button"
            onClick={clearExpiredSales}
            disabled={bulkSaving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 disabled:opacity-50"
            title="Borra precio de oferta y ventana en los productos con oferta vencida de esta página"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpiar ofertas vencidas
          </button>
        )}
        <button
          type="button"
          onClick={() => updateFilters(() => setOnlyUnderThreshold((v) => !v))}
          aria-pressed={onlyUnderThreshold}
          className={`${secondaryFilterClass} items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            onlyUnderThreshold
              ? "bg-red-600 text-white"
              : "bg-white border border-red-200 text-red-700 hover:bg-red-50"
          }`}
          title="Productos con existencia en o por debajo de su umbral de stock bajo"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Bajo umbral
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              onlyUnderThreshold ? "bg-black/20 text-white" : "bg-red-50 text-red-700"
            }`}
          >
            {counts.underThreshold}
          </span>
        </button>
        {tagList.length > 0 && (
          <label className={`${secondaryFilterClass} items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-600`}>
            <Tag className="w-3.5 h-3.5 text-gray-400" />
            <span className="sr-only">Filtrar por etiqueta</span>
            <select
              value={tagFilter}
              onChange={(e) => updateFilters(() => setTagFilter(e.target.value))}
              className="bg-transparent text-xs font-semibold text-gray-700 focus:outline-none"
              title="Etiquetas usadas por las colecciones de la tienda"
            >
              <option value="all">Todas las etiquetas</option>
              {tagList.map((t) => (
                <option key={t.tag} value={t.tag}>
                  {t.tag} ({t.count})
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={() => updateFilters(() => setOnlyTrash((v) => !v))}
          aria-pressed={onlyTrash}
          className={`${secondaryFilterClass} items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
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
              onlyTrash ? "bg-black/20 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {counts.trash}
          </span>
        </button>
        {onlyTrash && (
          <button
            type="button"
            onClick={() => purgeTrash()}
            disabled={purging || counts.trash === 0}
            title={`Borrar definitivamente los productos con más de ${TRASH_RETENTION_DAYS} días en la papelera`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {purging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Vaciar papelera
          </button>
        )}
        {/* Vistas guardadas de filtros */}
        <div className={filtersOpen ? "relative" : "hidden sm:block relative"}>
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
            <div className="absolute z-30 mt-1 w-64 rounded-xl border border-gray-200 bg-white shadow-lg p-2">
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
                <p className="px-3 py-2 text-[11px] text-gray-400">
                  Sin vistas guardadas. Guarda la combinación de filtros, orden y vista para
                  recuperarla con un clic.
                </p>
              ) : (
                <ul className="mt-1 divide-y divide-gray-50">
                  {savedViews.map((v) => {
                    const active = isActiveProductPreset(v, activePresetQuery)
                    return (
                      <li key={v.name} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => applyView(v)}
                          aria-current={active ? "true" : undefined}
                          className={`flex-1 min-w-0 text-left px-3 py-2 min-h-11 rounded-lg text-xs truncate ${
                            active
                              ? "bg-brand-50 text-brand-700 font-semibold"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                          title={`Aplicar vista ${v.name} — ${describeProductPreset(v)}`}
                        >
                          {v.name}
                          <span
                            className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              active ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {productPresetFilterCount(v)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteView(v.name)}
                          aria-label={`Borrar vista ${v.name}`}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-700 hover:bg-red-50 touch-target"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {savedViews.length > 0 && (
                <p className="px-3 pt-2 pb-1 text-[10px] text-gray-400">
                  {savedViews.length} de {MAX_PRODUCT_PRESETS} vistas · las más antiguas se
                  descartan al superar el tope
                </p>
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

        {/* Orden del listado. El `select` cubre TODAS las claves (incluidas las
            que no tienen columna propia, como unidades, costo o fecha de alta);
            los botones de la cabecera de la tabla siguen siendo el atajo para
            nombre/precio/stock. */}
        <div
          className={`${filtersOpen ? "flex" : "hidden sm:flex"} items-center gap-1 rounded-lg border border-gray-200 bg-white pl-1.5 pr-0.5 py-0.5`}
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
          <label htmlFor="product-sort-key" className="sr-only">
            Ordenar por
          </label>
          <select
            id="product-sort-key"
            value={sort.key}
            onChange={(e) => {
              const key = e.target.value as ProductSortKey
              // La dirección la fija la clave (ventas arranca en descendente),
              // no la que traía la clave anterior.
              setSort({ key, dir: defaultProductSortDir(key) })
            }}
            title="Ordenar el listado por"
            className="max-w-[9rem] bg-transparent text-xs font-semibold text-gray-600 focus:outline-none"
          >
            {PRODUCT_SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {PRODUCT_SORT_LABEL[k]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSort((prev) => ({ key: prev.key, dir: prev.dir === "asc" ? "desc" : "asc" }))}
            aria-label={`Dirección del orden: ${productSortDirLabel(sort.dir)}. Pulsa para invertir`}
            title={`Dirección: ${productSortDirLabel(sort.dir)}`}
            className="p-1 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            {sort.dir === "asc" ? (
              <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
          {sort.key !== DEFAULT_PRODUCT_SORT.key && (
            <button
              type="button"
              onClick={() => setSort(DEFAULT_PRODUCT_SORT)}
              aria-label="Volver al orden por defecto (nombre ascendente)"
              title="Orden por defecto"
              className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Chips de filtros activos. Sustituyen a tener que recordar qué se
          marcó: cada chip quita su filtro y "Limpiar todo" vacía la lista.
          Scroll horizontal en móvil para no empujar el listado hacia abajo. */}
      {activeFilterChips.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
          <span className="text-xs font-semibold text-gray-500">
            Filtros activos ({activeFilterChips.length})
          </span>
          {activeFilterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onRemove}
              aria-label={`Quitar filtro: ${chip.label}`}
              className="touch-target inline-flex max-w-full items-center gap-1 rounded-full border border-brand-200 bg-brand-50 py-1 pl-2.5 pr-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100"
            >
              <span className="truncate">{chip.label}</span>
              <X className="w-3 h-3 shrink-0" aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="ml-auto text-xs font-semibold text-gray-500 underline hover:text-gray-700"
          >
            Limpiar todo
          </button>
        </div>
      )}

      {/* Barra de acciones para la selección. Es sticky: se ancla DEBAJO del
          sub-nav de /admin (--admin-subnav-h, publicado por AdminSubNav con un
          ResizeObserver) y debajo de la fila sticky de categorías
          (--admin-catbar-h), para poder aplicar acciones sin volver a subir.
          Va en z-20 —por debajo del z-30 de las categorías— para pasar por
          debajo de ellas al desplazarse.
          En móvil es una sola fila con scroll horizontal (sin wrap) para no
          comerse la pantalla; en sm+ se conserva el wrap. */}
      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Acciones masivas"
          className="sticky z-20 top-[calc(var(--header-top-offset)+var(--admin-subnav-h)+var(--admin-catbar-h))] mb-4 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-1.5 shadow-sm sm:px-4 sm:py-3"
        >
          <span className="shrink-0 text-sm font-semibold text-brand-900">
            {selected.size} seleccionado{selected.size === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex items-center gap-2 overflow-x-auto sm:flex-wrap sm:overflow-visible">
            <button
              onClick={() => openCityModal()}
              disabled={bulkSaving || cityModalLoading}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50"
            >
              <MapPin className="w-3.5 h-3.5" />
              {cityModalLoading ? "Cargando…" : "Elegir ciudades…"}
            </button>
            <button
              onClick={() => applyAllCities(true)}
              disabled={bulkSaving}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold hover:bg-blue-100 disabled:opacity-50"
              title="Disponibles en todas las ciudades (Global)"
            >
              <Globe className="w-3.5 h-3.5" />
              Todas
            </button>
            <button
              onClick={() => applyAllCities(false)}
              disabled={bulkSaving}
              className="touch-target whitespace-nowrap px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-semibold hover:bg-red-100 disabled:opacity-50"
              title="No disponibles en ninguna ciudad"
            >
              Ninguna
            </button>
            {/* Fase 5 — visibilidad en tienda en lote */}
            <button
              onClick={() => bulkSetVisibility(true)}
              disabled={bulkSaving}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 text-xs font-semibold hover:bg-green-100 disabled:opacity-50"
            >
              <Eye className="w-3.5 h-3.5" />
              Mostrar en tienda
            </button>
            <button
              onClick={() => bulkSetVisibility(false)}
              disabled={bulkSaving}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 border border-gray-200 text-xs font-semibold hover:bg-gray-200 disabled:opacity-50"
            >
              <EyeOff className="w-3.5 h-3.5" />
              Ocultar de tienda
            </button>
            <button
              onClick={() => setBulkCategoryOpen(true)}
              disabled={bulkSaving}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-xs font-semibold hover:bg-purple-100 disabled:opacity-50"
              title="Cambiar la categoría de la selección"
            >
              <Tag className="w-3.5 h-3.5" />
              Categoría…
            </button>
            <button
              onClick={() => setBulkUnitOpen(true)}
              disabled={bulkSaving}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 text-xs font-semibold hover:bg-teal-100 disabled:opacity-50"
              title="Asignar unidad (kg, pieza…) a la selección"
            >
              <Package className="w-3.5 h-3.5" />
              Unidad…
            </button>
            <button
              onClick={() => setBulkPriceOpen(true)}
              disabled={bulkSaving}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 text-xs font-semibold hover:bg-orange-100 disabled:opacity-50"
              title="Ajustar precios de la selección en ±%"
            >
              <Percent className="w-3.5 h-3.5" />
              Precio %…
            </button>
            <button
              onClick={() => setBulkSaleOpen(true)}
              disabled={bulkSaving}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-50 text-pink-700 border border-pink-200 text-xs font-semibold hover:bg-pink-100 disabled:opacity-50"
              title="Aplicar o quitar ofertas en la selección"
            >
              <Tag className="w-3.5 h-3.5" />
              Oferta…
            </button>
            <button
              onClick={() => setBulkTagOpen(true)}
              disabled={bulkSaving}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold hover:bg-indigo-100 disabled:opacity-50"
              title="Agregar o quitar una etiqueta en la selección"
            >
              <Tag className="w-3.5 h-3.5" />
              Etiqueta…
            </button>
            <button
              onClick={() => setBulkMarginOpen(true)}
              disabled={bulkSaving}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-50 text-lime-700 border border-lime-200 text-xs font-semibold hover:bg-lime-100 disabled:opacity-50"
              title="Oferta calculada para conservar un margen mínimo (requiere costo)"
            >
              <Percent className="w-3.5 h-3.5" />
              Margen…
            </button>
            <button
              onClick={generateSeoBatch}
              disabled={bulkSaving || seoGenerating}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 border border-violet-200 text-xs font-semibold hover:bg-violet-100 disabled:opacity-50"
              title="Generar título y descripción SEO con IA (solo productos sin SEO)"
            >
              {seoGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {seoGenerating ? "Generando SEO…" : "SEO con IA…"}
            </button>
            <button
              onClick={() => bulkSetWhatsApp(true)}
              disabled={bulkSaving}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50"
              title="Mostrar la selección en el catálogo de WhatsApp"
            >
              <Eye className="w-3.5 h-3.5" />
              WA sí
            </button>
            <button
              onClick={() => bulkSetWhatsApp(false)}
              disabled={bulkSaving}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50"
              title="Ocultar la selección del catálogo de WhatsApp"
            >
              <EyeOff className="w-3.5 h-3.5" />
              WA no
            </button>
            <button
              onClick={copySelection}
              disabled={bulkSaving}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold hover:bg-indigo-100 disabled:opacity-50"
              title="Copiar la selección como lista Nombre — $precio"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Copiar
            </button>
            <button
              onClick={bulkGenerateImages}
              disabled={bulkAiBusy}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-xs font-semibold hover:bg-purple-100 disabled:opacity-50"
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
                className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 text-xs font-semibold hover:bg-fuchsia-100 disabled:opacity-50"
                title="Fusionar: conserva el de menor id, el otro va a la papelera"
              >
                <Copy className="w-3.5 h-3.5" />
                Fusionar
              </button>
            )}
            <button
              onClick={bulkDuplicate}
              disabled={bulkSaving}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 text-xs font-semibold hover:bg-sky-100 disabled:opacity-50"
              title="Duplicar la selección (las copias nacen despublicadas)"
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicar
            </button>
            <button
              onClick={bulkDelete}
              disabled={bulkSaving}
              className="touch-target whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-semibold hover:bg-red-100 disabled:opacity-50"
              title="Eliminar la selección (los que tengan pedidos se omiten)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar
            </button>
            <button
              onClick={() => clearSelection()}
              disabled={bulkSaving}
              className="touch-target whitespace-nowrap px-2 py-1.5 text-xs font-semibold text-gray-500 hover:underline disabled:opacity-50"
            >
              Limpiar
            </button>
            {bulkSaving && <Loader2 className="w-4 h-4 animate-spin text-brand-600" />}
          </div>
        </div>
      )}

      {/* Products: tabla o grid. `aria-busy` cubre el refetch del listado
          (filtros, orden, página). Antes se atenuaba todo el bloque con
          `opacity-60`, lo que bajaba el contraste del texto ya renderizado; ahora
          la señal de "actualizando" es el spinner de la cabecera (junto al
          conteo, en la región viva) y el anuncio `sr-only`, sin tocar el texto. */}
      {view === "table" ? (
      <div
        aria-busy={refreshing}
        /* La tabla scrollea dentro de la tarjeta para que el encabezado pueda
           quedarse pegado: `overflow-x-auto` convierte el eje Y en `auto` y un
           `th` sticky quedaría anclado a un scrollport que no scrollea. El
           alto se calcula con las mismas variables que el sub-nav y la fila de
           categorías (nunca con offsets a mano), con un mínimo para que en
           pantallas bajas la tarjeta siga siendo usable. */
        className="flex max-h-[max(24rem,calc(100dvh-var(--header-top-offset)-var(--admin-subnav-h)-var(--admin-catbar-h)-1.5rem))] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white"
      >
        <div ref={tableScrollRef} className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50">
              <tr className="text-left text-xs text-gray-400 font-medium">
                <th className="pl-4 pr-1 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    aria-label="Seleccionar todos los productos filtrados"
                    className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                </th>
                <th className="px-3 py-3" aria-sort={ariaSortFor("name", sort)}>
                  <button
                    type="button"
                    onClick={() => toggleSort("name")}
                    className="inline-flex items-center gap-1 hover:text-gray-600"
                    aria-label="Ordenar por nombre"
                  >
                    Producto {sortIcon("name")}
                  </button>
                </th>
                <th className="px-5 py-3 hidden md:table-cell">Categoría</th>
                <th className="px-5 py-3" aria-sort={ariaSortFor("price", sort)}>
                  <button
                    type="button"
                    onClick={() => toggleSort("price")}
                    className="inline-flex items-center gap-1 hover:text-gray-600"
                    aria-label="Ordenar por precio"
                  >
                    Precio {sortIcon("price")}
                  </button>
                </th>
                <th className="px-5 py-3 hidden md:table-cell" title="(precio de venta − costo) / precio de venta">
                  Margen
                </th>
                <th className="px-5 py-3" aria-sort={ariaSortFor("stock", sort)}>
                  <button
                    type="button"
                    onClick={() => toggleSort("stock")}
                    className="inline-flex items-center gap-1 hover:text-gray-600"
                    aria-label="Ordenar por stock"
                  >
                    Stock {sortIcon("stock")}
                  </button>
                </th>
                <th className="px-5 py-3 hidden md:table-cell">Estado</th>
                <th className="px-5 py-3 hidden md:table-cell">WhatsApp</th>
                <th className="px-5 py-3 hidden md:table-cell">Ciudades</th>
                <th className="px-5 py-3 hidden md:table-cell" aria-sort={ariaSortFor("sales", sort)}>
                  <button
                    type="button"
                    onClick={() => toggleSort("sales")}
                    className="inline-flex items-center gap-1 hover:text-gray-600"
                    aria-label="Ordenar por más vendidos"
                    title="Unidades vendidas (histórico)"
                  >
                    Ventas {sortIcon("sales")}
                  </button>
                </th>
                <th className="px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(filterBroken ? brokenItems : pageItems).map((product) => {
                const global = isGlobal(product.id)
                const cityCount = citiesAvailableCount(product.id)
                const edit = lastEdit[product.id]
                const soldAmount = salesAmount[product.id] ?? 0
                const imageIssue = imageIssues[product.id]
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
                                className="inline w-3.5 h-3.5 ml-1.5 text-amber-700 align-text-top"
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
                          <p className="text-xs text-gray-400">
                            {product.brand ?? "—"}
                            {product.sku && (
                              <span className="ml-1.5 font-mono text-[10px] text-gray-400">
                                · {product.sku}
                              </span>
                            )}
                          </p>
                          {(product.tags?.length ||
                            saleState(product) === "expired" ||
                            product.barcode ||
                            imageIssue ||
                            (product.related_product_ids?.length ?? 0) > 0 ||
                            (onlyTrash && purgeLabel(product.deleted_at))) && (
                            <div className="flex flex-wrap items-center gap-1 mt-1">
                              {onlyTrash && purgeLabel(product.deleted_at) && (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 text-[10px] font-bold"
                                  title={`Eliminado el ${new Date(product.deleted_at ?? "").toLocaleString("es-CO")}`}
                                >
                                  <Clock className="w-3 h-3" />
                                  {purgeLabel(product.deleted_at)}
                                </span>
                              )}
                              {(product.related_product_ids?.length ?? 0) > 0 && (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-bold"
                                  title="Tiene productos relacionados elegidos a mano"
                                >
                                  <Link2 className="w-3 h-3" />
                                  {product.related_product_ids?.length}
                                </span>
                              )}
                              {imageIssue && (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold"
                                  title={`La imagen no responde: ${imageIssue.reason}${
                                    imageIssue.url ? ` (${imageIssue.url})` : ""
                                  }`}
                                >
                                  <ImageOff className="w-3 h-3" />
                                  Imagen rota
                                </span>
                              )}
                              {(product.tags ?? []).slice(0, 4).map((t) => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[10px] font-semibold"
                                >
                                  {t}
                                </span>
                              ))}
                              {(product.tags?.length ?? 0) > 4 && (
                                <span className="text-[10px] text-gray-400">
                                  +{(product.tags?.length ?? 0) - 4}
                                </span>
                              )}
                              {product.barcode && (
                                <span
                                  className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-mono"
                                  title="Código de barras"
                                >
                                  {product.barcode}
                                </span>
                              )}
                              {saleState(product) === "expired" && (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold"
                                  title={`La oferta terminó el ${new Date(
                                    product.sale_ends_at as string
                                  ).toLocaleDateString("es-MX")}; la tienda ya cobra el precio normal`}
                                >
                                  <Clock className="w-3 h-3" />
                                  Oferta vencida
                                </span>
                              )}
                            </div>
                          )}
                          {edit && (
                            <p className="text-[10px] text-gray-400">
                              Editado {timeAgo(edit.at)}
                              {edit.email ? ` por ${edit.email}` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                        <Tag className="w-3 h-3" />
                        {categoryName(product.category_id)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {editingPrice === product.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                            Precio
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draftPrice}
                            onChange={(e) => setDraftPrice(e.target.value)}
                            aria-label={`Precio base de ${product.name}`}
                            className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-brand-500"
                          />
                          <button
                            onClick={() => savePrice(product)}
                            disabled={saving.has(product.id)}
                            className="p-1 rounded-lg text-green-700 hover:bg-green-50"
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
                          title="Editar precio base (la oferta se edita en el formulario)"
                          aria-label={`Editar precio base de ${product.name}`}
                        >
                          {resolveSalePrice(product) != null ? (
                            <div className="flex items-center">
                              <span className="font-semibold text-brand-600">
                                ${Number(resolveSalePrice(product)).toFixed(2)}
                              </span>
                              <span className="ml-1.5 text-xs text-gray-400 line-through">
                                ${Number(product.price ?? 0).toFixed(2)}
                              </span>
                            </div>
                          ) : product.sale_price != null ? (
                            // Oferta guardada pero fuera de vigencia: se muestra
                            // tachada para que el admin vea que ya no aplica.
                            <div className="flex items-center">
                              <span className="font-semibold text-gray-900">
                                ${Number(product.price ?? 0).toFixed(2)}
                              </span>
                              <span
                                className="ml-1.5 text-xs text-gray-400 line-through"
                                title="Precio de oferta guardado, fuera de la ventana de vigencia"
                              >
                                ${Number(product.sale_price).toFixed(2)}
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
                    <td className="px-5 py-3 hidden md:table-cell">
                      {(() => {
                        const selling = resolveSalePrice(product) ?? product.price
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
                    <td className="px-5 py-3 hidden md:table-cell">
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
                    <td className="px-5 py-3 hidden md:table-cell">
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
                    <td className="px-5 py-3 hidden md:table-cell">
                      <button
                        onClick={() => openCityModal(product.id)}
                        disabled={cities.length === 0 || cityModalLoading}
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
                    <td className="px-5 py-3 hidden md:table-cell">
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
                          onClick={() => setProductForm(product)}
                          title={`Editar ${product.name}`}
                          aria-label={`Editar ${product.name}`}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        >
                          <SquarePen className="w-4 h-4" />
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
                        <RowActionMenu
                          label={`Más acciones para ${product.name}`}
                          items={productMenuItems(product)}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {total === 0 && !refreshing && emptyListState}
        </div>
      </div>
      ) : (
        <div
          aria-busy={refreshing}
          className="bg-white rounded-xl border border-gray-200 p-4"
        >
          {total === 0 && !refreshing ? (
            emptyListState
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {(filterBroken ? brokenItems : pageItems).map((product) => (
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
                  {(product.related_product_ids?.length ?? 0) > 0 && (
                    <span
                      className="absolute top-2 right-2 z-10 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-bold shadow"
                      title="Tiene productos relacionados elegidos a mano"
                    >
                      <Link2 className="w-3 h-3" />
                      {product.related_product_ids?.length}
                    </span>
                  )}
                  {imageIssues[product.id] && (
                    <span
                      className={`absolute right-2 z-10 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold shadow ${
                        (product.related_product_ids?.length ?? 0) > 0 ? "top-9" : "top-2"
                      }`}
                      title={`La imagen no responde: ${imageIssues[product.id]?.reason}`}
                    >
                      <ImageOff className="w-3 h-3" />
                      Rota
                    </span>
                  )}
                  {onlyTrash && purgeLabel(product.deleted_at) && (
                    <span
                      className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gray-900/80 text-white text-[10px] font-bold shadow"
                      title={`Eliminado el ${new Date(product.deleted_at ?? "").toLocaleString("es-CO")}`}
                    >
                      <Clock className="w-3 h-3" />
                      {purgeLabel(product.deleted_at)}
                    </span>
                  )}
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
                          className="touch-target p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        >
                          <SquarePen className="w-4 h-4" />
                        </button>
                        {cities[0] && (
                          <Link
                            href={`/${cities[0].slug}/producto/${product.slug}`}
                            target="_blank"
                            title={`Ver ${product.name} en la tienda`}
                            aria-label={`Ver ${product.name} en la tienda`}
                            className="touch-target p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        )}
                        <RowActionMenu
                          label={`Más acciones para ${product.name}`}
                          items={productMenuItems(product)}
                        />
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5 bg-white rounded-xl border border-gray-200">
            <p className="text-xs text-gray-400">
              Mostrando {(currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, total)} de {total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                aria-label="Primera página"
                title="Primera página"
                className="touch-target p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                aria-label="Página anterior"
                title="Página anterior"
                className="touch-target p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {/* `key={currentPage}` remonta el input cuando la página cambia
                  (por botón, filtro o URL) para que el valor mostrado sea
                  siempre el real sin sincronizar estado en un efecto. */}
              <div className="flex items-center gap-1 px-1 text-xs font-medium text-gray-600">
                <label htmlFor="products-page-jump" className="sr-only">
                  Ir a la página
                </label>
                <input
                  key={currentPage}
                  id="products-page-jump"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={totalPages}
                  defaultValue={currentPage}
                  onBlur={(e) => {
                    e.currentTarget.value = String(goToPage(Number(e.currentTarget.value)))
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return
                    e.preventDefault()
                    e.currentTarget.value = String(goToPage(Number(e.currentTarget.value)))
                  }}
                  className="w-12 rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-center text-xs tabular-nums text-gray-700 focus:outline-none focus:border-brand-500"
                />
                <span aria-hidden="true">/</span>
                <span className="tabular-nums">{totalPages}</span>
              </div>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                aria-label="Página siguiente"
                title="Página siguiente"
                className="touch-target p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages}
                aria-label="Última página"
                title="Última página"
                className="touch-target p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
              <select
                value={pageSize}
                onChange={(e) => updateFilters(() => setPageSize(Number(e.target.value)))}
                aria-label="Productos por página"
                className="ml-1 px-2 py-1 border border-gray-200 rounded-lg text-xs text-gray-600 bg-white focus:outline-none focus:border-brand-500"
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
                      <span className="ml-auto text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
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
                <>
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
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[11px] font-semibold text-gray-600">
                      Desde
                      <input
                        type="datetime-local"
                        value={bulkSaleStart}
                        onChange={(e) => setBulkSaleStart(e.target.value)}
                        className="mt-1 w-full px-2.5 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-brand-500"
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-gray-600">
                      Hasta
                      <input
                        type="datetime-local"
                        value={bulkSaleEnd}
                        onChange={(e) => setBulkSaleEnd(e.target.value)}
                        className="mt-1 w-full px-2.5 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-brand-500"
                      />
                    </label>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Ventana opcional de la oferta; vacía = sin límite de vigencia.
                  </p>
                </>
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

      {/* Modal: etiquetas en lote */}
      {bulkTagOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !bulkSaving && setBulkTagOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Etiquetas en lote</h2>
              <button
                onClick={() => setBulkTagOpen(false)}
                disabled={bulkSaving}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-500">
                Se aplicará a {selected.size} producto{selected.size === 1 ? "" : "s"}. Las
                etiquetas alimentan las colecciones de la tienda.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBulkTagMode("add")}
                  aria-pressed={bulkTagMode === "add"}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    bulkTagMode === "add"
                      ? "bg-indigo-600 text-white"
                      : "bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                  }`}
                >
                  Agregar
                </button>
                <button
                  type="button"
                  onClick={() => setBulkTagMode("remove")}
                  aria-pressed={bulkTagMode === "remove"}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    bulkTagMode === "remove"
                      ? "bg-gray-700 text-white"
                      : "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  Quitar
                </button>
              </div>
              <input
                value={bulkTagValue}
                onChange={(e) => setBulkTagValue(e.target.value)}
                placeholder="arranque, limpieza…"
                maxLength={40}
                list="bulk-tag-suggestions"
                aria-label="Etiqueta"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500"
              />
              <datalist id="bulk-tag-suggestions">
                {tagList.map((t) => (
                  <option key={t.tag} value={t.tag} />
                ))}
              </datalist>
              {bulkTagMode === "add" && tagList.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tagList.slice(0, 10).map((t) => (
                    <button
                      key={t.tag}
                      type="button"
                      onClick={() => setBulkTagValue(t.tag)}
                      className="px-2 py-0.5 rounded-full border border-gray-200 text-[11px] text-gray-500 hover:bg-gray-50"
                    >
                      {t.tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setBulkTagOpen(false)}
                disabled={bulkSaving}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={bulkTag}
                disabled={bulkSaving || !bulkTagValue.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
              >
                {bulkSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal R7-10: SEO con IA — preview editable antes de aplicar */}
      {seoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !seoApplying && setSeoOpen(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-600" />
                  SEO con IA
                </h2>
                <p className="text-xs text-gray-500">
                  {seoProposals.length} propuesta{seoProposals.length === 1 ? "" : "s"} · revisa y
                  edita antes de aplicar
                </p>
              </div>
              <button
                onClick={() => setSeoOpen(false)}
                disabled={seoApplying}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-50"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {seoProposals.map((draft) => {
                const titleLen = draft.seo_title.length
                const descLen = draft.seo_description.length
                return (
                  <div
                    key={draft.id}
                    className="rounded-xl border border-gray-200 px-3 py-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900">{draft.name}</p>
                      <button
                        type="button"
                        onClick={() =>
                          setSeoProposals((prev) => prev.filter((p) => p.id !== draft.id))
                        }
                        className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"
                        aria-label={`Quitar propuesta de ${draft.name}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                        Título SEO
                      </label>
                      <input
                        value={draft.seo_title}
                        maxLength={SEO_TITLE_MAX}
                        onChange={(e) =>
                          setSeoProposals((prev) =>
                            prev.map((p) =>
                              p.id === draft.id ? { ...p, seo_title: e.target.value } : p
                            )
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500"
                      />
                      <p
                        className={`mt-1 text-[11px] ${
                          titleLen > SEO_TITLE_MAX ? "text-amber-700" : "text-gray-400"
                        }`}
                      >
                        {titleLen}/{SEO_TITLE_MAX} caracteres
                      </p>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                        Descripción SEO
                      </label>
                      <textarea
                        value={draft.seo_description}
                        maxLength={SEO_DESCRIPTION_MAX}
                        rows={2}
                        onChange={(e) =>
                          setSeoProposals((prev) =>
                            prev.map((p) =>
                              p.id === draft.id ? { ...p, seo_description: e.target.value } : p
                            )
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:border-brand-500"
                      />
                      <p
                        className={`mt-1 text-[11px] ${
                          descLen > SEO_DESCRIPTION_MAX ? "text-amber-700" : "text-gray-400"
                        }`}
                      >
                        {descLen}/{SEO_DESCRIPTION_MAX} caracteres
                      </p>
                    </div>
                  </div>
                )
              })}

              {seoProposals.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">
                  No quedan propuestas por aplicar.
                </p>
              )}

              {(seoSkipped.length > 0 || seoFailed.length > 0) && (
                <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-3">
                  <p className="text-xs font-semibold text-gray-600 mb-1.5">
                    Omitidos ({seoSkipped.length}) y sin respuesta ({seoFailed.length})
                  </p>
                  <ul className="space-y-1">
                    {[...seoSkipped, ...seoFailed].slice(0, 12).map((note) => (
                      <li key={`${note.id}-${note.reason}`} className="text-[11px] text-gray-500">
                        {note.name} · {note.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100">
              <label className="flex items-center gap-2 text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={seoOverwrite}
                  onChange={(e) => setSeoOverwrite(e.target.checked)}
                  disabled={seoGenerating || seoApplying}
                  className="rounded border-gray-300"
                />
                Sobrescribir SEO existente
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={generateSeoBatch}
                  disabled={seoGenerating || seoApplying}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {seoGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Regenerar
                </button>
                <button
                  type="button"
                  onClick={() => setSeoOpen(false)}
                  disabled={seoApplying}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={applySeoBatch}
                  disabled={seoApplying || seoProposals.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
                >
                  {seoApplying && <Loader2 className="w-4 h-4 animate-spin" />}
                  Aplicar {seoProposals.length}
                </button>
              </div>
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
              ) : activityDegraded ? (
                <p className="py-8 text-center text-sm text-amber-700">
                  Historial no disponible en este momento.
                </p>
              ) : activityEntries.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Sin actividad registrada.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {activityEntries.map((entry, i) => {
                    const diff = (entry.detail?.after ?? {}) as Record<string, unknown>
                    const prev = (entry.detail?.before ?? {}) as Record<string, unknown>
                    const productName =
                      (entry.detail?.name as string | undefined) ??
                      (diff.name as string | undefined) ??
                      (prev.name as string | undefined) ??
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
      {/* Ronda 7 — imágenes que no responden, con acciones por fila */}
      {imagesModalOpen && brokenItems.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setImagesModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <ImageOff className="w-4 h-4 text-red-600" />
                Imágenes rotas ({brokenItems.length})
              </h2>
              <button
                onClick={() => setImagesModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto space-y-2">
              <p className="text-xs text-gray-500">
                Estas URLs no respondieron al sondeo. Quita la imagen o pega una nueva: la tienda
                dejará de mostrar el hueco.
              </p>
              {brokenItems.map((product) => {
                const issue = imageIssues[product.id]
                if (!issue) return null
                return (
                  <div
                    key={product.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 p-3"
                  >
                    <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                      {product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- thumb admin, URL dinámica
                        <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImagePlus className="w-5 h-5 text-gray-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {product.name}
                      </p>
                      <p className="text-[11px] text-red-600 font-medium">{issue.reason}</p>
                      {issue.url && (
                        <p className="text-[10px] text-gray-400 font-mono truncate" title={issue.url}>
                          {issue.url}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void replaceBrokenImage(product)}
                        disabled={saving.has(product.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        Reemplazar
                      </button>
                      <button
                        type="button"
                        onClick={() => startImageUpload(product.id)}
                        disabled={saving.has(product.id)}
                        title="Subir un archivo desde tu equipo"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
                      >
                        <ImagePlus className="w-3.5 h-3.5" />
                        Subir
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeBrokenImage(product)}
                        disabled={saving.has(product.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-100 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Quitar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {reportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !reportLoading && setReportOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl"
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
                Unidades, monto y margen por producto (pedidos no cancelados del rango).
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

              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-700">Resumen del rango</span>
                  {insightsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                </div>
                {insightsLoading && !reportInsights ? (
                  <p className="text-xs text-gray-400">Calculando…</p>
                ) : !reportInsights || reportInsights.products === 0 ? (
                  <p className="text-xs text-gray-400">Sin ventas en el rango.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="text-gray-500">Productos</span>
                        <span className="font-semibold text-gray-800">{reportInsights.products}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-gray-500">Unidades</span>
                        <span className="font-semibold text-gray-800">{reportInsights.units}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-gray-500">Ingreso</span>
                        <span className="font-semibold text-gray-800">
                          ${reportInsights.revenue.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-gray-500">Margen</span>
                        <span className="font-semibold text-gray-800">
                          {reportInsights.margin === null
                            ? "—"
                            : `$${reportInsights.margin.toFixed(2)}${
                                reportInsights.marginPct === null
                                  ? ""
                                  : ` (${reportInsights.marginPct.toFixed(1)}%)`
                              }`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-gray-500">ABC:</span>
                      {(
                        [
                          ["A", reportInsights.abc.A, "bg-emerald-50 text-emerald-700"],
                          ["B", reportInsights.abc.B, "bg-amber-50 text-amber-700"],
                          ["C", reportInsights.abc.C, "bg-gray-100 text-gray-600"],
                        ] as const
                      ).map(([label, count, cls]) => (
                        <span
                          key={label}
                          className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold ${cls}`}
                        >
                          {label}: {count}
                        </span>
                      ))}
                      <span className="text-[11px] text-gray-400">
                        {Math.round(reportInsights.aShare * 100)}% del ingreso en A
                      </span>
                    </div>

                    <ul className="text-xs text-gray-600 space-y-1">
                      {reportInsights.topRevenue && (
                        <li className="flex justify-between gap-2">
                          <span className="text-gray-500">Más vendido</span>
                          <span className="font-semibold text-gray-800 truncate text-right">
                            {reportInsights.topRevenue.name}
                          </span>
                        </li>
                      )}
                      {reportInsights.topUnits && (
                        <li className="flex justify-between gap-2">
                          <span className="text-gray-500">Más unidades</span>
                          <span className="font-semibold text-gray-800 truncate text-right">
                            {reportInsights.topUnits.name} ({reportInsights.topUnits.units})
                          </span>
                        </li>
                      )}
                      {reportInsights.bestMargin && (
                        <li className="flex justify-between gap-2">
                          <span className="text-gray-500">Mejor margen</span>
                          <span className="font-semibold text-emerald-700 truncate text-right">
                            {reportInsights.bestMargin.name} (
                            {reportInsights.bestMargin.marginPct.toFixed(1)}%)
                          </span>
                        </li>
                      )}
                      {reportInsights.worstMargin &&
                        reportInsights.bestMargin?.name !== reportInsights.worstMargin.name && (
                          <li className="flex justify-between gap-2">
                            <span className="text-gray-500">Margen más bajo</span>
                            <span className="font-semibold text-amber-700 truncate text-right">
                              {reportInsights.worstMargin.name} (
                              {reportInsights.worstMargin.marginPct.toFixed(1)}%)
                            </span>
                          </li>
                        )}
                    </ul>

                    {reportInsights.missingCost > 0 && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
                        {reportInsights.missingCost} producto
                        {reportInsights.missingCost === 1 ? "" : "s"} sin costo capturado: su margen
                        no se calcula.
                      </p>
                    )}
                  </div>
                )}
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
              const pts = priceSeries(historyEntries).reverse()
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
              ) : historyDegraded ? (
                <p className="py-8 text-center text-sm text-amber-700">
                  Historial no disponible en este momento.
                </p>
              ) : historyEntries.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  Sin cambios registrados.
                </p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {historyEntries.map((entry, i) => {
                    const rows = auditDiffRows(entry.detail)
                    const extras = auditExtraFields(entry.detail)
                    return (
                      <li key={i} className="py-2.5">
                        <p className="text-sm font-medium text-gray-900">
                          {AUDIT_ACTION_LABEL[entry.action as AuditAction] ?? entry.action}
                        </p>
                        <p className="text-xs text-gray-400">
                          {timeAgo(entry.created_at)}
                          {entry.actor_email ? ` · ${entry.actor_email}` : ""}
                        </p>
                        {rows.length > 0 && (
                          <ul className="mt-1.5 space-y-1">
                            {rows.map((row) => (
                              <li
                                key={row.field}
                                className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[11px]"
                              >
                                <span className="font-semibold text-gray-500">{row.label}:</span>
                                <span className="text-gray-400 line-through">{row.before}</span>
                                <span className="text-gray-300">→</span>
                                <span className="font-semibold text-gray-800">{row.after}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {extras.length > 0 && (
                          <p className="mt-1 text-[11px] text-gray-500">
                            {extras.map((e) => `${e.label}: ${e.value}`).join(" · ")}
                          </p>
                        )}
                        {rows.length === 0 && extras.length === 0 && (
                          <p className="mt-0.5 text-[10px] font-mono text-gray-400 break-all">
                            {JSON.stringify(entry.detail ?? {})}
                          </p>
                        )}
                      </li>
                    )
                  })}
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
          tagSuggestions={tagList.map((t) => t.tag)}
          confirm={confirm}
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
                      ? "bg-green-700 text-white"
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

      {/* Confirmación/prompt accesibles (reemplazo de window.confirm/prompt) */}
      {confirmDialog}
    </div>
  )
}
