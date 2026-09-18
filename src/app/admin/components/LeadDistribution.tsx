"use client"

import { useCallback, useState } from "react"
import { Loader2, Shuffle, X } from "lucide-react"
import { distributeCrmProspects, getAdminSellerLoads, type DistributeCrmResult } from "../actions"
import {
  ASSIGNMENT_STRATEGIES,
  ASSIGNMENT_STRATEGY_LABEL,
  type AssignmentStrategy,
  type SellerLoad,
} from "@/lib/crm-assignment"
import { useToast } from "@/components/toast"

const CARD = "rounded-xl border border-gray-200 bg-white"

/** El reparto por "menos cargado" es el que menos sorprende: reparte según lo que hay. */
const DEFAULT_STRATEGY: AssignmentStrategy = "least_loaded"

interface SellerGroup {
  sellerName: string
  count: number
  reason: string
}

/** Una fila por vendedor con lo que le tocó, para poder explicar el reparto. */
function groupBySeller(result: DistributeCrmResult): SellerGroup[] {
  const groups = new Map<string, SellerGroup>()
  for (const assignment of result.assignments) {
    const group = groups.get(assignment.sellerId)
    if (group) group.count += 1
    else
      groups.set(assignment.sellerId, {
        sellerName: assignment.sellerName,
        count: 1,
        reason: assignment.reason,
      })
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.sellerName.localeCompare(b.sellerName, "es"))
}

/**
 * Reparto de prospectos seleccionados entre los vendedores.
 *
 * La carga de cada vendedor se lee al abrir (`getAdminSellerLoads`) y es lo único
 * que se muestra antes de confirmar: `distributeCrmProspects` **escribe**, no
 * tiene modo simulación, así que la previsualización honesta es la tabla de carga
 * y el reparto real solo ocurre al pulsar el botón.
 */
export function LeadDistribution({
  selectedIds,
  disabled,
  onDistributed,
}: {
  selectedIds: readonly number[]
  disabled?: boolean
  onDistributed: (message: string) => void
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loads, setLoads] = useState<SellerLoad[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [strategy, setStrategy] = useState<AssignmentStrategy>(DEFAULT_STRATEGY)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DistributeCrmResult | null>(null)

  const loadLoads = useCallback(async () => {
    setLoading(true)
    try {
      setLoads(await getAdminSellerLoads())
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No se pudo leer la carga de los vendedores")
    } finally {
      setLoading(false)
    }
  }, [])

  function toggle() {
    const next = !open
    setOpen(next)
    setResult(null)
    if (next && loads === null && !loading) void loadLoads()
  }

  async function distribute() {
    setBusy(true)
    try {
      const applied = await distributeCrmProspects({ strategy, prospectIds: [...selectedIds] })
      setResult(applied)
      if (applied.assigned === 0) {
        toast("No había nada que repartir: revisa que los vendedores estén dados de alta", "error")
      } else {
        onDistributed(
          `${applied.assigned} prospecto${applied.assigned === 1 ? "" : "s"} repartido${
            applied.assigned === 1 ? "" : "s"
          }`,
        )
        void loadLoads()
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo repartir", "error")
    } finally {
      setBusy(false)
    }
  }

  const grouped = result === null ? null : groupBySeller(result)

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled || selectedIds.length === 0}
        aria-expanded={open}
        onClick={toggle}
        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-gray-200 px-3 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <Shuffle className="h-3.5 w-3.5" /> Repartir
      </button>

      {open && (
        <div
          className={`${CARD} absolute right-0 z-30 mt-1 w-[22rem] max-w-[calc(100vw-2rem)] p-3 shadow-lg`}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-900">Repartir prospectos</p>
              <p className="mt-0.5 text-[11px] text-gray-500">
                {selectedIds.length} seleccionado{selectedIds.length === 1 ? "" : "s"}. Solo cambia
                el vendedor asignado.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar el reparto"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2.5">
            <p className="text-[11px] font-semibold text-gray-600">Carga actual</p>
            {loading && loads === null ? (
              <p className="flex items-center gap-2 py-2 text-[11px] text-gray-600">
                <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> Cargando...
              </p>
            ) : loadError ? (
              <div className="flex items-center gap-2 py-1.5">
                <p className="flex-1 text-[11px] text-red-700">{loadError}</p>
                <button
                  type="button"
                  onClick={() => void loadLoads()}
                  className="min-h-[32px] rounded-lg border border-gray-200 px-2.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Reintentar
                </button>
              </div>
            ) : loads !== null && loads.length === 0 ? (
              <p className="py-1.5 text-[11px] text-amber-700">
                No hay vendedores dados de alta, así que no hay a quién repartir.
              </p>
            ) : (
              <table className="mt-1 w-full text-[11px]">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="font-medium">Vendedor</th>
                    <th className="w-12 text-right font-medium">Abiertos</th>
                    <th className="w-14 text-right font-medium">Vencidos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(loads ?? []).map((load) => (
                    <tr key={load.sellerId} className="text-gray-700">
                      <td className="max-w-[10rem] truncate py-1">{load.name}</td>
                      <td className="py-1 text-right tabular-nums">{load.open}</td>
                      <td
                        className={`py-1 text-right tabular-nums ${
                          load.overdue > 0 ? "font-semibold text-amber-700" : "text-gray-600"
                        }`}
                      >
                        {load.overdue}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <fieldset className="mt-3">
            <legend className="text-[11px] font-semibold text-gray-600">Criterio</legend>
            <div className="mt-1 space-y-1">
              {ASSIGNMENT_STRATEGIES.map((option) => (
                <label
                  key={option}
                  className="flex min-h-[32px] cursor-pointer items-center gap-2 text-[11px] text-gray-700"
                >
                  <input
                    type="radio"
                    name="assignment-strategy"
                    value={option}
                    checked={strategy === option}
                    disabled={busy}
                    onChange={() => setStrategy(option)}
                    className="h-3.5 w-3.5 accent-brand-600"
                  />
                  {ASSIGNMENT_STRATEGY_LABEL[option]}
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            disabled={busy}
            onClick={() => void distribute()}
            className="mt-3 inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />}
            {busy
              ? "Repartiendo..."
              : `Repartir ${selectedIds.length} con ${ASSIGNMENT_STRATEGY_LABEL[strategy].toLowerCase()}`}
          </button>

          {grouped && (
            <div className="mt-2.5 border-t border-gray-100 pt-2">
              {grouped.length === 0 ? (
                <p className="text-[11px] text-gray-500">Nada que repartir: sin cambios.</p>
              ) : (
                <ul className="space-y-0.5">
                  {grouped.map((group) => (
                    <li key={group.sellerName} className="flex items-start gap-2 text-[11px]">
                      <span className="min-w-0 flex-1 truncate text-gray-700">
                        {group.sellerName}
                        <span className="ml-1 text-gray-600">{group.reason}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-gray-900">
                        +{group.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
