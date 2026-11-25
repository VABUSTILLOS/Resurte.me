"use client"

import { useEffect, useState } from "react"
import { CalendarClock, Save } from "lucide-react"

/**
 * Entregas — franjas horarias y hora de corte (Ola 7, 00236).
 *
 * Una sola configuración para los tres canales: el checkout web,
 * el flujo de WhatsApp y los pedidos recurrentes leen las mismas
 * franjas (fuente única: src/lib/delivery-slots.ts).
 *
 * - Franjas por día: qué franjas se ofrecen cada día de la
 *   semana. Un día sin franjas no entrega.
 * - Hora de corte: opcional. Con corte, un pedido que llega a
 *   esa hora o después ya no alcanza franja ese día, y una
 *   franja que ya empezó no se puede tomar. Sin corte, el
 *   comportamiento es el histórico.
 * - Capacidad por franja: opcional. Cuántos pedidos acepta cada
 *   franja por día.
 *
 * Sin la migración 00236 la pantalla lo declara y no se puede
 * guardar (la tienda sigue vendiendo con la configuración
 * histórica).
 */

interface SlotsConfig {
  cutoffTime: string | null
  capacityPerSlot: number | null
  week: string[][]
}

interface SlotDef {
  id: string
  label: string
}

const SLOTS: SlotDef[] = [
  { id: "08-10", label: "8:00 AM — 10:00 AM" },
  { id: "10-12", label: "10:00 AM — 12:00 PM" },
  { id: "12-14", label: "12:00 PM — 2:00 PM" },
  { id: "14-16", label: "2:00 PM — 4:00 PM" },
  { id: "16-18", label: "4:00 PM — 6:00 PM" },
  { id: "18-20", label: "6:00 PM — 8:00 PM" },
]

/** Orden visible: lunes primero. El índice es el de la config (0 = domingo). */
const WEEKDAYS: Array<{ index: number; label: string }> = [
  { index: 1, label: "Lunes" },
  { index: 2, label: "Martes" },
  { index: 3, label: "Miércoles" },
  { index: 4, label: "Jueves" },
  { index: 5, label: "Viernes" },
  { index: 6, label: "Sábado" },
  { index: 0, label: "Domingo" },
]

const inputCls =
  "rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
const btnCls =
  "inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"

