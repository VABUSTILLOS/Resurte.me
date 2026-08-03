#!/usr/bin/env npx tsx
/**
 * Test de Workflows WhatsApp — Resurte.me
 * =========================================
 * 
 * Uso:
 *   npx tsx scripts/test-workflows.ts [--dry] [--phone=526141047021]
 * 
 * --dry      Solo muestra los mensajes sin enviar (default si no hay credenciales)
 * --phone    Número destino (default: 526141047021)
 * --staff    Número del staff para notificaciones (default: mismo que phone)
 * --workflow Ejecutar un workflow específico (ej: payment_reminder)
 * 
 * Requiere variables de entorno:
 *   WHATSAPP_ACCESS_TOKEN
 *   WHATSAPP_PHONE_NUMBER_ID
 */

// Load .env.local manually (no external deps needed)
import { readFileSync } from "fs"
import { resolve } from "path"

try {
  const envPath = resolve(__dirname, "../.env.local")
  const envFile = readFileSync(envPath, "utf-8")
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
} catch {
  // .env.local not found — that's fine
}

// ============================================================
// Config from args
// ============================================================

const args = process.argv.slice(2)
const dryRun = args.includes("--dry")
const phoneArg = args.find((a) => a.startsWith("--phone="))
const staffArg = args.find((a) => a.startsWith("--staff="))
const workflowArg = args.find((a) => a.startsWith("--workflow="))

const CUSTOMER_PHONE = phoneArg ? phoneArg.split("=")[1] : "526141047021"
const STAFF_PHONE = staffArg ? staffArg.split("=")[1] : CUSTOMER_PHONE

// ============================================================
// Mock order data (simula lo que vendría de Supabase)
// ============================================================

const MOCK_ORDER = {
  id: 1043,
  user_id: "test-user",
  store_id: 1,
  status: "pending" as const,
  payment_status: "pending" as const,
  payment_method: "stripe",
  total: 385.5,
  subtotal: 346.5,
  delivery_fee: 39,
  scheduled_for: new Date(Date.now() + 3600000).toISOString(),
  source: "web" as "web" | "whatsapp",
  created_at: new Date().toISOString(),
  store_name: "La Comer",
  store_slug: "la-comer",
  store_whatsapp: STAFF_PHONE,
  customer_name: "Sarah Tan",
  customer_phone: CUSTOMER_PHONE,
  staff_phones: [STAFF_PHONE],
  items: [
    { name: "Aguacate Hass", quantity: 3 },
    { name: "Pechuga de pollo 1kg", quantity: 2 },
    { name: "Leche Lala entera 1L", quantity: 4 },
    { name: "Tortillas de maíz 1kg", quantity: 2 },
  ],
}

// ============================================================
// Message builders (same as workflows.ts)
// ============================================================

const STATUS_EMOJI: Record<string, string> = {
  pending: "⏳", confirmed: "✅", preparing: "👨‍🍳",
  out_for_delivery: "🛵", delivered: "📦", cancelled: "❌",
}

function itemsText(items: { name: string; quantity: number }[]) {
  return items.map((i) => `  • ${i.quantity}x ${i.name}`).join("\n")
}

const MESSAGES = {
  new_order_staff: `🛎 *¡Nuevo pedido #${MOCK_ORDER.id}!*

*Tienda:* ${MOCK_ORDER.store_name}
*Cliente:* ${MOCK_ORDER.customer_name}
*Total:* $${MOCK_ORDER.total.toFixed(2)} MXN
*Método de pago:* ${MOCK_ORDER.payment_method.toUpperCase()}
*Origen:* ${MOCK_ORDER.source === "whatsapp" ? "WhatsApp" : "Web"}

*Productos:*
${itemsText(MOCK_ORDER.items)}

_Confirma o cancela el pedido desde el panel de administración._`,

  new_order_customer: `👋 ¡Hola ${MOCK_ORDER.customer_name}!

Gracias por tu compra en *${MOCK_ORDER.store_name}*.

📋 *Pedido #${MOCK_ORDER.id}*

${itemsText(MOCK_ORDER.items)}

💰 Total: $${MOCK_ORDER.total.toFixed(2)} MXN
💳 Pago: Pendiente ⏳

Te notificaremos cuando tu pedido esté listo.
Si tienes dudas, responde a este mensaje.`,

  status_update: (status: string) =>
    `✅ Tu pedido #${MOCK_ORDER.id} ha sido *confirmado* y lo estamos preparando.
    
    Actualización de tu pedido #1043 en *La Comer*.
    Estado: *${status === "confirmed" ? "Confirmado" : status}*`,

  payment_reminder: (hours: number) =>
    `💡 Recordatorio

Hola ${MOCK_ORDER.customer_name},

El pago de tu pedido #${MOCK_ORDER.id} por *$${MOCK_ORDER.total.toFixed(2)} MXN* en ${MOCK_ORDER.store_name} sigue pendiente.

Método de pago: *${MOCK_ORDER.payment_method.toUpperCase()}*

Por favor completa tu pago para que procesemos tu pedido.`,

  payment_confirmed: `✅ *¡Pago confirmado!*

Hola ${MOCK_ORDER.customer_name},

Hemos recibido tu pago de *$${MOCK_ORDER.total.toFixed(2)} MXN* para el pedido #${MOCK_ORDER.id}.

Tu pedido será procesado y te notificaremos cuando esté listo.

¡Gracias por tu compra en ${MOCK_ORDER.store_name}! 🎉`,

  fulfillment_update: (status: string) =>
    `📦 Actualización de entrega

Pedido #${MOCK_ORDER.id}
Estado: *${status === "ready" ? "Listo para recoger" : status === "out_for_delivery" ? "En camino" : status}*`,
}

