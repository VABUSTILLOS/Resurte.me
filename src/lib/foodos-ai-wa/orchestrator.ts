// ============================================================
// Mesero IA — orquestador de una conversación de WhatsApp.
//
// Pega las cuatro piezas de la Fase 2:
//   context.ts       → cargar restaurante, menú y ajustes
//   state-machine.ts → decidir el siguiente turno (puro, sin red)
//   polish.ts        → reescribir el tono con el LLM (opcional)
//   foodos-order-create.ts → crear el pedido (productor único)
//
// Reglas de oro:
//   · El modelo NUNCA calcula precios ni totales.
//   · Los mensajes con dinero no pasan por el LLM (`rephraseable: false`).
//   · Si algo falla, se degrada al enlace de pedido. Nunca se deja al
//     cliente sin salida.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { dayKeyOf } from "@/lib/local-date"
import { getOpenStatus } from "@/lib/foodos"
import { createFoodosOrder } from "@/lib/foodos-order-create"
import { getRestaurantWhatsAppConfig } from "@/lib/foodos-whatsapp"
import { sendTextMessage } from "@/lib/whatsapp"
import type { FoodosBranchHours } from "@/types/foodos"
import {
  loadMeseroContext,
  loadSession,
  meseroConfig,
  siteOrigin,
  type MeseroContext,
} from "./context"
import { advance, type MeseroSession, type MeseroTurn } from "./state-machine"
import { polishReply } from "./polish"

/** Tope duro de mensajes que la IA guarda por sesión (evita historiales infinitos). */
const MAX_STORED_MESSAGES = 200

export interface MeseroHandleInput {
  supabase: SupabaseClient
  restaurantId: string
  /** Teléfono tal como llega de Meta (con o sin prefijo). */
  from: string
  text: string
  /** id del mensaje de Meta, para deduplicar. */
  messageId?: string | null
}

export type MeseroHandleResult =
  | { handled: false }
  | {
      handled: true
      /** `true` si se envió una respuesta al cliente. */
      replied: boolean
      /** id del pedido si el Mesero IA lo creó. */
      orderId?: string
      state: MeseroSession["state"]
    }

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "")
}

/**
 * ¿Alguna sucursal del restaurante está abierta ahora?
 * Si no hay horarios configurados, se considera abierto (mismo criterio que
 * `getOpenStatus`).
 */
async function anyBranchOpen(
  supabase: SupabaseClient,
  restaurantId: string,
  timezone: string
): Promise<boolean> {
  const { data: branches } = await supabase
    .from("foodos_branches")
    .select("id")
    .eq("restaurant_id", restaurantId)
  const ids = (branches ?? []).map((b) => b.id)
  if (!ids.length) return true

  const { data: hours } = await supabase
    .from("foodos_branch_hours")
    .select("id, branch_id, day_of_week, open_time, close_time, is_closed")
    .in("branch_id", ids)
  if (!hours?.length) return true

  const byBranch = new Map<string, FoodosBranchHours[]>()
  for (const row of hours) {
    const list = byBranch.get(row.branch_id) ?? []
    list.push(row as FoodosBranchHours)
    byBranch.set(row.branch_id, list)
  }
  for (const list of byBranch.values()) {
    if (getOpenStatus(list, timezone).isOpen) return true
  }
  return false
}

async function persistMessage(
  supabase: SupabaseClient,
  sessionId: string | null,
  restaurantId: string,
  direction: "inbound" | "outbound" | "human",
  content: string,
  extra: { source?: "llm" | "template"; tokensUsed?: number | null; stateBefore?: string; stateAfter?: string } = {}
) {
  if (!sessionId) return
  const { error } = await supabase.from("foodos_ai_messages").insert({
    session_id: sessionId,
    restaurant_id: restaurantId,
    direction,
    content: content.slice(0, 4000),
    source: extra.source ?? null,
    tokens_used: extra.tokensUsed ?? null,
    state_before: extra.stateBefore ?? null,
    state_after: extra.stateAfter ?? null,
  })
  if (error) logger.warn("[Mesero IA] No se pudo guardar el mensaje", { code: error.code })
}

/** Crea la sesión si no existe y devuelve su id. */
async function ensureSessionId(
  supabase: SupabaseClient,
  restaurantId: string,
  customerPhone: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("foodos_ai_sessions")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("customer_phone", customerPhone)
    .maybeSingle()
  if (existing?.id) return existing.id

  const { data: created, error } = await supabase
    .from("foodos_ai_sessions")
    .insert({
      restaurant_id: restaurantId,
      customer_phone: customerPhone,
      state: "greeting",
      draft: {},
      pending_question: "ask_intent",
    })
    .select("id")
    .single()
  if (error) {
    logger.warn("[Mesero IA] No se pudo crear la sesión", { code: error.code })
    return null
  }
  return created?.id ?? null
}

