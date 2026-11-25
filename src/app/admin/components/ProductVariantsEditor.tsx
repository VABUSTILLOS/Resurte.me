"use client"

import { useCallback, useEffect, useState } from "react"
import type { ProductVariant } from "@/types"

/**
 * Editor de presentaciones (variantes) de un producto — 00232.
 *
 * Vive dentro del formulario de producto pero es INDEPENDIENTE de
 * su guardado: cada presentación se crea/edita/elimina con su
 * propia llamada a /api/admin/products/variants en cuanto se pulsa
 * su botón, igual que la disponibilidad por ciudad. Así, agregar
 * una presentación no obliga a re-guardar el producto entero ni un
 * fallo aquí marca el formulario como sucio.
 *
 * Reglas que refleja la UI (la fuente es el servidor):
 * - El nombre se puede cambiar; el identificador del catálogo de
 *   WhatsApp NO cambia nunca con el nombre.
 * - Si la existencia lleva cantidad, el estado (hay/poco/agotado)
 *   lo deriva el servidor del umbral del producto; sin cantidad
 *   («sin control») se elige el estado a mano.
 * - Una presentación con pedidos no se puede eliminar (409): se
 *   desactiva.
 */

const inputCls =
  "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
const labelCls = "block text-xs font-semibold text-gray-600 mb-1"

interface VariantDraft {
  name: string
  price: string
  sale_price: string
  stock_quantity: string
  stock_status: "in_stock" | "low_stock" | "out_of_stock"
  sku: string
  is_active: boolean
}

function draftOf(v: ProductVariant): VariantDraft {
  return {
    name: v.name,
    price: String(v.price),
    sale_price: v.sale_price != null ? String(v.sale_price) : "",
    stock_quantity: v.stock_quantity != null ? String(v.stock_quantity) : "",
    stock_status: v.stock_status,
    sku: v.sku ?? "",
    is_active: v.is_active,
  }
}

const EMPTY_DRAFT: VariantDraft = {
  name: "",
  price: "",
  sale_price: "",
  stock_quantity: "",
  stock_status: "in_stock",
  sku: "",
  is_active: true,
}

function draftBody(d: VariantDraft): Record<string, unknown> {
  return {
    name: d.name.trim(),
    price: Number(d.price),
    sale_price: d.sale_price.trim() === "" ? null : Number(d.sale_price),
    stock_quantity: d.stock_quantity.trim() === "" ? null : Number(d.stock_quantity),
    stock_status: d.stock_status,
    sku: d.sku.trim() === "" ? null : d.sku.trim(),
    is_active: d.is_active,
  }
}

const STATUS_LABEL: Record<ProductVariant["stock_status"], string> = {
  in_stock: "Hay existencia",
  low_stock: "Pocas unidades",
  out_of_stock: "Agotado",
}

