// Bootstrap del master admin de Resurte.me
// Uso: node scripts/make-admin.mjs <email>
//
// Promueve el usuario con ese email a rol admin:
//   1. profiles.role = 'admin'  (fuente principal, migración 00067)
//   2. INSERT en admin_users    (legado, migración 00030, se mantiene sincronizada)
//
// El usuario debe existir (registrado previamente por email o Google).
// Requiere SUPABASE_SERVICE_ROLE_KEY en el entorno o en .env.local.
import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

// Carga .env.local si existe (las vars de entorno del shell tienen prioridad)
const envPath = join(process.cwd(), ".env.local")
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "")
    }
  }
}

const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.error("Uso: node scripts/make-admin.mjs <email>")
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !key) {
  console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.")
  console.error("Configúralas en .env.local o en el entorno.")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  // 1. Buscar el usuario en auth.users por email (Admin API)
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (listError) throw listError

  const user = list.users.find((u) => u.email?.toLowerCase() === email)
  if (!user) {
    console.error(`❌ No existe ningún usuario registrado con ${email}.`)
    console.error("Regístrate primero en /auth/register (o con Google) y vuelve a correr el script.")
    process.exit(1)
  }

  // 2. Asegurar profile y promover a admin
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, role: "admin" },
      { onConflict: "id", ignoreDuplicates: false }
    )
  if (profileError) throw profileError

  // 3. Mantener admin_users sincronizada (legado)
  const { error: legacyError } = await supabase
    .from("admin_users")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true })
  if (legacyError) {
    // La tabla puede no existir si la migración 00030 no se aplicó; no es fatal.
    console.warn(`⚠️  No se pudo sincronizar admin_users: ${legacyError.message}`)
  }

  console.log(`✅ ${email} (${user.id}) ahora es administrador.`)
  console.log("Puede entrar a /admin y gestionar otros usuarios en /admin/usuarios.")
}

main().catch((err) => {
  console.error("❌ Error:", err.message ?? err)
  process.exit(1)
})
