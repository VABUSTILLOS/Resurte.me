#!/usr/bin/env node
// Gestión de cuentas admin (master admin) de Resurte.me.
//
// Uso:
//   node scripts/admin-credentials.mjs list
//   node scripts/admin-credentials.mjs create <email> [password] [--name "Nombre"]
//   node scripts/admin-credentials.mjs promote <email> [--name "Nombre"]
//   node scripts/admin-credentials.mjs password <email> [password]
//
// Requiere la URL del proyecto y una clave de servicio reales, en el entorno o
// en .env.local:
//   URL   -> NEXT_PUBLIC_SUPABASE_URL  (o SUPABASE_URL)
//   clave -> SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY)
//
// Ojo: en Vercel esas variables están marcadas como "Sensitive", así que la CLI
// no puede leerlas — `vercel env pull` escribe [SENSITIVE] y `vercel env run`
// las omite. Hay que copiarlas a mano desde el panel de Supabase.
//
// Ver docs/OPS.md §8.2 (roles del sitio y master admin).
import { createClient } from "@supabase/supabase-js"
import { randomBytes } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

// Mismo criterio que src/lib/supabase/env.ts: un valor redactado no sirve.
const PLACEHOLDERS = new Set([
  "[SENSITIVE]",
  "your-project-url",
  "your-supabase-url",
  "your-anon-key",
  "dummy-anon-key",
])

const envPath = join(process.cwd(), ".env.local")
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "")
    }
  }
}

function readEnv(name) {
  const raw = process.env[name]?.trim().replace(/^["']|["']$/g, "")
  if (!raw || PLACEHOLDERS.has(raw)) return null
  return raw
}

const HELP = `Gestión de cuentas admin de Resurte.me

  node scripts/admin-credentials.mjs list
      Lista las cuentas admin actuales y de qué fuente proviene cada una.

  node scripts/admin-credentials.mjs create <email> [password] [--name "Nombre"]
      Crea una cuenta nueva ya confirmada y le da rol admin.
      Sin password se genera una aleatoria y se imprime una sola vez.

  node scripts/admin-credentials.mjs promote <email> [--name "Nombre"]
      Da rol admin a una cuenta ya registrada.

  node scripts/admin-credentials.mjs password <email> [password]
      Cambia la contraseña de una cuenta existente.

Fuentes de admin (cualquiera basta, ver docs/OPS.md §8.2):
  profiles.role='admin' · ADMIN_EMAILS · admin_users (legado)
`

let supabase = null

function requireCredentials() {
  const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL") ?? readEnv("SUPABASE_URL")
  const serviceKey =
    readEnv("SUPABASE_SERVICE_ROLE_KEY") ?? readEnv("SUPABASE_SECRET_KEY")

  if (!supabaseUrl || !serviceKey) {
    console.error("❌ Faltan credenciales reales de Supabase.")
    console.error("")
    console.error("   Necesito la URL del proyecto y una clave de servicio:")
    console.error("     URL   → NEXT_PUBLIC_SUPABASE_URL  (o SUPABASE_URL)")
    console.error("     clave → SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY)")
    console.error("")
    console.error("   `vercel env pull` NO sirve aquí: esas variables están marcadas")
    console.error("   como \"Sensitive\" en Vercel y la CLI no puede leerlas (escribe")
    console.error("   [SENSITIVE] o las omite). Cópialas a mano:")
    console.error("")
    console.error("     1. https://supabase.com/dashboard → tu proyecto → Settings → API")
    console.error("     2. Copia \"Project URL\" y la clave \"service_role\"")
    console.error("     3. Pégalas en .env.local:")
    console.error("          NEXT_PUBLIC_SUPABASE_URL=\"https://xxxx.supabase.co\"")
    console.error("          SUPABASE_SERVICE_ROLE_KEY=\"eyJ...\"")
    console.error("")
    console.error("   Alternativa sin credenciales locales: crea el usuario en")
    console.error("   Supabase (Authentication → Users → Add user, \"Auto Confirm User\")")
    console.error("   y dale el rol con:")
    console.error("     update profiles set role = 'admin' where id = '<uuid>';")
    process.exit(1)
  }

  supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return supabase
}

function generatePassword(length = 20) {
  // Sin caracteres ambiguos (l/I/O/0/1) para que se pueda dictar sin errores.
  const sets = [
    "abcdefghijkmnopqrstuvwxyz",
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "23456789",
    "!@#$%^&*-_=+",
  ]
  const all = sets.join("")
  const pick = (set) => set[randomBytes(1)[0] % set.length]
  const chars = sets.map(pick)
  while (chars.length < length) chars.push(pick(all))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join("")
}

async function listAllUsers() {
  const users = []
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) break
  }
  return users
}

async function findUserByEmail(email) {
  const users = await listAllUsers()
  return users.find((u) => u.email?.toLowerCase() === email) ?? null
}

// Escribe las dos fuentes persistidas: profiles.role (principal) y la tabla
// legado admin_users. ADMIN_EMAILS es solo env var, no se toca desde aquí.
async function grantAdmin(userId, { fullName } = {}) {
  const profile = { id: userId, role: "admin" }
  if (fullName) profile.full_name = fullName

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(profile, { onConflict: "id", ignoreDuplicates: false })
  if (profileError) throw profileError

  const { error: legacyError } = await supabase
    .from("admin_users")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true })
  if (legacyError) {
    console.warn(`⚠️  No se pudo sincronizar admin_users: ${legacyError.message}`)
  }
}

