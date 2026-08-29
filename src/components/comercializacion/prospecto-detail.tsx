"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  PhoneCall,
  Link2,
  Search,
  Mail,
  MapPin,
  Store,
  CalendarClock,
  Phone,
  Wallet,
  Pencil,
  Trash2,
} from "lucide-react"
import {
  Button,
  Badge,
  EmptyState,
  StatusBadge,
  Input,
  Modal,
  Spinner,
  Select,
  ConfirmDialog,
} from "./ui"
import { ActivityFormModal } from "./activity-form"
import { ProspectFormModal } from "./prospect-form"
import { useToast } from "@/components/toast"
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABEL,
  ACTIVITY_OUTCOME_LABEL,
  type ActivityType,
} from "@/lib/comercializacion/types"
import { formatDateTime, formatDate } from "@/lib/comercializacion/dates"
import { formatMoney } from "@/lib/comercializacion/commissions"
import { WhatsappTemplateMenu } from "./whatsapp-templates"
import {
  searchUsersForLinking,
  linkProspectAccount,
  updateProspect,
  deleteActivity,
} from "@/lib/comercializacion/actions"
import type { Prospect, Activity } from "@/lib/comercializacion/types"

const ACTIVITY_ICON: Record<ActivityType, string> = {
  llamada: "📞",
  whatsapp: "💬",
  correo: "✉️",
  visita: "🤝",
  nota: "📝",
  pedido: "🛒",
}

