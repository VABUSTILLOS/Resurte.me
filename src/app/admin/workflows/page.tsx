"use client"

import { useState } from "react"
import Link from "next/link"
import {
  MessageCircle,
  Bell,
  Send,
  RotateCcw,
  ShoppingCart,
  Star,
  Gift,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  AlertCircle,
  Zap,
  Play,
  RefreshCw,
  ArrowRight,
} from "lucide-react"

// ============================================================
// Workflow definitions with UI metadata
// ============================================================

interface WorkflowDef {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  color: string
  bgColor: string
  trigger: string
  recipient: "staff" | "customer"
  status: "active" | "inactive" | "configuring"
  lastRun?: string
  totalSent?: number
}

const WORKFLOWS: WorkflowDef[] = [
  {
    id: "new_order_staff",
    label: "Notificar nuevo pedido al staff",
    description: "Cuando un cliente hace un pedido, el equipo recibe una notificación en WhatsApp con los detalles y puede confirmar o cancelar.",
    icon: <Bell className="w-5 h-5" />,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    trigger: "Al crear un pedido nuevo",
    recipient: "staff",
    status: "active",
    lastRun: "Hace 5 min",
    totalSent: 142,
  },
  {
    id: "new_order_customer",
    label: "Confirmar pedido al cliente",
    description: "El cliente recibe confirmación inmediata con resumen del pedido, total y método de pago.",
    icon: <CheckCircle2 className="w-5 h-5" />,
    color: "text-green-600",
    bgColor: "bg-green-50",
    trigger: "Al crear un pedido nuevo",
    recipient: "customer",
    status: "active",
    lastRun: "Hace 5 min",
    totalSent: 142,
  },
  {
    id: "payment_reminder",
    label: "Recordatorio de pago pendiente",
    description: "Recordatorios automáticos a 1h, 24h y 48h con link de pago. Auto-cancela pedidos sin pago a las 72h.",
    icon: <RotateCcw className="w-5 h-5" />,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    trigger: "Cada hora (CRON) para pedidos con pago pendiente",
    recipient: "customer",
    status: "active",
    lastRun: "Hace 20 min",
    totalSent: 38,
  },
  {
    id: "payment_confirmed",
    label: "Confirmación de pago recibido",
    description: "El cliente recibe confirmación cuando su pago es procesado exitosamente (Stripe, SPEI, OXXO).",
    icon: <Zap className="w-5 h-5" />,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    trigger: "Al recibir pago (webhook de Stripe / confirmación manual)",
    recipient: "customer",
    status: "active",
    lastRun: "Hace 1 hora",
    totalSent: 95,
  },
  {
    id: "status_update",
    label: "Actualización de estado del pedido",
    description: "El cliente recibe notificación cuando su pedido cambia de estado: confirmado, preparando, en camino, entregado.",
    icon: <Truck className="w-5 h-5" />,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    trigger: "Al cambiar el estado del pedido en el admin",
    recipient: "customer",
    status: "active",
    lastRun: "Hace 15 min",
    totalSent: 210,
  },
  {
    id: "cart_abandonment",
    label: "Carritos abandonados",
    description: "Recordatorio a clientes que dejaron productos en su carrito sin completar la compra.",
    icon: <ShoppingCart className="w-5 h-5" />,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    trigger: "2 horas después de abandono de carrito",
    recipient: "customer",
    status: "inactive",
  },
  {
    id: "post_delivery_rating",
    label: "Calificación post-entrega",
    description: "Solicitud de calificación del servicio 24h después de la entrega.",
    icon: <Star className="w-5 h-5" />,
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
    trigger: "24 horas después de entrega",
    recipient: "customer",
    status: "configuring",
    lastRun: "Ayer",
    totalSent: 67,
  },
  {
    id: "onboarding",
    label: "Onboarding nuevo cliente",
    description: "Después del primer pedido, envía cupón de 10% descuento para la segunda compra.",
    icon: <Gift className="w-5 h-5" />,
    color: "text-pink-600",
    bgColor: "bg-pink-50",
    trigger: "Inmediatamente después del primer pedido completado",
    recipient: "customer",
    status: "active",
    lastRun: "Hace 2 horas",
    totalSent: 23,
  },
]

// ============================================================
// Manual trigger dialog (simplified inline)
// ============================================================