function parseFlags(args) {
  const rest = []
  let fullName = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name") {
      fullName = args[++i]?.trim() || null
    } else {
      rest.push(args[i])
    }
  }
  return { rest, fullName }
}

async function cmdList() {
  const sources = new Map()
  const add = (id, source) => {
    if (!id) return
    if (!sources.has(id)) sources.set(id, new Set())
    sources.get(id).add(source)
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "admin")
  if (profilesError) throw profilesError
  for (const p of profiles ?? []) add(p.id, "profiles.role")

  const { data: legacy, error: legacyError } = await supabase
    .from("admin_users")
    .select("user_id")
  if (legacyError) {
    console.warn(`⚠️  admin_users no disponible: ${legacyError.message}`)
  } else {
    for (const row of legacy ?? []) add(row.user_id, "admin_users")
  }

  const users = await listAllUsers()
  const byId = new Map(users.map((u) => [u.id, u]))

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const orphanEmails = []
  for (const email of adminEmails) {
    const user = users.find((u) => u.email?.toLowerCase() === email)
    if (user) add(user.id, "ADMIN_EMAILS")
    else orphanEmails.push(email)
  }

  if (sources.size === 0) {
    console.log("No hay ninguna cuenta admin todavía.\n")
    console.log("Crea la primera con:")
    console.log("  node scripts/admin-credentials.mjs create tu@correo.com")
    return
  }

  console.log(`Cuentas admin (${sources.size}):\n`)
  for (const [id, from] of sources) {
    const user = byId.get(id)
    const email = user?.email ?? "(sin email en auth)"
    const lastSignIn = user?.last_sign_in_at
      ? new Date(user.last_sign_in_at).toISOString().slice(0, 10)
      : "nunca"
    console.log(`  ${email}`)
    console.log(`    id: ${id}`)
    console.log(`    fuentes: ${[...from].join(", ")}`)
    console.log(`    último acceso: ${lastSignIn}`)
    console.log("")
  }

  if (orphanEmails.length > 0) {
    console.log("⚠️  En ADMIN_EMAILS pero sin cuenta registrada (no pueden entrar):")
    for (const email of orphanEmails) console.log(`    ${email}`)
    console.log("")
  }
  console.log("Entra en /admin (en local: http://localhost:3000/admin).")
}

async function cmdCreate(email, password, fullName) {
  const existing = await findUserByEmail(email)
  if (existing) {
    console.error(`❌ Ya existe una cuenta con ${email}.`)
    console.error("   Para darle admin:  node scripts/admin-credentials.mjs promote " + email)
    console.error("   Para cambiar clave: node scripts/admin-credentials.mjs password " + email)
    process.exit(1)
  }

  const generated = password ?? generatePassword()
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: generated,
    email_confirm: true,
    user_metadata: { full_name: fullName ?? email.split("@")[0] },
  })
  if (error) throw error

  await grantAdmin(data.user.id, { fullName })

  console.log("✅ Cuenta admin creada.\n")
  console.log(`   correo:     ${email}`)
  console.log(`   contraseña: ${generated}${password ? "" : "   (generada)"}`)
  console.log(`   id:         ${data.user.id}`)
  console.log("")
  console.log("   Guárdala ahora: no se vuelve a mostrar y en Supabase solo queda el hash.")
  console.log("   Entra en /admin (en local: http://localhost:3000/admin).")
}

async function cmdPromote(email, fullName) {
  const user = await findUserByEmail(email)
  if (!user) {
    console.error(`❌ No existe ninguna cuenta registrada con ${email}.`)
    console.error("   Créala con: node scripts/admin-credentials.mjs create " + email)
    process.exit(1)
  }
  await grantAdmin(user.id, { fullName })
  console.log(`✅ ${email} (${user.id}) ahora es administrador.`)
  console.log("   Entra en /admin y gestiona otros usuarios en /admin/usuarios.")
}

async function cmdPassword(email, password) {
  const user = await findUserByEmail(email)
  if (!user) {
    console.error(`❌ No existe ninguna cuenta registrada con ${email}.`)
    process.exit(1)
  }
  const generated = password ?? generatePassword()
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password: generated,
  })
  if (error) throw error

  console.log("✅ Contraseña actualizada.\n")
  console.log(`   correo:     ${email}`)
  console.log(`   contraseña: ${generated}${password ? "" : "   (generada)"}`)
  console.log("")
  console.log("   Guárdala ahora: no se vuelve a mostrar y en Supabase solo queda el hash.")
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(HELP)
    return
  }

  if (!["list", "create", "promote", "password"].includes(command)) {
    console.error(`Comando desconocido: ${command}\n`)
    console.log(HELP)
    process.exit(1)
  }

  // Validar los argumentos antes de exigir credenciales: así el error de uso
  // aparece aunque .env.local todavía no tenga valores reales.
  const { rest: positional, fullName } = parseFlags(rest)
  const [email, password] = positional
  const target = email?.trim().toLowerCase()

  if (command !== "list" && !target) {
    throw new Error(`Falta el email: ${command} <email> [password]`)
  }
  if (password && password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.")
  }

  requireCredentials()

  switch (command) {
    case "list":
      await cmdList()
      break
    case "create":
      await cmdCreate(target, password, fullName)
      break
    case "promote":
      await cmdPromote(target, fullName)
      break
    case "password":
      await cmdPassword(target, password)
      break
  }
}

main().catch((err) => {
  console.error(`❌ Error: ${err.message ?? err}`)
  process.exit(1)
})
