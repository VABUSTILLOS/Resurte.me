"use client"

import { useCallback, useEffect, useState } from "react"
import { PackagePlus, History, ChevronDown, ChevronUp } from "lucide-react"
import {
  getRestockSuggestions,
  adjustProductStock,
  getStockAdjustments,
  type StockAdjustmentEntry,
} from "../actions"
import { formatRelativeTime } from "@/lib/relative-time"

interface Suggestion {
  productId: number
  name: string
  stockStatus: string
  stockQuantity: number | null
  lowStockThreshold: number | null
  units30d: number
  priority: number
  suggestedQuantity: number
  reason: string
}

const STOCK_LABEL: Record<string, string> = {
  in_stock: "En stock",
  low_stock: "Stock bajo",
  out_of_stock: "Agotado",
}

/**
 * Fase 12 — panel de inventario proactivo en /admin/productos:
 * sugerencias de reabasto (velocidad de venta 30 d × estado de stock) con
 * acción de un clic que actualiza el estado y deja bitácora, más el
 * historial reciente de ajustes.
 */
export function RestockPanel({ onRestocked }: { onRestocked: (productId: number) => void }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [history, setHistory] = useState<StockAdjustmentEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [workingId, setWorkingId] = useState<number | null>(null)
  const [liveStatus, setLiveStatus] = useState("")
  const [restockError, setRestockError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await getRestockSuggestions(10)
        if (!cancelled) setSuggestions(data)
      } catch {
        // Silencioso: el panel es auxiliar, no bloquea la página
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await getStockAdjustments(20))
    } catch {
      setHistory([])
    }
  }, [])

  const toggleHistory = useCallback(() => {
    setShowHistory((v) => {
      if (!v) void loadHistory()
      return !v
    })
  }, [loadHistory])

  async function restock(s: Suggestion) {
    setWorkingId(s.productId)
    setRestockError(null)
    setLiveStatus(`Reponiendo ${s.name}…`)
    try {
      // Reponer la cantidad sugerida deja el stock por encima del umbral y
      // el estado se deriva de la existencia (00108).
      const quantity =
        s.suggestedQuantity > 0
          ? (s.stockQuantity ?? 0) + s.suggestedQuantity
          : undefined
      await adjustProductStock(
        s.productId,
        "in_stock",
        quantity !== undefined
          ? `Reabasto desde sugerencias (+${s.suggestedQuantity})`
          : "Reabasto desde sugerencias",
        quantity
      )
      setSuggestions((prev) => prev.filter((x) => x.productId !== s.productId))
      onRestocked(s.productId)
      setLiveStatus(`Reabastecido: ${s.name}`)
    } catch {
      // La fila sobrevive al fallo: el aviso explica por qué sigue ahí.
      setLiveStatus("")
      setRestockError(`No se pudo reabastecer ${s.name}. Vuelve a intentarlo.`)
    } finally {
      setWorkingId(null)
    }
    // Fuera del try a propósito: el historial es decorativo y ya no puede
    // hacer que un reabasto correcto se anuncie como fallido.
    if (showHistory) await loadHistory()
  }

  if (!loaded || (suggestions.length === 0 && !showHistory)) {
    if (!loaded) return null
    // Sin sugerencias: solo ofrecemos el historial
  }

  return (
    <section
      aria-label="Inventario proactivo"
      className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
          <PackagePlus className="w-4 h-4" aria-hidden="true" />
          Reabasto sugerido
          {suggestions.length > 0 && (
            <span className="rounded-full bg-amber-800 px-2 py-0.5 text-[10px] font-bold text-white">
              {suggestions.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={toggleHistory}
          aria-expanded={showHistory}
          className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:underline"
        >
          <History className="w-3.5 h-3.5" aria-hidden="true" />
          Historial
          {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {liveStatus}
      </p>
      {restockError && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-700">
          {restockError}
        </p>
      )}

      {suggestions.length === 0 ? (
        <p className="mt-2 text-xs text-amber-800">
          Sin sugerencias: no hay productos con stock bajo/agotado y ventas recientes.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-amber-100">
          {suggestions.map((s) => {
            const label =
              s.suggestedQuantity > 0 ? `Reponer ${s.suggestedQuantity}` : "Reabastecer"
            const busy = workingId === s.productId
            return (
              <li key={s.productId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-medium text-gray-900">{s.name}</span>
                <span className="text-xs text-amber-800">{s.reason}</span>
                {s.stockQuantity !== null && (
                  <span className="text-[11px] text-amber-800">
                    {s.stockQuantity} en existencia · umbral {s.lowStockThreshold ?? 5}
                  </span>
                )}
                <button
                  type="button"
                  disabled={busy}
                  aria-busy={busy}
                  aria-label={`${label} · ${s.name}`}
                  onClick={() => void restock(s)}
                  className="ml-auto rounded-lg bg-amber-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50 transition-colors"
                >
                  {busy ? "…" : label}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {showHistory && (
        <div className="mt-3 border-t border-amber-200 pt-3">
          <h3 className="text-xs font-semibold text-amber-900 mb-2">Últimos ajustes de stock</h3>
          {history.length === 0 ? (
            <p className="text-xs text-amber-800">Aún no hay ajustes registrados.</p>
          ) : (
            <ul className="space-y-1">
              {history.map((h) => (
                <li key={h.id} className="text-xs text-amber-900/80">
                  <span className="font-medium">{h.product_name ?? `#${h.product_id}`}</span>
                  {": "}
                  {STOCK_LABEL[h.previous_status] ?? h.previous_status}
                  {" → "}
                  {STOCK_LABEL[h.new_status] ?? h.new_status}
                  {h.note ? ` · ${h.note}` : ""}
                  <span
                    className="ml-1 text-amber-800"
                    title={new Date(h.created_at).toLocaleString("es-MX")}
                  >
                    {formatRelativeTime(h.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
