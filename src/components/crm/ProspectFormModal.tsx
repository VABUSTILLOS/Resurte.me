"use client"

import { useEffect, useState } from "react"
import {
  Modal,
  Button,
  Input,
  Select,
  TextArea,
  FieldLabel,
} from "@/components/comercializacion/ui"
import {
  PROSPECT_STATUSES,
  PROSPECT_STATUS_LABEL,
  type Prospect,
  type ProspectStatus,
} from "@/lib/comercializacion/types"
import type { DuplicateMatch, ProspectInput } from "@/lib/comercializacion/actions"
import { toDatetimeLocalValue } from "@/lib/local-date"
import { TIER_LABEL, ZONES } from "@/lib/agente/plan"

interface CityOption {
  id: number
  name: string
  state: string
}

/** Un vendedor al que se puede asignar un prospecto nuevo. */
export interface SellerOption {
  id: string
  name: string
}

/**
 * Los comandos que el formulario necesita, inyectados por la superficie.
 *
 * El mismo formulario sirve al vendedor y al panel, y no puede importar las
 * acciones de uno de los dos: la superficie del vendedor y la del admin tienen
 * módulos distintos, y elegir uno ataría el componente a él. Los tipos son los
 * de `ProspectInput`, que es el contrato de alta compartido.
 */
export interface ProspectFormActions {
  /** Alta. Obligatoria si el modal puede abrirse sin `prospect`. */
  create?: (input: ProspectInput) => Promise<unknown>
  /** Edición. Obligatoria si el modal puede abrirse con `prospect`. */
  update?: (id: number, input: Partial<ProspectInput>) => Promise<unknown>
  /**
   * Aviso de duplicado por teléfono. Si falta, no se avisa: es una advertencia,
   * nunca un bloqueo, así que su ausencia no puede impedir guardar.
   */
  findDuplicates?: (phones: string[]) => Promise<DuplicateMatch[]>
}