/**
 * Procesa un mensaje entrante y responde si corresponde.
 * Nunca lanza: cualquier fallo se registra y se devuelve `handled: false`
 * (o `handled: true` sin respuesta) para que el webhook siga su curso.
 */
export async function handleMeseroMessage(input: MeseroHandleInput): Promise<MeseroHandleResult> {
  const { supabase, restaurantId, from, text } = input
  const customerPhone = digitsOnly(from)

  try {
    const ctx = await loadMeseroContext(supabase, restaurantId)
    if (!ctx) return { handled: false }

    const loaded = await loadSession(supabase, restaurantId, customerPhone)
    const sessionId = loaded.id ?? (await ensureSessionId(supabase, restaurantId, customerPhone))

    const config = meseroConfig(ctx.settings)
    const session: MeseroSession = loaded.session

    // ── Guarda 1: handoff humano activo ────────────────────────
    // La IA no responde, pero sí registra el mensaje para que el humano lo vea.
    if (loaded.handoffAt) {
      await persistMessage(supabase, sessionId, restaurantId, "inbound", text)
      return { handled: true, replied: false, state: session.state }
    }

    // ── Guarda 2: solo en horario de atención ──────────────────
    if (ctx.settings.businessHoursOnly) {
      const open = await anyBranchOpen(supabase, restaurantId, ctx.timezone)
      if (!open) {
        await persistMessage(supabase, sessionId, restaurantId, "inbound", text)
        return { handled: true, replied: false, state: session.state }
      }
    }

    // ── Guarda 3: tope diario de respuestas ────────────────────
    const today = dayKeyOf(ctx.timezone)
    const repliesToday = loaded.repliesDay === today ? loaded.repliesToday : 0
    if (repliesToday >= ctx.settings.dailyReplyCap) {
      await persistMessage(supabase, sessionId, restaurantId, "inbound", text)
      logger.warn("[Mesero IA] Tope diario de respuestas alcanzado", { restaurantId })
      return { handled: true, replied: false, state: session.state }
    }

    await persistMessage(supabase, sessionId, restaurantId, "inbound", text, {
      stateBefore: session.state,
    })

    // ── Decisión (puro) ────────────────────────────────────────
    const turn: MeseroTurn = advance({ session, text, menu: ctx.menu, config })

    if (turn.state === "handoff" && !turn.reply) {
      // La máquina pidió silencio: el humano toma el control.
      await markHandoff(supabase, sessionId, restaurantId, turn)
      return { handled: true, replied: false, state: turn.state }
    }

    // ── Redacción (LLM solo si el turno lo permite) ────────────
    const polished = await polishReply({
      turn,
      tone: ctx.settings.tone,
      restaurantName: ctx.restaurantName,
      restaurantId,
    })
    let outgoing = polished.text.trim()

    // ── Envío ──────────────────────────────────────────────────
    const waConfig = await getRestaurantWhatsAppConfig(supabase, restaurantId)
    if (!waConfig) {
      logger.warn("[Mesero IA] Restaurante sin conexión de WhatsApp", { restaurantId })
      await markHandoff(supabase, sessionId, restaurantId, turn)
      return { handled: true, replied: false, state: turn.state }
    }

    let orderId: string | null = null
    if (turn.action === "create_order") {
      const created = await placeOrder({ supabase, ctx, session: turn, customerPhone })
      if (created) {
        orderId = created.orderId
        outgoing = `${outgoing}\n\n${confirmationBlock(ctx, created.slug, created.orderId)}`
      } else {
        // Degradación: no se pierde la conversación ni el pedido.
        outgoing = `${outgoing}\n\n${fallbackBlock(ctx)}`
      }
    }

    const sent = await sendTextMessage({ to: customerPhone, text: outgoing }, waConfig)
    if (!sent) logger.warn("[Mesero IA] WhatsApp no confirmó el envío", { restaurantId })

    await persistMessage(supabase, sessionId, restaurantId, "outbound", outgoing, {
      source: polished.source === "llm" ? "llm" : "template",
      tokensUsed: polished.tokensUsed,
      stateBefore: session.state,
      stateAfter: turn.state,
    })

    await saveSession(supabase, {
      sessionId,
      restaurantId,
      turn,
      orderId,
      repliesToday: repliesToday + 1,
      day: today,
    })

    if (turn.action === "handoff" || turn.state === "handoff") {
      await markHandoff(supabase, sessionId, restaurantId, turn)
    }

    return { handled: true, replied: true, state: turn.state, ...(orderId ? { orderId } : {}) }
  } catch (err) {
    // Un fallo del Mesero IA nunca debe tumbar el webhook: se registra y se
    // deja que el flujo normal (catálogo) continúe.
    logger.error("[Mesero IA] Fallo al procesar el mensaje", err, { restaurantId })
    return { handled: false }
  }
}

