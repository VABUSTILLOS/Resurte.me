"use client"

import Link from "next/link"
import { Bell, ChevronUp, ChevronDown, CheckCircle2, ArrowRight } from "lucide-react"
import type { HubAlert } from "./hub-data"

interface AlertsPanelProps {
  alerts: HubAlert[]
  showAlerts: boolean
  onToggle: () => void
}

export default function AlertsPanel({ alerts, showAlerts, onToggle }: AlertsPanelProps) {
  if (alerts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-500" />
        <span className="text-sm text-gray-600">Todo en orden ✅ — No hay alertas pendientes.</span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-gray-900">Alertas</h3>
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{alerts.length}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          {showAlerts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>
      {showAlerts && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {alerts.map((alert) => {
            const colorMap: Record<string, string> = {
              danger: "bg-red-50 border-red-200",
              warning: "bg-amber-50 border-amber-200",
              info: "bg-blue-50 border-blue-200",
              success: "bg-green-50 border-green-200",
            }
            const iconColorMap: Record<string, string> = {
              danger: "text-red-500",
              warning: "text-amber-500",
              info: "text-blue-500",
              success: "text-green-500",
            }
            return (
              <Link
                key={alert.id}
                href={alert.href}
                className={`flex items-start gap-3 p-3.5 mx-3 my-1.5 rounded-xl border transition-colors hover:shadow-sm ${colorMap[alert.type]}`}
              >
                <alert.icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconColorMap[alert.type]}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{alert.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{alert.detail}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 ml-auto" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
