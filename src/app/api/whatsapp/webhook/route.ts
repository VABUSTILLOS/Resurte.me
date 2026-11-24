/**
 * WhatsApp Webhook Endpoint
 * POST /api/whatsapp/webhook
 * 
 * Handles:
 * - GET: Webhook verification (Meta challenge)
 * - POST: Incoming messages, status updates, and other notifications
 * - POST: mensajes de pedido del catálogo (type "order") → se convierten
 *   en pedidos de la tienda vía src/lib/whatsapp-orders.ts
 *
 * Setup in Meta Business App:
 * 1. Configure webhook URL: https://resurte.me/api/whatsapp/webhook
 * 2. Set verify token: WHATSAPP_WEBHOOK_VERIFY_TOKEN env var
 * 3. Subscribe to: messages, message_statuses
 */

import { createHmac, timingSafeEqual } from "crypto"
import { after, NextRequest, NextResponse } from "next/server"
import { verifyWebhook, sendTextMessage } from "@/lib/whatsapp"
import {
  captureWhatsAppOrderAddress,
  createWhatsAppOrder,
  findProfileByPhone,
} from "@/lib/whatsapp-orders"
import { getSpeiAccount, formatClabe } from "@/lib/spei-account"
import { runNewOrderWorkflows } from "@/lib/workflows"
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

/** Pedido del catálogo tal como lo manda Meta en un mensaje type "order". */
interface WhatsAppOrderPayload {
  catalog_id?: string
  /** Nota opcional que el cliente adjunta al enviar el pedido. */
  text?: string
  product_items?: {
    product_retailer_id: string
    quantity: number
    /** Precio del catálogo al momento del pedido. NO es de confiar: se recalcula contra la BD. */
    item_price?: number
    currency?: string
  }[]
}

interface WhatsAppMessage {
  from?: string
  id?: string
  timestamp?: string | number
  type?: string
  text?: WhatsAppTextPayload
  interactive?: unknown
  order?: WhatsAppOrderPayload
}

