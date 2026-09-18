"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Link2, PhoneCall, Pencil, Search, Wallet } from "lucide-react"
import {
  ProspectDetailDrawer,
  type ProspectDetailActions,
} from "@/components/crm/ProspectDetailDrawer"
import { Badge, Button, ConfirmDialog, Input, Modal, Spinner } from "./ui"
import { ActivityFormModal } from "@/components/crm/ActivityFormModal"
import { ProspectFormModal } from "@/components/crm/ProspectFormModal"
import { WhatsappTemplateMenu } from "./whatsapp-templates"
import { useToast } from "@/components/toast"
import { formatDate } from "@/lib/comercializacion/dates"
import { formatMoney } from "@/lib/comercializacion/commissions"
import {
  addActivity,
  completeCrmTask,
  createTask,
  deleteActivity,
  deleteCrmTask,
  getProspectDetail,
  getSellerLeadConversation,
  linkProspectAccount,
  listProspectTasks,
  reopenCrmTask,
  searchUsersForLinking,
  setProspectTags,
  updateActivity,
  updateProspect,
} from "@/lib/comercializacion/actions"
import {
  LeadConversationPanel,
  type ConversationPanelActions,
} from "@/components/crm/ConversationPanel"
import type { CrmScope } from "@/lib/crm-core"
import type { Activity, Prospect } from "@/lib/comercializacion/types"

export interface SellerClientOrders {
  orders: Array<{
    id: number
    total: number
    status: string
    payment_status: string
    created_at: string
  }>
  revenue: number
  commission: number
  /** Pedidos pagados contados sobre el historial, no sobre `orders` (que es una página). */
  paidOrders: number
  /** `true` si el historial no cupo en el escaneo: `revenue` es un mínimo. */
  revenueTruncated: boolean
}

export interface SellerProspectDetailProps {
  detail: { prospect: Prospect; activities: Activity[]; tags?: readonly string[] }
  clientOrders: SellerClientOrders | null
  cities: Array<{ id: number; name: string; state: string }>
  scope: CrmScope
}

/**
 * Adaptador del vendedor para la ficha compartida.
 *
 * La ficha en sí vive en `@/components/crm/ProspectDetailDrawer`; aquí solo se
 * inyectan las acciones del vendedor —todas acotadas por `seller_id` en el
 * servidor— y las piezas exclusivas de esta superficie: vincular cuenta,
 * comisión del cliente vinculado, link de registro y los modales.
 *
 * No se inyectan `listSellers` ni `assign`: son de alcance admin (repartir
 * cartera entre vendedores no es algo que el vendedor haga) y la ficha oculta
 * esas secciones cuando no llegan. `setTags` sí se inyecta desde la Ronda 7:
 * el vendedor clasifica su propia cartera, y `setProspectTags` acota por
 * `seller_id` en el servidor.
 */

const ACTIONS: ProspectDetailActions = {
  loadDetail: getProspectDetail,
  // El vendedor no tiene acciones propias de estado/notas/seguimiento:
  // `updateProspect` ya acota por `seller_id` y acepta los tres campos.
  setStatus: async (prospectId, status) => {
    await updateProspect(prospectId, { status })
  },
  setNotes: async (prospectId, notes) => {
    await updateProspect(prospectId, { notes })
  },
  setFollowUp: async (prospectId, iso) => {
    await updateProspect(prospectId, { next_follow_up_at: iso })
  },
  addActivity: async (prospectId, draft) => {
    await addActivity(prospectId, draft)
  },
  setTags: async (prospectId, tags) => {
    await setProspectTags(prospectId, tags)
  },
  // Tareas (F4): el vendedor ve y mueve las suyas. El alcance lo resuelve el
  // servidor sobre el prospecto, así que aquí no hay filtro que repetir.
  listTasks: listProspectTasks,
  addTask: createTask,
  completeTask: completeCrmTask,
  reopenTask: reopenCrmTask,
  deleteTask: deleteCrmTask,
}

