"use client"

import Link from "next/link"
import {
  Users,
  PhoneCall,
  MessageCircle,
  Store,
  ArrowRight,
  Plus,
  Wallet,
  CalendarClock,
} from "lucide-react"
import {
  StatCard,
  SectionCard,
  Button,
  Badge,
  EmptyState,
  StatusBadge,
} from "./ui"
import type {
  DashboardKpis,
  FollowUp,
  ClientToReorder,
} from "@/lib/comercializacion/types"
import { formatMoney } from "@/lib/comercializacion/commissions"
import { formatDateTime } from "@/lib/comercializacion/dates"
import { weeklyReminderMessage, buildWhatsappLink } from "@/lib/comercializacion/whatsapp"
import { addActivity } from "@/lib/comercializacion/actions"
import { useToast } from "@/components/toast"
import { useState } from "react"

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

export function DashboardPage({
  kpis,
  followUps,
  clientsToReorder,
  sellerName,
}: {
  kpis: DashboardKpis
  followUps: FollowUp[]
  clientsToReorder: ClientToReorder[]
  sellerName: string
}) {
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

      {/* Comisión estimada */}
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
            Seguimientos pendientes (hoy)
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
            title="Sin seguimientos vencidos"
            subtitle="Programa un próximo contacto en tus prospectos para verlo aquí."
          />
        ) : (
          <ul className="divide-y divide-gray-50">
            {followUps.map((f) => (
              <li key={f.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{f.name}</p>
                    <StatusBadge status={f.status} />
                  </div>
                  <p className="text-xs text-gray-500">
                    {f.restaurant_name ? `${f.restaurant_name} · ` : ""}
                    Seguimiento: {formatDateTime(f.next_follow_up_at)}
                  </p>
                </div>
                <Link href={`/comercializacion/prospectos/${f.id}`}>
                  <Button variant="outline" size="sm">
                    <ArrowRight className="w-3.5 h-3.5" />
                    Abrir
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
