"use client"

import Link from "next/link"
import {
  AlertTriangle,
  PackageX,
  PackageSearch,
  TicketPercent,
  UserPlus,
  CheckCircle2,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react"
import type { AdminAlert } from "../actions"

const KIND_ICON: Record<AdminAlert["kind"], LucideIcon> = {
  stale_pending: AlertTriangle,
  out_of_stock: PackageX,
  low_stock: PackageSearch,
  coupon_expiring: TicketPercent,
  new_leads: UserPlus,
}

const SEVERITY_STYLE: Record<AdminAlert["severity"], string> = {
  critical: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
}

const SEVERITY_ICON_STYLE: Record<AdminAlert["severity"], string> = {
  critical: "bg-red-100 text-red-600",
  warning: "bg-amber-100 text-amber-600",
  info: "bg-blue-100 text-blue-600",
}

/**
 * Fase 2 — Centro de alertas operativas del dashboard: pendientes viejos,
 * quiebres de stock, cupones por expirar y leads nuevos. Todo es accionable
 * (cada alerta enlaza a la sección donde se resuelve).
 */
export function AdminAlerts({ alerts }: { alerts: AdminAlert[] }) {
  return (
    <section aria-label="Alertas operativas" className="mb-8">
      <h2 className="font-semibold text-gray-900 mb-3">Alertas operativas</h2>
      {alerts.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <p className="text-sm text-green-800 font-medium">
            Todo en orden. No hay alertas activas.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {alerts.map((alert, i) => {
            const Icon = KIND_ICON[alert.kind]
            return (
              <Link
                key={`${alert.kind}-${i}`}
                href={alert.href}
                className={`group flex items-start gap-3 rounded-xl border px-4 py-3 transition-shadow hover:shadow-sm ${SEVERITY_STYLE[alert.severity]}`}
              >
                <span
                  className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${SEVERITY_ICON_STYLE[alert.severity]}`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-snug">
                    {alert.title}
                  </span>
                  <span className="block text-xs opacity-80 mt-0.5">
                    {alert.detail}
                  </span>
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 mt-1 opacity-40 group-hover:opacity-100 shrink-0" />
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
