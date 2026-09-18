"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, Loader2, Power, Search, Sparkles, Trash2, X } from "lucide-react"

interface ProductOption {
  id: number
  name: string
  slug: string
}

export interface AffinityPair {
  id: number
  source_product_id: number
  target_product_id: number
  kind: string
  weight: number
  is_active: boolean
  source_name: string | null
  target_name: string | null
}

/** Debounce del buscador: evita una query por tecla. */
const SEARCH_DEBOUNCE_MS = 250
/** Menos de 2 caracteres trae el catálogo entero sin filtrar. */
const MIN_QUERY_LENGTH = 2

function useProductSearch() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ProductOption[]>([])
  const [searching, setSearching] = useState(false)
  const requestId = useRef(0)

  const q = query.trim()
  const tooShort = q.length < MIN_QUERY_LENGTH

  useEffect(() => {
    if (tooShort) {
      // Invalida respuestas en vuelo; el vacío se deriva, no se guarda.
      requestId.current += 1
      return
    }
    const id = ++requestId.current
    const timer = setTimeout(() => {
      setSearching(true)
      void (async () => {
        try {
          const res = await fetch(`/api/admin/bump-affinity/products?q=${encodeURIComponent(q)}`)
          if (!res.ok) throw new Error("búsqueda fallida")
          const data = (await res.json()) as { products: ProductOption[] }
          // Descarta respuestas fuera de orden (tecleo rápido).
          if (id === requestId.current) setResults(data.products)
        } catch {
          if (id === requestId.current) setResults([])
        } finally {
          if (id === requestId.current) setSearching(false)
        }
      })()
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [q, tooShort])

  const reset = useCallback(() => {
    requestId.current += 1
    setQuery("")
    setResults([])
    setSearching(false)
  }, [])

  return {
    query,
    setQuery,
    results: tooShort ? [] : results,
    searching: tooShort ? false : searching,
    reset,
  }
}

function ProductPicker({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: ProductOption | null
  onSelect: (product: ProductOption | null) => void
}) {
  const { query, setQuery, results, searching, reset } = useProductSearch()
  const [open, setOpen] = useState(false)

  if (selected) {
    return (
      <div className="text-sm">
        <span className="block text-xs text-gray-500 mb-1">{label}</span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2 py-1.5 text-brand-800">
          <span className="font-medium truncate max-w-[14rem]">{selected.name}</span>
          <button
            type="button"
            aria-label={`Quitar ${label.toLowerCase()}`}
            onClick={() => {
              onSelect(null)
              reset()
            }}
            className="text-brand-700 hover:text-brand-900"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      </div>
    )
  }

  return (
    <div className="relative text-sm">
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      <span className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5">
        <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Diferido: deja que el click en una opción gane al blur.
            setTimeout(() => setOpen(false), 150)
          }}
          placeholder="Buscar producto…"
          className="w-full outline-none"
          aria-label={label}
        />
        {searching && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 shrink-0" />}
      </span>
      {open && query.trim().length >= MIN_QUERY_LENGTH && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(p)
                  setOpen(false)
                  reset()
                }}
                className="w-full text-left px-2 py-1.5 hover:bg-gray-50 truncate"
              >
                {p.name}
              </button>
            </li>
          ))}
          {results.length === 0 && !searching && (
            <li className="px-2 py-1.5 text-gray-500">Sin resultados.</li>
          )}
        </ul>
      )}
    </div>
  )
}

/**
 * Sección "Afinidad entre productos" del panel de marketing.
 *
 * Regla: si el carrito trae el producto **origen**, el motor puede sugerir el
 * **destino** como order bump. El recetario ya genera pares automáticamente;
 * esta tabla agrega los pares curados a mano, que tienen prioridad y cuyo
 * motivo (`Ideal con …`) gana sobre el de receta.
 */
