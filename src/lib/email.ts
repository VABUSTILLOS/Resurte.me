/**
 * Resend Email Sender — via REST API (no npm package needed)
 *
 * USAGE:
 *   1. Set RESEND_API_KEY in your .env.local
 *   2. Call sendEmail(...) from server-side code
 *   3. In dev, emails are logged instead of sent if RESEND_API_KEY is missing
 *
 * To use the official SDK instead: `npm install resend` and swap the fetch below.
 */

const RESEND_API = "https://api.resend.com/emails"
const FROM_DEFAULT = "Resurte.me <hola@resurte.me>"

import { logger } from "@/lib/logger"

export interface EmailPayload {
  to: string
  subject: string
  html: string
  from?: string
  replyTo?: string
  /** Tag for analytics grouping */
  tag?: string
}

export interface EmailResult {
  ok: boolean
  id?: string
  error?: string
}

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    // Dev fallback: log to console
    logger.warn("email.dev_fallback", {
      to: payload.to,
      subject: payload.subject,
      tag: payload.tag ?? "—",
      htmlPreview: payload.html.slice(0, 120),
    })
    return { ok: true, id: "dev-logged" }
  }

  const body: {
    from: string
    to: string[]
    subject: string
    html: string
    reply_to?: string
    tags?: { name: string; value: string }[]
  } = {
    from: payload.from ?? FROM_DEFAULT,
    to: [payload.to],
    subject: payload.subject,
    html: payload.html,
  }
  if (payload.replyTo) body.reply_to = payload.replyTo
  if (payload.tag) {
    body.tags = [{ name: "category", value: payload.tag }]
  }

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) {
    logger.error("[EMAIL ERROR]", data)
    return { ok: false, error: (data as { message?: string }).message ?? String(res.status) }
  }
  return { ok: true, id: (data as { id?: string }).id }
}

// ── Email Templates ──────────────────────────────────────────────

export function abandonedCartEmailHtml(cartSummary: {
  itemCount: number
  itemsPreview: string
  cartUrl: string
}): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h1 style="color:#0E7A0E;font-size:24px">👋 ¡Tu carrito te espera!</h1>
  <p style="color:#242529;font-size:16px;line-height:1.6">
    Notamos que dejaste <strong>${cartSummary.itemCount} producto(s)</strong> en tu carrito
    sin completar tu pedido:
  </p>
  <p style="background:#F7F5F0;padding:16px;border-radius:8px;color:#5C6068;font-size:14px">
    ${cartSummary.itemsPreview}
  </p>
  <p style="color:#242529;font-size:16px;line-height:1.6">
    ¿Todavía los necesitas? No te preocupes, tu carrito sigue guardado.
  </p>
  <a href="${cartSummary.cartUrl}"
     style="display:inline-block;background:#0E7A0E;color:#fff;padding:14px 32px;
            border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0">
    Retomar mi pedido →
  </a>
  <p style="color:#72767E;font-size:13px;margin-top:32px;border-top:1px solid #E8E9EB;padding-top:16px">
    Resurte.me — Central de abastos digital<br>
    ¿No quieres estos correos? <a href="https://resurte.me/panel" style="color:#0E7A0E">Configura tus preferencias</a>
  </p>
</body>
</html>`
}

export function reorderReminderEmailHtml(params: {
  name: string
  daysSinceLastOrder: number
  shopUrl: string
}): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h1 style="color:#0E7A0E;font-size:24px">Hola ${params.name} 🥑</h1>
  <p style="color:#242529;font-size:16px;line-height:1.6">
    Han pasado <strong>${params.daysSinceLastOrder} días</strong> desde tu último pedido.
    Según tu ritmo de compra, es momento de resurtir tu cocina.
  </p>
  <a href="${params.shopUrl}"
     style="display:inline-block;background:#0E7A0E;color:#fff;padding:14px 32px;
            border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0">
    Repetir mi pedido →
  </a>
  <p style="color:#5C6068;font-size:14px;line-height:1.6">
    En la home encontrarás la sección <strong>"Volver a pedir"</strong> con los productos
    de tu último pedido listos para agregar con un toque.
  </p>
  <p style="color:#72767E;font-size:13px;margin-top:32px;border-top:1px solid #E8E9EB;padding-top:16px">
    Resurte.me — Central de abastos digital<br>
    ¿No quieres estos correos? <a href="https://resurte.me/panel" style="color:#0E7A0E">Configura tus preferencias</a>
  </p>
</body>
</html>`
}

export function reactivationEmailHtml(params: {
  name: string
  daysInactive: number
  tier: string
  cashbackBalance: number
  panelUrl: string
  /** Cupón personal de reactivación (opcional). */
  couponCode?: string
  couponDiscountPct?: number
  couponExpiresAt?: string
}): string {
  const messages: Record<string, string> = {
    "30": "Hace un mes que no pasas por Resurte.me. ¿Todo bien? Tenemos productos frescos esperándote.",
    "60": "Han pasado 2 meses desde tu último pedido. ¡Tus proveedores te extrañan! 🥑",
    "90": "¡3 meses es mucho tiempo! Mira todo lo nuevo que ha llegado a la central. 🚚",
  }
  const msg = messages[String(params.daysInactive)] ?? messages["30"]

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h1 style="color:#0E7A0E;font-size:24px">Hola ${params.name} 👋</h1>
  <p style="color:#242529;font-size:16px;line-height:1.6">${msg}</p>
  ${
    params.cashbackBalance > 0
      ? `<p style="background:#F0F9F0;padding:16px;border-radius:8px;color:#0E7A0E;font-size:15px;font-weight:600">
           💰 Tienes <strong>$${params.cashbackBalance} MXN</strong> en cashback (nivel ${params.tier})
         </p>`
      : ""
  }
  ${
    params.couponCode
      ? `<p style="background:#FFF7E6;border:1px dashed #F59E0B;padding:16px;border-radius:8px;color:#92400E;font-size:15px">
           🎁 Regalo de bienvenida de vuelta: <strong>${params.couponDiscountPct}% de descuento</strong>
           en tu próximo pedido con el cupón
           <span style="font-family:monospace;font-weight:700">${params.couponCode}</span>
           ${params.couponExpiresAt ? `<br><span style="font-size:13px">Válido hasta el ${params.couponExpiresAt}</span>` : ""}
         </p>`
      : ""
  }
  <a href="${params.panelUrl}"
     style="display:inline-block;background:#0E7A0E;color:#fff;padding:14px 32px;
            border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0">
    Ir a Resurte.me →
  </a>
  <p style="color:#72767E;font-size:13px;margin-top:32px;border-top:1px solid #E8E9EB;padding-top:16px">
    Resurte.me — Central de abastos digital<br>
    ¿No quieres estos correos? <a href="https://resurte.me/panel" style="color:#0E7A0E">Desuscribir</a>
  </p>
</body>
</html>`
}
