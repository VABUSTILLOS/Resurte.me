"use client"

import { UserPlus, Users, CalendarClock, Inbox, UserRoundX } from "lucide-react"
import type { AdminLeadsSummary } from "../actions"
import { formatRelativeTime } from "@/lib/relative-time"
import { crmHref } from "@/lib/crm-filters"

/**
 * Fase 8 — Widget de leads y CRM en el dashboard: captación reciente del
 * checkout, bandeja de entrada web, tamaño del pipeline de prospectos,
 * seguimientos vencidos y prospectos sin asignar.
 *
 * Cada número enlaza a la vista de `/admin/leads` que lo contiene, para que el
 * widget sea un punto de partida y no un dato muerto.
 */
export function LeadsCrmWidget({ summary }: { summary: AdminLeadsSummary }) {
  const board = summary.leadsBoard
  return (
    <section aria-label="Leads y CRM" className="mb-8">
      <h2 className="font-semibold text-gray-900 mb-3">Leads y CRM</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <span className="w-9 h-9 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Inbox className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-semibold text-gray-700">Bandeja de entrada</h3>
          </div>
          <div className="flex gap-6">
            <a
              href={crmHref({ tab: "leads", box: "pendientes" })}
              className="group"
            >
              <p
                className={`text-xl font-bold ${
                  board.pending > 0 ? "text-amber-700" : "text-gray-900"
                }`}
              >
                {board.pending}
              </p>
              <p className="text-xs text-gray-500 group-hover:text-brand-600 group-hover:underline">
                Sin atender
              </p>
            </a>
            <a href={crmHref({ tab: "leads", box: "convertidos" })} className="group">
              <p className="text-xl font-bold text-gray-900">{board.converted}</p>
              <p className="text-xs text-gray-500 group-hover:text-brand-600 group-hover:underline">
                Convertidos
              </p>
            </a>
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
            <a href={crmHref({ tab: "pipeline" })} className="group">
              <p className="text-xl font-bold text-gray-900">{summary.crmProspects}</p>
              <p className="text-xs text-gray-500 group-hover:text-brand-600 group-hover:underline">
                Prospectos
              </p>
            </a>
            <a
              href={crmHref({ tab: "pipeline", due: true })}
              className="group"
              title="Prospectos con fecha de seguimiento ya vencida"
            >
              <p
                className={`text-xl font-bold ${
                  summary.crmFollowUpsDue > 0 ? "text-amber-700" : "text-gray-900"
                }`}
              >
                {summary.crmFollowUpsDue}
              </p>
              <p className="text-xs text-gray-500 flex items-center gap-1 group-hover:text-brand-600 group-hover:underline">
                <CalendarClock className="w-3 h-3" />
                Seguimientos vencidos
              </p>
            </a>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-9 h-9 rounded-lg bg-orange-50 text-orange-700 flex items-center justify-center">
              <UserRoundX className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-semibold text-gray-700">Sin asignar</h3>
          </div>
          <a href={crmHref({ tab: "pipeline", unassigned: true })} className="group">
            <p
              className={`text-xl font-bold ${
                summary.crmUnassigned > 0 ? "text-orange-700" : "text-gray-900"
              }`}
            >
              {summary.crmUnassigned}
            </p>
            <p className="text-xs text-gray-500 group-hover:text-brand-600 group-hover:underline">
              Prospectos sin vendedor
            </p>
          </a>
        </div>
      </div>

      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Leads recientes</h3>
        {summary.recentLeads.length === 0 ? (
          <p className="text-sm text-gray-400">Sin leads capturados aún.</p>
        ) : (
          <ul className="space-y-2">
            {summary.recentLeads.map((lead) => (
              <li key={lead.id} className="flex items-center justify-between gap-2 text-sm">
                <a
                  href={crmHref({ tab: "leads", box: "todos", q: lead.email ?? "" })}
                  className="truncate text-gray-700 hover:text-brand-600 hover:underline"
                >
                  {lead.email ?? "Sin email"}
                </a>
                <span className="shrink-0 text-xs text-gray-400">
                  {formatRelativeTime(lead.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
