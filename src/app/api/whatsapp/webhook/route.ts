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
import { verifyWebhook } from "@/lib/whatsapp"

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
      console.error("WhatsApp webhook: WHATSAPP_APP_SECRET no configurado")
      return NextResponse.json({ error: "Not configured" }, { status: 503 })
    }
    if (!verifySignature(req, rawBody, appSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const body = JSON.parse(rawBody)

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
    console.error("WhatsApp webhook error:", err)
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
// Handlers
// ============================================================

async function handleIncomingMessage(
  message: Record<string, unknown>,
  value: Record<string, unknown>
) {
  const metadata = value.metadata as Record<string, unknown> | undefined
  const from = (message.from as string) || metadata?.display_phone_number || "unknown"
  const messageType = (message.type as string) || "unknown"

  // Registro estructurado del evento entrante. El almacenamiento en
  // `whatsapp_messages` queda pendiente de decidir el modelo de tenant:
  // esa tabla exige `store_id` (esquema B2B, BIGINT) y FoodOS usa UUID
  // de `foodos_restaurants`, por lo que no hay mapeo fiable aún.
  console.log(
    JSON.stringify({
      event: "whatsapp.incoming",
      from,
      type: messageType,
      messageId: message.id ?? null,
      timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : null,
      content:
        messageType === "text" && message.text
          ? (message.text as { body?: string }).body ?? null
          : null,
    })
  )

  // TODO: Route message based on type:
  //   - text → Check for order keywords, product queries
  //   - interactive → Handle button/list replies
  //   - order → Process WhatsApp Commerce order
  //   - button → Handle template button clicks

  // Auto-reply for text messages (simple echo for now)
  if (messageType === "text" && message.text) {
    const text = (message.text as { body: string }).body.toLowerCase()

    // TODO: Implement NLP / keyword routing
    if (text.includes("pedido") || text.includes("orden")) {
      // TODO: Look up recent orders for this phone number
    }

    if (text.includes("catálogo") || text.includes("productos")) {
      // TODO: Send catalog link
    }

    if (text.includes("ayuda") || text.includes("soporte")) {
      // TODO: Route to support or send FAQ
    }
  }
}

async function handleMessageStatus(
  status: Record<string, unknown>,
  _value: Record<string, unknown>
) {
  // status.id = message ID
  // status.status = "sent" | "delivered" | "read" | "failed"
  // status.timestamp = when the status changed
  // status.recipient_id = phone number
  console.log(
    JSON.stringify({
      event: "whatsapp.status",
      messageId: status.id ?? null,
      status: status.status ?? null,
      recipientId: status.recipient_id ?? null,
      timestamp: status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : null,
    })
  )
  // TODO: Update message status in Supabase (depende del modelo de tenant)
}