export default function BumpAffinitySection({
  pairs,
  onChanged,
}: {
  pairs: AffinityPair[]
  onChanged: () => void | Promise<void>
}) {
  const [source, setSource] = useState<ProductOption | null>(null)
  const [target, setTarget] = useState<ProductOption | null>(null)
  const [weight, setWeight] = useState("1")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("")

  const createPair = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!source || !target) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/bump-affinity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_product_id: source.id,
          target_product_id: target.id,
          weight: Math.max(0, Math.trunc(Number(weight) || 0)),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Error al crear el par")
      setSource(null)
      setTarget(null)
      setWeight("1")
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el par")
    } finally {
      setSaving(false)
    }
  }

  const togglePair = async (pair: AffinityPair) => {
    const res = await fetch(`/api/admin/bump-affinity/${pair.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !pair.is_active }),
    })
    if (res.ok) await onChanged()
  }

  const deletePair = async (pair: AffinityPair) => {
    const label = `${pair.source_name ?? pair.source_product_id} → ${pair.target_name ?? pair.target_product_id}`
    if (!window.confirm(`¿Eliminar el par "${label}"?`)) return
    const res = await fetch(`/api/admin/bump-affinity/${pair.id}`, { method: "DELETE" })
    if (res.ok) await onChanged()
  }

  const needle = filter.trim().toLowerCase()
  const visible = needle
    ? pairs.filter((p) =>
        `${p.source_name ?? ""} ${p.target_name ?? ""}`.toLowerCase().includes(needle),
      )
    : pairs

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-brand-600" />
        Afinidad entre productos
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        Si el carrito trae el producto <strong>origen</strong>, el destino se ofrece como order bump.
        Los pares del recetario se generan solos; los de esta tabla son curados y tienen prioridad.
      </p>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <form
        onSubmit={(e) => void createPair(e)}
        className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end mb-4"
      >
        <ProductPicker label="Origen (en el carrito)" selected={source} onSelect={setSource} />
        <ProductPicker label="Destino (sugerido)" selected={target} onSelect={setTarget} />
        <label className="text-sm">
          <span className="block text-xs text-gray-500 mb-1">Peso</span>
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            inputMode="numeric"
            className="w-20 rounded-lg border border-gray-200 px-2 py-1.5"
          />
        </label>
        <button
          type="submit"
          disabled={!source || !target || saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Agregar par
        </button>
      </form>

      {pairs.length > 0 && (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar pares…"
          className="w-full md:w-72 text-sm border border-gray-200 rounded-lg px-2 py-1.5 mb-2"
        />
      )}

      <ul className="divide-y divide-gray-100">
        {visible.map((pair) => (
          <li key={pair.id} className="py-2 flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => void togglePair(pair)}
              aria-pressed={pair.is_active}
              aria-label={pair.is_active ? "Desactivar par" : "Activar par"}
              className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border shrink-0 ${
                pair.is_active
                  ? "bg-brand-50 border-brand-200 text-brand-700"
                  : "bg-gray-50 border-gray-200 text-gray-500"
              }`}
            >
              <Power className="w-3.5 h-3.5" />
            </button>
            <span
              className={`flex-1 min-w-0 flex items-center gap-1.5 ${
                pair.is_active ? "text-gray-900" : "text-gray-400 line-through"
              }`}
            >
              <span className="truncate">{pair.source_name ?? `#${pair.source_product_id}`}</span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="truncate">{pair.target_name ?? `#${pair.target_product_id}`}</span>
            </span>
            <span className="text-xs text-gray-500 shrink-0">
              {pair.kind === "curated" ? "Curado" : "Receta"} · peso {pair.weight}
            </span>
            <button
              type="button"
              onClick={() => void deletePair(pair)}
              aria-label="Eliminar par"
              className="text-gray-400 hover:text-red-600 p-1 shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="py-3 text-sm text-gray-500">
            {pairs.length === 0 ? "Sin pares curados todavía." : "Ningún par coincide con el filtro."}
          </li>
        )}
      </ul>
    </section>
  )
}
