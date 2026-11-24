// ============================================================
// Comprobante de pago que el cliente manda por WhatsApp
// ============================================================
// Cuando un cliente con un pedido pendiente de pago manda una
// IMAGEN por WhatsApp, casi seguro es su comprobante de la
// transferencia. Este módulo lo liga a ese pedido:
//
// - Descarga el binario de la API de Meta (downloadWhatsAppMedia).
// - Lo valida con las reglas de src/lib/payment-proof.ts (mismas
//   que la ruta web de comprobantes: JPG/PNG/WebP, ≤ 5 MB).
// - Lo sube al MISMO almacenamiento que usa la ruta web de
//   comprobantes (bucket privado `entregas`, prefijo propio
//   `marketplace-pagos/`) y guarda la RUTA en
//   `orders.payment_proof_path` (+ `payment_proof_at`, migración
//   00228) — jamás una URL firmada.
// - Registra el evento para staff igual que la ruta web: el
//   comprobante queda en el pedido (visible en el panel) y, como el
//   canal es WhatsApp, además va la fila de bitácora en
//   `whatsapp_messages` y el aviso al número de staff.
//
// Invariantes:
// - Guardar el comprobante NO marca el pedido como pagado. La
//   confirmación del pago SPEI es manual en el panel (decisión de
//   la tienda); la foto respalda, no autoriza — mismo criterio que
//   el comprobante de entrega (00154).
// - Con EXACTAMENTE un candidato se liga solo. Con varios, se
//   pregunta a cuál pedido corresponde (respuestas numeradas) y la
//   foto queda en espera en la bitácora hasta que el cliente elija.
// - Sin la migración 00228 aplicada (columnas ausentes), el archivo
//   igual se sube y el evento se registra en la bitácora con la
//   ruta: el staff concilia a mano en vez de perder el comprobante.
// - Si el pedido deja de estar pendiente entre la lectura y la
//   escritura, el objeto recién subido se borra: no quedan
//   huérfanos en el bucket ni comprobantes ligados a pedidos
//   que ya se pagaron o cancelaron por otra vía.

import { WHATSAPP_NUMBER } from "@/lib/business"
import { missingColumnName } from "@/lib/admin/order-selects"
import { logger } from "@/lib/logger"
import {
  PAYMENT_PROOF_BUCKET,
  paymentProofPath,
  validatePaymentProofFile,
} from "@/lib/payment-proof"
import type { createServiceClient } from "@/lib/supabase/service"
import { downloadWhatsAppMedia, sendTextMessage } from "@/lib/whatsapp"
import { WHATSAPP_PROOF_LINK_WINDOW_DAYS } from "@/lib/whatsapp-order-config"
import { findProfileByPhone } from "@/lib/whatsapp-orders"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export interface ProofCandidateOrder {
  id: number
  total: number
  paymentMethod: string | null
}

interface CandidateRow {
  id: number
  total: number
  payment_method: string | null
  customer_phone: string | null
  user_id: string | null
}

/**
 * Pedidos del teléfono (de WhatsApp o web asociados a su perfil)
 * que siguen pendientes de pago dentro de la ventana de ligado.
 */