export function ProductVariantsEditor({ productId }: { productId: number }) {
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [drafts, setDrafts] = useState<Record<number, VariantDraft>>({})
  const [newDraft, setNewDraft] = useState<VariantDraft>(EMPTY_DRAFT)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")

  const fetchVariants = useCallback(async (): Promise<{
    list: ProductVariant[] | null
    error: string | null
  }> => {
    try {
      const res = await fetch(`/api/admin/products/variants?product_id=${productId}`)
      const data = (await res.json()) as { variants?: ProductVariant[]; error?: string }
      if (!res.ok) {
        return { list: null, error: data.error ?? "No se pudieron cargar las presentaciones" }
      }
      return { list: data.variants ?? [], error: null }
    } catch {
      return { list: null, error: "No se pudieron cargar las presentaciones" }
    }
  }, [productId])

  const applyResult = useCallback(
    (result: { list: ProductVariant[] | null; error: string | null }) => {
      if (result.list) {
        setVariants(result.list)
        setDrafts(Object.fromEntries(result.list.map((v) => [v.id, draftOf(v)])))
        setError(null)
      } else {
        setVariants([])
        setError(result.error)
      }
    },
    []
  )

  // El efecto no toca estado de forma síncrona: encadena la promesa y
  // solo escribe cuando ya resolvió (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false
    fetchVariants()
      .then((result) => {
        if (!cancelled) applyResult(result)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchVariants, applyResult])

  /** Recarga tras una escritura (contexto de evento: sí puede tocar estado). */
  const reload = useCallback(async () => {
    applyResult(await fetchVariants())
  }, [fetchVariants, applyResult])

  const runWrite = async (fn: () => Promise<Response>, okMessage: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fn()
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(data?.error ?? "No se pudo guardar la presentación")
        return false
      }
      setAnnouncement(okMessage)
      await reload()
      return true
    } catch {
      setError("No se pudo guardar la presentación")
      return false
    } finally {
      setBusy(false)
    }
  }

  const handleCreate = async () => {
    const ok = await runWrite(
      () =>
        fetch("/api/admin/products/variants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: productId, ...draftBody(newDraft) }),
        }),
      `Presentación ${newDraft.name} creada`
    )
    if (ok) setNewDraft(EMPTY_DRAFT)
  }

  const handleSave = async (v: ProductVariant) => {
    const draft = drafts[v.id]
    if (!draft) return
    await runWrite(
      () =>
        fetch("/api/admin/products/variants", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: v.id, ...draftBody(draft) }),
        }),
      `Presentación ${draft.name} guardada`
    )
  }

  const handleDelete = async (v: ProductVariant) => {
    await runWrite(
      () => fetch(`/api/admin/products/variants?id=${v.id}`, { method: "DELETE" }),
      `Presentación ${v.name} eliminada`
    )
  }

  const setDraft = (id: number, patch: Partial<VariantDraft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_DRAFT), ...patch } }))

  const renderFields = (
    draft: VariantDraft,
    onChange: (patch: Partial<VariantDraft>) => void,
    idPrefix: string
  ) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div className="col-span-2 sm:col-span-1">
        <label className={labelCls} htmlFor={`${idPrefix}-name`}>
          Nombre *
        </label>
        <input
          id={`${idPrefix}-name`}
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Ej. Bolsa 5 kg"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-price`}>
          Precio *
        </label>
        <input
          id={`${idPrefix}-price`}
          value={draft.price}
          onChange={(e) => onChange({ price: e.target.value })}
          inputMode="decimal"
          placeholder="0.00"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-sale`}>
          Precio de oferta
        </label>
        <input
          id={`${idPrefix}-sale`}
          value={draft.sale_price}
          onChange={(e) => onChange({ sale_price: e.target.value })}
          inputMode="decimal"
          placeholder="—"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-qty`}>
          Existencia (piezas)
        </label>
        <input
          id={`${idPrefix}-qty`}
          value={draft.stock_quantity}
          onChange={(e) => onChange({ stock_quantity: e.target.value })}
          inputMode="numeric"
          placeholder="Vacío = sin control"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-status`}>
          Estado si no hay conteo
        </label>
        <select
          id={`${idPrefix}-status`}
          value={draft.stock_status}
          onChange={(e) =>
            onChange({ stock_status: e.target.value as VariantDraft["stock_status"] })
          }
          className={inputCls}
        >
          <option value="in_stock">Hay existencia</option>
          <option value="low_stock">Pocas unidades</option>
          <option value="out_of_stock">Agotado</option>
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor={`${idPrefix}-sku`}>
          SKU
        </label>
        <input
          id={`${idPrefix}-sku`}
          value={draft.sku}
          onChange={(e) => onChange({ sku: e.target.value })}
          placeholder="Opcional"
          className={inputCls}
        />
      </div>
      <label className="col-span-2 sm:col-span-3 flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.is_active}
          onChange={(e) => onChange({ is_active: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="text-sm text-gray-700">Activa (se vende en la tienda y en WhatsApp)</span>
      </label>
    </div>
  )

  return (
    <div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <p className="text-[11px] text-gray-600 mb-3">
        Cada presentación (bolsa 1 kg, bolsa 5 kg, tamaño, sabor…) tiene su propio precio y
        existencia, y aparece como su propio artículo en el catálogo de WhatsApp. Los cambios
        aquí se guardan al momento, sin guardar el producto. La cantidad mínima/máxima por
        pedido es la del producto y suma todas las presentaciones.
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Cargando presentaciones…</p>
      ) : (
        <>
          <ul className="space-y-3">
            {variants.map((v) => {
              const draft = drafts[v.id] ?? draftOf(v)
              return (
                <li key={v.id} className="rounded-xl border border-gray-200 p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-800">
                      {v.name}
                      <span className="ml-2 text-[11px] font-medium text-gray-500">
                        {STATUS_LABEL[v.stock_status]}
                        {v.stock_quantity != null && ` · ${v.stock_quantity} piezas`}
                        {!v.is_active && " · Inactiva"}
                      </span>
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleSave(v)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDelete(v)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                  {renderFields(draft, (patch) => setDraft(v.id, patch), `pv-${v.id}`)}
                </li>
              )
            })}
          </ul>

          {variants.length === 0 && (
            <p className="text-sm text-gray-500 mb-3">
              Este producto aún no tiene presentaciones: se vende tal cual, como siempre.
            </p>
          )}

          <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-3 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-600">
              Agregar presentación
            </p>
            {renderFields(
              newDraft,
              (patch) => setNewDraft((prev) => ({ ...prev, ...patch })),
              "pv-new"
            )}
            <button
              type="button"
              disabled={busy || newDraft.name.trim() === "" || newDraft.price.trim() === ""}
              onClick={() => void handleCreate()}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Agregar presentación
            </button>
          </div>
        </>
      )}
    </div>
  )
}
