"use client"

import { useEffect, useState } from "react"
import { Pencil } from "lucide-react"
import { ADMIN_SCOPE, type CrmProspectRow, type CrmStatus } from "@/lib/crm-core"
import {
  ProspectDetailDrawer,
  type ProspectDetailActions,
} from "@/components/crm/ProspectDetailDrawer"
import { ProspectFormModal } from "@/components/crm/ProspectFormModal"
import {
  ActivityFormModal,
  type ActivityFormActions,
} from "@/components/crm/ActivityFormModal"
import { ConfirmDialog } from "@/components/comercializacion/ui"
import { useToast } from "@/components/toast"
import type { Activity } from "@/lib/comercializacion/types"
import {
  addCrmActivity,
  assignCrmProspect,
  closeCrmProspect,
  completeCrmTask,
  createCrmTask,
  deleteCrmActivity,
  deleteCrmTask,
  getAdminCities,
  getAdminProspectDetail,
  getAdminSellers,
  reopenCrmTask,
  setCrmProspectFollowUp,
  setCrmProspectTags,
  updateCrmActivity,
  updateCrmProspect,
  updateCrmProspectNotes,
  updateCrmProspectStatus,
} from "../actions"
import { listProspectTasks } from "@/lib/comercializacion/actions/tareas"
import { LeadConversationPanel } from "@/components/crm/ConversationPanel"
import { ProspectMoneyPanel } from "./ProspectMoneyPanel"
import { ADMIN_CONVERSATION_ACTIONS } from "./admin-conversation-actions"

/**
 * Adaptador del panel para la ficha compartida.
 *
 * La implementación vive en `@/components/crm/ProspectDetailDrawer` desde la
 * fusión con `/comercializacion`: era el mismo panel con dos copias, y un
 * arreglo en una no llegaba a la otra. Aquí solo se inyectan las acciones del
 * admin —todas acotadas por `requireAdmin()` en el servidor— y la conversación
 * de WhatsApp.
 *
 * El alcance es `admin`, así que la ficha muestra el selector de vendedor y el
 * pozo sin asignar; el vendedor usa el mismo componente con `sellerScope`.
 */

const ACTIONS: ProspectDetailActions = {
  loadDetail: getAdminProspectDetail,
  setStatus: (prospectId, status: CrmStatus) => updateCrmProspectStatus(prospectId, status),
  closeDeal: closeCrmProspect,
  // La acción del panel recibe `string`; el drawer usa `null` para "sin notas".
  setNotes: (prospectId, notes) => updateCrmProspectNotes(prospectId, notes ?? ""),
  setFollowUp: setCrmProspectFollowUp,
  addActivity: (prospectId, draft) => addCrmActivity(prospectId, draft),
  setTags: (prospectId, tags) => setCrmProspectTags(prospectId, tags),
  listSellers: getAdminSellers,
  assign: assignCrmProspect,
  // Las tareas leen del módulo compartido (no escriben, no hay bitácora que
  // dejar) y escriben por los envoltorios del panel, que sí la dejan.
  listTasks: listProspectTasks,
  addTask: createCrmTask,
  completeTask: completeCrmTask,
  reopenTask: reopenCrmTask,
  deleteTask: deleteCrmTask,
}

/**
 * Solo `update`: el alta de prospecto vive en la barra de `/admin/leads`, no en
 * la ficha de uno que ya existe. La ficha tampoco reasigna vendedor por aquí —
 * esa puerta es el selector del bloque de contacto, que además mueve las tareas
 * abiertas.
 */
const FORM_ACTIONS = { update: updateCrmProspect }

const ACTIVITY_ACTIONS: ActivityFormActions = { update: updateCrmActivity }

interface CityOption {
  id: number
  name: string
  state: string
}

export function LeadDetailDrawer({
  prospectId,
  onClose,
  onChanged,
}: {
  prospectId: number
  onClose: () => void
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [editing, setEditing] = useState<CrmProspectRow | null>(null)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [deletingActivity, setDeletingActivity] = useState<Activity | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [cities, setCities] = useState<CityOption[]>([])
  // Sube tras una edición de actividad para que la ficha recargue su historial;
  // `onChanged` por sí solo no la refresca, avisa al listado de detrás.
  const [reloadKey, setReloadKey] = useState(0)

  // Las ciudades se cargan la primera vez que se abre el formulario, no al
  // abrir la ficha: quien solo mira el historial no paga la consulta.
  useEffect(() => {
    if (!editing || cities.length > 0) return
    let cancelled = false
    void Promise.resolve()
      .then(getAdminCities)
      .then((rows) => {
        if (!cancelled) setCities(rows)
      })
      .catch(() => {
        // El selector de ciudad se queda vacío; el resto del formulario sirve.
      })
    return () => {
      cancelled = true
    }
  }, [editing, cities.length])

  async function confirmDeleteActivity() {
    if (!deletingActivity) return
    setDeleting(true)
    try {
      await deleteCrmActivity(deletingActivity.id)
      toast("Actividad eliminada")
      setDeletingActivity(null)
      setReloadKey((k) => k + 1)
      onChanged()
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo eliminar la actividad", "error")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <ProspectDetailDrawer
        scope={ADMIN_SCOPE}
        prospectId={prospectId}
        open
        onClose={onClose}
        onChanged={onChanged}
        actions={ACTIONS}
        refreshKey={reloadKey}
        slots={{
          contactActions: (prospect) => (
            <button
              type="button"
              onClick={() => setEditing(prospect)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar
            </button>
          ),
          extra: (prospect) => <ProspectMoneyPanel key={prospect.id} prospect={prospect} />,
        }}
        activityActions={{
          onEdit: setEditingActivity,
          onDelete: setDeletingActivity,
        }}
        renderConversation={(id, onSent) => (
          <LeadConversationPanel
            key={id}
            prospectId={id}
            onSent={onSent}
            actions={ADMIN_CONVERSATION_ACTIONS}
            className="h-[420px]"
          />
        )}
      />

      <ProspectFormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        prospect={editing}
        cities={cities}
        actions={FORM_ACTIONS}
        onSaved={() => {
          toast("Prospecto actualizado")
          setReloadKey((k) => k + 1)
          onChanged()
        }}
      />

      <ActivityFormModal
        open={editingActivity !== null}
        onClose={() => setEditingActivity(null)}
        prospectId={prospectId}
        activity={editingActivity}
        actions={ACTIVITY_ACTIONS}
        onSaved={() => {
          toast("Actividad actualizada")
          setReloadKey((k) => k + 1)
          onChanged()
        }}
      />

      <ConfirmDialog
        open={deletingActivity !== null}
        onClose={() => setDeletingActivity(null)}
        onConfirm={confirmDeleteActivity}
        title="Eliminar actividad"
        message="Se borra del historial del prospecto. Esto no se puede deshacer."
        loading={deleting}
      />
    </>
  )
}
