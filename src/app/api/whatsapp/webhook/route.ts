/**
 * WhatsApp Webhook Endpoint
 * POST /api/whatsapp/webhook
 * 
 * Handles:
 * - GET: Webhook verification (Meta challenge)
 * - POST: Incoming messages, status updates, and other notifications
 * 
 * Setup in Meta Business App:
 * 1. Configure webhook URL: https://resurte.me/api/whatsapp/webhook
 * 2. Set verify token: WHATSAPP_WEBHOOK_VERIFY_TOKEN env var
 * 3. Subscribe to: messages, message_statuses
 */

import { createHmac, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { verifyWebhook, sendTextMessage } from "@/lib/whatsapp"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

// ============================================================
// GET — Webhook Verification
// ============================================================

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (!mode || !token || !challenge) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
  }

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || ""

  const verified = verifyWebhook(mode, token, challenge, verifyToken)

  if (verified) {
    return new NextResponse(verified, { status: 200 })
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 })
}

// ============================================================
// POST — Incoming WhatsApp Events
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()

    // Fail-closed: sin app secret configurado no se aceptan eventos.
    const appSecret = process.env.WHATSAPP_APP_SECRET
    if (!appSecret) {
      logger.error("WhatsApp webhook: WHATSAPP_APP_SECRET no configurado")
      return NextResponse.json({ error: "Not configured" }, { status: 503 })
    }
    if (!verifySignature(req, rawBody, appSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const body: WhatsAppBody = JSON.parse(rawBody)

    // Meta sends an array of entries, each containing changes
    if (!body.entry || !Array.isArray(body.entry)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    for (const entry of body.entry) {
      if (!entry.changes) continue

      for (const change of entry.changes) {
        const value = change.value

        // Handle incoming messages
        if (value.messages && Array.isArray(value.messages)) {
          for (const message of value.messages) {
            await handleIncomingMessage(message, value)
          }
        }

        // Handle message status updates (sent, delivered, read, failed)
        if (value.statuses && Array.isArray(value.statuses)) {
          for (const status of value.statuses) {
            await handleMessageStatus(status, value)
          }
        }
      }
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    logger.error("WhatsApp webhook error:", err)
    // Always return 200 to Meta — otherwise they'll retry
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 200 })
  }
}

/**
 * Valida X-Hub-Signature-256 (HMAC-SHA256 del body crudo con el
 * app secret de Meta) usando comparación en tiempo constante.
 */
function verifySignature(
  req: NextRequest,
  rawBody: string,
  appSecret: string
): boolean {
  const signature = req.headers.get("x-hub-signature-256") ?? ""
  const expected = signature.replace(/^sha256=/, "")
  if (!expected) return false
  const digest = createHmac("sha256", appSecret).update(rawBody).digest("hex")
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(digest, "utf8")
  return a.length === b.length && timingSafeEqual(a, b)
}

// ============================================================
// Tipos del payload de Meta (Graph API webhook)
// ============================================================

interface WhatsAppTextPayload {
  body?: string
}

interface WhatsAppMessage {
  from?: string
  id?: string
  timestamp?: string | number
  type?: string
  text?: WhatsAppTextPayload
  interactive?: unknown
}

interface WhatsAppValue {
  messages?: WhatsAppMessage[]
  statuses?: WhatsAppStatus[]
  metadata?: { display_phone_number?: string }
}

interface WhatsAppStatus {
  id?: string
  status?: string
  recipient_id?: string
  timestamp?: string | number
}

interface WhatsAppChange {
  value: WhatsAppValue
}

interface WhatsAppEntry {
  changes?: WhatsAppChange[]
}

interface WhatsAppBody {
  entry?: WhatsAppEntry[]
}

// ============================================================
// Handlers
// ============================================================

async function handleIncomingMessage(message: WhatsAppMessage, value: WhatsAppValue) {
  const metadata = value.metadata
  const from =
    message.from ||
    metadata?.display_phone_number ||
    "unknown"
  const messageType = message.type || "unknown"
  const messageId = message.id || null

  // Contenido estructurado (texto simple por ahora; interactive/button
  // se registran igualmente con su tipo para auditoría).
  let content: string | null = null
  if (messageType === "text" && message.text) {
    content = message.text.body ?? null
  } else if (messageType === "interactive" && message.interactive) {
    content = JSON.stringify(message.interactive)
  }

  // Persistir el mensaje entrante en whatsapp_messages (service_role:
  // RLS 00034 restringe estas tablas a service client). store_id se
  // resuelve con el DEFAULT de la tienda activa (migración 00032).
  const supabase = await createServiceClient()
  try {
    const { error } = await supabase.from("whatsapp_messages").insert({
      from_number: from,
      message_type: `incoming:${messageType}`,
      content,
      direction: "inbound",
      message_id: messageId,
    })
    if (error) {
      logger.error("WhatsApp webhook: failed to persist incoming message:", error)
    }
  } catch (err) {
    logger.error("WhatsApp webhook: unexpected error persisting message:", err)
  }

  logger.info("whatsapp.incoming", {
    messageId,
    type: messageType,
    timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : null,
  })

  // Routing NLP por keywords — solo mensajes de texto reciben respuesta
  // (los replies de templates/interactive requieren el ID del botón).
  if (messageType === "text" && content) {
    const text = content.toLowerCase()

    if (text.includes("pedido") || text.includes("orden") || text.includes("mi pedido")) {
      await handleOrderLookup(from)
      return
    }

    if (text.includes("catálogo") || text.includes("catalogo") || text.includes("productos") || text.includes("menú") || text.includes("menu")) {
      await sendCatalogLink(from)
      return
    }

    if (text.includes("ayuda") || text.includes("soporte") || text.includes("contacto")) {
      await sendSupportInfo(from)
      return
    }

    // Fallback de bienvenida: orienta al usuario a los comandos disponibles.
    await sendTextMessage({
      to: from,
      text: "¡Hola! 👋 Puedo ayudarte con:\n\n" +
        "📦 *Tu pedido* — escríbeme \"mi pedido\" para ver el estado.\n" +
        "🛍️ *Catálogo* — escríbeme \"catálogo\" y te envío el link.\n" +
        "❓ *Ayuda* — escríbeme \"ayuda\" para hablar con soporte.",
    }).catch((err) => logger.error("WhatsApp webhook: fallback reply failed:", err))
  }
}

