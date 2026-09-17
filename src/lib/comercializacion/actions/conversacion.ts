"use server"

/**
 * Ronda 7 (F5) — bandeja de conversación del vendedor.
 *
 * Es la contraparte de `getAdminLeadConversation`, con **alcance de vendedor**.
 * La diferencia frente a la versión de administración es una sola línea, y es
 * la que sostiene toda la seguridad de la pieza:
 *
 *     readLeadConversation(supabase, prospectId, { scope })
 *
 * El cliente de servicio (`createServiceClient()`) **ignora RLS por completo**,
 * así que la política `crm_prospects_owner_all` (`seller_id = auth.uid()`) no
 * protege nada en este camino. Sin `scope`, un vendedor que adivine un
 * `prospectId` leería la conversación de WhatsApp de cualquier prospecto —de
 * otro vendedor o del pool sin asignar— con solo llamar a esta acción.
 *
 * El alcance se aplica como filtro SQL (`seller_id = userId`), de modo que una
 * fila ajena es **indistinguible de una inexistente**: ambas responden
 * "Prospecto no encontrado". Nunca "Acceso denegado", que confirmaría que la
 * fila existe. Y nunca se añade `OR seller_id IS NULL`: el pool sin asignar es
 * invisible para el vendedor por diseño.
 *
 * Lo que el vendedor **no** obtiene, por acuerdo de alcance de la ronda: vista
 * SLA, secuencias de goteo, reparto automático, sugerencia con IA y envío. Su
 * bandeja es de lectura; para escribir sigue usando los enlaces de WhatsApp de
 * la ficha, que abren `wa.me` con el mensaje ya redactado.
 *
 * La ventana de 24 h se calcula aquí, en el servidor, y no en la interfaz: es
 * un dato de la conversación, no una preferencia del navegador.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { requireSellerOrAdminAction } from "@/lib/roles"
import { scopeForRole } from "@/lib/crm-core"
import { readLeadConversation, type LeadConversation } from "@/lib/crm-conversation"

/**
 * Conversación completa de un prospecto **dentro de la cartera del vendedor**.
 *
 * El mensaje de error es el mismo para "no existe" y para "no es tuyo": es
 * deliberado. Distinguirlos convertiría esta acción en un oráculo de existencia
 * de prospectos ajenos.
 */
export async function getSellerLeadConversation(prospectId: number): Promise<LeadConversation> {
  const { userId, role } = await requireSellerOrAdminAction()
  const id = Number(prospectId)
  if (!Number.isFinite(id)) throw new Error("Prospecto no encontrado")

  const supabase = await createServiceClient()
  const conversation = await readLeadConversation(supabase, id, {
    scope: scopeForRole(role, userId),
  })
  if (!conversation) throw new Error("Prospecto no encontrado")

  return conversation
}