// ============================================================
// WhatsApp sender (same as lib/whatsapp.ts sendTextMessage)
// ============================================================

async function sendWhatsAppMessage(to: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneNumberId) {
    return { ok: false, error: "WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados" }
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `******${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: text, preview_url: false },
      }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(JSON.stringify(data))
    return { ok: true, id: data.messages?.[0]?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

// ============================================================
// Test runner
// ============================================================

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
}

function hr(title: string) {
  console.log(`\n${COLORS.cyan}${"═".repeat(60)}${COLORS.reset}`)
  console.log(`${COLORS.cyan}  ${title}${COLORS.reset}`)
  console.log(`${COLORS.cyan}${"═".repeat(60)}${COLORS.reset}\n`)
}

function showMessage(label: string, to: string, text: string) {
  console.log(`${COLORS.yellow}📤 ${label}${COLORS.reset}`)
  console.log(`${COLORS.gray}   Para: ${to}${COLORS.reset}`)
  console.log(`${COLORS.gray}${"─".repeat(50)}${COLORS.reset}`)
  // Show message with WhatsApp-style formatting
  text.split("\n").forEach((line) => {
    if (line.startsWith("*") && line.endsWith("*")) {
      console.log(`   ${COLORS.magenta}${line}${COLORS.reset}`)
    } else if (line.startsWith("  •")) {
      console.log(`   ${COLORS.gray}${line}${COLORS.reset}`)
    } else if (line.startsWith("_") && line.endsWith("_")) {
      console.log(`   ${COLORS.gray}${line}${COLORS.reset}`)
    } else if (line.startsWith("⚠")) {
      console.log(`   ${COLORS.red}${line}${COLORS.reset}`)
    } else {
      console.log(`   ${line}`)
    }
  })
  console.log()
}

async function testWorkflow(
  name: string,
  recipient: string,
  recipientLabel: string,
  getMessage: () => string
) {
  const message = getMessage()
  showMessage(`${name} → ${recipientLabel}`, recipient, message)

  if (dryRun) {
    console.log(`${COLORS.blue}   🔍 DRY RUN — mensaje no enviado${COLORS.reset}\n`)
    return
  }

  const result = await sendWhatsAppMessage(recipient, message)
  if (result.ok) {
    console.log(`${COLORS.green}   ✅ Enviado (ID: ${result.id})${COLORS.reset}\n`)
  } else {
    console.log(`${COLORS.red}   ❌ Error: ${result.error}${COLORS.reset}\n`)
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  const hasCreds = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
  const isDry = dryRun || !hasCreds

  console.log(`${COLORS.cyan}╔══════════════════════════════════════════════════════════╗${COLORS.reset}`)
  console.log(`${COLORS.cyan}║   Resurte.me — WhatsApp Workflow Test                  ║${COLORS.reset}`)
  console.log(`${COLORS.cyan}╚══════════════════════════════════════════════════════════╝${COLORS.reset}`)
  console.log()
  console.log(`${COLORS.gray}   Pedido: #${MOCK_ORDER.id} | Tienda: ${MOCK_ORDER.store_name}${COLORS.reset}`)
  console.log(`${COLORS.gray}   Cliente: ${MOCK_ORDER.customer_name} | ${CUSTOMER_PHONE}${COLORS.reset}`)
  console.log(`${COLORS.gray}   Staff: ${STAFF_PHONE}${COLORS.reset}`)
  console.log(`${COLORS.gray}   Total: $${MOCK_ORDER.total.toFixed(2)} MXN | Items: ${MOCK_ORDER.items.length}${COLORS.reset}`)

  if (isDry) {
    console.log(`\n${COLORS.blue}   🔍 MODO DRY RUN — los mensajes se muestran pero NO se envían${COLORS.reset}`)
    if (!hasCreds) {
      console.log(`${COLORS.yellow}   ⚠️  Configura WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID en .env.local${COLORS.reset}`)
      console.log(`${COLORS.gray}   ⚠️  para enviar mensajes reales.${COLORS.reset}`)
    }
  } else {
    console.log(`\n${COLORS.green}   🚀 MODO REAL — los mensajes SE ENVIARÁN a WhatsApp${COLORS.reset}`)
  }

  // Si se pidió un workflow específico
  if (workflowArg) {
    const wf = workflowArg.split("=")[1]
    hr(`Workflow: ${wf}`)

    switch (wf) {
      case "new_order_staff":
        await testWorkflow("Notificar staff", STAFF_PHONE, "Staff", () => MESSAGES.new_order_staff)
        break
      case "new_order_customer":
        await testWorkflow("Confirmar al cliente", CUSTOMER_PHONE, "Cliente", () => MESSAGES.new_order_customer)
        break
      case "new_order":
        // Full new order flow: staff + customer
        await testWorkflow("Notificar staff", STAFF_PHONE, "Staff 👥", () => MESSAGES.new_order_staff)
        await testWorkflow("Confirmar al cliente", CUSTOMER_PHONE, "Cliente 👤", () => MESSAGES.new_order_customer)
        break
      case "status_update":
        await testWorkflow("Estado: Confirmado", CUSTOMER_PHONE, "Cliente", () => MESSAGES.status_update("confirmed"))
        break
      case "payment_reminder":
        await testWorkflow("Recordatorio 1h", CUSTOMER_PHONE, "Cliente", () => MESSAGES.payment_reminder(1))
        break
      case "payment_confirmed":
        await testWorkflow("Pago confirmado", CUSTOMER_PHONE, "Cliente", () => MESSAGES.payment_confirmed)
        break
      case "fulfillment_update":
        await testWorkflow("Listo para recoger", CUSTOMER_PHONE, "Cliente", () => MESSAGES.fulfillment_update("ready"))
        break
      default:
        console.log(`${COLORS.red}   Workflow no reconocido: ${wf}${COLORS.reset}`)
        console.log(`   Opciones: new_order_staff, new_order_customer, new_order, status_update, payment_reminder, payment_confirmed, fulfillment_update, all`)
    }
    return
  }

  // ============================================================
  // Simular flujo completo de pedido
  // ============================================================

  hr("🔔 WORKFLOW 1: Nuevo pedido → Notificar staff")
  await testWorkflow("Notificar staff", STAFF_PHONE, "Staff 👥", () => MESSAGES.new_order_staff)

  hr("✅ WORKFLOW 2: Nuevo pedido → Confirmar al cliente")
  await testWorkflow("Confirmar al cliente", CUSTOMER_PHONE, "Cliente 👤", () => MESSAGES.new_order_customer)

  hr("💳 WORKFLOW 3: Recordatorio de pago (1 hora)")
  await testWorkflow("Recordatorio de pago", CUSTOMER_PHONE, "Cliente", () => MESSAGES.payment_reminder(1))

  hr("💰 WORKFLOW 4: Pago confirmado")
  await testWorkflow("Pago confirmado", CUSTOMER_PHONE, "Cliente", () => MESSAGES.payment_confirmed)

  hr("📦 WORKFLOW 5: Actualización de estado (Confirmado)")
  await testWorkflow("Estado: Confirmado", CUSTOMER_PHONE, "Cliente", () => MESSAGES.status_update("confirmed"))

  hr("🛵 WORKFLOW 6: Fulfillment — Listo para recoger")
  await testWorkflow("Listo para recoger", CUSTOMER_PHONE, "Cliente", () => MESSAGES.fulfillment_update("ready"))

  hr("🛵 WORKFLOW 6: Fulfillment — En camino")
  await testWorkflow("En camino", CUSTOMER_PHONE, "Cliente", () => MESSAGES.fulfillment_update("out_for_delivery"))

  // ============================================================
  // Resumen
  // ============================================================

  console.log(`${COLORS.cyan}${"═".repeat(60)}${COLORS.reset}`)
  console.log(`${COLORS.cyan}  ✅ Prueba completada${COLORS.reset}`)
  console.log(`${COLORS.cyan}${"═".repeat(60)}${COLORS.reset}`)
  console.log()
  console.log(`  Para probar workflows individuales:`)
  console.log(`    ${COLORS.gray}npx tsx scripts/test-workflows.ts --workflow=new_order${COLORS.reset}`)
  console.log(`    ${COLORS.gray}npx tsx scripts/test-workflows.ts --workflow=payment_reminder${COLORS.reset}`)
  console.log(`    ${COLORS.gray}npx tsx scripts/test-workflows.ts --workflow=fulfillment_update${COLORS.reset}`)
  console.log()
  console.log(`  Para enviar mensajes reales (requiere credenciales):`)
  console.log(`    ${COLORS.gray}npx tsx scripts/test-workflows.ts --workflow=new_order${COLORS.reset}`)
  console.log()
}

main().catch(console.error)
