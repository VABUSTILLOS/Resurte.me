"use client"

import { useState } from "react"
import { Check, Loader2, Percent, X } from "lucide-react"

type Props = {
  restaurantId: string
  restaurantName: string
  /** Comisión configurada actualmente, en porcentaje. */
  feePercent: number
  /** Se llama tras guardar, para refrescar el reporte. */
  onSaved: () => void
}

/**
 * Comisión de plataforma de un restaurante (migración 00157, escritura nueva).
 *
 * `platform_fee_percent` se leía en cuatro lugares pero **ninguna ruta la
 * escribía**: cambiarla exigía el SQL editor. Este control cierra ese hueco.
 *
 * Guardar aquí **no mueve dinero**: el porcentaje se lee al construir el cargo
 * de un pedido nuevo, así que aplica a partir del siguiente cobro y no reescribe
 * lo ya cobrado. Con Connect apagado el campo se guarda igual y sirve de
 * preparación; la comisión empieza a retenerse cuando los cargos se enrutan.
 *
 * El 0 por defecto es paridad con Take App: no es un descuido, es la política
 * vigente, y esta pantalla existe para poder cambiarla sin desplegar código.
 */
export function PlatformFeeEditor({
  restaurantId,
  restaurantName,
  feePercent,
  onSaved,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(feePercent))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save() {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(
        `/api/admin/foodos/restaurants/${encodeURIComponent(restaurantId)}/platform-fee`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform_fee_percent: value }),
        }
      )
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? "No se pudo guardar la comisión")
        return
      }
      setEditing(false)
      setSaved(true)
      onSaved()
    } catch {
      setError("No se pudo guardar la comisión")
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    setValue(String(feePercent))
    setError(null)
    setEditing(false)
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-gray-500">
          {feePercent > 0 ? `${feePercent} %` : "0 % (paridad)"}
        </span>
        <button
          type="button"
          onClick={() => {
            setSaved(false)
            setEditing(true)
          }}
          aria-label={`Cambiar la comisión de ${restaurantName}`}
          title="Cambiar la comisión de plataforma"
          className="inline-flex items-center rounded-full border border-gray-200 p-1 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
        >
          <Percent className="w-3 h-3" />
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700">
            <Check className="w-3 h-3" />
            Guardado
          </span>
        )}
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1.5">
        <label htmlFor={`fee-${restaurantId}`} className="sr-only">
          Comisión de plataforma para {restaurantName}
        </label>
        <input
          id={`fee-${restaurantId}`}
          type="text"
          inputMode="decimal"
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-xs text-right text-gray-900 disabled:opacity-50"
        />
        <span className="text-xs text-gray-500">%</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-full bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Guardar"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={cancel}
          aria-label="Cancelar"
          className="rounded-full border border-gray-200 p-1 text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </span>
      <span className="text-[10px] text-gray-600">
        Aplica a los próximos cobros, no a los ya realizados.
      </span>
      {error && (
        <span className="text-[10px] font-medium text-red-700">{error}</span>
      )}
    </span>
  )
}