function ManualTriggerPanel() {
  const [orderId, setOrderId] = useState("")
  const [selectedWorkflow, setSelectedWorkflow] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleTrigger = async () => {
    if (!orderId || !selectedWorkflow) return
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch("/api/workflows/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: parseInt(orderId), workflowType: selectedWorkflow }),
      })
      const data = await res.json()
      if (data.success) {
        setResult(`✅ Workflow "${selectedWorkflow}" ejecutado para pedido #${orderId}`)
      } else {
        setResult(`❌ Error: ${data.error}`)
      }
    } catch {
      setResult("❌ Error de conexión")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Play className="w-5 h-5 text-brand-600" />
        <h2 className="font-semibold text-gray-900">Disparar workflow manualmente</h2>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="number"
          placeholder="ID del pedido"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-full sm:w-40"
        />
        <select
          value={selectedWorkflow}
          onChange={(e) => setSelectedWorkflow(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm flex-1"
        >
          <option value="">Seleccionar workflow...</option>
          {WORKFLOWS.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleTrigger}
          disabled={loading || !orderId || !selectedWorkflow}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Ejecutar
        </button>
      </div>
      {result && (
        <div className={`mt-3 text-sm p-3 rounded-lg ${result.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {result}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Stats banner
// ============================================================

function WorkflowStats() {
  const activeCount = WORKFLOWS.filter((w) => w.status === "active").length
  const totalSent = WORKFLOWS.reduce((sum, w) => sum + (w.totalSent || 0), 0)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs text-gray-400 mb-1">Workflows activos</p>
        <p className="text-2xl font-bold text-gray-900">{activeCount} <span className="text-sm font-normal text-gray-400">/ {WORKFLOWS.length}</span></p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs text-gray-400 mb-1">Mensajes enviados</p>
        <p className="text-2xl font-bold text-green-600">{totalSent}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs text-gray-400 mb-1">CRON jobs</p>
        <p className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          1 <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
        </p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs text-gray-400 mb-1">Última ejecución</p>
        <p className="text-lg font-semibold text-gray-900">Hace 5 min</p>
      </div>
    </div>
  )
}

// ============================================================
// Page
// ============================================================

export default function AdminWorkflowsPage() {
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows de WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-1">
            Flujos automáticos de mensajes — notificaciones al staff, confirmaciones, recordatorios de pago y más.
          </p>
        </div>
        <Link
          href="/admin/whatsapp/automations"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Configurar automatizaciones
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <WorkflowStats />

      <ManualTriggerPanel />

      {/* How it works */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-green-900 mb-1">Así funciona el motor de workflows</h3>
            <div className="text-sm text-green-700 space-y-1">
              <p>1️⃣ <strong>Evento</strong> — Un pedido se crea, se paga, o cambia de estado.</p>
              <p>2️⃣ <strong>Workflow</strong> — El motor detecta el evento y selecciona el mensaje correcto.</p>
              <p>3️⃣ <strong>WhatsApp</strong> — Se envía el mensaje automáticamente al staff o al cliente.</p>
              <p>4️⃣ <strong>Log</strong> — Cada envío se registra para auditoría y diagnóstico.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow list — Take App style cards */}
      <div className="space-y-3">
        {WORKFLOWS.map((workflow) => (
          <div
            key={workflow.id}
            className={`bg-white rounded-xl border p-5 transition-colors ${
              workflow.status === "active" ? "border-green-200" :
              workflow.status === "inactive" ? "border-gray-200 opacity-60" :
              "border-amber-200"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${workflow.bgColor} ${workflow.color}`}>
                {workflow.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900">{workflow.label}</h3>
                  {workflow.status === "active" && (
                    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-[10px] font-medium rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      Activo
                    </span>
                  )}
                  {workflow.status === "inactive" && (
                    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-medium rounded-full">
                      Inactivo
                    </span>
                  )}
                  {workflow.status === "configuring" && (
                    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-medium rounded-full">
                      <AlertCircle className="w-3 h-3" />
                      Configurando
                    </span>
                  )}
                  <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full ${
                    workflow.recipient === "staff" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"
                  }`}>
                    {workflow.recipient === "staff" ? "👥 Staff" : "👤 Cliente"}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-2">{workflow.description}</p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {workflow.trigger}
                  </span>
                  {workflow.lastRun && (
                    <span className="flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      Última: {workflow.lastRun}
                    </span>
                  )}
                  {workflow.totalSent !== undefined && (
                    <span className="flex items-center gap-1">
                      <Send className="w-3 h-3" />
                      {workflow.totalSent} enviados
                    </span>
                  )}
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {workflow.status === "active" && (
                  <button className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                    Pausar
                  </button>
                )}
                {workflow.status === "inactive" && (
                  <button className="px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
                    Activar
                  </button>
                )}
                {workflow.status === "configuring" && (
                  <button className="px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors">
                    Configurar
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
