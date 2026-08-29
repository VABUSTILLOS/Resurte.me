"use client"

import { useEffect, useState } from "react"
import { logger } from "@/lib/logger"
import {
  MessageCircle,
  Clock,
  Calendar,
  ShoppingCart,
  Star,
  Gift,
  RotateCcw,
  ToggleLeft,
  ToggleRight,
  Save,
} from "lucide-react"
import type { AutomationType } from "@/types"

// ============================================================
// Mock automations with UI config
// ============================================================

interface AutomationUI {
  type: AutomationType
  label: string
  description: string
  icon: React.ReactNode
  triggerLabel: string
  triggerUnit: string
  templateName: string
  isActive: boolean
  delayHours: number
  config: Record<string, unknown>
}

const DEFAULT_AUTOMATIONS: AutomationUI[] = [
  {
    type: "payment_recovery",
    label: "Recuperación de pagos",
    description: "Envía recordatorios en 3 niveles (1h, 24h, 48h) cuando un pedido SPEI/OXXO no ha sido pagado.",
    icon: <RotateCcw className="w-5 h-5" />,
    triggerLabel: "Esperar",
    triggerUnit: "horas (primer nivel)",
    templateName: "payment_recovery_1h",
    isActive: true,
    delayHours: 1,
    config: { levels: [1, 24, 48] },
  },
  {
    type: "cart_abandonment",
    label: "Carritos abandonados",
    description: "Recuerda a los clientes que tienen productos en su carrito sin completar la compra.",
    icon: <ShoppingCart className="w-5 h-5" />,
    triggerLabel: "Esperar",
    triggerUnit: "horas después de abandono",
    templateName: "cart_abandonment_2h",
    isActive: true,
    delayHours: 2,
    config: {},
  },
  {
    type: "birthday",
    label: "Cumpleaños",
    description: "Felicita a los clientes en su cumpleaños con un cupón de 15% de descuento. Se envía a las 10 AM.",
    icon: <Gift className="w-5 h-5" />,
    triggerLabel: "Enviar a las 10 AM el día del cumpleaños",
    triggerUnit: "",
    templateName: "birthday_coupon_15",
    isActive: false,
    delayHours: 0,
    config: { discount_percent: 15, coupon_code: "CUMPLE15" },
  },
  {
    type: "reactivation",
    label: "Reactivación de clientes",
    description: "Clientes inactivos por 30 días reciben un cupón de $50 MXN para motivar su regreso.",
    icon: <Clock className="w-5 h-5" />,
    triggerLabel: "Esperar",
    triggerUnit: "días de inactividad",
    templateName: "reactivation_30d",
    isActive: false,
    delayHours: 720,
    config: { inactive_days: 30, discount_amount: 50, coupon_code: "TEAMO50" },
  },
  {
    type: "post_delivery_rating",
    label: "Calificación post-entrega",
    description: "Solicita una calificación del servicio 24 horas después de la entrega del pedido.",
    icon: <Star className="w-5 h-5" />,
    triggerLabel: "Esperar",
    triggerUnit: "horas después de entrega",
    templateName: "post_delivery_rating",
    isActive: true,
    delayHours: 24,
    config: { rating_link: "https://resurte.me/calificar" },
  },
  {
    type: "onboarding",
    label: "Onboarding nuevo cliente",
    description: "Después del primer pedido completado, envía cupón de 10% descuento para la segunda compra.",
    icon: <Gift className="w-5 h-5" />,
    triggerLabel: "Enviar",
    triggerUnit: "inmediatamente después del primer pedido",
    templateName: "onboarding_coupon_10",
    isActive: true,
    delayHours: 0,
    config: { discount_percent: 10, coupon_code: "BIENVENIDO10" },
  },
]

// ============================================================
// Page
// ============================================================

