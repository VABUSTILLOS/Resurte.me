"use client"

// ============================================================
// Flujos automáticos por condición (Ola 6)
// ============================================================
// CRUD mínimo de las reglas del tipo `conditional_flows` del
// motor de automatizaciones: la config vive en el JSONB de esa
// fila (config.rules) y se guarda por la MISMA ruta de siempre
// (POST /api/whatsapp/automations), sin template_name de nivel
// superior: cada regla trae la suya.
//
// El motor (src/lib/whatsapp-automations-engine.ts) evalúa las
// reglas en el cron diario contra los pedidos nuevos, con
// dedupe por (regla, pedido) y la guarda de consentimiento de
// marketing. Guardar requiere la migración 00235 (el valor del
// ENUM); sin ella la API responde error y aquí se muestra.

import { useCallback, useEffect, useState } from "react"
import { GitBranch, Plus, Save, Trash2 } from "lucide-react"
import { logger } from "@/lib/logger"

type FlowCondition =
  | "first_order"
  | "order_count_gte"
  | "order_total_gte"
  | "active_recurrence"

interface FlowRule {
  id: string
  name: string
  condition: FlowCondition
  threshold: number | null
  template_name: string
  text: string
  is_active: boolean
}

const CONDITION_OPTIONS: Array<{ value: FlowCondition; label: string; needsThreshold: boolean }> = [
  { value: "first_order", label: "Es su primer pedido", needsThreshold: false },
  { value: "order_count_gte", label: "Cliente frecuente — nº de pedidos ≥", needsThreshold: true },
  { value: "order_total_gte", label: "Pedido mayor a — $ MXN ≥", needsThreshold: true },
  { value: "active_recurrence", label: "Tiene una recurrencia activa (Ola 5)", needsThreshold: false },
]

function needsThreshold(condition: FlowCondition): boolean {
  return CONDITION_OPTIONS.find((o) => o.value === condition)?.needsThreshold ?? false
}

function newRule(): FlowRule {
  return {
    id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    condition: "first_order",
    threshold: null,
    template_name: "",
    text: "",
    is_active: true,
  }
}

function parseRules(config: Record<string, unknown> | undefined): FlowRule[] {
  const raw = config?.rules
  if (!Array.isArray(raw)) return []
  const rules: FlowRule[] = []
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object") return
    const r = item as Record<string, unknown>
    const condition = CONDITION_OPTIONS.some((o) => o.value === r.condition)
      ? (r.condition as FlowCondition)
      : "first_order"
    rules.push({
      id: typeof r.id === "string" && r.id ? r.id : `rule-${index + 1}`,
      name: typeof r.name === "string" ? r.name : "",
      condition,
      threshold: typeof r.threshold === "number" ? r.threshold : null,
      template_name: typeof r.template_name === "string" ? r.template_name : "",
      text: typeof r.text === "string" ? r.text : "",
      is_active: r.is_active !== false,
    })
  })
  return rules
}

