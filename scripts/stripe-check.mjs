#!/usr/bin/env node
// ¿Esta llave de Stripe sirve? Read-only.
//
// Uso:
//   npm run stripe:check                  # lee STRIPE_SECRET_KEY del entorno o de .env.local
//   npm run stripe:check -- --key sk_...  # o se la pasas (queda en el historial del shell)
//   npm run stripe:check -- --publishable pk_...
//   echo 'sk_...' | npm run stripe:check
//
// Por qué existe: el 08-oct-2026 se pegó una llave live **como nombre** de
// variable en Vercel (valor vacío) y la llave, además, era inválida — Stripe
// respondía `Invalid API Key provided`. Ninguna de las dos cosas se veía desde
// fuera: el sitio seguía sirviendo `pk_test_…` y nada avisaba. Se perdieron dos
// vueltas descubriéndolo a mano.
//
// Este script contesta, antes de tocar Vercel, las cuatro preguntas que
// importan:
//
//   1. ¿La llave es válida? (Stripe la acepta)
//   2. ¿Es de modo live o de prueba?
//   3. ¿La cuenta está activada? (`charges_enabled`, `payouts_enabled`) — que es
//      el requisito previo de todo y depende de la constancia fiscal.
//   4. ¿Coincide con la llave publicable configurada? Un `sk_live_` con un
//      `pk_test_` no cobra: el servidor crea un cobro live y el navegador intenta
//      confirmarlo con una llave de prueba.
//
// Solo hace GET /v1/account: no cobra, no crea nada, no modifica nada.
//
// Ver `docs/OPS.md §14.4` (checklist de arranque) y §14.9 (constancia fiscal).

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createInterface } from "node:readline"

const EXIT_OK = 0
const EXIT_PROBLEM = 1

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  return i !== -1 ? argv[i + 1] : undefined
}

/** Enmascara una llave para poder nombrarla sin exponerla. */
function mask(key) {
  if (key.length <= 14) return `${key.slice(0, 8)}…`
  return `${key.slice(0, 12)}…${key.slice(-4)} (${key.length} caracteres)`
}