export default function AdminEntregasPage() {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [config, setConfig] = useState<SlotsConfig | null>(null)
  const [cutoffEnabled, setCutoffEnabled] = useState(false)
  const [capacityText, setCapacityText] = useState("")
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // El setState vive dentro de la promesa, nunca síncrono en el
  // cuerpo del efecto (react-hooks/set-state-in-effect).
  useEffect(() => {
    let alive = true
    fetch("/api/admin/delivery-slots")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as { available: boolean; config: SlotsConfig }
      })
      .then((body) => {
        if (!alive) return
        setAvailable(body.available)
        setConfig(body.config)
        setCutoffEnabled(body.config.cutoffTime !== null)
        setCapacityText(
          body.config.capacityPerSlot !== null ? String(body.config.capacityPerSlot) : ""
        )
      })
      .catch(() => {
        if (!alive) return
        setAvailable(false)
        setError("No se pudo leer la configuración de entregas.")
      })
    return () => {
      alive = false
    }
  }, [])

  const toggleSlot = (weekday: number, slotId: string) => {
    setConfig((current) => {
      if (!current) return current
      const week = current.week.map((ids, i) => {
        if (i !== weekday) return ids
        return ids.includes(slotId) ? ids.filter((id) => id !== slotId) : [...ids, slotId]
      })
      return { ...current, week }
    })
  }

  const setDayAll = (weekday: number, all: boolean) => {
    setConfig((current) => {
      if (!current) return current
      const week = current.week.map((ids, i) =>
        i === weekday ? (all ? SLOTS.map((s) => s.id) : []) : ids
      )
      return { ...current, week }
    })
  }

  const save = async () => {
    if (!config) return
    setSaving(true)
    setError(null)
    setNotice(null)
    const capacity = capacityText.trim() === "" ? null : Number(capacityText)
    const payload: SlotsConfig = {
      cutoffTime: cutoffEnabled ? (config.cutoffTime ?? "14:00") : null,
      capacityPerSlot: capacity !== null && Number.isFinite(capacity) ? capacity : null,
      week: config.week,
    }
    try {
      const res = await fetch("/api/admin/delivery-slots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: payload }),
      })
      const body = (await res.json().catch(() => null)) as
        | { config?: SlotsConfig; error?: string }
        | null
      if (!res.ok) {
        setError(body?.error ?? "No se pudo guardar la configuración.")
        return
      }
      if (body?.config) {
        setConfig(body.config)
        setCutoffEnabled(body.config.cutoffTime !== null)
        setCapacityText(
          body.config.capacityPerSlot !== null ? String(body.config.capacityPerSlot) : ""
        )
      }
      setNotice("Configuración guardada. Aplica de inmediato en la web y en WhatsApp.")
    } catch {
      setError("No se pudo guardar la configuración.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <CalendarClock className="h-6 w-6 text-emerald-700" aria-hidden />
          Entregas: franjas y hora de corte
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Las franjas que se ofrecen en la web y en WhatsApp, la hora de corte del mismo día y la
          capacidad por franja. Sin tocar nada, la tienda ofrece las 6 franjas de siempre, todos
          los días.
        </p>
      </header>

      {available === false && (
        <p role="status" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          La tabla de configuración todavía no existe: corre la migración{" "}
          <strong>00236_delivery_slots_config.sql</strong> en Supabase para poder guardar cambios.
          Mientras tanto la tienda vende con la configuración de siempre.
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </p>
      )}

      {config && (
        <div className="space-y-8">
          <section aria-labelledby="entregas-franjas">
            <h2 id="entregas-franjas" className="mb-2 text-base font-semibold text-gray-900">
              Franjas por día de la semana
            </h2>
            <p className="mb-3 text-sm text-gray-600">
              Marca las franjas que se ofrecen cada día. Un día sin franjas marcadas no entrega.
            </p>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left">
                    <th scope="col" className="px-4 py-3 font-semibold text-gray-700">
                      Día
                    </th>
                    {SLOTS.map((slot) => (
                      <th key={slot.id} scope="col" className="px-2 py-3 text-center font-semibold text-gray-700">
                        {slot.label}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3 text-right font-semibold text-gray-700">
                      Todo / nada
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {WEEKDAYS.map(({ index, label }) => {
                    const ids = config.week[index] ?? []
                    return (
                      <tr key={index} className="border-b border-gray-100 last:border-0">
                        <th scope="row" className="px-4 py-3 text-left font-medium text-gray-800">
                          {label}
                          {ids.length === 0 && (
                            <span className="ml-2 text-xs font-normal text-red-700">sin entregas</span>
                          )}
                        </th>
                        {SLOTS.map((slot) => (
                          <td key={slot.id} className="px-2 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={ids.includes(slot.id)}
                              onChange={() => toggleSlot(index, slot.id)}
                              aria-label={`${label}: franja ${slot.label}`}
                              className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                            />
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setDayAll(index, true)}
                            className="mr-2 text-xs font-medium text-emerald-700 underline underline-offset-2"
                          >
                            Todas
                          </button>
                          <button
                            type="button"
                            onClick={() => setDayAll(index, false)}
                            className="text-xs font-medium text-gray-600 underline underline-offset-2"
                          >
                            Ninguna
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="entregas-corte" className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 id="entregas-corte" className="mb-2 text-base font-semibold text-gray-900">
              Hora de corte del mismo día
            </h2>
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={cutoffEnabled}
                onChange={(e) => setCutoffEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
              />
              Activar hora de corte
            </label>
            {cutoffEnabled && (
              <div className="mt-3 flex items-center gap-3">
                <label htmlFor="entregas-corte-hora" className="text-sm text-gray-700">
                  Pedidos del día hasta las
                </label>
                <input
                  id="entregas-corte-hora"
                  type="time"
                  value={config.cutoffTime ?? "14:00"}
                  onChange={(e) =>
                    setConfig((current) =>
                      current ? { ...current, cutoffTime: e.target.value } : current
                    )
                  }
                  className={inputCls}
                />
              </div>
            )}
            <p className="mt-3 text-sm text-gray-600">
              Con el corte activo, un pedido que llega a esa hora o después ya no alcanza franja
              ese día (se ofrece desde el siguiente día con entregas) y una franja que ya empezó
              no se puede elegir. Sin corte, los pedidos del día se ofrecen como siempre.
            </p>
          </section>

          <section aria-labelledby="entregas-capacidad" className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 id="entregas-capacidad" className="mb-2 text-base font-semibold text-gray-900">
              Capacidad por franja (opcional)
            </h2>
            <div className="flex items-center gap-3">
              <label htmlFor="entregas-capacidad-num" className="text-sm text-gray-700">
                Pedidos máximos por franja y día
              </label>
              <input
                id="entregas-capacidad-num"
                type="number"
                min={1}
                max={200}
                value={capacityText}
                onChange={(e) => setCapacityText(e.target.value)}
                placeholder="Sin límite"
                className={`${inputCls} w-32`}
              />
            </div>
            <p className="mt-3 text-sm text-gray-600">
              Al llenarse una franja, deja de ofrecerse en la web y en WhatsApp, y los pedidos
              recurrentes pasan a la siguiente franja válida de su día. Vacío = sin límite.
            </p>
          </section>

          <div>
            <button type="button" onClick={save} disabled={saving || available === false} className={btnCls}>
              <Save className="h-4 w-4" aria-hidden />
              {saving ? "Guardando…" : "Guardar configuración"}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
