"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Bot,
  Sparkles,
  Send,
  MapPin,
  Phone,
  MonitorPlay,
  ListTodo,
  Inbox,
  BarChart3,
  Trash2,
  Check,
} from "lucide-react"
import { useToast } from "@/components/toast"
import {
  Button,
  Badge,
  StatusBadge,
  StatCard,
  SectionCard,
  Modal,
  EmptyState,
  Spinner,
  TextArea,
} from "./ui"
import {
  generateAgentMessage,
  sendAgentMessage,
  setAgentMessageStatus,
  updateAgentMessageText,
  registerAgentTouch,
} from "@/lib/agente/actions"
import {
  MESSAGE_KIND_LABEL,
  type AgentKpis,
  type AgentMessage,
  type AgentQueueItem,
  type TouchChannel,
} from "@/lib/agente/types"
import { TIER_LABEL, ZONE_LABEL } from "@/lib/agente/plan"

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

const money = (n: number) =>
  `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`
const pct = (n: number) => `${Math.round(n * 100)}%`

function ProgressBar({
  value,
  goal,
  color = "bg-[#0E7A0E]",
}: {
  value: number
  goal: number
  color?: string
}) {
  const ratio = goal > 0 ? Math.min(1, value / goal) : 0
  const over = goal > 0 && value >= goal
  return (
    <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${over ? "bg-[#0E7A0E]" : color}`}
        style={{ width: `${Math.max(4, ratio * 100)}%` }}
      />
    </div>
  )
}

const CHANNEL_ICON: Record<TouchChannel, typeof MapPin> = {
  visita: MapPin,
  whatsapp: Send,
  llamada: Phone,
  demo: MonitorPlay,
}

// ------------------------------------------------------------
// Página principal (3 pestañas)
// ------------------------------------------------------------

type Tab = "cola" | "mensajes" | "kpis"

export function AgentePage({
  queue,
  kpis,
  drafts,
}: {
  queue: AgentQueueItem[]
  kpis: AgentKpis
  drafts: AgentMessage[]
}) {
  const [tab, setTab] = useState<Tab>("cola")
  const [draft, setDraft] = useState<AgentMessage | null>(null)

  const TABS: Array<{ id: Tab; label: string; icon: typeof Bot; badge?: number }> = [
    { id: "cola", label: "Cola del día", icon: ListTodo, badge: queue.length },
    { id: "mensajes", label: "Mensajes", icon: Inbox, badge: kpis.borradoresPendientes },
    { id: "kpis", label: "KPIs", icon: BarChart3 },
  ]

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Bot className="w-6 h-6 text-[#0E7A0E]" />
            Agente de Ventas IA
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Prioriza tu día, redacta los WhatsApp y tú apruebas antes de enviar.
          </p>
        </div>
        {kpis.zoneOfDay && (
          <div className="hidden sm:block text-right">
            <Badge color="green">Ruta de hoy: {kpis.zoneOfDay.label}</Badge>
            <p className="text-[11px] text-gray-400 mt-1 max-w-[220px]">
              “{kpis.zoneOfDay.pitch}”
            </p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="ml-1 text-[10px] font-bold bg-[#0E7A0E]/10 text-[#0E7A0E] px-1.5 py-0.5 rounded-full">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "cola" && <QueueTab queue={queue} onDraft={setDraft} />}
      {tab === "mensajes" && <MessagesTab drafts={drafts} onDraft={setDraft} />}
      {tab === "kpis" && <KpisTab kpis={kpis} />}

      <DraftModal draft={draft} onClose={() => setDraft(null)} />
    </div>
  )
}

// ------------------------------------------------------------
// Cola del día
// ------------------------------------------------------------

function QueueTab({
  queue,
  onDraft,
}: {
  queue: AgentQueueItem[]
  onDraft: (m: AgentMessage) => void
}) {
  const { toast } = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<number | null>(null)

  const generate = (item: AgentQueueItem) => {
    setBusyId(item.prospectId)
    startTransition(async () => {
      try {
        const msg = await generateAgentMessage(item.prospectId, item.suggestedKind)
        onDraft(msg)
      } catch (e) {
        toast(e instanceof Error ? e.message : "Error al generar", "error")
      } finally {
        setBusyId(null)
      }
    })
  }

  const registerTouch = (
    item: AgentQueueItem,
    type: Exclude<TouchChannel, "whatsapp">
  ) => {
    setBusyId(item.prospectId)
    startTransition(async () => {
      try {
        await registerAgentTouch(item.prospectId, type)
        toast(
          type === "visita"
            ? "Visita registrada · seguimiento programado para mañana"
            : type === "llamada"
              ? "Llamada registrada"
              : "Demo registrada"
        )
        router.refresh()
      } catch (e) {
        toast(e instanceof Error ? e.message : "Error al registrar", "error")
      } finally {
        setBusyId(null)
      }
    })
  }

  if (queue.length === 0) {
    return (
      <EmptyState
        title="Sin prospectos en la cola"
        subtitle="Agrega prospectos en la sección Prospectos y el agente los priorizará aquí."
      />
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        Ordenados por: seguimientos vencidos → zona del día → tier → nuevos sin
        tocar. Secuencia recomendada: visita → WhatsApp → llamada.
      </p>
      {queue.map((item, i) => {
        const ChannelIcon = CHANNEL_ICON[item.recommendedChannel]
        return (
          <div
            key={item.prospectId}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-gray-300 w-5">
                    {i + 1}
                  </span>
                  <p className="font-semibold text-gray-900 truncate">
                    {item.restaurantName || item.name}
                  </p>
                  <StatusBadge status={item.status} />
                  {item.tier && (
                    <Badge color={item.tier === 1 ? "purple" : item.tier === 2 ? "blue" : "gray"}>
                      {TIER_LABEL[item.tier]}
                    </Badge>
                  )}
                  {item.zone && (
                    <Badge color={item.isZoneOfDay ? "green" : "gray"}>
                      {item.isZoneOfDay ? "📍 Hoy: " : ""}
                      {ZONE_LABEL[item.zone] ?? item.zone}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5 flex-wrap">
                  <ChannelIcon className="w-3.5 h-3.5 text-[#0E7A0E]" />
                  <span>
                    Siguiente toque: <strong>{item.recommendedChannel}</strong>
                  </span>
                  <span className="text-gray-300">·</span>
                  <span>{item.touches} toques</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-[#0E7A0E] font-medium">
                    {MESSAGE_KIND_LABEL[item.suggestedKind]}
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => generate(item)}
                disabled={pending && busyId === item.prospectId}
              >
                {pending && busyId === item.prospectId ? (
                  <Spinner className="w-3.5 h-3.5 border-white border-t-transparent" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Generar mensaje
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => registerTouch(item, "visita")}
                disabled={pending}
              >
                <MapPin className="w-3.5 h-3.5" /> Visita
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => registerTouch(item, "llamada")}
                disabled={pending}
              >
                <Phone className="w-3.5 h-3.5" /> Llamada
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => registerTouch(item, "demo")}
                disabled={pending}
              >
                <MonitorPlay className="w-3.5 h-3.5" /> Demo
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------
// Bandeja de borradores
// ------------------------------------------------------------

function MessagesTab({
  drafts,
  onDraft,
}: {
  drafts: AgentMessage[]
  onDraft: (m: AgentMessage) => void
}) {
  if (drafts.length === 0) {
    return (
      <EmptyState
        title="Sin borradores pendientes"
        subtitle="Genera mensajes desde la Cola del día y aparecerán aquí para tu aprobación."
      />
    )
  }
  return (
    <div className="space-y-3">
      {drafts.map((m) => (
        <div
          key={m.id}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900">
                  {m.restaurantName || m.prospectName}
                </p>
                <Badge color="amber">{MESSAGE_KIND_LABEL[m.kind]}</Badge>
                {m.model && m.model !== "plantilla" && (
                  <Badge color="blue">IA · {m.model}</Badge>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2 whitespace-pre-line">
                {m.message}
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => onDraft(m)}>
              Revisar
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------
// Modal de borrador (editar → aprobar → enviar)
// ------------------------------------------------------------

function DraftModal({
  draft,
  onClose,
}: {
  draft: AgentMessage | null
  onClose: () => void
}) {
  const { toast } = useToast()
  const router = useRouter()
  const [text, setText] = useState("")
  const [pending, startTransition] = useTransition()

  // Sincroniza el texto editable al abrir otro borrador.
  if (draft && text === "" ) setText(draft.message)

  const close = () => {
    setText("")
    onClose()
  }

  const act = (fn: () => Promise<void>, okMsg: string) => {
    startTransition(async () => {
      try {
        await fn()
        toast(okMsg)
        router.refresh()
        close()
      } catch (e) {
        toast(e instanceof Error ? e.message : "Ocurrió un error", "error")
      }
    })
  }

  if (!draft) return null

  const saveIfEdited = async () => {
    if (text.trim() && text !== draft.message) {
      await updateAgentMessageText(draft.id, text)
    }
  }

  return (
    <Modal open={!!draft} onClose={close} title={
      <span className="flex items-center gap-2">
        {MESSAGE_KIND_LABEL[draft.kind]}
        <span className="text-xs font-normal text-gray-400">
          para {draft.restaurantName || draft.prospectName}
        </span>
      </span>
    }>
      <div className="space-y-4">
        <TextArea
          rows={12}
          value={text || draft.message}
          onChange={(e) => setText(e.target.value)}
        />
        {!draft.whatsapp && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            ⚠️ Este prospecto no tiene número de WhatsApp registrado. Agrégalo
            en su ficha antes de enviar.
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            className="flex-1"
            disabled={pending || !draft.whatsapp}
            onClick={() =>
              act(async () => {
                await saveIfEdited()
                const { link } = await sendAgentMessage(draft.id)
                window.open(link, "_blank", "noopener")
              }, "Aprobado · abriendo WhatsApp")
            }
          >
            {pending ? <Spinner className="w-4 h-4 border-white border-t-transparent" /> : <Send className="w-4 h-4" />}
            Aprobar y enviar por WhatsApp
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              act(async () => {
                await saveIfEdited()
                await setAgentMessageStatus(draft.id, "aprobado")
              }, "Borrador guardado")
            }
          >
            <Check className="w-4 h-4" /> Guardar
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() =>
              act(
                () => setAgentMessageStatus(draft.id, "descartado"),
                "Mensaje descartado"
              )
            }
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------
// Tablero gerencial de KPIs
// ------------------------------------------------------------

function KpisTab({ kpis }: { kpis: AgentKpis }) {
  const maxFunnel = Math.max(1, ...kpis.funnel.map((f) => f.count))

  return (
    <div className="space-y-5">
      {/* Metas del mes */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Mes {kpis.monthIndex} de operación · metas del plan
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Registros del mes"
            value={kpis.monthRegistros}
            sub={`Meta acumulada: ${kpis.targetRegistros}`}
          />
          <StatCard
            label="Clientes activos"
            value={kpis.monthActivos}
            sub={`Meta acumulada: ${kpis.targetActivos}`}
          />
          <StatCard
            label="Ventas del mes"
            value={money(kpis.monthVentas)}
            sub={`Meta acumulada: ${money(kpis.targetVentas)}`}
          />
          <StatCard
            label="Ticket promedio"
            value={money(kpis.ticketPromedio)}
            sub={`${kpis.monthPedidos} pedidos pagados`}
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Actividad vs. metas */}
        <SectionCard title="Actividad del agente vs. mínimos diarios">
          <div className="space-y-4">
            {kpis.activity.map((a) => (
              <div key={a.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-gray-700">{a.label}</span>
                  <span className="text-gray-500">
                    Hoy {a.today}/{a.todayGoal} · Semana {a.week}/{a.weekGoal}
                  </span>
                </div>
                <ProgressBar value={a.today} goal={a.todayGoal} />
              </div>
            ))}
            <p className="text-[11px] text-gray-400">
              Los mensajes del agente enviados por WhatsApp esta semana: {kpis.enviadosSemana}.
            </p>
          </div>
        </SectionCard>

        {/* Embudo */}
        <SectionCard title="Embudo de prospección">
          <div className="space-y-2.5">
            {kpis.funnel.map((f) => (
              <div key={f.status} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-28 shrink-0">{f.label}</span>
                <div className="flex-1">
                  <div className="h-5 rounded-md bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-md bg-[#0E7A0E]/80"
                      style={{ width: `${(f.count / maxFunnel) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs font-bold text-gray-800 w-8 text-right">
                  {f.count}
                </span>
              </div>
            ))}
            <div className="pt-2 border-t border-gray-100 flex justify-between text-xs">
              <span className="text-gray-500">Conversión a cliente activo</span>
              <span className="font-bold text-gray-900">
                {pct(kpis.conversionGlobal)}
                <span className="font-normal text-gray-400">
                  {" "}(meta mes {kpis.monthIndex}: {pct(kpis.targetConversion)})
                </span>
              </span>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Conversión por tier */}
        <SectionCard title="Conversión por tier">
          <div className="space-y-3">
            {kpis.byTier.map((t) => (
              <div key={t.segment}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-gray-700">{t.segment}</span>
                  <span className="text-gray-500">
                    {t.activos}/{t.total} activos · {pct(t.conversion)}
                  </span>
                </div>
                <ProgressBar value={t.activos} goal={Math.max(1, t.total)} color="bg-purple-400" />
              </div>
            ))}
            {kpis.byTier.every((t) => t.total === 0) && (
              <p className="text-xs text-gray-400">
                Asigna tier a tus prospectos (1, 2 o 3) para ver este análisis.
              </p>
            )}
          </div>
        </SectionCard>

        {/* Conversión por zona */}
        <SectionCard title="Conversión por zona de ruta">
          <div className="space-y-3">
            {kpis.byZone.map((z) => (
              <div key={z.segment}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-gray-700">{z.segment}</span>
                  <span className="text-gray-500">
                    {z.activos}/{z.total} activos · {pct(z.conversion)}
                  </span>
                </div>
                <ProgressBar value={z.activos} goal={Math.max(1, z.total)} color="bg-blue-400" />
              </div>
            ))}
            {kpis.byZone.every((z) => z.total === 0) && (
              <p className="text-xs text-gray-400">
                Asigna zona a tus prospectos (centro, distrito_uno, paseo_central,
                periferico) para ver este análisis.
              </p>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