function LinkAccountPanel({
  prospect,
  onLinked,
}: {
  prospect: Prospect
  onLinked: () => void
}) {
  const { toast } = useToast()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<
    Array<{ id: string; full_name: string | null; email: string; phone: string | null }>
  >([])
  const [searching, setSearching] = useState(false)
  const [linking, setLinking] = useState<string | null>(null)

  async function search() {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await searchUsersForLinking(query)
      setResults(res)
      if (res.length === 0) toast("Sin resultados", "warning")
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error de búsqueda", "error")
    } finally {
      setSearching(false)
    }
  }

  async function link(userId: string, name: string) {
    setLinking(userId)
    try {
      await linkProspectAccount(prospect.id, userId)
      await updateProspect(prospect.id, { status: "cliente_activo" })
      toast(`Vinculado: ${name} ✅`)
      onLinked()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al vincular", "error")
    } finally {
      setLinking(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Buscar por nombre, teléfono o email…"
        />
        <Button variant="secondary" onClick={search} disabled={searching || !query.trim()}>
          <Search className="w-4 h-4" />
          Buscar
        </Button>
      </div>
      {results.length > 0 ? (
        <ul className="divide-y divide-gray-50 border border-gray-100 rounded-xl">
          {results.map((u) => (
            <li key={u.id} className="px-3 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {u.full_name ?? "Sin nombre"}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {u.email}
                  {u.phone ? ` · ${u.phone}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => link(u.id, u.full_name ?? u.email)}
                disabled={linking === u.id}
              >
                {linking === u.id ? <Spinner className="!w-3.5 !h-3.5" /> : "Vincular"}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function ProspectoDetail({
  detail,
  clientOrders,
  cities,
}: {
  detail: { prospect: Prospect; activities: Activity[] }
  clientOrders: {
    orders: Array<{ id: number; total: number; status: string; payment_status: string; created_at: string }>
    revenue: number
    commission: number
  } | null
  cities: Array<{ id: number; name: string; state: string }>
}) {
  const { toast } = useToast()
  const { prospect, activities } = detail
  const [copied, setCopied] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [refreshed, setRefreshed] = useState(0)
  const [activityFilter, setActivityFilter] = useState<ActivityType | "todos">("todos")
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [deletingActivity, setDeletingActivity] = useState<Activity | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const visibleActivities =
    activityFilter === "todos"
      ? activities
      : activities.filter((a) => a.type === activityFilter)

  function reloadPage() {
    setRefreshed((r) => r + 1)
    window.location.reload()
  }

  async function confirmDeleteActivity() {
    if (!deletingActivity) return
    setDeleteLoading(true)
    try {
      await deleteActivity(deletingActivity.id)
      toast("Actividad eliminada")
      setDeletingActivity(null)
      reloadPage()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al eliminar", "error")
    } finally {
      setDeleteLoading(false)
    }
  }
  // El refresco tras guardar remonta el componente vía key={refreshed},
  // así que "current" siempre es igual a "prospect" (derivado, no state).
  const current = prospect

  const regLink = current.referral_code
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/auth/register?ref=${current.referral_code}`
    : null

  async function copyRegLink() {
    if (!regLink) {
      toast("Este prospecto aún no tiene código de registro", "warning")
      return
    }
    try {
      await navigator.clipboard.writeText(regLink)
      setCopied(true)
      toast("Link copiado ✅")
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast("No se pudo copiar", "error")
    }
  }

  return (
    <div className="space-y-5" key={refreshed}>
      <Link
        href="/comercializacion/prospectos"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0E7A0E]"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a prospectos
      </Link>

      {/* Ficha */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{current.name}</h1>
              <StatusBadge status={current.status} />
            </div>
            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5" />
              {current.restaurant_name ?? "Sin restaurante"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
              <Pencil className="w-3.5 h-3.5" />
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={copyRegLink}
              title="Copiar link de registro"
            >
              <Link2 className="w-3.5 h-3.5" />
              {copied ? "✓ Copiado" : "Link registro"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {current.whatsapp || current.phone ? (
            <div className="flex items-center gap-2 text-gray-600">
              <Phone className="w-4 h-4 text-gray-400" />
              {current.whatsapp ?? current.phone}
            </div>
          ) : null}
          {current.email ? (
            <div className="flex items-center gap-2 text-gray-600">
              <Mail className="w-4 h-4 text-gray-400" />
              {current.email}
            </div>
          ) : null}
          {current.city_name ? (
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400" />
              {current.city_name}
            </div>
          ) : null}
          <div className="flex items-center gap-2 text-gray-600">
            <CalendarClock className="w-4 h-4 text-gray-400" />
            {current.next_follow_up_at
              ? `Seguimiento: ${formatDateTime(current.next_follow_up_at)}`
              : "Sin seguimiento programado"}
          </div>
        </div>

        {current.notes ? (
          <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2">
            {current.notes}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <WhatsappTemplateMenu
            phone={current.whatsapp ?? current.phone}
            vars={{
              nombre: current.name,
              restaurante: current.restaurant_name,
            }}
            variant="button"
          />
          <Button variant="secondary" size="sm" onClick={() => setShowActivity(true)}>
            <PhoneCall className="w-3.5 h-3.5" />
            Registrar llamada
          </Button>
          {!current.user_id ? (
            <Button variant="outline" size="sm" onClick={() => setShowLink(true)}>
              <Link2 className="w-3.5 h-3.5" />
              Vincular cuenta
            </Button>
          ) : null}
          {current.user_id ? (
            <Link
              href={`/comercializacion/pedidos?prospecto=${current.id}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#0E7A0E]/10 text-[#0E7A0E] px-3 py-1.5 rounded-xl hover:bg-[#0E7A0E]/15 transition-colors"
            >
              🛒 Hacer pedido
            </Link>
          ) : null}
        </div>
      </div>

      {/* Cuenta vinculada + comisión */}
      {current.user_id ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              🔗 Cuenta vinculada
            </h3>
            <Badge color="green">Vinculada</Badge>
          </div>
          {clientOrders ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 px-3 py-2">
                <p className="text-xs text-gray-500">Ventas pagadas (histórico)</p>
                <p className="text-lg font-bold text-gray-900">
                  {formatMoney(clientOrders.revenue)}
                </p>
              </div>
              <div className="rounded-xl bg-[#0E7A0E]/5 px-3 py-2">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Wallet className="w-3 h-3" /> Comisión estimada
                </p>
                <p className="text-lg font-bold text-[#0E7A0E]">
                  {formatMoney(clientOrders.commission)}
                </p>
              </div>
            </div>
          ) : null}
          {clientOrders && clientOrders.orders.length > 0 ? (
            <ul className="mt-4 divide-y divide-gray-50">
              {clientOrders.orders.slice(0, 10).map((o) => (
                <li key={o.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                  <span className="text-gray-700">
                    Pedido #{o.id}
                    <span className="text-gray-400"> · {formatDate(o.created_at)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {o.payment_status === "paid" && o.status !== "cancelled" ? (
                      <Badge color="green">Pagado</Badge>
                    ) : o.status === "cancelled" ? (
                      <Badge color="red">Cancelado</Badge>
                    ) : (
                      <Badge color="amber">Pendiente</Badge>
                    )}
                    <span className="font-semibold text-gray-900">
                      {formatMoney(o.total)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 mt-3">Este cliente aún no tiene pedidos.</p>
          )}
        </div>
      ) : null}

      {/* Timeline de actividades */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-900">Bitácora de contacto</h3>
          <div className="flex items-center gap-2">
            {activities.length > 0 ? (
              <Select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value as ActivityType | "todos")}
                className="!w-auto text-xs"
              >
                <option value="todos">Todas</option>
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACTIVITY_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => setShowActivity(true)}>
              <PhoneCall className="w-3.5 h-3.5" />
              Registrar
            </Button>
          </div>
        </div>
        {activities.length === 0 ? (
          <EmptyState
            title="Aún no hay actividades"
            subtitle="Registra tu primera llamada o WhatsApp para empezar el seguimiento."
          />
        ) : visibleActivities.length === 0 ? (
          <EmptyState
            title="Sin actividades de este tipo"
            subtitle="Cambia el filtro para ver el resto de la bitácora."
          />
        ) : (
          <ol className="relative space-y-4 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-gray-100">
            {visibleActivities.map((a) => (
              <li key={a.id} className="relative pl-10 group/activity">
                <span className="absolute left-0 top-0 w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-sm">
                  {ACTIVITY_ICON[a.type]}
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">
                      {ACTIVITY_TYPE_LABEL[a.type]}
                    </span>
                    {a.outcome ? (
                      <Badge color="blue">{ACTIVITY_OUTCOME_LABEL[a.outcome] ?? a.outcome}</Badge>
                    ) : null}
                    {a.direction === "entrante" ? <Badge color="gray">Entrante</Badge> : null}
                    {a.duration_seconds ? (
                      <span className="text-[11px] text-gray-400">
                        {Math.round(a.duration_seconds / 60)} min
                      </span>
                    ) : null}
                    <span className="ml-auto flex items-center gap-1 opacity-0 group-hover/activity:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingActivity(a)}
                        className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        title="Editar actividad"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingActivity(a)}
                        className="p-1 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Eliminar actividad"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  </div>
                  {a.summary ? (
                    <p className="text-sm text-gray-600 mt-0.5">{a.summary}</p>
                  ) : null}
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {formatDateTime(a.occurred_at)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <ActivityFormModal
        open={showActivity}
        onClose={() => setShowActivity(false)}
        prospectId={current.id}
        onSaved={() => {
          toast("Actividad registrada ✅")
          setShowActivity(false)
          reloadPage()
        }}
      />

      <ActivityFormModal
        open={!!editingActivity}
        onClose={() => setEditingActivity(null)}
        prospectId={current.id}
        activity={editingActivity}
        onSaved={() => {
          toast("Actividad actualizada")
          setEditingActivity(null)
          reloadPage()
        }}
      />

      <ConfirmDialog
        open={!!deletingActivity}
        onClose={() => setDeletingActivity(null)}
        onConfirm={confirmDeleteActivity}
        loading={deleteLoading}
        title="Eliminar actividad"
        message={`¿Eliminar esta actividad (${deletingActivity ? ACTIVITY_TYPE_LABEL[deletingActivity.type] : ""})? Esta acción no se puede deshacer.`}
      />

      <ProspectFormModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        prospect={current}
        cities={cities}
        onSaved={() => {
          toast("Prospecto actualizado")
          setShowEdit(false)
          window.location.reload()
        }}
      />

      {!current.user_id ? (
        <Modal
          open={showLink}
          onClose={() => setShowLink(false)}
          title="Vincular cuenta de cliente"
        >
          <p className="text-sm text-gray-500 mb-3">
            Busca la cuenta registrada del cliente (por email, teléfono o nombre) para
            vincular sus pedidos a este prospecto.
          </p>
          <LinkAccountPanel
            prospect={current}
            onLinked={() => {
              setShowLink(false)
              setRefreshed((r) => r + 1)
              window.location.reload()
            }}
          />
        </Modal>
      ) : null}
    </div>
  )
}
