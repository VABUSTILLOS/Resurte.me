"use client"

import { useEffect, useState } from "react"
import { Modal, Button, Input, Select, TextArea, FieldLabel, Spinner } from "./ui"
import { PROSPECT_STATUSES, PROSPECT_STATUS_LABEL, type Prospect, type ProspectStatus } from "@/lib/comercializacion/types"
import { TIER_LABEL, ZONES } from "@/lib/agente/plan"

interface CityOption {
  id: number
  name: string
  state: string
}

export function ProspectFormModal({
  open,
  onClose,
  prospect,
  cities,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  prospect?: Prospect | null
  cities: CityOption[]
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: "",
    restaurant_name: "",
    phone: "",
    whatsapp: "",
    email: "",
    city_id: "",
    tier: "",
    zone: "",
    status: "nuevo" as ProspectStatus,
    next_follow_up_at: "",
    notes: "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)

  // Advertencia de duplicado por teléfono/WhatsApp al crear (no al editar).
  useEffect(() => {
    if (!open || prospect) return
    const phone = form.phone.replace(/\D/g, "")
    const whatsapp = form.whatsapp.replace(/\D/g, "")
    const candidates = [phone, whatsapp].filter((d) => d.length >= 8)
    if (candidates.length === 0) return
    const timeout = setTimeout(async () => {
      try {
        const { findDuplicatesByPhone } = await import("@/lib/comercializacion/actions")
        const matches = await findDuplicatesByPhone(candidates)
        if (matches.length > 0) {
          const names = [...new Set(matches.map((m) => m.prospectName))].join(", ")
          setDuplicateWarning(`Ya existe un prospecto con este teléfono: ${names}`)
        } else {
          setDuplicateWarning(null)
        }
      } catch {
        // Silencioso: es solo una advertencia.
      }
    }, 500)
    return () => clearTimeout(timeout)
  }, [open, prospect, form.phone, form.whatsapp])

  useEffect(() => {
    if (!open) return
    // Se difiere para no disparar setState de forma síncrona dentro del efecto
    // (evita renders en cascada; ver react-hooks/set-state-in-effect).
    const timeout = setTimeout(() => {
      setError(null)
      setDuplicateWarning(null)
      setForm({
        name: prospect?.name ?? "",
        restaurant_name: prospect?.restaurant_name ?? "",
        phone: prospect?.phone ?? "",
        whatsapp: prospect?.whatsapp ?? "",
        email: prospect?.email ?? "",
        city_id: prospect?.city_id ? String(prospect.city_id) : "",
        tier: prospect?.tier ? String(prospect.tier) : "",
        zone: prospect?.zone ?? "",
        status: prospect?.status ?? "nuevo",
        next_follow_up_at: prospect?.next_follow_up_at
          ? new Date(prospect.next_follow_up_at).toISOString().slice(0, 16)
          : "",
        notes: prospect?.notes ?? "",
      })
    }, 0)
    return () => clearTimeout(timeout)
  }, [open, prospect])

  async function handleSubmit() {
    if (!form.name.trim()) {
      setError("El nombre del contacto es obligatorio")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { createProspect, updateProspect } = await import("@/lib/comercializacion/actions")
      const payload = {
        name: form.name,
        restaurant_name: form.restaurant_name || null,
        phone: form.phone || null,
        whatsapp: form.whatsapp || null,
        email: form.email || null,
        city_id: form.city_id ? Number(form.city_id) : null,
        tier: form.tier ? Number(form.tier) : null,
        zone: form.zone || null,
        status: form.status,
        next_follow_up_at: form.next_follow_up_at
          ? new Date(form.next_follow_up_at).toISOString()
          : null,
        notes: form.notes || null,
      }
      if (prospect) {
        await updateProspect(prospect.id, payload)
      } else {
        await createProspect(payload)
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={prospect ? "Editar prospecto" : "Nuevo prospecto"}
    >
      <div className="space-y-4">
        {error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-xl">
            {error}
          </div>
        ) : null}
        {duplicateWarning ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 rounded-xl">
            ⚠️ {duplicateWarning}
          </div>
        ) : null}

        <div>
          <FieldLabel>Nombre del contacto *</FieldLabel>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej. María García"
          />
        </div>

        <div>
          <FieldLabel>Restaurante</FieldLabel>
          <Input
            value={form.restaurant_name}
            onChange={(e) => setForm({ ...form, restaurant_name: e.target.value })}
            placeholder="Ej. Taquería El Fuego"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Teléfono</FieldLabel>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="55 1234 5678"
            />
          </div>
          <div>
            <FieldLabel>WhatsApp</FieldLabel>
            <Input
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              placeholder="55 1234 5678"
            />
          </div>
        </div>

        <div>
          <FieldLabel>Email</FieldLabel>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="cliente@restaurante.mx"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Ciudad</FieldLabel>
            <Select
              value={form.city_id}
              onChange={(e) => setForm({ ...form, city_id: e.target.value })}
            >
              <option value="">— Selecciona —</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}, {c.state}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel>Estado</FieldLabel>
            <Select
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as ProspectStatus })
              }
            >
              {PROSPECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROSPECT_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Tier (segmento)</FieldLabel>
            <Select
              value={form.tier}
              onChange={(e) => setForm({ ...form, tier: e.target.value })}
            >
              <option value="">— Sin asignar —</option>
              {[1, 2, 3].map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel>Zona de ruta</FieldLabel>
            <Select
              value={form.zone}
              onChange={(e) => setForm({ ...form, zone: e.target.value })}
            >
              <option value="">— Sin asignar —</option>
              {ZONES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <FieldLabel>Próximo seguimiento</FieldLabel>
          <Input
            type="datetime-local"
            value={form.next_follow_up_at}
            onChange={(e) => setForm({ ...form, next_follow_up_at: e.target.value })}
          />
        </div>

        <div>
          <FieldLabel>Notas</FieldLabel>
          <TextArea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Contexto, acuerdos, preferencias del cliente…"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Spinner className="!w-4 !h-4 !border-white" /> : null}
            {prospect ? "Guardar cambios" : "Crear prospecto"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
