#!/usr/bin/env node
// ¿Se puede operar la tienda? Medición de arranque, read-only.
//
// Uso:
//   npm run launch:check                  # contra https://resurte.me
//   npm run launch:check -- --url https://preview.vercel.app
//   npm run launch:check -- --json
//
// Por qué existe: la puesta en marcha tiene tres bloqueadores que **no se ven
// desde el código** — el modo de la llave de Stripe horneada en el bundle, el
// SMTP de Supabase Auth y el webhook live — y la forma de comprobarlos era
// abrir tres dashboards y acordarse de todo. El 23-sep-2026 la medición encontró
// que producción servía `pk_test_…`: Stripe en modo test, o sea que ninguna
// tarjeta real podía cobrarse, y eso llevaba así desde el despliegue. Nada en el
// repo lo decía.
//
// Los tres principios de este script:
//
//   1. **No escribe nada.** Solo GET y un POST sin firma al webhook (que debe
//      responder 400). No crea pedidos, no crea usuarios, no toca la base.
//   2. **Distingue "no medido" de "está bien".** Si no hay token de la API de
//      administración de Supabase, la fila dice NO MEDIDO, no ✅. Una ausencia
//      de información renderizada como buena noticia es el error que este repo
//      ya se autoimputó una vez.
//   3. **El veredicto se calcula, no se transcribe.** El exit code sale de los
//      hallazgos; si un bloqueador aparece, sale 1.
//
// Ver `docs/OPS.md §14` (auditoría de puesta en marcha y checklist).

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const EXIT_OK = 0
const EXIT_BLOCKED = 1

const argv = process.argv.slice(2)
const asJson = argv.includes("--json")
const urlFlag = argv.indexOf("--url")
const BASE = (urlFlag !== -1 ? argv[urlFlag + 1] : undefined) ?? "https://resurte.me"
const BASE_URL = BASE.replace(/\/$/, "")

/** Rutas que un cliente necesita y su código esperado. */
const ROUTES = [
  ["/", 200],
  ["/auth/login", 200],
  ["/auth/register", 200],
  ["/cart", 200],
]

const results = []

/** Registra una medición. `ok: null` = NO MEDIDO (nunca se pinta como bueno). */
function record(id, label, ok, detail, blocker = false) {
  results.push({ id, label, ok, detail, blocker })
}

