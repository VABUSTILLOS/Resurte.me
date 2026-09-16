"use client"

import { useRef, useState } from "react"
import { Upload, Download, X } from "lucide-react"
import {
  parseProductImportCsv,
  generateProductImportTemplate,
  type ProductImportResult,
} from "@/lib/product-import"
import { useEscapeKey } from "@/hooks/use-escape-key"

type ImportMode = "upsert" | "create_only" | "update_only"

interface ImportResponse {
  created?: number
  updated?: number
  skipped?: number
  errors?: { slug: string; message: string }[]
  error?: string
}

interface PlanEntry {
  line: number
  slug: string
  name: string
  sku: string | null
  matchedBy: "sku" | "slug" | null
}

interface DryRunPlan {
  created: number
  updated: number
  skipped: number
  toCreate: PlanEntry[]
  toUpdate: PlanEntry[]
}

const MODE_LABEL: Record<ImportMode, string> = {
  upsert: "Crear y actualizar",
  create_only: "Solo crear nuevos",
  update_only: "Solo actualizar existentes",
}

/**
 * Fase 16 — modal de importación masiva de productos: plantilla
 * descargable, pegar/subir CSV, preview con validación y confirmación.
 */
export function ImportProductsModal({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: () => void
}) {
  const [text, setText] = useState("")
  const [parsed, setParsed] = useState<ProductImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResponse | null>(null)
  // Dry-run: clasificación servidor (crear/actualizar) antes de aplicar.
  const [plan, setPlan] = useState<DryRunPlan | null>(null)
  const [planning, setPlanning] = useState(false)
  const [mode, setMode] = useState<ImportMode>("upsert")
  const fileRef = useRef<HTMLInputElement>(null)

  useEscapeKey(onClose, true)

  function downloadTemplate() {
    const blob = new Blob([generateProductImportTemplate()], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "plantilla-productos.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  function preview(value: string) {
    setText(value)
    setResult(null)
    setPlan(null)
    setParsed(value.trim() ? parseProductImportCsv(value) : null)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    preview(await file.text())
  }

  /** Paso 1: dry-run — el servidor clasifica crear/actualizar sin escribir. */
  async function dryRun() {
    if (!parsed || parsed.rows.length === 0) return
    setPlanning(true)
    try {
      const res = await fetch("/api/admin/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.rows, dryRun: true, mode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error al previsualizar")
      setPlan({
        created: data.created ?? 0,
        updated: data.updated ?? 0,
        skipped: data.skipped ?? 0,
        toCreate: data.toCreate ?? [],
        toUpdate: data.toUpdate ?? [],
      })
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Error de conexión" })
    } finally {
      setPlanning(false)
    }
  }

  async function doImport() {
    if (!parsed || parsed.rows.length === 0) return
    setImporting(true)
    try {
      const res = await fetch("/api/admin/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.rows, mode }),
      })
      const data = (await res.json()) as ImportResponse
      setResult(data)
      if (res.ok && ((data.created ?? 0) > 0 || (data.updated ?? 0) > 0)) {
        setPlan(null)
        onImported()
      }
    } catch {
      setResult({ error: "Error de conexión" })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Importar productos desde CSV"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Upload className="w-5 h-5 text-brand-600" aria-hidden="true" />
            Importar productos (CSV)
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <Download className="w-3.5 h-3.5" />
            Descargar plantilla
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <Upload className="w-3.5 h-3.5" />
            Subir archivo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => void onFile(e)}
            aria-label="Archivo CSV"
          />
        </div>

        <textarea
          value={text}
          onChange={(e) => preview(e.target.value)}
          placeholder="O pega aquí el contenido del CSV…"
          rows={6}
          aria-label="Contenido CSV"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs focus:outline-none focus:border-brand-500"
        />

        <fieldset className="mt-3">
          <legend className="text-xs font-semibold text-gray-700 mb-1.5">
            Qué hacer con las filas
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(MODE_LABEL) as ImportMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setPlan(null)
                }}
                aria-pressed={mode === m}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  mode === m
                    ? "bg-brand-600 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-gray-500">
            La coincidencia es primero por SKU y luego por slug.
          </p>
        </fieldset>

        {parsed && (
          <div className="mt-3" aria-live="polite">
            <p className="text-xs font-medium text-gray-700">
              {parsed.rows.length} fila{parsed.rows.length !== 1 ? "s" : ""} válida{parsed.rows.length !== 1 ? "s" : ""}
              {parsed.errors.length > 0 && (
                <span className="text-red-600"> · {parsed.errors.length} con error</span>
              )}
            </p>
            {parsed.errors.length > 0 && (
              <ul className="mt-2 max-h-32 overflow-y-auto rounded-lg bg-red-50 border border-red-100 p-2 space-y-0.5">
                {parsed.errors.slice(0, 20).map((err, i) => (
                  <li key={i} className="text-[11px] text-red-700">
                    Línea {err.line}: {err.message}
                  </li>
                ))}
                {parsed.errors.length > 20 && (
                  <li className="text-[11px] text-red-500">…y {parsed.errors.length - 20} más</li>
                )}
              </ul>
            )}
            {parsed.rows.length > 0 && (
              <ul className="mt-2 max-h-32 overflow-y-auto rounded-lg bg-gray-50 border border-gray-100 p-2 space-y-0.5">
                {parsed.rows.slice(0, 10).map((r) => (
                  <li key={r.slug} className="text-[11px] text-gray-600">
                    {r.name} — ${r.price.toFixed(2)} ({r.slug})
                  </li>
                ))}
                {parsed.rows.length > 10 && (
                  <li className="text-[11px] text-gray-400">…y {parsed.rows.length - 10} más</li>
                )}
              </ul>
            )}
          </div>
        )}

        {plan && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
            <p className="font-semibold">
              Vista previa: {plan.created} nuevos · {plan.updated} se actualizarán
              {plan.skipped > 0 && ` · ${plan.skipped} se omitirán por el modo elegido`}
            </p>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
              {plan.toCreate.length > 0 && (
                <ul className="rounded-lg bg-white/70 border border-blue-100 p-2 space-y-0.5">
                  <li className="text-[10px] font-bold text-green-700 uppercase">Nuevos</li>
                  {plan.toCreate.slice(0, 20).map((r) => (
                    <li key={`c-${r.line}`} className="text-[11px] text-gray-700">
                      {r.name}
                      {r.sku && <span className="text-gray-400"> · {r.sku}</span>}
                    </li>
                  ))}
                  {plan.toCreate.length > 20 && (
                    <li className="text-[11px] text-gray-400">…y {plan.toCreate.length - 20} más</li>
                  )}
                </ul>
              )}
              {plan.toUpdate.length > 0 && (
                <ul className="rounded-lg bg-white/70 border border-blue-100 p-2 space-y-0.5">
                  <li className="text-[10px] font-bold text-amber-700 uppercase">Se actualizan</li>
                  {plan.toUpdate.slice(0, 20).map((r) => (
                    <li key={`u-${r.line}`} className="text-[11px] text-gray-700">
                      {r.name}
                      <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-700 uppercase">
                        {r.matchedBy === "sku" ? "SKU" : "slug"}
                      </span>
                    </li>
                  ))}
                  {plan.toUpdate.length > 20 && (
                    <li className="text-[11px] text-gray-400">…y {plan.toUpdate.length - 20} más</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        )}

        {result && (
          <div
            className={`mt-3 rounded-lg border p-3 text-xs ${
              result.error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-800"
            }`}
            role="status"
          >
            {result.error ? (
              result.error
            ) : (
              <>
                {result.created ?? 0} creados · {result.updated ?? 0} actualizados
                {(result.skipped ?? 0) > 0 && ` · ${result.skipped} omitidos`}
                {(result.errors?.length ?? 0) > 0 && ` · ${result.errors?.length ?? 0} fallidos`}
                {(result.errors ?? []).slice(0, 5).map((e) => (
                  <p key={e.slug} className="mt-1 text-red-700">
                    {e.slug}: {e.message}
                  </p>
                ))}
              </>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Cerrar
          </button>
          {plan === null ? (
            <button
              type="button"
              onClick={() => void dryRun()}
              disabled={!parsed || parsed.rows.length === 0 || planning}
              className="rounded-lg bg-white border border-brand-300 text-brand-700 px-4 py-2 text-sm font-semibold hover:bg-brand-50 disabled:opacity-50 transition-colors"
            >
              {planning ? "Analizando..." : "Vista previa"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void doImport()}
              disabled={importing}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {importing
                ? "Importando..."
                : `Confirmar: ${plan.created} nuevos, ${plan.updated} actualizados`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