/** Un campo numérico vacío no vale `0`: vale «no declarado». */
function numberOrNull(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

const EMPTY_FORM = {
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
  estimated_value: "",
  employees: "",
  instagram: "",
  weekly_volume_min: "",
  weekly_volume_max: "",
  seller_id: "",
}

/**
 * Alta y edición de un prospecto, compartido por las dos superficies.
 *
 * Antes vivía dentro de `/comercializacion`, así que el panel no podía editar
 * contacto y el pozo solo se llenaba por webhook. El movimiento es el mismo que
 * el de la ficha en la Ronda 10: una copia, dos superficies.
 *
 * Decisiones que no son de estilo:
 *
 * - **`seller_id` solo se ofrece en el alta y solo si la superficie pasa
 *   `sellers`.** La reasignación de un trato ya tiene puerta propia, y esa
 *   además mueve las tareas abiertas; duplicarla aquí crearía una segunda ruta
 *   que no las mueve.
 * - **Los cuatro campos de segmentación y el valor previsto son campos del
 *   formulario**, no del panel: el agente IA los leía y nadie podía llenarlos,
 *   así que razonaba sobre `null` permanentes.
 */
export function ProspectFormModal({
  open,
  onClose,
  prospect,
  cities,
  actions,
  sellers,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  prospect?: Prospect | null
  cities: CityOption[]
  actions: ProspectFormActions
  /** Presentes solo en el panel: el vendedor no reparte tratos. */
  sellers?: SellerOption[]
  onSaved: () => void
}) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)

  // Advertencia de duplicado por teléfono/WhatsApp al crear (no al editar).
  useEffect(() => {
    if (!open || prospect || !actions.findDuplicates) return
    const phone = form.phone.replace(/\D/g, "")
    const whatsapp = form.whatsapp.replace(/\D/g, "")
    const candidates = [phone, whatsapp].filter((d) => d.length >= 8)
    if (candidates.length === 0) return
    const findDuplicates = actions.findDuplicates
    const timeout = setTimeout(async () => {
      try {
        const matches = await findDuplicates(candidates)
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
  }, [open, prospect, actions.findDuplicates, form.phone, form.whatsapp])

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
          ? toDatetimeLocalValue(prospect.next_follow_up_at)
          : "",
        notes: prospect?.notes ?? "",
        estimated_value:
          prospect?.estimated_value != null ? String(prospect.estimated_value) : "",
        employees: prospect?.employees != null ? String(prospect.employees) : "",
        instagram: prospect?.instagram ?? "",
        weekly_volume_min:
          prospect?.weekly_volume_min != null ? String(prospect.weekly_volume_min) : "",
        weekly_volume_max:
          prospect?.weekly_volume_max != null ? String(prospect.weekly_volume_max) : "",
        seller_id: "",
      })
    }, 0)
    return () => clearTimeout(timeout)
  }, [open, prospect])

  async function handleSubmit() {
    if (!form.name.trim()) {
      setError("El nombre del contacto es obligatorio")
      return
    }
    const min = numberOrNull(form.weekly_volume_min)
    const max = numberOrNull(form.weekly_volume_max)
    if (min !== null && max !== null && min > max) {
      setError("El volumen mínimo no puede superar al máximo")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: ProspectInput = {
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
        estimated_value: numberOrNull(form.estimated_value),
        employees: numberOrNull(form.employees),
        instagram: form.instagram.trim() || null,
        weekly_volume_min: min,
        weekly_volume_max: max,
      }
      if (prospect) {
        if (!actions.update) throw new Error("La edición no está disponible")
        await actions.update(prospect.id, payload)
      } else {
        if (!actions.create) throw new Error("El alta no está disponible")
        await actions.create({
          ...payload,
          // Solo el alta elige responsable, y solo el panel ofrece el selector.
          seller_id: form.seller_id || null,
        })
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const showSellerPicker = !prospect && (sellers?.length ?? 0) > 0

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

        {showSellerPicker ? (
          <div>
            <FieldLabel>Vendedor</FieldLabel>
            <Select
              value={form.seller_id}
              onChange={(e) => setForm({ ...form, seller_id: e.target.value })}
            >
              <option value="">— Sin asignar (pozo) —</option>
              {sellers?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-gray-600">
              Sin asignar, el prospecto cae en el pozo y no lo ve ningún vendedor.
            </p>
          </div>
        ) : null}

        <div>
          <FieldLabel>Valor previsto del trato</FieldLabel>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.estimated_value}
            onChange={(e) => setForm({ ...form, estimated_value: e.target.value })}
            placeholder="0.00"
          />
          <p className="mt-1 text-xs text-gray-600">
            Vacío no es cero: significa que nadie lo ha valorado.
          </p>
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Empleados</FieldLabel>
            <Input
              type="number"
              min="0"
              value={form.employees}
              onChange={(e) => setForm({ ...form, employees: e.target.value })}
              placeholder="Ej. 12"
            />
          </div>
          <div>
            <FieldLabel>Instagram</FieldLabel>
            <Input
              value={form.instagram}
              onChange={(e) => setForm({ ...form, instagram: e.target.value })}
              placeholder="@restaurante"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Volumen semanal mín.</FieldLabel>
            <Input
              type="number"
              min="0"
              value={form.weekly_volume_min}
              onChange={(e) => setForm({ ...form, weekly_volume_min: e.target.value })}
              placeholder="Ej. 200"
            />
          </div>
          <div>
            <FieldLabel>Volumen semanal máx.</FieldLabel>
            <Input
              type="number"
              min="0"
              value={form.weekly_volume_max}
              onChange={(e) => setForm({ ...form, weekly_volume_max: e.target.value })}
              placeholder="Ej. 500"
            />
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
            {saving
              ? "Guardando…"
              : prospect
                ? "Guardar cambios"
                : "Crear prospecto"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
