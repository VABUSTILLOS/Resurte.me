"use client"

import { UserPlus, Users, CalendarClock } from "lucide-react"
import type { AdminLeadsSummary } from "../actions"
import { formatRelativeTime } from "@/lib/relative-time"

/**
 * Fase 8 — Widget de leads y CRM en el dashboard: captación reciente del
 * checkout, tamaño del pipeline de prospectos y seguimientos vencidos.
 */
export function LeadsCrmWidget({ summary }: { summary: AdminLeadsSummary }) {
  return (
    <section aria-label="Leads y CRM" className="mb-8">
      <h2 className="font-semibold text-gray-900 mb-3">Leads y CRM</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-semibold text-gray-700">Captación</h3>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-xl font-bold text-gray-900">{summary.leadsToday}</p>
              <p className="text-xs text-gray-500">Leads hoy</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{summary.leadsWeek}</p>
              <p className="text-xs text-gray-500">Últimos 7 días</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-semibold text-gray-700">Pipeline CRM</h3>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-xl font-bold text-gray-900">{summary.crmProspects}</p>
              <p className="text-xs text-gray-500">Prospectos</p>
            </div>
            <div>
              <p
                className={`text-xl font-bold ${
                  summary.crmFollowUpsDue > 0 ? "text-amber-600" : "text-gray-900"
                }`}
              >
                {summary.crmFollowUpsDue}
              </p>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <CalendarClock className="w-3 h-3" />
                Seguimientos vencidos
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Leads recientes</h3>
          {summary.recentLeads.length === 0 ? (
            <p className="text-sm text-gray-400">Sin leads capturados aún.</p>
          ) : (
            <ul className="space-y-2">
              {summary.recentLeads.map((lead) => (
                <li key={lead.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-gray-700">
                    {lead.email ?? "Sin email"}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {formatRelativeTime(lead.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