export function ConditionalFlowsPanel() {
  const [isActive, setIsActive] = useState(false)
  const [rules, setRules] = useState<FlowRule[]>([])
  const [templates, setTemplates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<{ ok: boolean; detail?: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/automations")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as {
        automations: Array<{
          automation_type: string
          is_active: boolean
          config: Record<string, unknown>
        }>
        templates?: string[]
      }
      const row = data.automations.find((a) => a.automation_type === "conditional_flows")
      if (row) {
        setIsActive(row.is_active)
        setRules(parseRules(row.config))
      }
      setTemplates(data.templates ?? [])
    } catch (err) {
      logger.error("Failed to load conditional flows:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const run = async () => {
      await load()
    }
    run().catch(() => {})
  }, [load])

  const updateRule = (id: string, patch: Partial<FlowRule>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const handleSave = async () => {
    setSaving(true)
    setSavedMsg(null)
    try {
      const res = await fetch("/api/whatsapp/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automation_type: "conditional_flows",
          trigger_delay_hours: 0,
          is_active: isActive,
          config: { rules },
        }),
      })
      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(detail?.error || `HTTP ${res.status}`)
      }
      setSavedMsg({ ok: true })
    } catch (err) {
      logger.error("Failed to save conditional flows:", err)
      setSavedMsg({
        ok: false,
        detail:
          err instanceof Error
            ? `${err.message} — si es la primera vez, puede faltar la migración 00235.`
            : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 mb-6">
        <p className="text-sm text-gray-500">Cargando flujos por condición…</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
            <GitBranch className="w-5 h-5 text-indigo-700" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Flujos por condición</h2>
            <p className="text-sm text-gray-500 max-w-2xl">
              Cuando un pedido nuevo cumple la condición de una regla, el cliente recibe
              la plantilla elegida. El cron diario evalúa los pedidos recientes; cada
              regla se envía una sola vez por pedido y respeta el consentimiento de
              marketing. En el texto puedes usar {"{nombre}"}, {"{pedido}"} y {"{total}"}.
            </p>
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-500"
          />
          Activo
        </label>
      </div>

      <div className="space-y-4 mt-4">
        {rules.length === 0 && (
          <p className="text-sm text-gray-500">
            Sin reglas todavía. Agrega la primera: por ejemplo, «primer pedido» con la
            plantilla de bienvenida.
          </p>
        )}
        {rules.map((rule) => (
          <div key={rule.id} className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={rule.name}
                onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                aria-label="Nombre de la regla"
                placeholder="Nombre de la regla (ej. Bienvenida primer pedido)"
                className="flex-1 min-w-[220px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
              <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={rule.is_active}
                  onChange={(e) => updateRule(rule.id, { is_active: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-500"
                />
                Regla activa
              </label>
              <button
                type="button"
                onClick={() => setRules((prev) => prev.filter((r) => r.id !== rule.id))}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" /> Quitar
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-gray-500">Cuando el cliente cumple:</span>
              <select
                value={rule.condition}
                onChange={(e) =>
                  updateRule(rule.id, { condition: e.target.value as FlowCondition })
                }
                aria-label="Condición de la regla"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                {CONDITION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {needsThreshold(rule.condition) && (
                <input
                  type="number"
                  min={0}
                  value={rule.threshold ?? ""}
                  aria-label="Umbral de la condición"
                  onChange={(e) =>
                    updateRule(rule.id, {
                      threshold: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  placeholder={rule.condition === "order_total_gte" ? "Ej. 1500" : "Ej. 5"}
                  className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Plantilla a enviar (aprobada)
                </label>
                <select
                  value={rule.template_name}
                  onChange={(e) => updateRule(rule.id, { template_name: e.target.value })}
                  aria-label="Plantilla a enviar"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">Sin plantilla (solo texto, dentro de ventana)</option>
                  {templates.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  {rule.template_name && !templates.includes(rule.template_name) && (
                    <option value={rule.template_name}>
                      {rule.template_name} (no aprobada)
                    </option>
                  )}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Texto (respaldo si la plantilla falla, o el mensaje si no hay plantilla)
                </label>
                <input
                  type="text"
                  value={rule.text}
                  onChange={(e) => updateRule(rule.id, { text: e.target.value })}
                  aria-label="Texto del mensaje"
                  placeholder="Hola {nombre}, gracias por tu pedido {pedido}…"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setRules((prev) => [...prev, newRule()])}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Plus className="w-4 h-4" /> Agregar regla
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> {saving ? "Guardando…" : "Guardar flujos"}
        </button>
        {savedMsg?.ok && <span className="text-sm text-emerald-700">Guardado ✓</span>}
        {savedMsg && !savedMsg.ok && (
          <span className="text-sm text-red-700">
            No se pudo guardar. {savedMsg.detail ?? ""}
          </span>
        )}
      </div>
    </div>
  )
}