/** Lee una variable de `.env.local` sin cargar el archivo entero. */
function fromDotEnvLocal(name) {
  const path = join(process.cwd(), ".env.local")
  if (!existsSync(path)) return undefined
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (match && match[1] === name) {
      const value = match[2].trim().replace(/^["']|["']$/g, "")
      return value || undefined
    }
  }
  return undefined
}

/** Pide la llave por entrada estándar cuando no vino por argumento ni entorno. */
async function readFromStdin() {
  if (process.stdin.isTTY) return undefined
  const rl = createInterface({ input: process.stdin })
  const chunks = []
  for await (const line of rl) chunks.push(line)
  const value = chunks.join("").trim()
  return value || undefined
}

async function resolveKey() {
  const fromArg = flag("--key")
  if (fromArg) return { key: fromArg.trim(), origin: "argumento --key" }

  const fromEnv = process.env.STRIPE_SECRET_KEY?.trim()
  if (fromEnv) return { key: fromEnv, origin: "variable de entorno STRIPE_SECRET_KEY" }

  const fromFile = fromDotEnvLocal("STRIPE_SECRET_KEY")
  if (fromFile) return { key: fromFile, origin: ".env.local" }

  const fromPipe = await readFromStdin()
  if (fromPipe) return { key: fromPipe, origin: "entrada estándar" }

  return { key: null, origin: null }
}

const publishableFlag = flag("--publishable")
const publishable =
  publishableFlag?.trim() ||
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
  fromDotEnvLocal("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY")

const { key, origin } = await resolveKey()

console.log("")

if (!key) {
  console.log("No encontré ninguna llave que revisar.")
  console.log("")
  console.log("Pásala de una de estas formas:")
  console.log("  · npm run stripe:check -- --key sk_live_…")
  console.log("  · tenerla en STRIPE_SECRET_KEY (entorno o .env.local)")
  console.log("  · echo 'sk_live_…' | npm run stripe:check")
  process.exit(EXIT_PROBLEM)
}

console.log(`Revisando: ${mask(key)}  (desde ${origin})`)
console.log("")

// Chequeos que se pueden hacer sin tocar la red: atrapan el error de pegar la
// llave equivocada o a medias antes de gastar una llamada a Stripe.
const looksLikeKey = /^sk_(live|test)_/.test(key)
const looksLikePublishable = /^pk_(live|test)_/.test(key)
const hasWhitespace = /\s/.test(key)

let fatal = false
if (looksLikePublishable) {
  console.log("✖ Es una llave PUBLICABLE (pk_), no una secreta.")
  console.log("  La secreta empieza por sk_. Estás copiando el campo equivocado.")
  fatal = true
} else if (!looksLikeKey) {
  console.log("✖ No empieza por `sk_live_` ni `sk_test_`, así que no es una llave secreta de Stripe.")
  console.log("  Revisa que hayas copiado el campo «Secret key», con el botón de copiar.")
  fatal = true
}
if (hasWhitespace) {
  console.log("✖ Trae espacios o saltos de línea: se pegó incompleta o con texto de más.")
  fatal = true
}
if (fatal) {
  console.log("")
  process.exit(EXIT_PROBLEM)
}

const keyMode = key.startsWith("sk_live_") ? "live" : "test"
console.log(`Modo de la llave: ${keyMode === "live" ? "LIVE (dinero real)" : "prueba"}`)

if (publishable) {
  const pubMode = publishable.startsWith("pk_live_") ? "live" : "test"
  if (pubMode !== keyMode) {
    console.log("")
    console.log(`✖ DESALINEADAS: la secreta es de ${keyMode} y la publicable de ${pubMode}.`)
    console.log("  Así el checkout se rompe: el servidor crea un cobro en un modo y el")
    console.log("  navegador intenta confirmarlo en el otro. Las dos tienen que ser del mismo modo.")
    fatal = true
  } else {
    console.log(`Llave publicable configurada: ${pubMode} — coincide.`)
  }
} else {
  console.log("Llave publicable: no configurada (no se puede comprobar la coincidencia).")
}

// Única llamada de red: leer la cuenta. No cobra ni modifica nada.
console.log("")
console.log("Consultando la cuenta en Stripe…")

let account
try {
  const res = await fetch("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  })
  account = await res.json()
} catch (error) {
  console.log(`✖ No se pudo consultar a Stripe: ${error instanceof Error ? error.message : error}`)
  process.exit(EXIT_PROBLEM)
}

if (account?.error) {
  console.log("")
  console.log(`✖ Stripe rechaza la llave: ${account.error.message}`)
  console.log("")
  console.log("  Qué hacer:")
  console.log("   1. Developers → API keys → verifica que «Test mode» esté APAGADO para una live.")
  console.log("   2. Copia con el botón de copiar, no seleccionando el texto a mano.")
  console.log("   3. Si la llave es de una cuenta sin activar, primero activa la cuenta")
  console.log("      (constancia de situación fiscal — ver docs/OPS.md §14.9).")
  console.log("   4. Si ya la habías pegado en algún lado, rótala: pudo quedar expuesta.")
  process.exit(EXIT_PROBLEM)
}

const requirements = account.requirements ?? {}
const charges = account.charges_enabled === true
const payouts = account.payouts_enabled === true

console.log("")
console.log(`Cuenta: ${account.id}`)
console.log(`País: ${account.country}`)
console.log(`Cobros habilitados: ${charges ? "sí" : "NO"}`)
console.log(`Pagos al banco habilitados: ${payouts ? "sí" : "NO"}`)
console.log(`Datos enviados: ${account.details_submitted ? "sí" : "NO"}`)
if (requirements.disabled_reason) {
  console.log(`Motivo de bloqueo: ${requirements.disabled_reason}`)
}
const due = [...(requirements.currently_due ?? []), ...(requirements.past_due ?? [])]
if (due.length > 0) {
  console.log(`Requisitos pendientes (${due.length}): ${due.slice(0, 8).join(", ")}${due.length > 8 ? "…" : ""}`)
}

console.log("")
if (!charges) {
  console.log("✖ La cuenta NO puede cobrar todavía.")
  console.log("  Una llave live de una cuenta sin activar no sirve para cobrar. El requisito")
  console.log("  más común en México es la constancia de situación fiscal (docs/OPS.md §14.9).")
  process.exit(EXIT_PROBLEM)
}

console.log(`✅ La llave es válida (modo ${keyMode}) y la cuenta puede cobrar.`)
if (keyMode === "test") {
  console.log("")
  console.log("  Ojo: es de PRUEBA. Para cobrar de verdad necesitas la de modo live,")
  console.log("  con «Test mode» APAGADO en el Dashboard.")
}
process.exit(EXIT_OK)