async function get(path, options = {}) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      ...options,
    })
    return { status: res.status, body: await res.text().catch(() => "") }
  } catch (error) {
    return { status: 0, body: "", error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * El modo de la llave de Stripe, leído del bundle desplegado.
 *
 * Es el único lugar donde se puede saber sin credenciales: `NEXT_PUBLIC_*` se
 * hornea en el build, así que lo que sirve el navegador es lo que hay. Vercel
 * marca la variable como Sensitive y `vercel env pull` la devuelve como
 * `[SENSITIVE]`, o sea que el panel no sirve para esto.
 */
async function stripeKeyMode() {
  const home = await get("/")
  if (home.status !== 200) {
    return { mode: "unknown", detail: `la home respondió ${home.status || "sin respuesta"}` }
  }

  const chunks = [...new Set(home.body.match(/\/(?:_next|_nuxt)\/static\/[A-Za-z0-9/._-]*\.js/g) ?? [])]
  if (chunks.length === 0) {
    return { mode: "unknown", detail: "no se encontraron chunks de JS en la home" }
  }

  const keys = new Set()
  for (const chunk of chunks) {
    const js = await get(chunk)
    for (const match of js.body.matchAll(/loadStripe\(\s*["'](pk_(?:live|test)_[^"']*)["']/g)) {
      keys.add(match[1])
    }
  }

  if (keys.size === 0) {
    // Puede pasar legítimamente: el chunk del checkout se carga en diferido y
    // no siempre está en el grafo de la home. Se dice, no se asume.
    return {
      mode: "unknown",
      detail: `${chunks.length} chunks revisados, sin loadStripe(): la llave no está en el grafo de la home`,
    }
  }

  const list = [...keys]
  const live = list.filter((key) => key.startsWith("pk_live_"))
  return {
    mode: live.length > 0 && live.length === list.length ? "live" : "test",
    detail: list.map((key) => `${key.slice(0, 12)}…`).join(", "),
    count: list.length,
  }
}

/**
 * Candidatos a token de la API de administración de Supabase, en orden de
 * preferencia. Nunca se imprimen.
 *
 * Se devuelven **varios** a propósito: el 23-sep-2026 el token de
 * `~/.supabase/access-token` daba 401 mientras el del Keychain de macOS daba
 * 200, así que quedarse con el primero convertía una credencial caducada en un
 * "NO MEDIDO" silencioso. Se prueban todos y se usa el que responda.
 */
function supabaseTokenCandidates() {
  const tokens = []

  const fromEnv = process.env.SUPABASE_ACCESS_TOKEN?.trim()
  if (fromEnv) tokens.push(fromEnv)

  // En macOS el CLI guarda el token vigente en el Keychain.
  if (process.platform === "darwin") {
    try {
      const token = execFileSync("security", ["find-generic-password", "-s", "Supabase CLI", "-w"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim()
      if (token) tokens.push(token)
    } catch {
      // Sin Keychain: se sigue con lo que haya.
    }
  }

  const tokenFile = join(homedir(), ".supabase", "access-token")
  if (existsSync(tokenFile)) {
    const token = readFileSync(tokenFile, "utf8").trim()
    if (token) tokens.push(token)
  }

  return [...new Set(tokens)]
}

function supabaseProjectRef() {
  const fromUrl = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  )
  if (fromUrl) return fromUrl[1]

  const refFile = join(process.cwd(), "supabase", ".temp", "project-ref")
  if (existsSync(refFile)) {
    const ref = readFileSync(refFile, "utf8").trim()
    if (ref) return ref
  }
  return null
}

async function supabaseAuthConfig() {
  const tokens = supabaseTokenCandidates()
  const ref = supabaseProjectRef()
  if (tokens.length === 0 || !ref) {
    return {
      measured: false,
      detail: "sin token de la API de administración (SUPABASE_ACCESS_TOKEN, Keychain) o sin project-ref",
    }
  }

  let lastStatus = 0
  for (const token of tokens) {
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) {
        lastStatus = res.status
        continue
      }
      const config = await res.json()
      return {
        measured: true,
        smtpConfigured: Boolean(config.smtp_host && config.smtp_user && config.smtp_pass),
        smtpHost: config.smtp_host ?? null,
        autoconfirm: config.mailer_autoconfirm === true,
        emailRateLimit: config.rate_limit_email_sent ?? null,
        signupDisabled: config.disable_signup === true,
        googleEnabled: config.external_google_enabled === true,
      }
    } catch (error) {
      return { measured: false, detail: error instanceof Error ? error.message : String(error) }
    }
  }

  return {
    measured: false,
    detail: `ninguno de los ${tokens.length} tokens probados funcionó (último: HTTP ${lastStatus}). \`npx supabase login\` renueva el del Keychain`,
  }
}

/** Ejecuta SQL de solo lectura por la API de administración. `null` si no se pudo. */
async function supabaseQuery(sql) {
  const tokens = supabaseTokenCandidates()
  const ref = supabaseProjectRef()
  if (tokens.length === 0 || !ref) return null

  for (const token of tokens) {
    try {
      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: sql }),
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) continue
      const rows = await res.json()
      return Array.isArray(rows) ? rows : null
    } catch {
      return null
    }
  }
  return null
}

/**
 * Fecha desde la que una cancelación de contra entrega ya es una regresión.
 *
 * El barrido de recuperación de pagos canceló los 4 pedidos contra entrega que
 * existían antes de esta fecha (ver `docs/OPS.md §14.7`). Esas cuatro filas son
 * el registro de lo que pasó y no deben reportarse como fallo nuevo; lo que sí
 * importa es que no aparezca una quinta.
 */
const PAYMENT_RECOVERY_FIX_DATE = "2026-10-01"

