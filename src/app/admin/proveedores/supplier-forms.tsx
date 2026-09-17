"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Loader2, Search, X } from "lucide-react"
import { SUPPLIER_STATUSES, type SupplierStatus } from "@/lib/supplier-admin"

/**
 * Formularios del directorio de proveedores.
 *
 * Van en un archivo aparte de la página porque son tres formularios con
 * estado propio (proveedor, vínculo y buscador de productos) y mezclarlos
 * con el listado dejaría un componente de mil líneas imposible de seguir.
 * No usan `alert` para errores: el `error` que devuelve la API se pinta
 * junto al campo que lo causó, que es la diferencia entre "no se pudo" y
 * "el WhatsApp debe tener entre 10 y 15 dígitos".
 */

const STATUS_LABEL: Record<SupplierStatus, string> = {
  prospecto: "Prospecto",
  localizado: "Localizado",
  verificado: "Verificado",
  contactado: "Contactado",
  cotizado: "Cotizado",
  aprobado: "Aprobado",
  activo: "Activo",
}

export interface SupplierFormValues {
  name: string
  contact_name: string
  phone: string
  whatsapp: string
  email: string
  website: string
  address: string
  city: string
  state: string
  status: SupplierStatus
  notes: string
}

export const EMPTY_SUPPLIER: SupplierFormValues = {
  name: "",
  contact_name: "",
  phone: "",
  whatsapp: "",
  email: "",
  website: "",
  address: "",
  city: "",
  state: "",
  status: "prospecto",
  notes: "",
}

const inputClass =
  "mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
const labelClass = "text-xs font-semibold text-gray-700"

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  hint?: string
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  )
}

/**
 * Alta y edición de proveedor. Un solo formulario para los dos casos: los
 * campos son los mismos y duplicarlo garantizaba que se desincronizaran.
 * Los vacíos se mandan como `null` para que el backend los guarde como
 * "sin dato" en vez de cadena vacía.
 */
