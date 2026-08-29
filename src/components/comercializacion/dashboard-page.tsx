"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  Users,
  PhoneCall,
  MessageCircle,
  Store,
  ArrowRight,
  Plus,
  Wallet,
  CalendarClock,
  Download,
  BarChart3,
} from "lucide-react"
import {
  StatCard,
  SectionCard,
  Button,
  Badge,
  EmptyState,
  StatusBadge,
} from "./ui"
import { ActivityFormModal } from "./activity-form"
import type {
  DashboardKpis,
  FollowUp,
  ClientToReorder,
  WeeklyTrendsReport,
} from "@/lib/comercializacion/types"
import { PROSPECT_STATUS_LABEL, type ProspectStatus } from "@/lib/comercializacion/types"
import type { WeeklyGoals } from "@/lib/comercializacion/goals"
import { formatMoney } from "@/lib/comercializacion/commissions"
import { toCsv, downloadCsv } from "@/lib/comercializacion/csv"
import { formatDateTime, getTodayBounds } from "@/lib/comercializacion/dates"
import { weeklyReminderMessage, buildWhatsappLink } from "@/lib/comercializacion/whatsapp"
import { addActivity } from "@/lib/comercializacion/actions"
import { useToast } from "@/components/toast"

function ReminderButtons({
  client,
  sellerName,
}: {
  client: ClientToReorder
  sellerName: string
}) {
  const { toast } = useToast()
  const [logging, setLogging] = useState(false)

  const waLink = buildWhatsappLink(
    client.whatsapp ?? client.phone,
    weeklyReminderMessage(sellerName, client.restaurant_name ?? client.name)
  )

  async function logWhatsappSent() {
    setLogging(true)
    try {
      await addActivity(client.id, {
        type: "whatsapp",
        direction: "saliente",
        outcome: "enviado",
        summary: `Recordatorio semanal enviado (pedido pendiente)`,
      })
      toast("Recordatorio registrado ✅")
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al registrar", "error")
    } finally {
      setLogging(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {waLink ? (
        <>
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={logWhatsappSent}
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#25D366]/15 text-[#128C4A] px-3 py-1.5 rounded-xl hover:bg-[#25D366]/25 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Recordar pedido
          </a>
          <span className="text-[10px] text-gray-400">
            {logging ? "Registrando…" : "Se abre WhatsApp"}
          </span>
        </>
      ) : null}
      {client.user_id ? (
        <Link
          href={`/comercializacion/pedidos?prospecto=${client.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#0E7A0E]/10 text-[#0E7A0E] px-3 py-1.5 rounded-xl hover:bg-[#0E7A0E]/15 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Hacer pedido
        </Link>
      ) : null}
    </div>
  )
}

function GoalBar({
  label,
  current,
  goal,
  format,
}: {
  label: string
  current: number
  goal: number
  format: (n: number) => string
}) {
  const pct = Math.min(100, Math.round((current / goal) * 100))
  const done = current >= goal
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-semibold text-gray-700">{label}</span>
        <span className={done ? "font-bold text-[#0E7A0E]" : "text-gray-500"}>
          {format(current)} / {format(goal)} {done ? "✅" : ""}
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${done ? "bg-[#0E7A0E]" : "bg-amber-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function TrendBars({
  title,
  values,
  colorClass,
  format,
}: {
  title: string
  values: { label: string; value: number }[]
  colorClass: string
  format: (v: number) => string
}) {
  const max = Math.max(...values.map((v) => v.value), 1)
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-2">{title}</p>
      <div className="space-y-1.5">
        {values.map((v) => (
          <div key={v.label} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[11px] text-gray-400 text-right">
              {v.label}
            </span>
            <div className="flex-1 h-4 bg-gray-50 rounded-md overflow-hidden">
              <div
                className={`h-full rounded-md ${colorClass}`}
                style={{ width: `${Math.max((v.value / max) * 100, v.value > 0 ? 3 : 0)}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-[11px] font-semibold text-gray-700">
              {format(v.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PipelineDistribution({
  pipeline,
}: {
  pipeline: { status: ProspectStatus; count: number }[]
}) {
  const total = pipeline.reduce((s, p) => s + p.count, 0)
  if (total === 0) return null
  const barColor: Record<ProspectStatus, string> = {
    nuevo: "bg-blue-400",
    contactado: "bg-purple-400",
    en_seguimiento: "bg-amber-400",
    cliente_activo: "bg-[#0E7A0E]",
    inactivo: "bg-gray-300",
    perdido: "bg-red-300",
  }
  return (
    <div>
      <div className="flex h-4 rounded-md overflow-hidden bg-gray-50">
        {pipeline.map((p) => (
          <div
            key={p.status}
            className={barColor[p.status]}
            style={{ width: `${(p.count / total) * 100}%` }}
            title={`${PROSPECT_STATUS_LABEL[p.status]}: ${p.count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {pipeline.map((p) => (
          <span key={p.status} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
            <span className={`w-2.5 h-2.5 rounded-sm ${barColor[p.status]}`} />
            {PROSPECT_STATUS_LABEL[p.status]} ({p.count})
          </span>
        ))}
      </div>
    </div>
  )
}

export function DashboardPage({
  kpis,
  followUps,
  clientsToReorder,
  sellerName,
  goals,
  trends,
}: {
  kpis: DashboardKpis
  followUps: FollowUp[]
  clientsToReorder: ClientToReorder[]
  sellerName: string
  goals: WeeklyGoals
  trends: WeeklyTrendsReport
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [activityFor, setActivityFor] = useState<FollowUp | null>(null)
  // Límite de "hoy" en CDMX para distinguir seguimientos vencidos.
  const todayStart = getTodayBounds().startISO
  const overdueCount = followUps.filter(
    (f) => !!f.next_follow_up_at && f.next_follow_up_at < todayStart
  ).length

  function exportCommissionCsv() {
    const hoy = new Date().toISOString().slice(0, 10)
    downloadCsv(
      `comisiones-${hoy}.csv`,
      toCsv(
        ["concepto", "monto"],
        [
          ["vendedor", sellerName],
          ["ventas clientes (semana)", kpis.weekRevenue.toFixed(2)],
          ["comision estimada (semana)", kpis.weekCommission.toFixed(2)],
          ["ventas clientes (mes)", kpis.monthRevenue.toFixed(2)],
          ["comision estimada (mes)", kpis.monthCommission.toFixed(2)],
        ]
      )
    )
    toast("Resumen de comisiones descargado")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">¡Hola, {sellerName.split(" ")[0]}! 👋</h1>
          <p className="text-sm text-gray-500">Este es el resumen de tu semana de ventas.</p>
        </div>
        <Link href="/comercializacion/prospectos?nuevo=1">
          <Button>
            <Plus className="w-4 h-4" />
            Nuevo prospecto
          </Button>
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Prospectos"
          value={kpis.totalProspects}
          sub={`${kpis.pendingContact} por contactar`}
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          label="Llamadas"
          value={`${kpis.callsToday}/${kpis.callsWeek}`}
          sub="hoy / semana"
          icon={<PhoneCall className="w-5 h-5" />}
        />
        <StatCard
          label="WhatsApp"
          value={`${kpis.whatsappToday}/${kpis.whatsappWeek}`}
          sub="hoy / semana"
          icon={<MessageCircle className="w-5 h-5" />}
        />
        <StatCard
          label="Clientes activos"
          value={kpis.activeClients}
          sub={`${kpis.linkedClients} vinculados`}
          icon={<Store className="w-5 h-5" />}
        />
      </div>

      {/* Metas semanales */}
      <SectionCard title="Metas de la semana">
        <div className="space-y-3">
          <GoalBar
            label="Llamadas"
            current={kpis.callsWeek}
            goal={goals.calls}
            format={(n) => String(n)}
          />
          <GoalBar
            label="WhatsApps"
            current={kpis.whatsappWeek}
            goal={goals.whatsapps}
            format={(n) => String(n)}
          />
          <GoalBar
            label="Ventas de clientes"
            current={kpis.weekRevenue}
            goal={goals.revenue}
            format={formatMoney}
          />
        </div>
      </SectionCard>

      {/* Comisión estimada */}
      <SectionCard
        title="Ventas y comisión"
        action={
          <Button variant="outline" size="sm" onClick={exportCommissionCsv}>
            <Download className="w-3.5 h-3.5" />
            Exportar mes
          </Button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StatCard
            label="Ventas de tus clientes (semana)"
            value={formatMoney(kpis.weekRevenue)}
            sub="pedidos pagados, no cancelados"
            icon={<Wallet className="w-5 h-5" />}
          />
          <StatCard
            label="Comisión estimada (semana)"
            value={formatMoney(kpis.weekCommission)}
            sub={`Mes: ${formatMoney(kpis.monthCommission)} · ventas mes ${formatMoney(kpis.monthRevenue)}`}
            icon={<Wallet className="w-5 h-5" />}
          />
        </div>
      </SectionCard>

      {/* Debemos pedir esta semana */}
      <SectionCard
        title={
          <span className="inline-flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-[#0E7A0E]" />
            Deben pedir esta semana
          </span>
        }
        action={
          <Badge color="amber">
            {clientsToReorder.length}{" "}
            {clientsToReorder.length === 1 ? "cliente" : "clientes"}
          </Badge>
        }
      >
        {clientsToReorder.length === 0 ? (
          <EmptyState
            title="¡Todo al día! 🎉"
            subtitle="Todos tus clientes activos ya pidieron esta semana."
          />
        ) : (
          <ul className="divide-y divide-gray-50">
            {clientsToReorder.map((c) => (
              <li key={c.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {c.name}
                    </p>
                    {c.restaurant_name ? (
                      <span className="text-xs text-gray-400 truncate">
                        · {c.restaurant_name}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-500">
                    {c.last_order_at
                      ? `Último pedido: ${formatDateTime(c.last_order_at)}`
                      : "Sin pedidos aún"}
                  </p>
                </div>
                <ReminderButtons client={c} sellerName={sellerName} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Seguimientos pendientes */}
      <SectionCard
        title={
          <span className="inline-flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-amber-500" />
            Seguimientos pendientes
            {overdueCount > 0 && (
              <Badge color="red">{overdueCount} vencidos</Badge>
            )}
          </span>
        }
        action={
          <Link href="/comercializacion/prospectos">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0E7A0E]">
              Ver CRM <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        }
      >
        {followUps.length === 0 ? (
          <EmptyState
            title="Sin seguimientos pendientes"
            subtitle="Programa un próximo contacto en tus prospectos para verlo aquí."
          />
        ) : (
          <ul className="divide-y divide-gray-50">
            {followUps.map((f) => {
              const overdue =
                !!f.next_follow_up_at && f.next_follow_up_at < todayStart
              return (
              <li key={f.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{f.name}</p>
                    <StatusBadge status={f.status} />
                    <Badge color={overdue ? "red" : "amber"}>
                      {overdue ? "Vencido" : "Hoy"}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    {f.restaurant_name ? `${f.restaurant_name} · ` : ""}
                    Seguimiento: {formatDateTime(f.next_follow_up_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActivityFor(f)}
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    Registrar contacto
                  </Button>
                  <Link href={`/comercializacion/prospectos/${f.id}`}>
                    <Button variant="ghost" size="sm">
                      <ArrowRight className="w-3.5 h-3.5" />
                      Abrir
                    </Button>
                  </Link>
                </div>
              </li>
              )
            })}
          </ul>
        )}
      </SectionCard>

      {/* Tendencias de las últimas 8 semanas */}
      <SectionCard
        title={
          <span className="inline-flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#0E7A0E]" />
            Tendencias (últimas 8 semanas)
          </span>
        }
      >
        <div className="grid sm:grid-cols-2 gap-6">
          <TrendBars
            title="Actividades registradas"
            values={trends.weeks.map((w) => ({ label: w.label, value: w.activities }))}
            colorClass="bg-[#0E7A0E]/70"
            format={(v) => String(v)}
          />
          <TrendBars
            title="Ventas de clientes"
            values={trends.weeks.map((w) => ({ label: w.label, value: w.sales }))}
            colorClass="bg-emerald-500/70"
            format={(v) => formatMoney(v)}
          />
        </div>
        {trends.pipeline.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold text-gray-500 mb-2">
              Distribución del pipeline
            </p>
            <PipelineDistribution pipeline={trends.pipeline} />
          </div>
        )}
      </SectionCard>

      <ActivityFormModal
        open={!!activityFor}
        onClose={() => setActivityFor(null)}
        prospectId={activityFor?.id ?? 0}
        onSaved={() => {
          toast("Actividad registrada ✅")
          router.refresh()
        }}
      />
    </div>
  )
}
