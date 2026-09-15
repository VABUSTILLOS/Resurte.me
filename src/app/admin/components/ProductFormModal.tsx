"use client"

import { useRef, useState } from "react"
import { ImagePlus, Loader2, Star, X } from "lucide-react"

interface Category {
  id: number
  name: string
  slug: string
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
  stock_status: "in_stock" | "low_stock" | "out_of_stock"
  is_visible: boolean
  show_in_whatsapp: boolean | null
  image_url: string | null
  images: string[] | null
  publish_at: string | null
  unpublish_at: string | null
  admin_note: string | null
}

interface ProductFormModalProps {
  categories: Category[]
  /** null = crear; con valor = editar ese producto. */
  product: ProductFormProduct | null
  onClose: () => void
  onSaved: (product: ProductFormProduct, created: boolean) => void
  /** Alta inline de categoría: el padre la agrega a su lista. */
  onCategoryCreated?: (category: Category) => void
}

const STOCK_OPTIONS = [
  { value: "in_stock", label: "En stock" },
  { value: "low_stock", label: "Stock bajo" },
  { value: "out_of_stock", label: "Agotado" },
] as const

/** Modal de alta/edición completa de producto (nombre, marca, categoría,
 *  descripción, precios, stock y flags de publicación). */
export function ProductFormModal({
  categories,
  product,
  onClose,
  onSaved,
  onCategoryCreated,
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
  const [stockStatus, setStockStatus] = useState<ProductFormProduct["stock_status"]>(
    product?.stock_status ?? "in_stock"
  )
  const [isVisible, setIsVisible] = useState(product?.is_visible ?? false)
  const [showInWhatsapp, setShowInWhatsapp] = useState(product?.show_in_whatsapp ?? false)
  // Programación de publicación (00096): datetime-local → ISO al guardar.
  const toLocalInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 16) : "")
  const [publishAt, setPublishAt] = useState(toLocalInput(product?.publish_at))
  const [unpublishAt, setUnpublishAt] = useState(toLocalInput(product?.unpublish_at))
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
      const form = new FormData()
      form.append("file", file)
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Alta inline de categoría.
  const [newCatOpen, setNewCatOpen] = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [creatingCat, setCreatingCat] = useState(false)

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
        stock_status: stockStatus,
        is_visible: isVisible,
        show_in_whatsapp: showInWhatsapp,
        publish_at: publishAt ? new Date(publishAt).toISOString() : null,
        unpublish_at: unpublishAt ? new Date(unpublishAt).toISOString() : null,
        admin_note: adminNote.trim() || null,
        image_url: mainImage,
        images: gallery,
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
        onSaved({ ...product, ...payload }, false)
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
            <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="pf-desc">
              Descripción
            </label>
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
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="hidden"
                onChange={(e) => void uploadGalleryImage(e.target.files?.[0])}
                aria-label="Agregar imagen a la galería"
              />
            </div>
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
              <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="pf-stock">
                Stock
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
