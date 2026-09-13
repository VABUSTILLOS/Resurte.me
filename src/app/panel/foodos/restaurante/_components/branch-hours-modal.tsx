"use client"

// ============================================================
// Editor de horario semanal de una sucursal (7 días).
// ============================================================

import { useEffect, useState } from "react"
import { Clock, Loader2, X } from "lucide-react"
import { listBranchHours, upsertBranchHours } from "../../actions"
import type { FoodosBranch } from "@/types/foodos"
import { useEscapeKey } from "@/hooks/use-escape-key"

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

interface DayDraft {
  day_of_week: number
  is_closed: boolean
  open_time: string
  close_time: string
}

const DEFAULT_DAYS: DayDraft[] = DAYS.map((_, i) => ({
  day_of_week: i,
  is_closed: i === 0, // domingo cerrado por defecto
  open_time: "09:00",
  close_time: "22:00",
}))

export function BranchHoursModal({ branch, onClose }: { branch: FoodosBranch; onClose: () => void }) {
  const [days, setDays] = useState<DayDraft[]>(DEFAULT_DAYS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEscapeKey(onClose, true)

  useEffect(() => {
    let cancelled = false
    listBranchHours(branch.id)
      .then((rows) => {
        if (cancelled || rows.length === 0) return
        setDays(
          DAYS.map((_, i) => {
            const row = rows.find((r) => r.day_of_week === i)
            const fallback = DEFAULT_DAYS[i] ?? { day_of_week: i, is_closed: false, open_time: "09:00", close_time: "22:00" }
            if (!row) return fallback
            return {
              day_of_week: i,
              is_closed: row.is_closed,
              open_time: row.open_time?.slice(0, 5) ?? "09:00",
              close_time: row.close_time?.slice(0, 5) ?? "22:00",
            }
          })
        )
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [branch.id])

  const updateDay = (day: number, patch: Partial<DayDraft>) => {
    setDays((prev) => prev.map((d) => (d.day_of_week === day ? { ...d, ...patch } : d)))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await upsertBranchHours(
        branch.id,
        days.map((d) => ({
          day_of_week: d.day_of_week,
          is_closed: d.is_closed,
          open_time: d.is_closed ? null : d.open_time,
          close_time: d.is_closed ? null : d.close_time,
        }))
      )
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#0E7A0E]" />
            Horario — {branch.name}
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Fuera de este horario los clientes ven el menú pero no pueden pedir.
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-[#0E7A0E]" />
          </div>
        ) : (
          <div className="space-y-2">
            {days.map((d) => (
              <div key={d.day_of_week} className="flex items-center gap-2">
                <label className="flex items-center gap-2 w-28 shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!d.is_closed}
                    onChange={(e) => updateDay(d.day_of_week, { is_closed: !e.target.checked })}
                    className="accent-[#0E7A0E]"
                  />
                  <span className={`text-sm ${d.is_closed ? "text-gray-400" : "text-gray-700"}`}>{DAYS[d.day_of_week]}</span>
                </label>
                <input
                  type="time"
                  value={d.open_time}
                  disabled={d.is_closed}
                  onChange={(e) => updateDay(d.day_of_week, { open_time: e.target.value })}
                  className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm disabled:opacity-40"
                />
                <span className="text-xs text-gray-400">a</span>
                <input
                  type="time"
                  value={d.close_time}
                  disabled={d.is_closed}
                  onChange={(e) => updateDay(d.day_of_week, { close_time: e.target.value })}
                  className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm disabled:opacity-40"
                />
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0e7a0e] disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar horario
          </button>
        </div>
      </div>
    </div>
  )
}