/**
 * Canario del defecto que cancelaba los pedidos contra entrega.
 *
 * `checkAndSendPaymentReminders()` seleccionaba por `payment_status='pending'`
 * sin mirar el método, y un pedido contra entrega nace `pending` porque se paga
 * al recibir. El resultado fue que todo pedido en efectivo se cancelaba a las 72
 * h. La firma es inconfundible y se puede buscar en la base: un pedido
 * `cash_on_delivery` con `payment_status='pending'` cancelado entre 72 y 96
 * horas después de crearse —la ventana del primer barrido diario tras el
 * umbral—.
 *
 * Esto vive aquí y no solo en los tests a propósito: los tests prueban el código
 * del repo, y este canario prueba lo que la base **tiene**. Si un despliegue
 * viejo o una ruta que nadie recuerda reintroduce el defecto, la firma aparece
 * en los datos aunque el código esté limpio.
 */
async function codSweepCanary() {
  const rows = await supabaseQuery(
    `select count(*)::int as n, max(updated_at)::date::text as ultima
     from orders
     where payment_method = 'cash_on_delivery'
       and payment_status = 'pending'
       and status = 'cancelled'
       and updated_at - created_at between interval '72 hours' and interval '96 hours'`
  )
  if (!rows || rows.length === 0) return { measured: false, detail: "sin acceso de lectura a la base" }

  const total = Number(rows[0]?.n ?? 0)
  const ultima = rows[0]?.ultima ?? null
  const posteriores = await supabaseQuery(
    `select count(*)::int as n
     from orders
     where payment_method = 'cash_on_delivery'
       and payment_status = 'pending'
       and status = 'cancelled'
       and updated_at - created_at between interval '72 hours' and interval '96 hours'
       and updated_at >= date '${PAYMENT_RECOVERY_FIX_DATE}'`
  )
  const nuevas = Number(posteriores?.[0]?.n ?? 0)

  return {
    measured: true,
    total,
    ultima,
    nuevas,
    detail:
      nuevas > 0
        ? `${nuevas} pedido(s) contra entrega cancelado(s) por el barrido DESPUÉS del ${PAYMENT_RECOVERY_FIX_DATE}: el defecto volvió`
        : `${total} cancelación(es) histórica(s) del defecto${ultima ? `, la última el ${ultima}` : ""}; ninguna desde el ${PAYMENT_RECOVERY_FIX_DATE}`,
  }
}

// --- 1. Cobro: modo de la llave de Stripe -------------------------------------
const stripe = await stripeKeyMode()
if (stripe.mode === "live") {
  record("stripe", "Stripe en modo live", true, stripe.detail)
} else if (stripe.mode === "test") {
  record(
    "stripe",
    "Stripe en modo live",
    false,
    `el bundle sirve una llave de TEST (${stripe.detail}): ninguna tarjeta real puede cobrarse`,
    true
  )
} else {
  record("stripe", "Stripe en modo live", null, stripe.detail, true)
}

// --- 2. Rutas que el cliente necesita ----------------------------------------
const routeResults = await Promise.all(
  ROUTES.map(async ([path, expected]) => ({ path, expected, ...(await get(path)) }))
)
const brokenRoutes = routeResults.filter((r) => r.status !== r.expected)
record(
  "routes",
  `${ROUTES.length} rutas clave responden`,
  brokenRoutes.length === 0,
  brokenRoutes.length === 0
    ? routeResults.map((r) => `${r.path}=${r.status}`).join(" ")
    : brokenRoutes.map((r) => `${r.path}=${r.status || "sin respuesta"} (esperado ${r.expected})`).join(" "),
  brokenRoutes.length > 0
)