interface WhatsAppValue {
  messages?: WhatsAppMessage[]
  statuses?: WhatsAppStatus[]
  metadata?: { display_phone_number?: string; phone_number_id?: string }
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
// Routing FoodOS: mensajes a números de restaurantes conectados
// ============================================================

/**
 * Si el phone_number_id destino pertenece a un restaurante FoodOS:
 * 1. Guarda el mensaje en foodos_whatsapp_messages (su inbox).
 * 2. Si tiene auto_reply_catalog activo, responde con el catálogo
 *    ORDENADO (product_list) — solo una vez por conversación de 24h.
 * Devuelve true si el mensaje fue manejado por FoodOS.
 */
async function handleFoodosIncoming(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  phoneNumberId: string,
  from: string,
  messageType: string,
  content: string | null,
  messageId: string | null
): Promise<boolean> {
  const { data: conn } = await supabase
    .from("foodos_whatsapp_connections")
    .select("restaurant_id, auto_reply_catalog, auto_reply_text")
    .eq("phone_number_id", phoneNumberId)
    .eq("status", "connected")
    .maybeSingle()
  if (!conn) return false

  const { error } = await supabase.from("foodos_whatsapp_messages").insert({
    restaurant_id: conn.restaurant_id,
    wa_message_id: messageId,
    direction: "inbound",
    customer_phone: from,
    type: messageType,
    content,
    status: "received",
  })
  if (error) {
    logger.error("FoodOS webhook: failed to persist message:", error)
  }

  // ── Mesero IA ───────────────────────────────────────────────
  // Se intenta ANTES del catálogo: quien activó el Mesero IA quiere que la IA
  // atienda, no que se le dispare una lista de productos. Solo aplica a texto;
  // las respuestas del catálogo interactivo no pasan por la IA.
  if (messageType === "text" && content) {
    try {
      const { handleMeseroMessage } = await import("@/lib/foodos-ai-wa/orchestrator")
      const result = await handleMeseroMessage({
        supabase,
        restaurantId: conn.restaurant_id,
        from,
        text: content,
        messageId,
      })
      if (result.handled) return true
    } catch (e) {
      // Si la IA falla, se cae al catálogo en vez de dejar al cliente sin
      // respuesta.
      logger.error("FoodOS Mesero IA error:", e)
    }
  }

  if (conn.auto_reply_catalog) {
    try {
      // Evitar loop de auto-respuestas: solo si no se respondió ya en 24h.
      const since = new Date(Date.now() - 86_400_000).toISOString()
      const { data: recent } = await supabase
        .from("foodos_whatsapp_messages")
        .select("id")
        .eq("restaurant_id", conn.restaurant_id)
        .eq("customer_phone", from)
        .eq("direction", "outbound")
        .gte("created_at", since)
        .limit(1)
      if (recent?.length) return true

      const wa = await import("@/lib/foodos-whatsapp")
      const [itemsRes, catsRes] = await Promise.all([
        supabase.from("foodos_menu_items").select("*").eq("restaurant_id", conn.restaurant_id),
        supabase.from("foodos_menu_categories").select("*").eq("restaurant_id", conn.restaurant_id),
      ])
      const sections = wa.buildProductListSections(itemsRes.data ?? [], catsRes.data ?? [])
      if (!sections.length) return true

      const config = await wa.getRestaurantWhatsAppConfig(supabase, conn.restaurant_id)
      if (!config) return true

      await wa.sendCatalogProductList({
        config,
        to: from.replace(/\D/g, ""),
        sections,
        headerText: "Nuestro menú",
        bodyText: conn.auto_reply_text || "Elige tus platillos favoritos:",
      })
      await supabase.from("foodos_whatsapp_messages").insert({
        restaurant_id: conn.restaurant_id,
        direction: "outbound",
        customer_phone: from,
        type: "product_list",
        content: `Catálogo auto-respuesta (${sections.reduce((s, x) => s + x.product_items.length, 0)} platillos)`,
        status: "sent",
      })
    } catch (e) {
      logger.error("FoodOS auto-reply error:", e)
    }
  }

  return true
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
  // se registran igualmente con su tipo para auditoría). Un pedido del
  // catálogo se persiste como el JSON completo del payload: es la
  // bitácora del intento aunque no se cree el pedido (p. ej. por no
  // llegar al mínimo).
  let content: string | null = null
  if (messageType === "text" && message.text) {
    content = message.text.body ?? null
  } else if (messageType === "interactive" && message.interactive) {
    content = JSON.stringify(message.interactive)
  } else if (messageType === "order" && message.order) {
    content = JSON.stringify(message.order)
  }

  const supabase = await createServiceClient()

  // Routing FoodOS: si el phone_number_id destino pertenece a un restaurante
  // conectado, el mensaje va a SU inbox (y puede disparar auto-respuesta con
  // el catálogo ordenado). No interfiere con el flujo del marketplace.
  if (metadata?.phone_number_id) {
    const handled = await handleFoodosIncoming(
      supabase,
      metadata.phone_number_id,
      from,
      messageType,
      content,
      messageId
    )
    if (handled) return
  }

  // Persistir el mensaje entrante en whatsapp_messages (service_role:
  // RLS 00034 restringe estas tablas a service client). store_id se
  // resuelve con el DEFAULT de la tienda activa (migración 00032).
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

  // Pedido del catálogo (type "order"): se convierte en un pedido de
  // la tienda ANTES del routing de texto. La creación es idempotente
  // por wamid (Meta reintenta los webhooks) y responde al cliente
  // según el resultado; ver handleOrderMessage.
  if (messageType === "order" && message.order) {
    await handleOrderMessage(supabase, { from, messageId, order: message.order })
    return
  }

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

    // Captura de dirección: si el teléfono tiene UN pedido reciente
    // esperando dirección, este texto libre ES la dirección (la
    // confirmación del pedido se la acaba de pedir). Va DESPUÉS de
    // las palabras clave: si el texto trae una, manda su flujo.
    const capture = await captureWhatsAppOrderAddress(supabase, { from, text: content })
    if (capture.kind === "captured") {
      await sendTextMessage({
        to: from,
        text:
          "✅ *¡Dirección registrada!*\n\n" +
          `Pedido *#${capture.orderId}* — Total: *$${capture.total.toFixed(2)} MXN*\n` +
          `📍 ${capture.addressText}\n\n` +
          "Con esto tu pedido queda completo. Te avisaremos cuando vaya en camino. 🛵",
      }).catch((err) => logger.error("WhatsApp webhook: address confirmation reply failed:", err))
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

/**
 * Pedido del catálogo (type "order"): lo convierte en un pedido de la
 * tienda con createWhatsAppOrder y responde al cliente según el
 * resultado. Todas las respuestas son texto libre dentro de la
 * ventana de servicio de 24 h que abre el propio mensaje del cliente.
 * Un duplicado (reintento de Meta) no responde ni crea nada de nuevo.
 */
async function handleOrderMessage(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  args: { from: string; messageId: string | null; order: WhatsAppOrderPayload }
) {
  const { from, messageId, order } = args

  const result = await createWhatsAppOrder(supabase, {
    from,
    waMessageId: messageId,
    catalogId: order.catalog_id ?? null,
    productItems: order.product_items ?? [],
    noteText: order.text ?? null,
  })

  switch (result.kind) {
    case "created": {
      // Mismos workflows que el checkout web (aviso a staff +
      // confirmación al cliente + email), sin bloquear la respuesta
      // a Meta.
      after(() => {
        void runNewOrderWorkflows(result.orderId)
      })
      const lines = [
        "¡Gracias por tu pedido! 🎉",
        "",
        `Ya lo recibimos y quedó registrado en Resurte con el *#${result.orderId}*.`,
        `Total: *$${result.total.toFixed(2)} MXN*`,
      ]
      if (result.unresolved.length > 0) {
        const named = result.unresolved
          .map((u) => u.name)
          .filter((n): n is string => Boolean(n))
        lines.push(
          "",
          named.length > 0
            ? `⚠️ No pudimos agregar: ${named.join(", ")}. Si los necesitas, escríbenos el nombre y la cantidad y los agregamos a tu pedido.`
            : "⚠️ Algunos productos de tu pedido no pudimos identificarlos. Si te falta algo, escríbenos el nombre y la cantidad."
        )
      }
      // Datos SPEI: la misma fuente única que muestra el checkout web
      // (src/lib/spei-account.ts). El cliente paga su pedido por
      // transferencia para que se le pueda entregar; el concepto es su
      // número de pedido, para conciliar el pago contra el pedido.
      const spei = getSpeiAccount()
      lines.push(
        "",
        "💳 *Paga tu pedido por transferencia SPEI:*",
        `CLABE: *${formatClabe(spei.clabe)}*`,
        `Banco: *${spei.banco}*`,
        `Beneficiario: *${spei.beneficiario}*`,
        `Concepto: *${result.orderId}* (tu número de pedido)`,
        `Monto exacto: *$${result.total.toFixed(2)} MXN*`,
        "",
        "En cuanto recibamos tu pago, preparamos tu pedido. 🛵"
      )
      lines.push(
        "",
        "Para entregártelo, compárteme tu *dirección completa* (calle, número, colonia, CP y alguna referencia) y el nombre de quien recibe. 📍"
      )
      await sendTextMessage({ to: from, text: lines.join("\n") }).catch((err) =>
        logger.error("WhatsApp webhook: order confirmation reply failed:", err)
      )
      break
    }
    case "below_minimum": {
      await sendTextMessage({
        to: from,
        text:
          `Tu pedido suma *$${result.subtotal.toFixed(2)} MXN* y el mínimo de compra es de *$${result.minimum.toFixed(2)} MXN*: te faltan *$${result.missingAmount.toFixed(2)} MXN*. 🙏\n\n` +
          "Agrega más productos desde el catálogo y vuelve a enviar tu pedido. 🛍️",
      }).catch((err) => logger.error("WhatsApp webhook: below-minimum reply failed:", err))
      break
    }
    case "no_resolvable_items": {
      await sendTextMessage({
        to: from,
        text:
          "No pude identificar los productos de tu pedido. 😕\n\n" +
          "Escríbeme tu pedido como texto (producto y cantidad) y lo registramos por aquí mismo.",
      }).catch((err) => logger.error("WhatsApp webhook: no-items reply failed:", err))
      break
    }
    case "insufficient_stock": {
      await sendTextMessage({
        to: from,
        text:
          `Algunos productos de tu pedido ya no tienen existencia suficiente: ${result.detail}.\n\n` +
          "Ajusta las cantidades en el catálogo y vuelve a enviar tu pedido, por favor. 🙏",
      }).catch((err) => logger.error("WhatsApp webhook: stock reply failed:", err))
      break
    }
    case "quantity_violation": {
      await sendTextMessage({
        to: from,
        text:
          `Tu pedido tiene cantidades fuera del rango permitido por producto: ${result.detail}.\n\n` +
          "Ajusta las cantidades en el catálogo y vuelve a enviar tu pedido, por favor. 🙏",
      }).catch((err) => logger.error("WhatsApp webhook: quantity-violation reply failed:", err))
      break
    }
    case "duplicate": {
      // Reintento de Meta: el pedido ya existe y ya se respondió.
      logger.info("whatsapp.order.duplicate_ignored", { messageId, orderId: result.orderId })
      break
    }
    case "error": {
      logger.error("WhatsApp webhook: order creation failed:", { detail: result.detail, messageId })
      break
    }
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

  // 1) Encontrar el perfil cuyo teléfono termina en los mismos 10 dígitos
  // (helper compartido con la creación de pedidos: whatsapp-orders.ts).
  const { profile, error: profileError } = await findProfileByPhone(supabase, from)

  if (profileError) {
    logger.error("WhatsApp webhook: profile lookup failed:", profileError)
    return
  }

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
