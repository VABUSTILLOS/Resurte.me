// El juego completo de acciones de conversación, el único que tiene el admin.
//
// Vive en su propio módulo porque lo consumen dos superficies del admin —la
// pestaña Bandeja (`LeadConversations.tsx`) y la ficha del lead
// (`LeadDetailDrawer.tsx`)— y el panel compartido ya no trae valor por omisión:
// una omisión que apuntara a las acciones del admin metería ese módulo en el
// bundle del vendedor.
//
// Sin `"use client"`: no ejecuta nada, solo reúne referencias a acciones de
// servidor para que las superficies del cliente las inyecten.
import {
  getAdminLeadConversation,
  getAdminQuickReplies,
  listWaTemplates,
  sendLeadMessage,
  suggestLeadReply,
} from "../actions"
import type { ConversationPanelActions } from "@/components/crm/ConversationPanel"

export const ADMIN_CONVERSATION_ACTIONS: ConversationPanelActions = {
  load: getAdminLeadConversation,
  quickReplies: getAdminQuickReplies,
  templates: listWaTemplates,
  send: sendLeadMessage,
  suggest: suggestLeadReply,
}
