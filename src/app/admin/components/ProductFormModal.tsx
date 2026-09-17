"use client"

import { useEffect, useRef, useState } from "react"
import { ImagePlus, Loader2, Plus, Search, Sparkles, Star, X } from "lucide-react"
import { cropImageToSquare } from "@/lib/crop-image"
import { validateBarcode, validateSku } from "@/lib/sku"
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  deriveStockStatus,
  resolveLowStockThreshold,
} from "@/lib/stock"

interface Category {
  id: number
  name: string
  slug: string
  icon: string | null
}

export interface ProductFormProduct {
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
}

interface ProductFormModalProps {
  categories: Category[]
  /** null = crear; con valor = editar ese producto. */
  product: ProductFormProduct | null
  onClose: () => void
  onSaved: (product: ProductFormProduct, created: boolean) => void
  /** Alta inline de categoría: el padre la agrega a su lista. */
  onCategoryCreated?: (category: Category) => void
  /** Etiquetas ya usadas en el catálogo, para autocompletar. */
  tagSuggestions?: string[]
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult:
    | ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

const STOCK_OPTIONS = [
  { value: "in_stock", label: "En stock" },
  { value: "low_stock", label: "Stock bajo" },
  { value: "out_of_stock", label: "Agotado" },
] as const

interface RelatedOption {
  id: number
  name: string
  brand: string | null
}

/** Tope de relacionados que acepta el servidor (update/route.ts). */
const RELATED_MAX = 12

/** Modal de alta/edición completa de producto (nombre, marca, categoría,
 *  descripción, precios, stock y flags de publicación). */
export function ProductFormModal({
  categories,
  product,
  onClose,
  onSaved,
  onCategoryCreated,
  tagSuggestions = [],
}: ProductFormModalProps) {
  const isEdit = product !== null
  const [name, setName] = useState(product?.name ?? "")
  const [brand, setBrand] = useState(product?.brand ?? "")
  const [categoryId, setCategoryId] = useState<string>(
    product?.category_id != null ? String(product.category_id) : ""
  )
  const [description, setDescription] = useState(product?.description ?? "")
  const [unit, setUnit] = useState(product?.unit ?? "")
  const [price, setPrice] = useState(product?.price != null ? String(product.price) : "")
  const [salePrice, setSalePrice] = useState(
    product?.sale_price != null ? String(product.sale_price) : ""
  )
  const [cost, setCost] = useState(product?.cost != null ? String(product.cost) : "")
  const [stockQuantity, setStockQuantity] = useState(
    product?.stock_quantity != null ? String(product.stock_quantity) : ""
  )
  const [sku, setSku] = useState(product?.sku ?? "")
  const [barcode, setBarcode] = useState(product?.barcode ?? "")
  const [tags, setTags] = useState<string[]>(product?.tags ?? [])
  const [tagDraft, setTagDraft] = useState("")
  const [lowStockThreshold, setLowStockThreshold] = useState(
    product?.low_stock_threshold != null ? String(product.low_stock_threshold) : ""
  )
  const [seoTitle, setSeoTitle] = useState(product?.seo_title ?? "")
  const [seoDescription, setSeoDescription] = useState(product?.seo_description ?? "")
  const [generatingSeo, setGeneratingSeo] = useState(false)

  // Relacionados explícitos (00109): ids elegidos + metadatos para los chips.
  const [relatedIds, setRelatedIds] = useState<number[]>(product?.related_product_ids ?? [])
  const [relatedInfo, setRelatedInfo] = useState<Record<number, RelatedOption>>({})
  const [relatedQuery, setRelatedQuery] = useState("")
  const [relatedResults, setRelatedResults] = useState<RelatedOption[]>([])
  const [relatedSearching, setRelatedSearching] = useState(false)

  // Nombres de los ya elegidos que no vinieron en la carga inicial.
  useEffect(() => {
    const missing = relatedIds.filter((id) => !relatedInfo[id])
    if (missing.length === 0) return
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/admin/products/list?ids=${missing.join(",")}`)
      const data = await res.json().catch(() => ({}))
      if (cancelled || !Array.isArray(data.rows)) return
      setRelatedInfo((prev) => {
        const next = { ...prev }
        for (const r of data.rows as RelatedOption[]) next[r.id] = r
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [relatedIds, relatedInfo])

  // Buscador del catálogo (nombre, marca, SKU, código de barras).
  const relatedActive = relatedQuery.trim().length >= 2
  useEffect(() => {
    const q = relatedQuery.trim()
    if (q.length < 2) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setRelatedSearching(true)
      try {
        const res = await fetch(
          `/api/admin/products/list?q=${encodeURIComponent(q)}&page=1&pageSize=12&sort=name&dir=asc`
        )
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        setRelatedResults(Array.isArray(data.rows) ? (data.rows as RelatedOption[]) : [])
      } finally {
        if (!cancelled) setRelatedSearching(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [relatedQuery])

  function toggleRelated(option: RelatedOption) {
    if (product && option.id === product.id) return
    setRelatedIds((prev) =>
      prev.includes(option.id)
        ? prev.filter((id) => id !== option.id)
        : prev.length >= RELATED_MAX
          ? prev
          : [...prev, option.id]
    )
    setRelatedInfo((prev) => ({ ...prev, [option.id]: option }))
  }

  async function generateSeo() {
    if (!name.trim()) {
      setError("Escribe el nombre del producto primero")
      return
    }
    setGeneratingSeo(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/kie-ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                'Eres especialista SEO de una tienda de abarrotes mexicana. Responde SOLO con JSON válido: {"title": "...", "description": "..."}. title máx 60 caracteres, description máx 160, orientados a búsqueda local, sin emojis.',
            },
            {
              role: "user",
              content: `Producto: ${name.trim()}${brand.trim() ? `, marca ${brand.trim()}` : ""}${
                description.trim() ? `. Descripción: ${description.trim().slice(0, 200)}` : ""
              }`,
            },
          ],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Error al generar SEO")
      const content = (data.content ?? "").trim()
      const match = content.match(/\{[\s\S]*\}/)
      if (!match) throw new Error("La IA no devolvió JSON válido")
      const parsed = JSON.parse(match[0]) as { title?: string; description?: string }
      if (parsed.title) setSeoTitle(parsed.title.slice(0, 70))
      if (parsed.description) setSeoDescription(parsed.description.slice(0, 170))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar SEO")
    } finally {
      setGeneratingSeo(false)
    }
  }
  const [stockStatus, setStockStatus] = useState<ProductFormProduct["stock_status"]>(
    product?.stock_status ?? "in_stock"
  )
  const [isVisible, setIsVisible] = useState(product?.is_visible ?? false)
  const [showInWhatsapp, setShowInWhatsapp] = useState(product?.show_in_whatsapp ?? false)
  // Programación de publicación (00096): datetime-local → ISO al guardar.
  const toLocalInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 16) : "")
  const [publishAt, setPublishAt] = useState(toLocalInput(product?.publish_at))
  const [unpublishAt, setUnpublishAt] = useState(toLocalInput(product?.unpublish_at))
  // Ventana de vigencia de la oferta (00107).
  const [saleStartsAt, setSaleStartsAt] = useState(toLocalInput(product?.sale_starts_at))
  const [saleEndsAt, setSaleEndsAt] = useState(toLocalInput(product?.sale_ends_at))
  const [adminNote, setAdminNote] = useState(product?.admin_note ?? "")
  // Galería de imágenes (products.images jsonb) + principal (image_url).
  const [gallery, setGallery] = useState<string[]>(product?.images ?? [])
  const [mainImage, setMainImage] = useState<string | null>(product?.image_url ?? null)
  const [uploadingImg, setUploadingImg] = useState(false)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  async function uploadGalleryImage(file: File | undefined | null) {
    if (!file || uploadingImg) return
    setUploadingImg(true)
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
      const res = await fetch("/api/admin/products/upload-image", { method: "POST", body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail ?? data.error ?? "Error al subir la imagen")
      const url = data.url as string
      setGallery((prev) => [...prev, url])
      if (!mainImage) setMainImage(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la imagen")
    } finally {
      setUploadingImg(false)
      if (galleryInputRef.current) galleryInputRef.current.value = ""
    }
  }

  function removeGalleryImage(url: string) {
    setGallery((prev) => prev.filter((u) => u !== url))
    if (mainImage === url) {
      setMainImage(gallery.filter((u) => u !== url)[0] ?? null)
    }
  }

  // ---- IA (Kie.ai): descripción e imagen generadas (best-effort) ----
  const [generatingDesc, setGeneratingDesc] = useState(false)
  const [aiImageOpen, setAiImageOpen] = useState(false)
  const [aiImagePrompt, setAiImagePrompt] = useState("")
  const [generatingImg, setGeneratingImg] = useState(false)

  async function generateDescription() {
    if (!name.trim()) {
      setError("Escribe el nombre del producto primero")
      return
    }
    setGeneratingDesc(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/kie-ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "Eres copywriter de una tienda de abarrotes mexicana. Escribe descripciones de producto cortas (máx 280 caracteres), claras y vendedoras, sin emojis ni encabezados. Responde solo con la descripción.",
            },
            {
              role: "user",
              content: `Producto: ${name.trim()}${brand.trim() ? `, marca ${brand.trim()}` : ""}${
                unit.trim() ? `, presentación por ${unit.trim()}` : ""
              }`,
            },
          ],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Error al generar la descripción")
      const content = (data.content ?? "").trim()
      if (!content) throw new Error("La IA no devolvió texto")
      setDescription(content)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar la descripción")
    } finally {
      setGeneratingDesc(false)
    }
  }

  // Dictado por voz con la Web Speech API nativa (es-MX).
  const [dictating, setDictating] = useState(false)
  const recognitionRef = useRef<{ stop: () => void } | null>(null)

  function toggleDictation() {
    if (dictating) {
      recognitionRef.current?.stop()
      setDictating(false)
      return
    }
    const W = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = "es-MX"
    rec.interimResults = false
    rec.continuous = false
    rec.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim()
      if (transcript) {
        setDescription((prev) => (prev ? `${prev} ${transcript}` : transcript))
      }
    }
    rec.onend = () => setDictating(false)
    rec.onerror = () => setDictating(false)
    recognitionRef.current = rec
    rec.start()
    setDictating(true)
  }

  /** Extrae la primera URL https del record de la tarea (resultUrls/resultJson). */
  function extractImageUrl(record: Record<string, unknown>): string | null {
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

  async function generateImage() {
    const prompt = aiImagePrompt.trim() || `Foto de producto: ${name.trim()}, fondo blanco, estudio`
    if (generatingImg) return
    setGeneratingImg(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/kie-ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Error al crear la tarea de imagen")
      const taskId = data.taskId as string

      // Polling hasta estado terminal (máx ~90 s).
      const deadline = Date.now() + 90_000
      for (;;) {
        await new Promise((r) => setTimeout(r, 3000))
        const st = await fetch(`/api/admin/kie-ai/status?taskId=${encodeURIComponent(taskId)}`)
        const stData = await st.json().catch(() => ({}))
        if (!st.ok) throw new Error(stData.error ?? "Error al consultar la tarea")
        const record = stData.record ?? {}
        if (record.state === "success" || record.state === "completed") {
          const url = extractImageUrl(record)
          if (!url) throw new Error("La tarea terminó sin URL de imagen")
          setGallery((prev) => [...prev, url])
          setMainImage((prev) => prev ?? url)
          setAiImageOpen(false)
          setAiImagePrompt("")
          break
        }
        if (record.state === "fail" || record.state === "failed") {
          throw new Error(record.failMsg ?? "La generación falló")
        }
        if (Date.now() > deadline) throw new Error("La generación tardó demasiado")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar la imagen")
    } finally {
      setGeneratingImg(false)
    }
  }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Alta inline de categoría.
  const [newCatOpen, setNewCatOpen] = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [creatingCat, setCreatingCat] = useState(false)
  // Imagen por URL pegada.
  const [urlOpen, setUrlOpen] = useState(false)
  const [urlValue, setUrlValue] = useState("")

  function addImageByUrl() {
    const url = urlValue.trim()
    if (!url) return
    if (!url.startsWith("https://") && !url.startsWith("/")) {
      setError("La URL debe ser https o una ruta local (/)")
      return
    }
    if (gallery.includes(url)) {
      setError("Esa imagen ya está en la galería")
      return
    }
    setGallery((prev) => [...prev, url])
    if (!mainImage) setMainImage(url)
    setUrlValue("")
    setUrlOpen(false)
    setError(null)
  }

  async function createCategory() {
    const name = newCatName.trim()
    if (!name || creatingCat) return
    setCreatingCat(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/categories/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Error al crear la categoría")
      onCategoryCreated?.(data.category as Category)
      setCategoryId(String((data.category as Category).id))
      setNewCatName("")
      setNewCatOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear la categoría")
    } finally {
      setCreatingCat(false)
    }
  }

  /** Etiquetas normalizadas (minúsculas, sin duplicados, máx 20). */
  function addTag(raw: string) {
    const value = raw.trim().toLowerCase()
    if (!value) return
    if (value.length > 40) {
      setError("Cada etiqueta debe tener máximo 40 caracteres")
      return
    }
    setTags((prev) => {
      if (prev.includes(value)) return prev
      if (prev.length >= 20) {
        setError("Máximo 20 etiquetas por producto")
        return prev
      }
      return [...prev, value]
    })
    setTagDraft("")
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag))
  }

  const tagSuggestionsAvailable = tagSuggestions
    .filter((t) => !tags.includes(t))
    .slice(0, 8)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!name.trim()) {
      setError("El nombre es obligatorio")
      return
    }
    const parsedPrice = price.trim() === "" ? null : parseFloat(price)
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setError("Precio inválido")
      return
    }
    const parsedSale = salePrice.trim() === "" ? null : parseFloat(salePrice)
    if (parsedSale !== null && (!Number.isFinite(parsedSale) || parsedSale < 0)) {
      setError("Precio de oferta inválido")
      return
    }
    const parsedCost = cost.trim() === "" ? null : parseFloat(cost)
    if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      setError("Costo inválido")
      return
    }
    const parsedQty =
      stockQuantity.trim() === "" ? null : parseInt(stockQuantity, 10)
    if (parsedQty !== null && (!Number.isInteger(parsedQty) || parsedQty < 0)) {
      setError("Cantidad de stock inválida")
      return
    }
    const parsedThreshold =
      lowStockThreshold.trim() === "" ? null : parseInt(lowStockThreshold, 10)
    if (
      parsedThreshold !== null &&
      (!Number.isInteger(parsedThreshold) || parsedThreshold < 0)
    ) {
      setError("Umbral de stock bajo inválido")
      return
    }
    const skuCheck = validateSku(sku)
    if (!skuCheck.ok) {
      setError(skuCheck.error)
      return
    }
    const barcodeCheck = validateBarcode(barcode)
    if (!barcodeCheck.ok) {
      setError(barcodeCheck.error)
      return
    }
    if (saleStartsAt && saleEndsAt && new Date(saleStartsAt) > new Date(saleEndsAt)) {
      setError("La oferta no puede empezar después de terminar")
      return
    }

    // Espeja la regla del servidor: con unidades capturadas el estado se
    // deriva del umbral; sin unidades manda la selección manual.
    const derivedStockStatus =
      parsedQty === null ? stockStatus : deriveStockStatus(parsedQty, parsedThreshold)

    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: name.trim(),
        brand: brand.trim() || null,
        category_id: categoryId === "" ? null : Number(categoryId),
        description: description.trim() || null,
        unit: unit.trim() || null,
        price: parsedPrice,
        sale_price: parsedSale,
        sale_starts_at: saleStartsAt ? new Date(saleStartsAt).toISOString() : null,
        sale_ends_at: saleEndsAt ? new Date(saleEndsAt).toISOString() : null,
        cost: parsedCost,
        stock_quantity: parsedQty,
        low_stock_threshold: parsedThreshold,
        stock_status: derivedStockStatus,
        sku: sku.trim() || null,
        barcode: barcode.trim() || null,
        tags,
        related_product_ids: relatedIds,
        seo_title: seoTitle.trim() || null,
        seo_description: seoDescription.trim() || null,
        is_visible: isVisible,
        show_in_whatsapp: showInWhatsapp,
        publish_at: publishAt ? new Date(publishAt).toISOString() : null,
        unpublish_at: unpublishAt ? new Date(unpublishAt).toISOString() : null,
        admin_note: adminNote.trim() || null,
        image_url: mainImage,
        images: gallery,
        // created_at no forma parte del form: el servidor la asigna; en
        // edición el padre conserva el valor existente.
        created_at: null,
      }
      const res = isEdit
        ? await fetch("/api/admin/products/update", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: product.id, ...payload }),
          })
        : await fetch("/api/admin/products/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Error al guardar el producto")

      if (isEdit) {
        onSaved({ ...product, ...payload, created_at: product.created_at ?? null }, false)
      } else {
        onSaved(data.product as ProductFormProduct, true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el producto")
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    "w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !saving && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {isEdit ? `Editar ${product.name}` : "Nuevo producto"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="px-3 py-2 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="pf-name">
              Nombre *
            </label>
            <input
              id="pf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="pf-unit">
                Unidad (kg, pieza, litro…)
              </label>
              <input
                id="pf-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="kg"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="pf-brand">
                Marca
              </label>
              <input
                id="pf-brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="pf-sku">
                SKU
              </label>
              <input
                id="pf-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="AB-0001"
                maxLength={40}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label
                className="block text-xs font-semibold text-gray-600 mb-1"
                htmlFor="pf-barcode"
              >
                Código de barras
              </label>
              <input
                id="pf-barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                inputMode="numeric"
                placeholder="7501234567890"
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>
          <p className="text-[10px] text-gray-400 -mt-2">
            El SKU debe ser único en el catálogo; el código de barras acepta 8, 12, 13 o 14
            dígitos.
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="pf-tag">
              Etiquetas
            </label>
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              {tags.length === 0 && (
                <span className="text-[11px] text-gray-400">Sin etiquetas</span>
              )}
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-semibold"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="text-brand-500 hover:text-brand-800"
                    aria-label={`Quitar etiqueta ${t}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                id="pf-tag"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault()
                    addTag(tagDraft)
                  }
                }}
                placeholder="arranque, limpieza…"
                maxLength={40}
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => addTag(tagDraft)}
                disabled={!tagDraft.trim()}
                className="shrink-0 flex items-center gap-1 px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar
              </button>
            </div>
            {tagSuggestionsAvailable.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {tagSuggestionsAvailable.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addTag(t)}
                    className="px-2 py-0.5 rounded-full border border-gray-200 text-[11px] text-gray-500 hover:bg-gray-50"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1 text-[10px] text-gray-400">
              Las etiquetas alimentan las colecciones de la tienda (p. ej. arranque, limpieza).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="pf-related">
              Productos relacionados
            </label>
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              {relatedIds.length === 0 && (
                <span className="text-[11px] text-gray-400">
                  Sin relacionados: la tienda sugiere por categoría
                </span>
              )}
              {relatedIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[11px] font-semibold"
                >
                  {relatedInfo[id]?.name ?? `#${id}`}
                  <button
                    type="button"
                    onClick={() => setRelatedIds((prev) => prev.filter((x) => x !== id))}
                    className="text-violet-500 hover:text-violet-800"
                    aria-label={`Quitar relacionado ${relatedInfo[id]?.name ?? id}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="pf-related"
                value={relatedQuery}
                onChange={(e) => setRelatedQuery(e.target.value)}
                placeholder="Buscar por nombre, marca o SKU…"
                className={`${inputCls} pl-9`}
                autoComplete="off"
              />
              {relatedActive && relatedSearching && (
                <Loader2 className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 animate-spin" />
              )}
            </div>
            {relatedActive && relatedResults.length > 0 && (
              <ul className="mt-1.5 max-h-40 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                {relatedResults.map((r) => {
                  const selected = relatedIds.includes(r.id)
                  const isSelf = product?.id === r.id
                  const full = !selected && relatedIds.length >= RELATED_MAX
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => toggleRelated(r)}
                        disabled={isSelf || full}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50 disabled:opacity-40"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-gray-800">
                            {r.name}
                          </span>
                          {r.brand && (
                            <span className="block truncate text-[10px] text-gray-400">
                              {r.brand}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-[10px] font-semibold text-violet-600">
                          {isSelf ? "Es este" : selected ? "Quitar" : full ? "Tope" : "Agregar"}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {relatedActive &&
              !relatedSearching &&
              relatedResults.length === 0 && (
                <p className="mt-1 text-[10px] text-gray-400">Sin resultados.</p>
              )}
            <p className="mt-1 text-[10px] text-gray-400">
              Se muestran primero en la ficha del producto; máximo {RELATED_MAX}. Si no hay
              ninguno, la tienda sugiere por categoría.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-600" htmlFor="pf-category">
                  Categoría
                </label>
                <button
                  type="button"
                  onClick={() => setNewCatOpen((v) => !v)}
                  className="text-[11px] font-semibold text-brand-600 hover:underline"
                >
                  {newCatOpen ? "Cancelar" : "＋ Nueva"}
                </button>
              </div>
              {newCatOpen ? (
                <div className="flex items-center gap-2">
                  <input
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Nombre de la categoría"
                    aria-label="Nombre de la nueva categoría"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={createCategory}
                    disabled={creatingCat || !newCatName.trim()}
                    className="shrink-0 flex items-center gap-1 px-3 py-2.5 rounded-xl bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 disabled:opacity-50"
                  >
                    {creatingCat && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Crear
                  </button>
                </div>
              ) : (
                <select
                  id="pf-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className={`${inputCls} bg-white`}
                >
                  <option value="">Sin categoría</option>
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-600" htmlFor="pf-desc">
                Descripción
              </label>
              <div className="flex items-center gap-3">
                {typeof window !== "undefined" &&
                  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) && (
                    <button
                      type="button"
                      onClick={toggleDictation}
                      disabled={dictating}
                      title="Dictar la descripción por voz (español)"
                      className={`flex items-center gap-1 text-[11px] font-semibold hover:underline disabled:opacity-50 ${
                        dictating ? "text-red-600" : "text-gray-500"
                      }`}
                    >
                      <span className={dictating ? "animate-pulse" : ""}>🎤</span>
                      {dictating ? "Escuchando… (clic para parar)" : "Dictar"}
                    </button>
                  )}
                <button
                  type="button"
                  onClick={generateDescription}
                  disabled={generatingDesc}
                  title="Genera una propuesta con IA (editable antes de guardar)"
                  className="flex items-center gap-1 text-[11px] font-semibold text-purple-600 hover:underline disabled:opacity-50"
                >
                  {generatingDesc ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  Generar con IA
                </button>
              </div>
            </div>
            <textarea
              id="pf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`${inputCls} resize-y`}
            />
          </div>

          {/* Galería de imágenes: la marcada con ★ es la principal (image_url) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="block text-xs font-semibold text-gray-600">
                Imágenes {gallery.length > 0 && `(${gallery.length})`}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAiImageOpen((v) => !v)}
                  disabled={generatingImg}
                  title="Genera una imagen con IA"
                  className="flex items-center gap-1 text-[11px] font-semibold text-purple-600 hover:underline disabled:opacity-50"
                >
                  {generatingImg ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  Generar con IA
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={uploadingImg}
                  className="flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline disabled:opacity-50"
                >
                  {uploadingImg ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="w-3.5 h-3.5" />
                  )}
                  Agregar
                </button>
                <button
                  type="button"
                  onClick={() => setUrlOpen((v) => !v)}
                  title="Agregar imagen pegando una URL"
                  className="text-[11px] font-semibold text-gray-500 hover:underline"
                >
                  Por URL
                </button>
              </div>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="hidden"
                onChange={(e) => void uploadGalleryImage(e.target.files?.[0])}
                aria-label="Agregar imagen a la galería"
              />
            </div>
            {urlOpen && (
              <div className="mb-2 flex items-center gap-2">
                <input
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  placeholder="https://… o /ruta/local"
                  aria-label="URL de la imagen"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={addImageByUrl}
                  disabled={!urlValue.trim()}
                  className="shrink-0 px-3 py-2.5 rounded-xl bg-gray-700 text-white text-xs font-semibold hover:bg-gray-800 disabled:opacity-50"
                >
                  Agregar
                </button>
              </div>
            )}
            {aiImageOpen && (
              <div className="mb-2 flex items-center gap-2">
                <input
                  value={aiImagePrompt}
                  onChange={(e) => setAiImagePrompt(e.target.value)}
                  placeholder={`Foto de producto: ${name || "…"}, fondo blanco`}
                  aria-label="Prompt para generar imagen"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={generateImage}
                  disabled={generatingImg}
                  className="shrink-0 flex items-center gap-1 px-3 py-2.5 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 disabled:opacity-50"
                >
                  {generatingImg && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Generar
                </button>
              </div>
            )}
            {gallery.length === 0 ? (
              <p className="text-[11px] text-gray-400">Sin imágenes todavía.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {gallery.map((url) => (
                  <div
                    key={url}
                    className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 ${
                      mainImage === url ? "border-brand-500" : "border-gray-200"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- thumbs admin, URLs dinámicas de Storage */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/40 px-0.5">
                      <button
                        type="button"
                        onClick={() => setMainImage(url)}
                        title="Marcar como imagen principal"
                        aria-label="Marcar como imagen principal"
                        className={`p-0.5 ${
                          mainImage === url ? "text-yellow-300" : "text-white/70 hover:text-white"
                        }`}
                      >
                        <Star className="w-3.5 h-3.5" fill={mainImage === url ? "currentColor" : "none"} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeGalleryImage(url)}
                        title="Quitar de la galería"
                        aria-label="Quitar de la galería"
                        className="p-0.5 text-white/70 hover:text-red-300"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="pf-note">
              Nota interna (solo visible en el panel)
            </label>
            <textarea
              id="pf-note"
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              rows={2}
              placeholder="Ej. proveedor, condiciones de compra…"
              className={`${inputCls} resize-y`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="pf-price">
                Precio
              </label>
              <input
                id="pf-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="pf-sale">
                Precio oferta
              </label>
              <input
                id="pf-sale"
                type="number"
                min="0"
                step="0.01"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="pf-cost">
                Costo
              </label>
              <input
                id="pf-cost"
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className="block text-xs font-semibold text-gray-600 mb-1"
                htmlFor="pf-sale-start"
              >
                Oferta desde
              </label>
              <input
                id="pf-sale-start"
                type="datetime-local"
                value={saleStartsAt}
                onChange={(e) => setSaleStartsAt(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label
                className="block text-xs font-semibold text-gray-600 mb-1"
                htmlFor="pf-sale-end"
              >
                Oferta hasta
              </label>
              <input
                id="pf-sale-end"
                type="datetime-local"
                value={saleEndsAt}
                onChange={(e) => setSaleEndsAt(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 -mt-2">
            {salePrice.trim() === ""
              ? "Sin precio de oferta no hay ventana que aplicar."
              : "Fuera de esta ventana la tienda cobra el precio normal; déjala vacía para que la oferta no expire."}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="pf-qty">
                Unidades disponibles
              </label>
              <input
                id="pf-qty"
                type="number"
                min="0"
                step="1"
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
                placeholder="—"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="pf-stock">
                Estado de stock
              </label>
              <select
                id="pf-stock"
                value={stockStatus}
                onChange={(e) =>
                  setStockStatus(e.target.value as ProductFormProduct["stock_status"])
                }
                className={`${inputCls} bg-white`}
              >
                {STOCK_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-gray-400">
                {`Si capturas unidades, el estado se deriva (0 → agotado, ≤${resolveLowStockThreshold(
                  lowStockThreshold.trim() === "" ? null : Number(lowStockThreshold)
                )} → bajo).`}
              </p>
            </div>
            <div>
              <label
                className="block text-xs font-semibold text-gray-600 mb-1"
                htmlFor="pf-threshold"
              >
                Umbral stock bajo
              </label>
              <input
                id="pf-threshold"
                type="number"
                min="0"
                step="1"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
                placeholder={String(DEFAULT_LOW_STOCK_THRESHOLD)}
                className={inputCls}
              />
              <p className="mt-1 text-[10px] text-gray-400">
                Vacío = predeterminado ({DEFAULT_LOW_STOCK_THRESHOLD}).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600">SEO del producto</span>
              <button
                type="button"
                onClick={generateSeo}
                disabled={generatingSeo}
                title="Genera título y descripción SEO con IA"
                className="flex items-center gap-1 text-[11px] font-semibold text-purple-600 hover:underline disabled:opacity-50"
              >
                {generatingSeo ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Generar con IA
              </button>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-600" htmlFor="pf-seo-title">
                  SEO: título
                </label>
                <span
                  className={`text-[10px] ${seoTitle.length > 60 ? "text-amber-600" : "text-gray-400"}`}
                >
                  {seoTitle.length}/60
                </span>
              </div>
              <input
                id="pf-seo-title"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                placeholder={name || "Título para Google"}
                className={inputCls}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-600" htmlFor="pf-seo-desc">
                  SEO: descripción
                </label>
                <span
                  className={`text-[10px] ${
                    seoDescription.length > 160 ? "text-amber-600" : "text-gray-400"
                  }`}
                >
                  {seoDescription.length}/160
                </span>
              </div>
              <textarea
                id="pf-seo-desc"
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                rows={2}
                placeholder="Descripción para resultados de búsqueda"
                className={`${inputCls} resize-y`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className="block text-xs font-semibold text-gray-600 mb-1"
                htmlFor="pf-publish-at"
              >
                Publicar automáticamente
              </label>
              <input
                id="pf-publish-at"
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label
                className="block text-xs font-semibold text-gray-600 mb-1"
                htmlFor="pf-unpublish-at"
              >
                Despublicar automáticamente
              </label>
              <input
                id="pf-unpublish-at"
                type="datetime-local"
                value={unpublishAt}
                onChange={(e) => setUnpublishAt(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 -mt-2">
            Se aplica en la corrida diaria del cron; publicar/despublicar a mano cancela la
            programación.
          </p>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isVisible}
                onChange={(e) => setIsVisible(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700">Publicado en tienda</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showInWhatsapp}
                onChange={(e) => setShowInWhatsapp(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700">Mostrar en WhatsApp</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? "Guardar cambios" : "Crear producto"}
          </button>
        </div>
      </form>
    </div>
  )
}