/** Busca el perfil por teléfono (últimos 10 dígitos) y responde con el estado del último pedido. */
async function handleOrderLookup(from: string) {
  // Meta envía el número en formato internacional sin '+': 5215512345678.
  // profiles.phone puede estar como "+52 1 55..." o "5512345678": comparar
  // por los últimos 10 dígitos cubre ambos formatos de forma fiable.
  const digits = from.replace(/\D/g, "")
  const last10 = digits.slice(-10)
  if (last10.length < 10) {
    await sendTextMessage({
      to: from,
      text: "No pude identificar tu número para buscar tu pedido. Escríbenos a soporte por favor.",
    }).catch(() => {})
    return
  }

  const supabase = await createServiceClient()

  // 1) Encontrar el perfil cuyo teléfono termina en los mismos 10 dígitos.
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .ilike("phone", `%${last10}`)
    .limit(1)

  if (profileError) {
    logger.error("WhatsApp webhook: profile lookup failed:", profileError)
    return
  }

  const profile = profiles?.[0]
  if (!profile) {
    await sendTextMessage({
      to: from,
      text: "No encontramos un pedido asociado a este número. Si acabas de hacer tu primer pedido, ¡gracias! 🎉\n\n¿Quieres ver el *catálogo*? Escríbeme \"catálogo\".",
    }).catch(() => {})
    return
  }

  // 2) Último pedido del usuario, con su ciudad para contexto.
  const { data: orders, error: orderError } = await supabase
    .from("orders")
    .select(`
      id,
      status,
      total,
      created_at,
      city:cities(name)
    `)
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)

  if (orderError) {
    logger.error("WhatsApp webhook: order lookup failed:", orderError)
    return
  }

  const order = orders?.[0]
  if (!order) {
    await sendTextMessage({
      to: from,
      text: "Aún no tienes pedidos registrados en Resurte. Cuando hagas tu primer pedido te avisamos aquí mismo. 📲",
    }).catch(() => {})
    return
  }

  const statusLabel: Record<string, string> = {
    pending: "pendiente de confirmación",
    confirmed: "confirmado ✅",
    preparing: "en preparación 👨‍🍳",
    out_for_delivery: "en camino 🛵",
    delivered: "entregado 🎉",
    cancelled: "cancelado ❌",
  }
  const city = (order.city as { name?: string } | null)?.name || "tu ciudad"
  const total = Number(order.total).toFixed(2)

  await sendTextMessage({
    to: from,
    text: `Hola ${profile.full_name || ""} 👋\n\nTu pedido *#${order.id}* (${city}) está: *${statusLabel[order.status as string] || order.status}*\n\nTotal: $${total} MXN\n\n¿Necesitas algo más? Escríbeme \"ayuda\" o \"catálogo\".`,
  }).catch((err) => logger.error("WhatsApp webhook: order status reply failed:", err))
}

async function sendCatalogLink(from: string) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://resurte.me"
  await sendTextMessage({
    to: from,
    text: "¡Claro! Aquí tienes nuestro catálogo: 🛍️",
    preview_url: true,
  }).catch(() => {})
  await sendTextMessage({
    to: from,
    text: `${siteUrl}/comer`,
    preview_url: true,
  }).catch((err) => logger.error("WhatsApp webhook: catalog link reply failed:", err))
}

async function sendSupportInfo(from: string) {
  await sendTextMessage({
    to: from,
    text: "¿Necesitas ayuda? 🙋\n\n📞 Escríbenos a *hola@resurte.me* o responde con tu duda y un agente te atenderá en horario de 9:00 a 21:00.\n\nTambién puedes consultar el estado de tu pedido escribiendo \"mi pedido\".",
  }).catch((err) => logger.error("WhatsApp webhook: support reply failed:", err))
}

async function handleMessageStatus(status: WhatsAppStatus, _value: WhatsAppValue) {
  const messageId = status.id || null
  const statusValue = status.status || null

  logger.info("whatsapp.status", {
    messageId,
    status: statusValue,
    timestamp: status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : null,
  })

  if (!messageId || !statusValue) return

  // Actualizar el status del mensaje original en whatsapp_messages
  // (columna message_id, migración 00041) vía service client.
  const supabase = await createServiceClient()
  try {
    const { error } = await supabase
      .from("whatsapp_messages")
      .update({ status: statusValue })
      .eq("message_id", messageId)
    if (error) {
      logger.error("WhatsApp webhook: status update failed:", error)
    }
  } catch (err) {
    logger.error("WhatsApp webhook: unexpected error on status update:", err)
  }
}
