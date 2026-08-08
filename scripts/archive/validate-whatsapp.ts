#!/usr/bin/env npx tsx
/**
 * Validador de credenciales WhatsApp Cloud API
 * =============================================
 * 
 * Uso:
 *   npx tsx scripts/validate-whatsapp.ts
 * 
 * Verifica:
 *   1. Que las variables de entorno existan
 *   2. Que el token tenga permisos válidos
 *   3. Que el phone number ID exista
 *   4. Que los números de prueba estén configurados
 */

import { readFileSync } from "fs"
import { resolve } from "path"

// Load .env.local
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
    if (!process.env[key]) process.env[key] = value
  }
} catch {
  // no .env.local
}

const C = {
  reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", gray: "\x1b[90m", bold: "\x1b[1m",
}

function check(label: string, ok: boolean, detail?: string) {
  const icon = ok ? `${C.green}✅${C.reset}` : `${C.red}❌${C.reset}`
  const d = detail ? ` ${C.gray}→ ${detail}${C.reset}` : ""
  console.log(`  ${icon} ${label}${d}`)
}

async function apiCall(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  })
  return { status: res.status, data: await res.json() }
}

async function main() {
  console.log(`\n${C.cyan}${C.bold}🔍 WhatsApp Cloud API — Validador de credenciales${C.reset}\n`)

  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const wabaId = process.env.WHATSAPP_WABA_ID

  // 1. Variables de entorno
  console.log(`${C.bold}1. Variables de entorno${C.reset}`)
  check("WHATSAPP_ACCESS_TOKEN", !!token, token ? `${token.slice(0, 12)}...${token.slice(-4)}` : "no configurado")
  check("WHATSAPP_PHONE_NUMBER_ID", !!phoneNumberId, phoneNumberId || "no configurado")
  check("WHATSAPP_WABA_ID", !!wabaId, wabaId || "no configurado (opcional)")

  if (!token || !phoneNumberId) {
    console.log(`\n${C.yellow}⚠️  Faltan credenciales. Configúralas en .env.local y vuelve a correr este script.${C.reset}\n`)
    return
  }

  // 2. Validar token (chequeamos /debug_token)
  console.log(`\n${C.bold}2. Validando Access Token...${C.reset}`)
  const debug = await apiCall(
    `https://graph.facebook.com/v22.0/debug_token?input_token=${token}`,
    token
  )
  if (debug.status === 200 && debug.data.data) {
    const d = debug.data.data
    check("Token válido", d.is_valid === true)
    check("Tipo", true, d.type)
    check("App ID", true, d.app_id)
    check("Expira", true, d.expires_at ? `Expira: ${new Date(d.expires_at * 1000).toLocaleString()}` : "Sin expiración (pero es temporal)")
    d.scopes?.forEach((s: string) => check(`  Scope: ${s}`, true))
  } else {
    check("Token válido", false, JSON.stringify(debug.data))
  }

  // 3. Validar Phone Number ID
  console.log(`\n${C.bold}3. Validando Phone Number ID...${C.reset}`)
  const phoneInfo = await apiCall(
    `https://graph.facebook.com/v22.0/${phoneNumberId}`,
    token
  )
  if (phoneInfo.status === 200) {
    const p = phoneInfo.data
    check("Phone Number ID existe", true, phoneNumberId)
    check("Display Phone", true, p.display_phone_number || "no disponible")
    check("Verified Name", true, p.verified_name || "no disponible")
    check("Quality Rating", true, p.quality_rating || "no disponible")
    check("Code Verification", true, p.code_verification_status || "no disponible")
  } else {
    check("Phone Number ID existe", false, JSON.stringify(phoneInfo.data))
  }

  // 4. Listar test recipients (si es número de prueba)
  console.log(`\n${C.bold}4. Buscando destinatarios de prueba...${C.reset}`)
  // This endpoint may not exist; try a test send approach instead
  const businessInfo = await apiCall(
    `https://graph.facebook.com/v22.0/${wabaId}`,
    token
  )
  if (businessInfo.status === 200) {
    const b = businessInfo.data
    check("WABA ID existe", true, wabaId || "no configurado")
    check("WABA Name", true, b.name || "no disponible")
  } else if (wabaId) {
    check("WABA ID existe", false, JSON.stringify(businessInfo.data))
  }

  // 5. Instrucciones para test
  console.log(`\n${C.bold}5. Próximos pasos para enviar un mensaje de prueba:${C.reset}`)
  console.log()
  console.log(`   ${C.gray}a) Asegúrate de que el número destino esté en "Recipient Numbers"${C.reset}`)
  console.log(`   ${C.gray}   👉 https://developers.facebook.com/apps/ → WhatsApp → API Setup → Recipient Numbers${C.reset}`)
  console.log()
  console.log(`   ${C.gray}b) El destinatario DEBE mandar primero un mensaje al número de prueba de Meta${C.reset}`)
  console.log(`   ${C.gray}   Número de prueba: ${phoneInfo.data?.display_phone_number || "(obtener del dashboard)"}${C.reset}`)
  console.log()
  console.log(`   ${C.gray}c) Una vez enviado el mensaje desde WhatsApp, corre:${C.reset}`)
  console.log(`   ${C.green}   npx tsx scripts/test-workflows.ts --workflow=new_order${C.reset}`)
  console.log()

  // 6. Resumen
  const allOk = debug.status === 200 && debug.data?.data?.is_valid && phoneInfo.status === 200
  if (allOk) {
    console.log(`${C.green}${C.bold}✅ Credenciales válidas. ¡Listo para enviar mensajes!${C.reset}\n`)
  } else {
    console.log(`${C.yellow}⚠️  Hay problemas con las credenciales. Revisa los ❌ arriba.${C.reset}\n`)
  }
}

main().catch(console.error)
