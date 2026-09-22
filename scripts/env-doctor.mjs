#!/usr/bin/env node
// ¿Está completo y coherente mi entorno? Read-only.
//
// Uso:
//   npm run env:doctor
//
// POR QUÉ EXISTE: el 17-sep-2026 un `vercel env pull` sobre `.env.local`
// reemplazó 21 llaves reales por el literal `[SENSITIVE]`. Nada avisó: la app
// arrancó igual, y las fallas aparecieron después disfrazadas de 404, de estado
// vacío o de 401 opaco. Perder las llaves fue el daño; que la pérdida entrara
// **en silencio** fue el problema. Esto lo convierte en un rojo explícito.
//
// Dos reglas que no se negocian:
//   1. NUNCA imprime el valor de una variable. Solo el nombre y su estado.
//   2. No escribe nada. Si algo falta, lo dice y sale con código 1.
//
// Funciona en los dos contextos: en tu máquina lee `.env.local`, y dentro de un
// sandbox (staging) lee el entorno inyectado. `.env.local` gana cuando existe.
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const LOCAL_FILE = ".env.local"
const EXAMPLE_FILE = ".env.local.example"

/**
 * Proyecto Supabase de producción. Si `NEXT_PUBLIC_SUPABASE_URL` apunta aquí,
 * este entorno escribe en la base real: es la advertencia más importante que
 * puede dar este script.
 */
const PRODUCTION_SUPABASE_REF = "isogthougrpctnfzcdes"

/** Lo que `vercel env pull` escribe en lugar del valor. */
const PLACEHOLDERS = new Set([
  "[SENSITIVE]",
  "your-project-url",
  "your-supabase-url",
  "your-anon-key",
  "dummy-anon-key",
])

/** Ruido del volcado de Vercel. En `.env.local` no pinta nada. */
const PULL_ARTIFACT = /^(VERCEL|TURBO_|NX_DAEMON)/

/**
 * Variables que **no se pueden recuperar de ningún panel** porque se muestran
 * una sola vez al crearlas. Cada una trae qué hacer en local, para que nadie
 * las busque en un dashboard donde no están.
 */
const NOT_RECOVERABLE = {
  POSTGRES_PASSWORD:
    "No la muestra ningún panel. La app no lee POSTGRES_*: déjala vacía salvo que uses psql.",
  CRON_SECRET:
    "No se recupera, y no hace falta: Vercel inyecta su propia copia en la cabecera del cron. En local vale cualquier valor de prueba.",
  FOODOS_WA_ENCRYPTION_KEY:
    "Se muestra una sola vez. No la rotes en Vercel: es la clave que descifra los tokens de WhatsApp ya guardados.",
  OPENAI_API_KEY:
    "Se muestra una sola vez. Crea una nueva (es aditivo: la vieja sigue funcionando) o déjala vacía y usa OMNIROUTE_*.",
  SUPABASE_SECRET_KEY:
    "Se muestra una sola vez. Crea una adicional en Project Settings → API Keys; es aditivo y no rompe las existentes.",
}

/** Sin estas tres la app no opera: es lo que separa "falta configurar" de "funciona". */
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]

/**
 * Variables que **la app no lee** (0 referencias en `src/`): son de plataforma
 * (`psql`, `supabase db push`) o quedaron residuales en Vercel. Dejarlas vacías
 * no cambia el comportamiento de nada.
 */
const NOT_READ_BY_APP = new Set([
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_HOST",
  "POSTGRES_USER",
  "POSTGRES_DATABASE",
  // La app usa NEXT_PUBLIC_WHATSAPP_NUMBER (con default en el código).
  "WHATSAPP_NUMBER",
  // La app prefiere NEXT_PUBLIC_GA_MEASUREMENT_ID, que es la misma medición.
  "GOOGLEANALYTICS",
])

function unquote(value) {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && trimmed[0] === trimmed[trimmed.length - 1] && (trimmed[0] === '"' || trimmed[0] === "'")) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseFile(path) {
  const out = new Map()
  if (!existsSync(path)) return out
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const text = line.trim()
    if (!text || text.startsWith("#")) continue
    const match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (match) out.set(match[1], unquote(match[2]))
  }
  return out
}

const fromLocal = parseFile(join(ROOT, LOCAL_FILE))
const fromExample = parseFile(join(ROOT, EXAMPLE_FILE))

/** `.env.local` gana; si no está, vale el entorno inyectado (sandbox de staging). */
function valueOf(name) {
  if (fromLocal.has(name)) return fromLocal.get(name)
  return process.env[name] ?? ""
}

function stateOf(name) {
  const value = valueOf(name)
  if (PLACEHOLDERS.has(value)) return "placeholder"
  if (value === "") return "vacía"
  return "ok"
}

const keys = [...new Set([...fromExample.keys(), ...fromLocal.keys(), ...REQUIRED])].sort()
const states = new Map(keys.map((name) => [name, stateOf(name)]))

/** Definidas en tu entorno (el archivo o el proceso). El resto son del ejemplo. */
const defined = keys.filter((name) => fromLocal.has(name) || process.env[name] !== undefined)
const undefinedKeys = keys.filter((name) => !defined.includes(name))