function confirmationBlock(ctx: MeseroContext, slug: string | null, orderId: string): string {
  const link = `${siteOrigin()}/r/${slug ?? ctx.restaurantSlug}/pedido/${orderId}`
  return `📋 Sigue tu pedido aquí: ${link}`
}

function fallbackBlock(ctx: MeseroContext): string {
  return `No pude registrar el pedido automáticamente 😔\nPuedes completarlo aquí: ${ctx.menu.orderLink}`
}

async function placeOrder(args: {
  supabase: SupabaseClient
  ctx: MeseroContext
  session: MeseroTurn
  customerPhone: string
}): Promise<{ orderId: string; slug: string | null } | null> {
  const { supabase, ctx, session, customerPhone } = args
  const draft = session.draft

  // Los precios se vuelven a resolver contra el menú real dentro de
  // createFoodosOrder; aquí solo se traduce el borrador.
  const items = draft.items.map((line) => ({
    item_id: line.item_id,
    name: line.name,
    price: line.price,
    qty: line.qty,
    combo_id: line.combo_id,
  }))
  if (!items.length) return null

  const isDelivery = draft.fulfillment === "delivery"
  const noteParts: string[] = []
  if (isDelivery && draft.address) noteParts.push(`Entrega: ${draft.address}`)
  if (draft.note) noteParts.push(draft.note)
  noteParts.push("Pedido tomado por el Mesero IA de WhatsApp")

  const result = await createFoodosOrder(supabase, {
    restaurant_id: ctx.restaurantId,
    items,
    channel: "whatsapp",
    fulfillment: draft.fulfillment ?? "pickup",
    // El Mesero IA no cobra en línea: se liquida al entregar/recoger.
    payment_method: null,
    customer_name: draft.name ?? null,
    customer_phone: customerPhone,
    note: noteParts.join(" · "),
    table_number: draft.tableNumber ?? null,
  })

  if (!result.ok) {
    logger.warn("[Mesero IA] No se pudo crear el pedido", {
      status: result.status,
      error: result.error,
    })
    return null
  }
  return { orderId: result.orderId, slug: result.slug }
}

async function markHandoff(
  supabase: SupabaseClient,
  sessionId: string | null,
  restaurantId: string,
  turn: MeseroTurn
) {
  if (!sessionId) return
  const { error } = await supabase
    .from("foodos_ai_sessions")
    .update({
      state: "handoff",
      pending_question: null,
      draft: turn.draft,
      handoff_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("restaurant_id", restaurantId)
  if (error) logger.warn("[Mesero IA] No se pudo marcar el handoff", { code: error.code })
}

async function saveSession(
  supabase: SupabaseClient,
  args: {
    sessionId: string | null
    restaurantId: string
    turn: MeseroTurn
    orderId: string | null
    repliesToday: number
    day: string
  }
) {
  if (!args.sessionId) return
  const now = new Date().toISOString()

  const { data: current } = await supabase
    .from("foodos_ai_sessions")
    .select("message_count")
    .eq("id", args.sessionId)
    .maybeSingle()

  const nextCount = Math.min((current?.message_count ?? 0) + 2, MAX_STORED_MESSAGES)

  const patch: Record<string, unknown> = {
    state: args.turn.state,
    pending_question: args.turn.pendingQuestion,
    draft: args.turn.draft,
    replies_today: args.repliesToday,
    replies_day: args.day,
    message_count: nextCount,
    last_message_at: now,
  }
  if (args.orderId) patch.order_id = args.orderId
  // Al llegar a "done" o "handoff" se cierra el handoff pendiente.
  if (args.turn.state === "done") patch.handoff_at = null

  const { error } = await supabase
    .from("foodos_ai_sessions")
    .update(patch)
    .eq("id", args.sessionId)
    .eq("restaurant_id", args.restaurantId)
  if (error) logger.warn("[Mesero IA] No se pudo guardar la sesión", { code: error.code })
}