export function SupplierForm({
  initial,
  supplierId,
  onSaved,
  onCancel,
}: {
  initial?: SupplierFormValues
  supplierId?: number
  onSaved: () => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<SupplierFormValues>(initial ?? EMPTY_SUPPLIER)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = supplierId != null

  function set<K extends keyof SupplierFormValues>(key: K, value: SupplierFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function submit() {
    if (!values.name.trim()) {
      setError("El nombre del proveedor es obligatorio")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, string | null> = { status: values.status }
      for (const [key, value] of Object.entries(values)) {
        if (key === "status") continue
        payload[key] = value.trim() ? value.trim() : null
      }

      const res = await fetch(isEdit ? `/api/admin/suppliers/${supplierId}` : "/api/admin/suppliers", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el proveedor")
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el proveedor")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-gray-900">
          {isEdit ? "Editar proveedor" : "Nuevo proveedor"}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800"
        >
          <X className="w-3.5 h-3.5" />
          Cancelar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field
          id="supplier-name"
          label="Nombre *"
          value={values.name}
          onChange={(v) => set("name", v)}
          placeholder="Ej. Distribuidora Central"
        />
        <div>
          <label htmlFor="supplier-status" className={labelClass}>
            Estatus
          </label>
          <select
            id="supplier-status"
            value={values.status}
            onChange={(e) => set("status", e.target.value as SupplierStatus)}
            className={inputClass}
          >
            {SUPPLIER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>
        <Field
          id="supplier-contact"
          label="Persona de contacto"
          value={values.contact_name}
          onChange={(v) => set("contact_name", v)}
          placeholder="Ej. Laura Ruiz"
        />
        <Field
          id="supplier-whatsapp"
          label="WhatsApp"
          value={values.whatsapp}
          onChange={(v) => set("whatsapp", v)}
          placeholder="614 533 7486"
          hint="Es el canal del botón de contacto. Se guarda sin espacios."
        />
        <Field
          id="supplier-phone"
          label="Teléfono"
          value={values.phone}
          onChange={(v) => set("phone", v)}
          placeholder="614 000 0000"
        />
        <Field
          id="supplier-email"
          label="Email"
          value={values.email}
          onChange={(v) => set("email", v)}
          type="email"
          placeholder="ventas@proveedor.mx"
        />
        <Field
          id="supplier-website"
          label="Sitio web"
          value={values.website}
          onChange={(v) => set("website", v)}
          placeholder="proveedor.mx"
        />
        <Field
          id="supplier-city"
          label="Ciudad"
          value={values.city}
          onChange={(v) => set("city", v)}
          placeholder="Chihuahua"
        />
        <Field
          id="supplier-state"
          label="Estado (ubicación)"
          value={values.state}
          onChange={(v) => set("state", v)}
          placeholder="Chihuahua"
        />
        <div className="sm:col-span-2 lg:col-span-3">
          <Field
            id="supplier-address"
            label="Dirección"
            value={values.address}
            onChange={(v) => set("address", v)}
            placeholder="Calle, número, colonia"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor="supplier-notes" className={labelClass}>
            Notas
          </label>
          <textarea
            id="supplier-notes"
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            placeholder="Condiciones de pago, días de entrega, mínimo de compra…"
            className={inputClass}
          />
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-xs font-bold text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {isEdit ? "Guardar cambios" : "Dar de alta"}
        </button>
      </div>
    </div>
  )
}

interface ProductMatch {
  id: number
  name: string
  sku: string | null
  unit: string | null
  price: number | null
}

export interface LinkFormValues {
  supplier_sku: string
  presentation: string
  cost: string
  list_date: string
  is_primary: boolean
  notes: string
}

export const EMPTY_LINK: LinkFormValues = {
  supplier_sku: "",
  presentation: "",
  cost: "",
  list_date: "",
  is_primary: true,
  notes: "",
}

/**
 * Buscador de productos para vincular. Consulta la misma ruta del
 * directorio (`?productSearch=`) en vez de traer el catálogo completo: son
 * miles de productos y el admin sabe qué busca.
 */
function ProductPicker({
  selected,
  onSelect,
}: {
  selected: ProductMatch | null
  onSelect: (product: ProductMatch | null) => void
}) {
  const [term, setTerm] = useState("")
  const [matches, setMatches] = useState<ProductMatch[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    const query = term.trim()
    // Cancelar respuestas en vuelo en cuanto cambia el término, pero sin
    // llamar setState en el cuerpo del efecto (react-hooks/set-state-in-effect).
    const id = ++requestId.current

    const timer = setTimeout(() => {
      if (query.length < 2) {
        setMatches([])
        setError(null)
        setSearching(false)
        return
      }
      setSearching(true)
      fetch(`/api/admin/suppliers?productSearch=${encodeURIComponent(query)}`, {
        cache: "no-store",
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.error ?? "No se pudo buscar productos")
          return (data.productMatches ?? []) as ProductMatch[]
        })
        .then((rows) => {
          if (id === requestId.current) {
            setMatches(rows)
            setError(null)
          }
        })
        .catch((err) => {
          if (id === requestId.current) {
            setError(err instanceof Error ? err.message : "No se pudo buscar productos")
            setMatches([])
          }
        })
        .finally(() => {
          if (id === requestId.current) setSearching(false)
        })
    }, 300)

    return () => clearTimeout(timer)
  }, [term])

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{selected.name}</p>
          <p className="text-[11px] text-gray-500">
            {selected.sku ? `SKU ${selected.sku} · ` : ""}
            {selected.unit ?? "sin unidad"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onSelect(null)
            setTerm("")
          }}
          className="shrink-0 text-xs font-semibold text-gray-500 hover:text-gray-800"
        >
          Cambiar
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-gray-400" />
        <input
          id="link-product-search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Busca el producto por nombre (mínimo 2 letras)"
          className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-gray-400 focus:outline-none"
        />
      </div>
      {searching && <p className="mt-1 text-[11px] text-gray-400">Buscando…</p>}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      {!searching && !error && term.trim().length >= 2 && matches.length === 0 && (
        <p className="mt-1 text-[11px] text-gray-400">Sin resultados para “{term.trim()}”.</p>
      )}
      {matches.length > 0 && (
        <ul className="mt-2 max-h-56 overflow-y-auto overscroll-contain rounded-lg border border-gray-200 divide-y divide-gray-100">
          {matches.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => onSelect(product)}
                className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
              >
                {product.name}
                {product.sku && (
                  <span className="ml-2 font-mono text-[11px] text-gray-400">{product.sku}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Alta y edición de un vínculo producto ↔ proveedor. En edición el
 * producto es de sólo lectura: mover un vínculo de producto se hace
 * borrando y volviendo a vincular, para que la bitácora registre el
 * cambio real en vez de un `UPDATE` que parece otra cosa.
 */
export function ProductLinkForm({
  supplierId,
  link,
  onSaved,
  onCancel,
}: {
  supplierId: number
  link?: { id: number; productName: string; values: LinkFormValues }
  onSaved: () => void
  onCancel: () => void
}) {
  const [product, setProduct] = useState<ProductMatch | null>(null)
  const [values, setValues] = useState<LinkFormValues>(link?.values ?? EMPTY_LINK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = link != null
  const canSave = isEdit || product != null

  const title = useMemo(
    () => (isEdit ? `Editar vínculo · ${link?.productName ?? ""}` : "Vincular producto"),
    [isEdit, link?.productName]
  )

  function set<K extends keyof LinkFormValues>(key: K, value: LinkFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function submit() {
    if (!canSave) {
      setError("Elige el producto que quieres vincular")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        supplier_sku: values.supplier_sku.trim() || null,
        presentation: values.presentation.trim() || null,
        cost: values.cost.trim() === "" ? null : Number(values.cost),
        list_date: values.list_date.trim() || null,
        is_primary: values.is_primary,
        notes: values.notes.trim() || null,
      }
      if (!isEdit && product) payload.product_id = product.id

      const url = isEdit
        ? `/api/admin/suppliers/${supplierId}/products/${link.id}`
        : `/api/admin/suppliers/${supplierId}/products`
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el vínculo")
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el vínculo")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-50 border-t border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800"
        >
          <X className="w-3.5 h-3.5" />
          Cancelar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {!isEdit && (
          <div className="sm:col-span-2 lg:col-span-4">
            <label htmlFor="link-product-search" className={labelClass}>
              Producto *
            </label>
            <div className="mt-1">
              <ProductPicker selected={product} onSelect={setProduct} />
            </div>
          </div>
        )}
        <Field
          id="link-cost"
          label="Costo de lista"
          value={values.cost}
          onChange={(v) => set("cost", v)}
          placeholder="150.00"
          hint="Sin IVA, como lo cotizó el proveedor."
        />
        <Field
          id="link-sku"
          label="SKU del proveedor"
          value={values.supplier_sku}
          onChange={(v) => set("supplier_sku", v)}
          placeholder="ABC-123"
        />
        <Field
          id="link-presentation"
          label="Presentación"
          value={values.presentation}
          onChange={(v) => set("presentation", v)}
          placeholder="Caja 12 pzas"
        />
        <Field
          id="link-list-date"
          label="Fecha de lista"
          value={values.list_date}
          onChange={(v) => set("list_date", v)}
          type="date"
          hint="De cuándo es este precio."
        />
        <div className="sm:col-span-2 lg:col-span-4">
          <label htmlFor="link-notes" className={labelClass}>
            Notas
          </label>
          <input
            id="link-notes"
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Ej. precio por volumen a partir de 10 cajas"
            className={inputClass}
          />
        </div>
        <label className="flex items-center gap-2 sm:col-span-2 lg:col-span-4 text-xs font-semibold text-gray-700">
          <input
            type="checkbox"
            checked={values.is_primary}
            onChange={(e) => set("is_primary", e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Proveedor principal de este producto
          <span className="font-normal text-gray-400">
            (al marcarlo se desmarca cualquier otro principal del mismo producto)
          </span>
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-xs font-bold text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {isEdit ? "Guardar vínculo" : "Vincular"}
        </button>
      </div>
    </div>
  )
}
