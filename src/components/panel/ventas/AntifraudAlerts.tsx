"use client"

import { AlertTriangle, ShieldAlert } from "lucide-react"
import type { FraudAlert } from "./ventas-shared"

interface AntifraudAlertsProps {
  fraudAlerts: FraudAlert[]
  ticketThreshold: number
  tipoCambio: number
  onTicketThresholdChange: (v: number) => void
  onTipoCambioChange: (v: number) => void
}

export default function AntifraudAlerts({ fraudAlerts, ticketThreshold, tipoCambio, onTicketThresholdChange, onTipoCambioChange }: AntifraudAlertsProps) {
  if (fraudAlerts.length === 0) return null
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert className="w-4 h-4 text-red-600" />
        <h3 className="text-sm font-semibold text-red-800">
          Posibles ventas irregulares ({fraudAlerts.length})
        </h3>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[10px] font-semibold text-red-400 uppercase">
            Umbral ticket $
            <input
              id="ventas-umbral"
              type="number"
              value={ticketThreshold}
              onChange={(e) => onTicketThresholdChange(Math.max(0, parseFloat(e.target.value) || 0))}
              min="0"
              className="w-20 px-2 py-1 rounded-lg border border-red-200 text-xs bg-white focus:outline-none focus:border-red-400"
              aria-label="Umbral de ticket para alerta antifraude"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 uppercase" title="Tipo de cambio MXN → USD (solo presentación)">
            Tipo cambio MXN/USD
            <input
              id="ventas-tipo-cambio"
              type="number"
              step="0.01"
              min="0"
              value={tipoCambio}
              onChange={(e) => onTipoCambioChange(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-16 px-2 py-1 rounded-lg border border-emerald-200 text-xs bg-white focus:outline-none focus:border-emerald-400"
              aria-label="Tipo de cambio MXN a USD"
            />
          </label>
        </div>
      </div>
      <ul className="space-y-1.5">
        {fraudAlerts.map((a, i) => (
          <li key={`${a.entryId}-${i}`} className="flex items-center gap-2 text-xs text-red-700">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium">{a.dishName}</span>
            <span className="text-red-500">— {a.reason}</span>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-red-400 mt-3">Revisa estos registros antes de cerrar tu corte de caja.</p>
    </div>
  )
}