export default function AdminAutomationsPage() {
  const [automations, setAutomations] = useState<AutomationUI[]>(DEFAULT_AUTOMATIONS)
  const [savingType, setSavingType] = useState<AutomationType | null>(null)
  const [savedMsg, setSavedMsg] = useState<{ type: AutomationType; ok: boolean; detail?: string } | null>(null)

  // Load real automations from the API (fallback to defaults on error)
  useEffect(() => {
    let cancelled = false
    fetch("/api/whatsapp/automations")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (cancelled) return
        const rows = (data.automations || []) as Array<{
          automation_type: AutomationType
          is_active: boolean
          trigger_delay_hours: number
          config: Record<string, unknown>
          template_name?: string
        }>
        if (rows.length > 0) {
          setAutomations((prev) =>
            prev.map((a) => {
              const row = rows.find((r) => r.automation_type === a.type)
              return row
                ? { ...a, isActive: row.is_active, delayHours: row.trigger_delay_hours ?? a.delayHours, config: row.config || a.config, templateName: row.template_name || a.templateName }
                : a
            })
          )
        }
      })
      .catch((err) => {
        if (!cancelled) logger.error("Failed to load automations:", err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggleAutomation = (type: AutomationType) => {
    setAutomations((prev) =>
      prev.map((a) => (a.type === type ? { ...a, isActive: !a.isActive } : a))
    )
  }

  const handleSave = async (type: AutomationType) => {
    const auto = automations.find((a) => a.type === type)
    if (!auto) return
    setSavingType(type)
    setSavedMsg(null)
    try {
      const res = await fetch("/api/whatsapp/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automation_type: type,
          trigger_delay_hours: auto.delayHours,
          is_active: auto.isActive,
          config: auto.config,
          template_name: auto.templateName,
        }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(detail?.error || `HTTP ${res.status}`)
      }
      setSavedMsg({ type, ok: true })
    } catch (err) {
      logger.error("Failed to save automation:", err)
      setSavedMsg({ type, ok: false, detail: err instanceof Error ? err.message : undefined })
    } finally {
      setSavingType(null)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Automatizaciones</h1>
        <p className="text-sm text-gray-500">
          Configura mensajes automáticos de WhatsApp para recuperación de pagos, fidelización y más.
        </p>
      </div>

      {/* Info banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
          <MessageCircle className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-800 mb-1">
            Requisito: Plantillas aprobadas por Meta
          </p>
          <p className="text-xs text-amber-600">
            Cada automatización usa una plantilla de WhatsApp que debe estar <strong>aprobada por Meta</strong> antes de poder enviarse. Las plantillas se configuran en el WhatsApp Business Manager. Una vez aprobadas, asigna el nombre de la plantilla en cada automatización.
          </p>
        </div>
      </div>

      {/* Automations list */}
      <div className="space-y-4">
        {automations.map((auto) => (
          <div
            key={auto.type}
            className={`bg-white rounded-xl border p-5 transition-colors ${
              auto.isActive ? "border-brand-200" : "border-gray-200"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    auto.isActive ? "bg-brand-50 text-brand-600" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {auto.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">{auto.label}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{auto.description}</p>
                </div>
              </div>
              <button
                onClick={() => toggleAutomation(auto.type)}
                className="shrink-0 p-2 -m-2"
                aria-label={auto.isActive ? "Desactivar automatización" : "Activar automatización"}
              >
                {auto.isActive ? (
                  <ToggleRight className="w-8 h-8 text-green-500" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-gray-300" />
                )}
              </button>
            </div>

            {auto.isActive && (
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                {/* Template name */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Plantilla de WhatsApp
                  </label>
                  <input
                    type="text"
                    value={auto.templateName}
                    onChange={(e) =>
                      setAutomations((prev) =>
                        prev.map((a) => (a.type === auto.type ? { ...a, templateName: e.target.value } : a))
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Nombre exacto de la plantilla aprobada en Meta Business Manager
                  </p>
                </div>

                {/* Trigger info */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-1.5 flex-wrap">
                    <Calendar className="w-3.5 h-3.5" />
                    {auto.triggerLabel}
                    {auto.delayHours > 0 && (
                      <span className="font-semibold text-gray-700">{auto.delayHours} {auto.triggerUnit}</span>
                    )}
                    {auto.delayHours === 0 && auto.triggerUnit && (
                      <span className="font-semibold text-gray-700">{auto.triggerUnit}</span>
                    )}
                  </div>
                </div>

                {/* Config details */}
                {auto.type === "payment_recovery" && (
                  <div className="text-xs text-gray-400">
                    Niveles: 1 hora, 24 horas, 48 horas después de crear el pedido no pagado
                  </div>
                )}
                {auto.type === "birthday" && (
                  <div className="text-xs text-gray-400">
                    Cupón: {String(auto.config.coupon_code)} — {String(auto.config.discount_percent)}% descuento
                  </div>
                )}
                {auto.type === "reactivation" && (
                  <div className="text-xs text-gray-400">
                    Cupón: {String(auto.config.coupon_code)} — ${String(auto.config.discount_amount)} MXN · Inactividad: {String(auto.config.inactive_days)} días
                  </div>
                )}
                {auto.type === "onboarding" && (
                  <div className="text-xs text-gray-400">
                    Cupón: {String(auto.config.coupon_code)} — {String(auto.config.discount_percent)}% descuento
                  </div>
                )}

                {/* Save button */}
                <button
                  onClick={() => handleSave(auto.type)}
                  disabled={savingType === auto.type}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  {savingType === auto.type ? "Guardando…" : "Guardar configuración"}
                </button>
                {savedMsg && savedMsg.type === auto.type && (
                  <p className={`text-xs mt-1 ${savedMsg.ok ? "text-green-600" : "text-red-600"}`}>
                    {savedMsg.ok
                      ? `Automatización "${auto.label}" guardada correctamente.`
                      : `Error al guardar. ${savedMsg.detail || "Intenta de nuevo."}`}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
