"use client"

// ============================================================
// Panel de prompts GEO — la hoja de trabajo con persistencia
// ============================================================
// Antes: la página dibujaba un `—` escrito a mano en las 80 celdas y un pie que
// decía "registra también qué dato se citó y si era correcto". El procedimiento
// de `docs/medicion-seo-ia.md` §2 pedía "guarda los resultados" y no había
// dónde. Esto es ese lugar.
//
// Decisiones de lectura que la UI respeta (vienen de `@/lib/geo-panel`):
//  - Una tasa sin medición dice "sin datos", nunca "0%".
//  - Una corrida a medias no se reporta como fracaso de posicionamiento.
//  - El delta mes contra mes sólo existe si hubo un mes anterior con datos.

import { useCallback, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Info,
  Loader2,
  Trash2,
  X,
} from "lucide-react"
import { useEscapeKey } from "@/hooks/use-escape-key"
import { GEO_ENGINES, GEO_QUERIES } from "@/lib/geo-queries"
import {
  GEO_PANEL_LIMITS,
  cellKey,
  comparePanelMonths,
  computePanelMetrics,
  formatDelta,
  formatRate,
  indexCells,
  panelRowsToCsv,
  panelVerdict,
  type GeoPanelRecord,
  type GeoPanelVerdict,
} from "@/lib/geo-panel"
import {
  clearGeoPanelCell,
  getGeoPanelMonth,
  saveGeoPanelCell,
  type GeoPanelMonthData,
} from "./actions"

// ---------------------------------------------------------------------------
// Lectura del veredicto
// ---------------------------------------------------------------------------

const VERDICT: Record<GeoPanelVerdict, { label: string; tone: string; help: string }> = {
  sin_datos: {
    label: "Sin corrida",
    tone: "bg-gray-100 text-gray-600 border-gray-200",
    help: "Todavía no hay ninguna celda capturada en este mes.",
  },
  cobertura_parcial: {
    label: "Corrida incompleta",
    tone: "bg-amber-50 text-amber-700 border-amber-200",
    help: "Faltan celdas por capturar. Con la corrida a medias no se puede concluir que no nos citan: sólo que falta medir. Complétala antes de sacar conclusiones.",
  },
  sin_citas: {
    label: "No aparecemos",
    tone: "bg-red-50 text-red-700 border-red-200",
    help: "Ningún motor citó a Resurte.me en las celdas medidas. La lista de brechas de abajo dice qué página debería haber sido citada.",
  },
  citas_inexactas: {
    label: "Nos citan con datos equivocados",
    tone: "bg-red-50 text-red-700 border-red-200",
    help: "Hay más citas con el dato equivocado que citas correctas. Es peor que no aparecer: revisa los datos citados y corrígelos en la página de origen.",
  },
  citas_correctas: {
    label: "Nos citan bien",
    tone: "bg-green-50 text-green-700 border-green-200",
    help: "La mayoría de las citas traen el dato correcto. El trabajo de este mes es subir la tasa de citación, no arreglar datos.",
  },
}

// ---------------------------------------------------------------------------
// Celda
// ---------------------------------------------------------------------------

/** Estado visual de una celda de la matriz. */
function cellLook(cell: GeoPanelRecord | undefined) {
  if (!cell) {
    return {
      className: "border-dashed border-gray-200 text-gray-300 hover:border-brand-300 hover:text-brand-600",
      text: "—",
      title: "Sin registrar",
    }
  }
  if (!cell.cited) {
    return {
      className: "border-gray-200 bg-gray-50 text-gray-500 hover:border-brand-300",
      text: "No",
      title: "No citó a Resurte.me",
    }
  }
  const position = cell.citationPosition ? ` #${cell.citationPosition}` : ""
  if (cell.factAccuracy === "no") {
    return {
      className: "border-red-300 bg-red-50 text-red-700 hover:border-red-400",
      text: `Sí${position}`,
      title: "Citó, pero el dato es incorrecto",
    }
  }
  if (cell.factAccuracy === "parcial") {
    return {
      className: "border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400",
      text: `Sí${position}`,
      title: "Citó, pero el dato es sólo parcialmente correcto",
    }
  }
  return {
    className: "border-green-300 bg-green-50 text-green-700 hover:border-green-400",
    text: `Sí${position}`,
    title: cell.factAccuracy === "si" ? "Citó con el dato correcto" : "Citó",
  }
}

