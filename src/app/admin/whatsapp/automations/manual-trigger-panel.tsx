"use client"

import { useState } from "react"
import { Play, Send, RefreshCw } from "lucide-react"
import { VALID_WORKFLOWS, WORKFLOW_LABELS } from "@/lib/workflow-types"

/**
 * Disparo manual de un workflow sobre un pedido concreto, contra el motor real
 * (`POST /api/workflows/trigger`). Vivía en la antigua `/admin/workflows`, que
 * el resto era un mock de datos; se movió aquí, junto a la configuración real
 * de automatizaciones.
 */
export function ManualTriggerPanel() {
  const [orderId, setOrderId] = useState("")
  const [selectedWorkflow, setSelectedWorkflow] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

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
        setResult({
          ok: true,
          message: `Workflow "${WORKFLOW_LABELS[selectedWorkflow as keyof typeof WORKFLOW_LABELS] ?? selectedWorkflow}" ejecutado para el pedido #${orderId}`,
        })
      } else {
        setResult({ ok: false, message: data.error ?? "El motor rechazó la ejecución" })
      }
    } catch {
      setResult({ ok: false, message: "Error de conexión" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Play className="w-5 h-5 text-brand-600" aria-hidden="true" />
        <h2 className="font-semibold text-gray-900">Disparar workflow manualmente</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Útil para reenviar un aviso que no salió. Se ejecuta contra el mismo motor que los disparos
        automáticos.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <label className="sr-only" htmlFor="manual-trigger-order">
          ID del pedido
        </label>
        <input
          id="manual-trigger-order"
          type="number"
          placeholder="ID del pedido"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-full sm:w-40"
        />
        <label className="sr-only" htmlFor="manual-trigger-workflow">
          Workflow a ejecutar
        </label>
        <select
          id="manual-trigger-workflow"
          value={selectedWorkflow}
          onChange={(e) => setSelectedWorkflow(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm flex-1"
        >
          <option value="">Seleccionar workflow...</option>
          {VALID_WORKFLOWS.map((type) => (
            <option key={type} value={type}>
              {WORKFLOW_LABELS[type]}
            </option>
          ))}
        </select>
        <button
          onClick={handleTrigger}
          disabled={loading || !orderId || !selectedWorkflow}
          className="touch-target inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Ejecutar
        </button>
      </div>
      {result && (
        <div
          role="status"
          className={`mt-3 text-sm p-3 rounded-lg ${
            result.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  )
}