const errors = []
const warnings = []
const notes = []

// --- Lo que rompe el entorno -------------------------------------------------

const placeholders = defined.filter((name) => states.get(name) === "placeholder")
if (placeholders.length > 0) {
  errors.push(
    `${placeholders.length} variable(s) con placeholder: ${placeholders.join(", ")}. ` +
      `Un placeholder es una cadena con contenido: pasa los guardas de "¿existe?" y ` +
      `falla después de forma opaca. Bórralo o pon el valor real.`
  )
}

const artifacts = [...fromLocal.keys()].filter((name) => PULL_ARTIFACT.test(name))
if (artifacts.length > 0) {
  errors.push(
    `${artifacts.length} variable(s) del volcado de Vercel en ${LOCAL_FILE}: ${artifacts.join(", ")}. ` +
      `Bórralas. En particular VERCEL_ENV=production hace que este entorno se crea ` +
      `producción y desactiva los guardarraíles de staging (noindex y rechazo de llaves live).`
  )
}

const missing = REQUIRED.filter((name) => states.get(name) !== "ok")
if (missing.length > 0) {
  errors.push(`Faltan variables obligatorias: ${missing.join(", ")}.`)
}

// --- Coherencia de ambiente --------------------------------------------------

const stripeKey = valueOf("STRIPE_SECRET_KEY")
const isProduction = valueOf("VERCEL_ENV") === "production"
const optedIn = ["1", "true"].includes(valueOf("ALLOW_LIVE_STRIPE").trim().toLowerCase())
if (stripeKey.startsWith("sk_live_") && !isProduction && !optedIn) {
  errors.push(
    "STRIPE_SECRET_KEY es una llave live fuera de producción. `getStripe()` la va a " +
      "rechazar; si de verdad quieres probar contra la cuenta real desde tu máquina, " +
      "define ALLOW_LIVE_STRIPE=1."
  )
}

const supabaseUrl = valueOf("NEXT_PUBLIC_SUPABASE_URL")
if (supabaseUrl.includes(PRODUCTION_SUPABASE_REF) && !isProduction) {
  warnings.push(
    "NEXT_PUBLIC_SUPABASE_URL apunta al proyecto de **producción**: lo que ejecutes aquí " +
      "escribe en datos reales de clientes. Para staging usa un proyecto aparte."
  )
}

if (valueOf("FOODOS_WA_ENCRYPTION_KEY") === "" && valueOf("SUPABASE_SERVICE_ROLE_KEY") !== "") {
  warnings.push(
    "FOODOS_WA_ENCRYPTION_KEY vacía: el cifrado de tokens de WhatsApp cae a " +
      "SUPABASE_SERVICE_ROLE_KEY como respaldo, que no es la clave con la que se cifraron. " +
      "Los tokens guardados no van a descifrar."
  )
}

for (const [name, note] of Object.entries(NOT_RECOVERABLE)) {
  if (states.get(name) === "vacía") notes.push(`${name}: ${note}`)
}

const notRead = defined.filter(
  (name) => states.get(name) === "vacía" && NOT_READ_BY_APP.has(name)
)
if (notRead.length > 0) {
  notes.push(
    `La app no lee estas, así que vacías no cambian nada: ${notRead.join(", ")}.`
  )
}

// --- Informe ----------------------------------------------------------------

const group = (state) => defined.filter((name) => states.get(name) === state)
const vacias = group("vacía")

console.log(`\nEntorno — ${LOCAL_FILE}${fromLocal.size === 0 ? " (no existe; se leyó el entorno inyectado)" : ""}\n`)
console.log(`  ok            ${group("ok").length}`)
console.log(`  vacías        ${vacias.length}`)
console.log(`  placeholder   ${placeholders.length}`)
console.log(`  no definidas  ${undefinedKeys.length}  (del ejemplo; casi todas son integraciones apagadas)`)

if (vacias.length > 0) {
  console.log(`\nVacías (${vacias.length}):`)
  for (const name of vacias) console.log(`  · ${name}`)
}

if (errors.length > 0) {
  console.log("\n✖ Errores:")
  for (const message of errors) console.log(`  · ${message}`)
}

if (warnings.length > 0) {
  console.log("\n▲ Avisos:")
  for (const message of warnings) console.log(`  · ${message}`)
}

if (notes.length > 0) {
  console.log("\nℹ De estas no busques el valor en un panel (se muestran una sola vez):")
  for (const message of notes) console.log(`  · ${message}`)
}

if (process.argv.includes("--verbose") && undefinedKeys.length > 0) {
  console.log(`\nNo definidas en tu entorno (${undefinedKeys.length}):`)
  for (const name of undefinedKeys) console.log(`  · ${name}`)
}

console.log(
  errors.length === 0
    ? "\n✓ El entorno no tiene placeholders ni incoherencias.\n"
    : `\n✖ ${errors.length} error(es).\n`
)

process.exit(errors.length === 0 ? 0 : 1)