// ---------------------------------------------------------------------------
// Tarjeta de métrica
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  hint,
  delta,
}: {
  label: string
  value: string
  hint?: string
  delta?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {delta && <span className="text-xs font-medium text-gray-500">{delta}</span>}
      </div>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editor de una celda
// ---------------------------------------------------------------------------

interface EditorDraft {
  cited: boolean
  citationPosition: string
  citedFact: string
  factAccuracy: string
  competitorHost: string
  notes: string
}

function draftOf(cell: GeoPanelRecord | undefined): EditorDraft {
  return {
    cited: cell?.cited ?? false,
    citationPosition: cell?.citationPosition ? String(cell.citationPosition) : "",
    citedFact: cell?.citedFact ?? "",
    factAccuracy: cell?.factAccuracy ?? "",
    competitorHost: cell?.competitorHost ?? "",
    notes: cell?.notes ?? "",
  }
}

function GeoCellEditor({
  queryId,
  engineId,
  monthLabel,
  cell,
  saving,
  onCancel,
  onSave,
  onClear,
}: {
  queryId: string
  engineId: string
  monthLabel: string
  cell: GeoPanelRecord | undefined
  saving: boolean
  onCancel: () => void
  onSave: (draft: EditorDraft) => void
  onClear: () => void
}) {
  const [draft, setDraft] = useState<EditorDraft>(() => draftOf(cell))
  const query = GEO_QUERIES.find((q) => q.id === queryId)
  const engine = GEO_ENGINES.find((e) => e.id === engineId)

  useEscapeKey(onCancel, !saving)

  const set = <K extends keyof EditorDraft>(key: K, value: EditorDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="geo-cell-title"
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl my-8"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
              {engine?.label} · {monthLabel}
            </p>
            <h2 id="geo-cell-title" className="text-base font-bold text-gray-900 mt-0.5">
              {query?.prompt ?? queryId}
            </h2>
            {query && <p className="text-xs text-gray-500 mt-1">{query.intent}</p>}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            aria-label="Cerrar"
            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Citado */}
          <fieldset>
            <legend className="text-sm font-medium text-gray-900 mb-2">
              ¿{engine?.label} citó a Resurte.me?
            </legend>
            <div className="flex gap-2">
              {[
                { value: true, label: "Sí citó" },
                { value: false, label: "No citó" },
              ].map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => set("cited", opt.value)}
                  aria-pressed={draft.cited === opt.value}
                  className={`flex-1 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors touch-target ${
                    draft.cited === opt.value
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>

          {draft.cited ? (
            <>
              <div>
                <label htmlFor="geo-position" className="block text-sm font-medium text-gray-900 mb-1">
                  Posición de la cita
                </label>
                <input
                  id="geo-position"
                  type="number"
                  min={1}
                  max={GEO_PANEL_LIMITS.position}
                  inputMode="numeric"
                  value={draft.citationPosition}
                  onChange={(e) => set("citationPosition", e.target.value)}
                  placeholder="—"
                  className="w-28 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  El número de la lista. Si no la contaste, déjalo vacío.
                </p>
              </div>

              <div>
                <label htmlFor="geo-fact" className="block text-sm font-medium text-gray-900 mb-1">
                  Dato citado
                </label>
                <input
                  id="geo-fact"
                  type="text"
                  maxLength={GEO_PANEL_LIMITS.fact}
                  value={draft.citedFact}
                  onChange={(e) => set("citedFact", e.target.value)}
                  placeholder="Precio, pedido mínimo, plazo…"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {draft.citedFact.length}/{GEO_PANEL_LIMITS.fact}
                </p>
              </div>

              <div>
                <label htmlFor="geo-accuracy" className="block text-sm font-medium text-gray-900 mb-1">
                  ¿El dato citado es correcto?
                </label>
                <select
                  id="geo-accuracy"
                  value={draft.factAccuracy}
                  onChange={(e) => set("factAccuracy", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Sin verificar</option>
                  <option value="si">Sí, correcto</option>
                  <option value="no">No, incorrecto</option>
                  <option value="parcial">Parcialmente</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Una cita con el precio equivocado es peor que no aparecer.
                </p>
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="geo-competitor" className="block text-sm font-medium text-gray-900 mb-1">
                Quién fue citado en su lugar
              </label>
              <input
                id="geo-competitor"
                type="text"
                maxLength={GEO_PANEL_LIMITS.competitor}
                value={draft.competitorHost}
                onChange={(e) => set("competitorHost", e.target.value)}
                placeholder="dominio.com"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Sólo el dominio. Es lo que alimenta el ranking de competidores del mes.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="geo-notes" className="block text-sm font-medium text-gray-900 mb-1">
              Notas
            </label>
            <textarea
              id="geo-notes"
              rows={2}
              maxLength={GEO_PANEL_LIMITS.notes}
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Lo que no cabe en los campos de arriba."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
            />
            <p className="text-xs text-gray-400 mt-1">
              {draft.notes.length}/{GEO_PANEL_LIMITS.notes}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100">
          {cell && (
            <button
              type="button"
              onClick={onClear}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Borrar celda
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function GeoPanelForm({ initialData }: { initialData: GeoPanelMonthData }) {
  const [data, setData] = useState(initialData)
  const [loadingMonth, setLoadingMonth] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openCell, setOpenCell] = useState<{ queryId: string; engineId: string } | null>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)

  const cells = useMemo(() => indexCells(data.records), [data.records])
  const metrics = useMemo(() => computePanelMetrics(data.records), [data.records])
  const previousMetrics = useMemo(
    () => (data.previousMonth ? computePanelMetrics(data.previousRecords) : null),
    [data.previousMonth, data.previousRecords]
  )
  const comparison = useMemo(
    () => comparePanelMonths(metrics, previousMetrics, data.previousMonth),
    [metrics, previousMetrics, data.previousMonth]
  )
  const verdict = VERDICT[panelVerdict(metrics)]

  const apply = useCallback((next: GeoPanelMonthData) => {
    setData(next)
  }, [])

  const changeMonth = async (monthKey: string) => {
    if (monthKey === data.monthKey) return
    setLoadingMonth(true)
    setError(null)
    try {
      apply(await getGeoPanelMonth(monthKey))
      setOpenCell(null)
    } catch {
      setError("No se pudo cargar el mes. Intenta de nuevo.")
    } finally {
      setLoadingMonth(false)
    }
  }

  const handleSave = async (draft: EditorDraft) => {
    if (!openCell) return
    setSaving(true)
    setError(null)
    try {
      const result = await saveGeoPanelCell({
        monthKey: data.monthKey,
        queryId: openCell.queryId,
        engineId: openCell.engineId,
        cited: draft.cited,
        citationPosition: draft.citationPosition ? Number(draft.citationPosition) : null,
        citedFact: draft.citedFact,
        factAccuracy: draft.factAccuracy || null,
        competitorHost: draft.competitorHost,
        notes: draft.notes,
      })
      if (!result.ok) {
        setError(result.error ?? "No se pudo guardar la celda.")
        errorRef.current?.focus()
        return
      }
      if (result.data) apply(result.data)
      setOpenCell(null)
    } catch {
      setError("No se pudo guardar la celda.")
      errorRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    if (!openCell) return
    setSaving(true)
    setError(null)
    try {
      const result = await clearGeoPanelCell({
        monthKey: data.monthKey,
        queryId: openCell.queryId,
        engineId: openCell.engineId,
      })
      if (!result.ok) {
        setError(result.error ?? "No se pudo borrar la celda.")
        errorRef.current?.focus()
        return
      }
      if (result.data) apply(result.data)
      setOpenCell(null)
    } catch {
      setError("No se pudo borrar la celda.")
      errorRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  const exportCsv = () => {
    const csv = panelRowsToCsv(data.records)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `panel-geo-${data.monthKey}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const openCellRecord = openCell ? cells.get(cellKey(openCell.queryId, openCell.engineId)) : undefined

  return (
    <div>
      {/* Selector de mes */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <label htmlFor="geo-month" className="text-sm font-medium text-gray-900">
          Corrida de
        </label>
        <select
          id="geo-month"
          value={data.monthKey}
          onChange={(e) => void changeMonth(e.target.value)}
          disabled={loadingMonth}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
        >
          {data.availableMonths.map((m) => (
            <option key={m.monthKey} value={m.monthKey}>
              {m.label} · {m.recorded}/{m.total}
            </option>
          ))}
          {!data.availableMonths.some((m) => m.monthKey === data.monthKey) && (
            <option value={data.monthKey}>{data.monthLabel} · 0/80 (sin empezar)</option>
          )}
        </select>
        {loadingMonth && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        <div className="flex-1" />
        <button
          type="button"
          onClick={exportCsv}
          disabled={data.records.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <Download className="w-4 h-4" />
          CSV del mes
        </button>
      </div>

      {error && (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-300"
        >
          {error}
        </p>
      )}

      {/* Veredicto y métricas */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${verdict.tone}`}>
          {verdict.label}
        </span>
        {comparison.previousMonth && (
          <span className="text-xs text-gray-500">
            vs {comparison.previousMonth}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-5 max-w-3xl">{verdict.help}</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <MetricCard
          label="Cobertura"
          value={`${metrics.recorded}/${metrics.total}`}
          hint="celdas capturadas de la corrida"
          delta={comparison.coverageDelta !== null ? formatDelta(comparison.coverageDelta, 1) : undefined}
        />
        <MetricCard
          label="Tasa de citación"
          value={formatRate(metrics.citedRate, 1)}
          hint={metrics.citedRate === null ? "sin celdas medidas" : `${metrics.cited} de ${metrics.recorded} citaron`}
          delta={comparison.citedRateDelta !== null ? formatDelta(comparison.citedRateDelta, 1) : undefined}
        />
        <MetricCard
          label="Dato correcto"
          value={formatRate(metrics.accuracyRate, 1)}
          hint={
            metrics.rated === 0
              ? "ninguna cita verificada"
              : `${metrics.accurate} correctas · ${metrics.inaccurate} incorrectas · ${metrics.partial} parciales`
          }
          delta={comparison.accuracyRateDelta !== null ? formatDelta(comparison.accuracyRateDelta, 1) : undefined}
        />
        <MetricCard
          label="Dato equivocado"
          value={formatRate(metrics.wrongRate, 1)}
          hint={metrics.rated === 0 ? "sin citas verificadas" : "de las citas verificadas"}
        />
      </div>

      {/* Matriz */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 font-medium">
                <th className="px-5 py-3 w-8">#</th>
                <th className="px-5 py-3 min-w-[20rem]">Pregunta</th>
                <th className="px-5 py-3 min-w-[9rem]">Dónde debería citar</th>
                {GEO_ENGINES.map((e) => (
                  <th key={e.id} className="px-3 py-3 text-center w-28">
                    {e.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {GEO_QUERIES.map((q, i) => (
                <tr key={q.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-xs text-gray-400 font-mono">{i + 1}</td>
                  <td className="px-5 py-3">
                    <p className="text-gray-900">{q.prompt}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{q.intent}</p>
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={q.targetPath}
                      className="text-xs font-mono text-brand-600 hover:underline"
                      target="_blank"
                    >
                      {q.targetPath}
                    </Link>
                  </td>
                  {GEO_ENGINES.map((e) => {
                    const cell = cells.get(cellKey(q.id, e.id))
                    const look = cellLook(cell)
                    return (
                      <td key={e.id} className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setOpenCell({ queryId: q.id, engineId: e.id })}
                          title={look.title}
                          aria-label={`${q.prompt} en ${e.label}: ${look.title}`}
                          className={`w-full min-h-[2.25rem] px-2 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${look.className}`}
                        >
                          {look.text}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-10">
        Pica cualquier celda para registrarla. {metrics.total} comprobaciones por corrida (
        {GEO_QUERIES.length} preguntas × {GEO_ENGINES.length} motores). Registra también{" "}
        <strong>qué dato se citó</strong> y <strong>si era correcto</strong>: una cita con el precio
        equivocado es peor que no aparecer.
      </p>

      {/* Motores */}
      {metrics.recorded > 0 && (
        <section className="mb-10">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Tasa de citación por motor</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {metrics.byEngine.map((e) => (
              <div key={e.engineId} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-semibold text-gray-900">{e.label}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{formatRate(e.citedRate, 0)}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {e.recorded === 0 ? "sin celdas medidas" : `${e.cited} de ${e.recorded} citaron`}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Competidores */}
      {metrics.topCompetitors.length > 0 && (
        <section className="mb-10">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Quién nos gana la cita</h3>
          <p className="text-sm text-gray-500 mb-3">
            Dominios citados en las celdas donde Resurte.me no apareció.
          </p>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {metrics.topCompetitors.map((c) => (
              <div key={c.host} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm font-mono text-gray-900">{c.host}</span>
                <span className="text-sm text-gray-500">
                  {c.count} {c.count === 1 ? "celda" : "celdas"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Brechas */}
      <section className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Brechas accionables</h3>
        <p className="text-sm text-gray-500 mb-3">
          Preguntas donde la página existe y aun así no nos citaron. Cada renglón es una página a
          reforzar.
        </p>
        {metrics.gaps.length === 0 ? (
          <div className="flex items-start gap-2 text-sm text-gray-500 bg-white rounded-xl border border-gray-200 px-5 py-4">
            {metrics.recorded === 0 ? (
              <>
                <Info className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                Todavía no hay celdas capturadas, así que no hay brechas que leer.
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-green-700" />
                Ninguna brecha en las celdas medidas: donde debería haber cita, la hubo.
              </>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {metrics.gaps.map((g) => (
              <div key={`${g.queryId}::${g.engineId}`} className="px-5 py-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900">{g.prompt}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {g.engineLabel} ·{" "}
                      <Link
                        href={g.targetPath}
                        target="_blank"
                        className="font-mono text-brand-600 hover:underline"
                      >
                        {g.targetPath}
                      </Link>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {openCell && (
        <GeoCellEditor
          key={`${openCell.queryId}::${openCell.engineId}`}
          queryId={openCell.queryId}
          engineId={openCell.engineId}
          monthLabel={data.monthLabel}
          cell={openCellRecord}
          saving={saving}
          onCancel={() => setOpenCell(null)}
          onSave={(draft) => void handleSave(draft)}
          onClear={() => void handleClear()}
        />
      )}
    </div>
  )
}
