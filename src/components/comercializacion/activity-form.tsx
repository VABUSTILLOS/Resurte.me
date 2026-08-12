"use client"

import { useEffect, useState } from "react"
import { Modal, Button, Input, Select, TextArea, FieldLabel, Spinner } from "./ui"
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABEL,
  ACTIVITY_OUTCOMES,
  ACTIVITY_OUTCOME_LABEL,
  type ActivityType,
  type ActivityDirection,
} from "@/lib/comercializacion/types"

export function ActivityFormModal({
  open,
  onClose,
  prospectId,
  defaultType,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  prospectId: number
  defaultType?: ActivityType
  onSaved: () => void
}) {
  const [type, setType] = useState<ActivityType>(defaultType ?? "llamada")
  const [direction, setDirection] = useState<ActivityDirection>("saliente")
  const [outcome, setOutcome] = useState("")
  const [duration, setDuration] = useState("")
  const [summary, setSummary] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // Se difiere para no disparar setState de forma síncrona dentro del efecto
    // (evita renders en cascada; ver react-hooks/set-state-in-effect).
    const timeout = setTimeout(() => {
      setError(null)
      setType(defaultType ?? "llamada")
      setDirection("saliente")
      setOutcome("")
      setDuration("")
      setSummary("")
    }, 0)
    return () => clearTimeout(timeout)
  }, [open, defaultType])

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      const { addActivity } = await import("@/lib/comercializacion/actions")
      await addActivity(prospectId, {
        type,
        direction,
        outcome: outcome || null,
        duration_seconds: duration ? Math.max(1, Math.round(Number(duration) * 60)) : null,
        summary: summary || null,
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar actividad">
      <div className="space-y-4">
        {error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-xl">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Tipo</FieldLabel>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as ActivityType)}
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACTIVITY_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel>Dirección</FieldLabel>
            <Select
              value={direction}
              onChange={(e) => setDirection(e.target.value as ActivityDirection)}
            >
              <option value="saliente">Saliente (yo llamé)</option>
              <option value="entrante">Entrante (me contactó)</option>
            </Select>
          </div>
        </div>

        <div>
          <FieldLabel>Resultado</FieldLabel>
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">— Sin seleccionar —</option>
            {ACTIVITY_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {ACTIVITY_OUTCOME_LABEL[o]}
              </option>
            ))}
          </Select>
        </div>

        {type === "llamada" ? (
          <div>
            <FieldLabel>Duración (minutos)</FieldLabel>
            <Input
              type="number"
              min="0"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Ej. 5"
            />
          </div>
        ) : null}

        <div>
          <FieldLabel>Resumen / notas</FieldLabel>
          <TextArea
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="¿De qué hablaron? ¿Qué sigue?"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Spinner className="!w-4 !h-4 !border-white" /> : null}
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