export async function findProofCandidateOrders(
  supabase: ServiceClient,
  from: string
): Promise<ProofCandidateOrder[]> {
  const last10 = from.replace(/\D/g, "").slice(-10)
  if (last10.length < 10) return []

  const { profile } = await findProfileByPhone(supabase, from)

  const since = new Date(
    Date.now() - WHATSAPP_PROOF_LINK_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()
  const { data: rows, error } = await supabase
    .from("orders")
    .select("id, total, payment_method, customer_phone, user_id")
    .eq("payment_status", "pending")
    .not("status", "in", "(cancelled,delivered)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10)

  if (error) {
    logger.error("WhatsApp proof: consulta de candidatos falló:", error)
    return []
  }

  return ((rows ?? []) as CandidateRow[])
    .filter((o) => {
      if (o.customer_phone && o.customer_phone.replace(/\D/g, "").slice(-10) === last10) {
        return true
      }
      return profile !== null && o.user_id === profile.id
    })
    .map((o) => ({ id: o.id, total: Number(o.total), paymentMethod: o.payment_method }))
}

export type AttachProofResult =
  | { kind: "attached"; orderId: number; total: number }
  | { kind: "stored_unlinked"; orderId: number; total: number }
  | { kind: "invalid_file"; orderId: number; error: string }
  | { kind: "order_not_pending"; orderId: number }
  | { kind: "error"; detail: string }

/**
 * Descarga la imagen de Meta y la liga como comprobante del pedido.
 * El UPDATE es condicional (`payment_status = 'pending'`): si el
 * pago se confirmó por otra vía mientras tanto, no se liga nada.
 */
export async function attachWhatsAppPaymentProof(
  supabase: ServiceClient,
  input: { orderId: number; mediaId: string }
): Promise<AttachProofResult> {
  const { orderId, mediaId } = input

  const { data: orderRow, error: readError } = await supabase
    .from("orders")
    .select("id, total, payment_status, status")
    .eq("id", orderId)
    .maybeSingle()
  if (readError || !orderRow) {
    if (readError) logger.error("WhatsApp proof: no se pudo leer el pedido:", readError)
    return { kind: "error", detail: "order_read_failed" }
  }
  const order = orderRow as {
    id: number
    total: number
    payment_status: string
    status: string
  }
  if (
    order.payment_status !== "pending" ||
    order.status === "cancelled" ||
    order.status === "delivered"
  ) {
    return { kind: "order_not_pending", orderId }
  }
  const total = Number(order.total)

  let media: Awaited<ReturnType<typeof downloadWhatsAppMedia>>
  try {
    media = await downloadWhatsAppMedia(mediaId)
  } catch (err) {
    logger.error("WhatsApp proof: descarga de media falló:", err)
    return { kind: "error", detail: "media_download_failed" }
  }

  const check = validatePaymentProofFile({ type: media.mimeType, size: media.size })
  if (!check.ok) return { kind: "invalid_file", orderId, error: check.error }

  const path = paymentProofPath(orderId, media.mimeType)
  const { error: uploadError } = await supabase.storage
    .from(PAYMENT_PROOF_BUCKET)
    .upload(path, media.data, { contentType: media.mimeType, upsert: false })
  if (uploadError) {
    logger.error("WhatsApp proof: subida a Storage falló:", uploadError)
    return { kind: "error", detail: "storage_upload_failed" }
  }

  const removeOrphan = async () => {
    const { error } = await supabase.storage.from(PAYMENT_PROOF_BUCKET).remove([path])
    if (error) logger.error("WhatsApp proof: no se pudo borrar el objeto huérfano:", error)
  }

  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ payment_proof_path: path, payment_proof_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("payment_status", "pending")
    .select("id")

  if (updateError) {
    const missing = missingColumnName(updateError)
    if (missing === "payment_proof_path" || missing === "payment_proof_at") {
      // Migración 00228 sin aplicar: el archivo ya está en Storage y
      // el evento queda en la bitácora con la ruta para conciliar a
      // mano. Perder el comprobante sería peor que no ligarlo.
      await registerProofForStaff(supabase, { orderId, total, path, linked: false })
      logger.warn("whatsapp.payment_proof.stored_unlinked", { orderId, path })
      return { kind: "stored_unlinked", orderId, total }
    }
    logger.error("WhatsApp proof: no se pudo ligar el comprobante:", updateError)
    await removeOrphan()
    return { kind: "error", detail: "order_update_failed" }
  }
  if (!updated || updated.length === 0) {
    await removeOrphan()
    return { kind: "order_not_pending", orderId }
  }

  await registerProofForStaff(supabase, { orderId, total, path, linked: true })
  logger.info("whatsapp.payment_proof.attached", { orderId, path })
  return { kind: "attached", orderId, total }
}

/**
 * Registro para staff, espejo de cómo la ruta web deja el
 * comprobante a la vista del panel: fila de bitácora en
 * `whatsapp_messages` ligada al pedido y aviso al número de staff.
 * Best-effort en ambas patas: el comprobante ya está guardado.
 */
async function registerProofForStaff(
  supabase: ServiceClient,
  args: { orderId: number; total: number; path: string; linked: boolean }
): Promise<void> {
  try {
    const { error } = await supabase.from("whatsapp_messages").insert({
      from_number: WHATSAPP_NUMBER,
      message_type: "workflow:payment_proof",
      content: JSON.stringify({ order_id: args.orderId, path: args.path, linked: args.linked }),
      order_id: args.orderId,
      direction: "outbound",
    })
    if (error) logger.error("WhatsApp proof: no se pudo registrar en la bitácora:", error)
  } catch (err) {
    logger.error("WhatsApp proof: error registrando en la bitácora:", err)
  }

  await sendTextMessage({
    to: WHATSAPP_NUMBER,
    text:
      `🧾 *Comprobante recibido* — Pedido *#${args.orderId}* ($${args.total.toFixed(2)} MXN)\n\n` +
      "El cliente mandó la foto de su pago por WhatsApp y quedó adjunta a su pedido. " +
      "Revísala en el panel para confirmar el pago.",
  }).catch((err) => logger.error("WhatsApp proof: aviso a staff falló:", err))
}

// ============================================================
// Entrada del webhook: imagen recibida
// ============================================================

export type WhatsAppProofImageResult =
  | { kind: "none" }
  | { kind: "attached"; orderId: number; total: number }
  | { kind: "stored_unlinked"; orderId: number; total: number }
  | { kind: "clarify"; candidates: ProofCandidateOrder[] }
  | { kind: "invalid_file"; orderId: number; error: string }
  | { kind: "order_not_pending"; orderId: number }
  | { kind: "error"; detail: string }

/**
 * Una imagen entrante: si el teléfono tiene pedidos pendientes de
 * pago, la trata como su comprobante. Sin candidatos devuelve "none"
 * y el webhook la deja pasar sin responder (comportamiento actual
 * para imágenes que no son comprobante de nada identificable).
 */
export async function handleWhatsAppProofImage(
  supabase: ServiceClient,
  input: { from: string; mediaId: string }
): Promise<WhatsAppProofImageResult> {
  const candidates = await findProofCandidateOrders(supabase, input.from)
  if (candidates.length === 0) return { kind: "none" }

  const only = candidates[0]
  if (candidates.length === 1 && only) {
    return attachWhatsAppPaymentProof(supabase, { orderId: only.id, mediaId: input.mediaId })
  }

  // Ambigüedad: la foto queda en espera en la bitácora y se pregunta
  // a cuál pedido corresponde. La respuesta numerada la retoma
  // handleWhatsAppProofClarification.
  try {
    const { error } = await supabase.from("whatsapp_messages").insert({
      from_number: input.from,
      message_type: "workflow:proof_clarify",
      content: JSON.stringify({
        media_id: input.mediaId,
        order_ids: candidates.map((c) => c.id),
        resolved: false,
      }),
      direction: "outbound",
    })
    if (error) logger.error("WhatsApp proof: no se pudo guardar la aclaración:", error)
  } catch (err) {
    logger.error("WhatsApp proof: error guardando la aclaración:", err)
  }

  return { kind: "clarify", candidates }
}

export type WhatsAppProofClarificationResult =
  | { kind: "none" }
  | { kind: "attached"; orderId: number; total: number }
  | { kind: "stored_unlinked"; orderId: number; total: number }
  | { kind: "invalid_file"; orderId: number; error: string }
  | { kind: "invalid_choice"; orderIds: number[] }
  | { kind: "order_not_pending"; orderId: number }
  | { kind: "error"; detail: string }

/** Ventana para responder la aclaración (la misma del flujo: 48 h). */
const PROOF_CLARIFY_WINDOW_MS = 48 * 60 * 60 * 1000

/**
 * La respuesta numerada a "¿a cuál pedido corresponde tu
 * comprobante?". Solo actúa si el texto es un número pelado y hay
 * una aclaración abierta reciente para el teléfono; en cualquier
 * otro caso devuelve "none" y el mensaje sigue su routing normal.
 */
export async function handleWhatsAppProofClarification(
  supabase: ServiceClient,
  input: { from: string; text: string }
): Promise<WhatsAppProofClarificationResult> {
  const text = input.text.trim()
  if (!/^\d+$/.test(text)) return { kind: "none" }
  const pick = Number(text)

  const { data: rows, error } = await supabase
    .from("whatsapp_messages")
    .select("id, content, created_at")
    .eq("from_number", input.from)
    .eq("message_type", "workflow:proof_clarify")
    .order("created_at", { ascending: false })
    .limit(5)
  if (error) {
    logger.error("WhatsApp proof: consulta de aclaraciones falló:", error)
    return { kind: "none" }
  }

  const cutoff = Date.now() - PROOF_CLARIFY_WINDOW_MS
  let pending: { id: number; mediaId: string; orderIds: number[] } | null = null
  for (const row of (rows ?? []) as { id: number; content: string | null; created_at: string }[]) {
    if (new Date(row.created_at).getTime() < cutoff) continue
    try {
      const parsed = JSON.parse(row.content ?? "{}") as {
        media_id?: string
        order_ids?: number[]
        resolved?: boolean
      }
      if (parsed.resolved || !parsed.media_id || !Array.isArray(parsed.order_ids)) continue
      pending = { id: row.id, mediaId: parsed.media_id, orderIds: parsed.order_ids }
      break
    } catch {
      continue
    }
  }
  if (!pending) return { kind: "none" }

  const orderId = pending.orderIds[pick - 1]
  if (orderId === undefined) return { kind: "invalid_choice", orderIds: pending.orderIds }

  const result = await attachWhatsAppPaymentProof(supabase, {
    orderId,
    mediaId: pending.mediaId,
  })

  if (result.kind === "attached" || result.kind === "stored_unlinked") {
    // Cerrar la aclaración para que un número suelto posterior no
    // vuelva a ligar la misma foto a otro pedido.
    const { error: closeError } = await supabase
      .from("whatsapp_messages")
      .update({
        content: JSON.stringify({
          media_id: pending.mediaId,
          order_ids: pending.orderIds,
          resolved: true,
          resolved_order_id: orderId,
        }),
      })
      .eq("id", pending.id)
    if (closeError) logger.error("WhatsApp proof: no se pudo cerrar la aclaración:", closeError)
  }

  return result
}