// --- 3. Webhook de Stripe ----------------------------------------------------
const webhook = await get("/api/webhooks/stripe", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: "evt_launch_check", type: "payment_intent.succeeded" }),
})
// 400 es el resultado bueno: el endpoint existe y rechaza lo que no trae firma
// válida. Un 404 significa que no está desplegado; un 500, que revienta.
//
// El cuerpo importa tanto como el código, y esto se aprendió a golpes: el
// 08-oct-2026 se renombró `STRIPE_SECRET_KEY` por accidente (se editó el campo
// del nombre en vez del valor) y la variable desapareció. El despliegue en curso
// siguió sano —conserva su instantánea de variables— pero **el siguiente
// despliegue** habría dejado el cobro con tarjeta y el webhook rotos, sin más
// señal que un 400 igual al de siempre. El endpoint devuelve el mensaje real en
// el cuerpo, así que se puede distinguir "falta configurar" de "firma inválida".
const webhookBody = webhook.body ?? ""
const missingConfig = /is not defined|no está configurado/i.test(webhookBody)

if (missingConfig) {
  const varName = /([A-Z][A-Z0-9_]{4,})/.exec(webhookBody)?.[1] ?? "una variable de Stripe"
  record(
    "webhook",
    "Webhook de Stripe desplegado y validando firma",
    false,
    `el despliegue no tiene configurada ${varName}: el webhook y el cobro con tarjeta fallarán. ` +
      `Respuesta: ${webhookBody.slice(0, 120)}`,
    true
  )
} else if (webhook.status === 400) {
  record(
    "webhook",
    "Webhook de Stripe desplegado y validando firma",
    true,
    "POST sin firma → 400 (rechaza lo que no está firmado)"
  )
} else {
  record(
    "webhook",
    "Webhook de Stripe desplegado y validando firma",
    false,
    `POST sin firma → ${webhook.status || "sin respuesta"} (se espera 400)`,
    true
  )
}

// --- 4. Cron fail-closed -----------------------------------------------------
const cron = await get("/api/cron/daily")
record(
  "cron",
  "Cron protegido (401 sin secreto)",
  cron.status === 401,
  `GET /api/cron/daily → ${cron.status || "sin respuesta"}`,
  false
)

// --- 5. Registro por email: SMTP de Supabase ---------------------------------
const auth = await supabaseAuthConfig()
if (!auth.measured) {
  record("smtp", "Registro por email con SMTP propio", null, auth.detail, false)
} else if (auth.smtpConfigured) {
  record("smtp", "Registro por email con SMTP propio", true, `smtp_host=${auth.smtpHost}`)
} else if (auth.autoconfirm) {
  // El alta funciona (no depende del correo), pero la recuperación de
  // contraseña sigue necesitando el correo. No es un bloqueador para vender; sí
  // es una deuda que no debe volverse invisible.
  record(
    "smtp",
    "Registro por email con SMTP propio",
    false,
    "confirmación por correo DESACTIVADA (autoconfirm): el alta entra sin correo, " +
      "pero «olvidé mi contraseña» NO funciona y los correos de pedido no salen. Falta SMTP propio",
    false
  )
} else {
  const limit = auth.emailRateLimit === null ? "?" : auth.emailRateLimit
  record(
    "smtp",
    "Registro por email con SMTP propio",
    false,
    `sin SMTP y con confirmación obligatoria: el alta depende del correo por defecto de Supabase, limitado a ${limit} correos por hora`,
    true
  )
}

/**
 * Auditoría de la configuración de Stripe en Vercel.
 *
 * POR QUÉ EXISTE: la sonda del webhook (arriba) mira el despliegue **en curso**,
 * y ese conserva su instantánea de variables. Así que puede reportar todo verde
 * mientras la configuración del proyecto está rota y **el siguiente despliegue**
 * va a fallar. Pasó exactamente eso el 08-oct-2026: se renombró
 * `STRIPE_SECRET_KEY` por accidente y el sitio seguía sano, con la mina armada
 * para el próximo deploy.
 *
 * Mira nombres y fechas, nunca valores: las tres variables están marcadas
 * `sensitive` y Vercel no las devuelve.
 */
const STRIPE_ENV_VARS = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
]

function vercelProjectId() {
  const path = join(process.cwd(), ".vercel", "project.json")
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf8")).projectId ?? null
  } catch {
    return null
  }
}