/**
 * Comandos del formulario compartido. Sin `create` y sin `findDuplicates`: en
 * esta superficie el formulario solo se abre con un prospecto ya cargado (el
 * alta del vendedor vive en la lista), así que la rama de alta no se alcanza y
 * el aviso de duplicado no tiene nada que advertir.
 */
const FORM_ACTIONS = { update: updateProspect }

/**
 * Comandos del formulario de actividad. Los dos modales —alta y edición— usan el
 * mismo objeto: el formulario decide cuál de los dos comandos llamar.
 */
const ACTIVITY_ACTIONS = { create: addActivity, update: updateActivity }

/**
 * Bandeja del vendedor: **solo lectura**.
 *
 * Se inyecta únicamente `load`, que en el servidor acota por `seller_id` —el
 * cliente de servicio ignora RLS, así que ese filtro es la única barrera—. Sin
 * `send` ni `suggest`, el pie del panel no pinta compositor ni botón de IA: no
 * es una interfaz deshabilitada, es una interfaz que no ofrece lo que el
 * vendedor no puede hacer. Para escribir sigue teniendo los botones de WhatsApp
 * de la ficha, que abren `wa.me` con el mensaje ya redactado.
 *
 * El envío desde el panel para el vendedor queda como trabajo aparte: exige
 * extraer el camino de envío del admin (ventana de 24 h, plantilla aprobada) a
 * un módulo compartido y acotarlo por cartera.
 */
