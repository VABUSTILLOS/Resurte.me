"use client"

import { ADMIN_SCOPE, type CrmStatus } from "@/lib/crm-core"
import {
  ProspectDetailDrawer,
  type ProspectDetailActions,
} from "@/components/crm/ProspectDetailDrawer"
import {
  addCrmActivity,
  assignCrmProspect,
  getAdminProspectDetail,
  getAdminSellers,
  setCrmProspectFollowUp,
  setCrmProspectTags,
  updateCrmProspectNotes,
  updateCrmProspectStatus,
} from "../actions"
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
  // La acción del panel recibe `string`; el drawer usa `null` para "sin notas".
  setNotes: (prospectId, notes) => updateCrmProspectNotes(prospectId, notes ?? ""),
  setFollowUp: setCrmProspectFollowUp,
  addActivity: (prospectId, draft) => addCrmActivity(prospectId, draft),
  setTags: (prospectId, tags) => setCrmProspectTags(prospectId, tags),
  listSellers: getAdminSellers,
  assign: assignCrmProspect,
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
  return (
    <ProspectDetailDrawer
      scope={ADMIN_SCOPE}
      prospectId={prospectId}
      open
      onClose={onClose}
      onChanged={onChanged}
      actions={ACTIONS}
      slots={{
        extra: (prospect) => <ProspectMoneyPanel key={prospect.id} prospect={prospect} />,
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
  )
}