async function vercelStripeEnvAudit() {
  const projectId = vercelProjectId()
  if (!projectId) return { measured: false, detail: "sin .vercel/project.json (proyecto no vinculado)" }

  let payload
  try {
    const raw = execFileSync("npx", ["vercel", "api", `/v9/projects/${projectId}/env`], {
      encoding: "utf8",
      timeout: 90_000,
      stdio: ["ignore", "pipe", "ignore"],
    })
    payload = JSON.parse(raw.slice(raw.indexOf("{")))
  } catch {
    return { measured: false, detail: "no se pudo consultar la API de Vercel (¿sesión caducada?)" }
  }

  const envs = payload.envs ?? []
  const names = envs.map((e) => e.key)
  const missing = STRIPE_ENV_VARS.filter((name) => !names.includes(name))

  // El error de captura que ya ocurrió dos veces: pegar la llave en el campo del
  // NOMBRE en vez del valor. Crea una variable inútil y deja la llave en claro.
  const strayKeys = names.filter(
    (name) => /^(sk|pk|rk|whsec)_/.test(name) || !/^[A-Za-z0-9_]+$/.test(name)
  )

  const problemas = []
  if (missing.length > 0) {
    problemas.push(`falta(n) ${missing.join(", ")}: el próximo despliegue rompería el cobro con tarjeta`)
  }
  if (strayKeys.length > 0) {
    problemas.push(
      `${strayKeys.length} variable(s) con nombre de llave (${strayKeys.map((n) => `${n.slice(0, 14)}…`).join(", ")}): ` +
        `la llave se pegó en el campo del NOMBRE, no del valor`
    )
  }

  return { measured: true, missing, strayKeys, total: envs.length, problems: problemas }
}

// --- 6. Canario: el barrido no debe cancelar pedidos contra entrega -----------
const canary = await codSweepCanary()
if (!canary.measured) {
  record("cod-sweep", "Contra entrega a salvo del barrido de impagos", null, canary.detail, false)
} else {
  record(
    "cod-sweep",
    "Contra entrega a salvo del barrido de impagos",
    canary.nuevas === 0,
    canary.detail,
    canary.nuevas > 0
  )
}

// --- 7. Configuración de Stripe en Vercel (mira el próximo despliegue) --------
const envAudit = await vercelStripeEnvAudit()
if (!envAudit.measured) {
  record("stripe-env", "Configuración de Stripe en Vercel", null, envAudit.detail, false)
} else {
  record(
    "stripe-env",
    "Configuración de Stripe en Vercel",
    envAudit.problems.length === 0,
    envAudit.problems.length === 0
      ? `las 3 variables están puestas (${envAudit.total} en total, sin nombres sospechosos)`
      : envAudit.problems.join("; "),
    envAudit.problems.length > 0
  )
}

// --- Salida ------------------------------------------------------------------
const blockers = results.filter((r) => r.blocker && r.ok !== true)
const unmeasured = results.filter((r) => r.ok === null)

if (asJson) {
  console.log(JSON.stringify({ url: BASE_URL, results, blockers: blockers.length, unmeasured: unmeasured.length }, null, 2))
} else {
  const mark = (ok) => (ok === true ? "✅" : ok === false ? "❌" : "⚠️ NO MEDIDO")
  console.log(`\nPuesta en marcha — ${BASE_URL}\n`)
  for (const r of results) {
    console.log(`${mark(r.ok)}  ${r.label}`)
    if (r.detail) console.log(`     ${r.detail}`)
  }
  console.log("")
  if (blockers.length === 0) {
    console.log("Sin bloqueadores detectados en lo que se pudo medir.")
  } else {
    console.log(`✖ ${blockers.length} bloqueador(es):`)
    for (const r of blockers) console.log(`  · ${r.label} — ${r.detail}`)
  }
  if (unmeasured.length > 0) {
    console.log(`\n⚠️  ${unmeasured.length} comprobación(es) NO MEDIDAS (no son un ✅).`)
  }
  console.log("\nDetalle y comandos: docs/OPS.md §14.")
}

process.exit(blockers.length > 0 ? EXIT_BLOCKED : EXIT_OK)