const CONVERSATION_ACTIONS: ConversationPanelActions = {
  load: getSellerLeadConversation,
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

function ClientAccountPanel({ clientOrders }: { clientOrders: SellerClientOrders | null }) {
  return (
    <section className="rounded-2xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
          🔗 Cuenta vinculada
        </h3>
        <Badge color="green">Vinculada</Badge>
      </div>
      {clientOrders ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">Ventas pagadas (histórico)</p>
            <p className="text-lg font-bold text-gray-900">
              {/* El `≥` va con el formato local de dinero (2 decimales), que es
                  distinto del de `/admin`; por eso no se reusa el helper. */}
              {clientOrders.revenueTruncated ? "≥ " : ""}
              {formatMoney(clientOrders.revenue)}
            </p>
          </div>
          <div className="rounded-xl bg-[#0E7A0E]/5 px-3 py-2">
            <p className="flex items-center gap-1 text-xs text-gray-500">
              <Wallet className="w-3 h-3" /> Comisión estimada
            </p>
            <p className="text-lg font-bold text-[#0E7A0E]">
              {clientOrders.revenueTruncated ? "≥ " : ""}
              {formatMoney(clientOrders.commission)}
            </p>
          </div>
        </div>
      ) : null}
      {clientOrders?.revenueTruncated ? (
        <p className="mt-2 text-xs text-gray-500">
          Este cliente tiene más pedidos de los que caben en el escaneo: el importe es un
          mínimo, no el histórico completo.
        </p>
      ) : null}
      {clientOrders && clientOrders.orders.length > 0 ? (
        <ul className="mt-4 divide-y divide-gray-50">
          {clientOrders.orders.slice(0, 10).map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-sm">
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
                <span className="font-semibold text-gray-900">{formatMoney(o.total)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : clientOrders ? (
        <p className="mt-3 text-sm text-gray-500">Este cliente aún no tiene pedidos.</p>
      ) : (
        // `clientOrders` solo llega nulo aquí si la medición falló —el panel se
        // monta únicamente con cuenta vinculada—, así que decir "no tiene
        // pedidos" sería afirmar un cero que nadie midió.
        <p className="mt-3 text-sm text-gray-500">
          No se pudieron cargar los pedidos de este cliente.
        </p>
      )}
    </section>
  )
}

export function SellerProspectDetail({
  detail,
  clientOrders,
  cities,
  scope,
}: SellerProspectDetailProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { prospect } = detail
  const [refreshKey, setRefreshKey] = useState(0)
  const [copied, setCopied] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [deletingActivity, setDeletingActivity] = useState<Activity | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Los modales viven aquí, no en el drawer: al guardar hay que refrescar
  // también los datos que el servidor pasó a este componente (ciudades,
  // pedidos del cliente), y eso solo lo hace un reload completo.
  function reload() {
    window.location.reload()
  }

  // Las ediciones hechas dentro del drawer sí se resuelven sin recargar.
  function softRefresh() {
    setRefreshKey((k) => k + 1)
    router.refresh()
  }

  async function confirmDeleteActivity() {
    if (!deletingActivity) return
    setDeleteLoading(true)
    try {
      await deleteActivity(deletingActivity.id)
      toast("Actividad eliminada")
      setDeletingActivity(null)
      reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al eliminar", "error")
    } finally {
      setDeleteLoading(false)
    }
  }

  const regLink = prospect.referral_code
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/auth/register?ref=${prospect.referral_code}`
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
    <div className="space-y-5">
      <Link
        href="/comercializacion/prospectos"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0E7A0E]"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a prospectos
      </Link>

      <ProspectDetailDrawer
        scope={scope}
        prospectId={prospect.id}
        open
        variant="page"
        refreshKey={refreshKey}
        onClose={() => router.push("/comercializacion/prospectos")}
        onChanged={softRefresh}
        actions={ACTIONS}
        renderConversation={(id, onSent) => (
          <LeadConversationPanel
            key={id}
            prospectId={id}
            onSent={onSent}
            actions={CONVERSATION_ACTIONS}
            className="h-[420px]"
          />
        )}
        activityActions={{
          onEdit: (a) => setEditingActivity(a),
          onDelete: (a) => setDeletingActivity(a),
        }}
        slots={{
          contactActions: () => (
            <>
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
              <WhatsappTemplateMenu
                phone={prospect.whatsapp ?? prospect.phone}
                vars={{ nombre: prospect.name, restaurante: prospect.restaurant_name }}
                variant="button"
              />
              {!prospect.user_id && (
                <Button variant="outline" size="sm" onClick={() => setShowLink(true)}>
                  <Link2 className="w-3.5 h-3.5" />
                  Vincular cuenta
                </Button>
              )}
              {prospect.user_id && (
                <Link
                  href={`/comercializacion/pedidos?prospecto=${prospect.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0E7A0E]/10 px-3 py-1.5 text-xs font-semibold text-[#0E7A0E] transition-colors hover:bg-[#0E7A0E]/15"
                >
                  🛒 Hacer pedido
                </Link>
              )}
            </>
          ),
          activityForm: () => (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => setShowActivity(true)}
            >
              <PhoneCall className="w-3.5 h-3.5" />
              Registrar llamada
            </Button>
          ),
          extra: () =>
            prospect.user_id ? (
              <ClientAccountPanel clientOrders={clientOrders} />
            ) : null,
        }}
      />

      <ProspectFormModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        prospect={prospect}
        cities={cities}
        actions={FORM_ACTIONS}
        onSaved={reload}
      />

      <ActivityFormModal
        open={showActivity}
        onClose={() => setShowActivity(false)}
        prospectId={prospect.id}
        actions={ACTIVITY_ACTIONS}
        onSaved={reload}
      />

      <ActivityFormModal
        open={editingActivity !== null}
        onClose={() => setEditingActivity(null)}
        prospectId={prospect.id}
        activity={editingActivity}
        actions={ACTIVITY_ACTIONS}
        onSaved={reload}
      />

      <Modal
        open={showLink}
        onClose={() => setShowLink(false)}
        title="Vincular cuenta de cliente"
      >
        <LinkAccountPanel
          prospect={prospect}
          onLinked={() => {
            setShowLink(false)
            reload()
          }}
        />
      </Modal>

      <ConfirmDialog
        open={deletingActivity !== null}
        onClose={() => setDeletingActivity(null)}
        onConfirm={confirmDeleteActivity}
        loading={deleteLoading}
        title="Eliminar actividad"
        message="¿Seguro que quieres eliminar esta actividad de la bitácora? No se puede deshacer."
      />
    </div>
  )
}
