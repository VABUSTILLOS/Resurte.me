// Verifica que el setup de autenticación esté sano:
//   1. El trigger handle_new_user existe y crea profiles al registrar.
//   2. Un signup de prueba crea su profile correctamente.
//   3. profiles.role admite 'admin' (migración 00067 aplicada).
//
// Uso: node scripts/verify-auth-setup.mjs
// Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el
// entorno o en .env.local. El usuario de prueba se crea y se elimina.
import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const envPath = join(process.cwd(), ".env.local")
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "")
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !key) {
  console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let failures = 0
function check(ok, label, detail = "") {
  if (ok) console.log(`✅ ${label}`)
  else {
    failures++
    console.error(`❌ ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

async function main() {
  // La verificación del trigger handle_new_user es indirecta: si el signup
  // de prueba crea su profile, el trigger funciona.

  // 1. Signup de prueba (con admin API para no enviar correo real)
  const testEmail = `auth-check-${Date.now()}@example.invalid`
  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email: testEmail,
      password: "AuthCheck!234",
      email_confirm: true,
      user_metadata: { full_name: "Auth Check" },
    })
  check(!createError, "Crear usuario de prueba vía Admin API", createError?.message)

  let userId = created?.user?.id
  try {
    if (userId) {
      // 2. El trigger creó el profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", userId)
        .maybeSingle()
      check(
        !profileError && !!profile,
        "handle_new_user crea el profile automáticamente",
        profileError?.message ?? "profile no encontrado"
      )
      check(
        profile?.full_name === "Auth Check",
        "El profile copia full_name desde user_metadata",
        `full_name=${profile?.full_name}`
      )

      // 3. profiles.role admite 'admin' (migración 00067)
      const { error: roleError } = await supabase
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", userId)
      check(
        !roleError,
        "profiles.role admite 'admin' (migración 00067 aplicada)",
        roleError?.message
      )
    }
  } finally {
    if (userId) {
      const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)
      if (deleteError) {
        console.warn(`⚠️  No se pudo eliminar el usuario de prueba ${userId}: ${deleteError.message}`)
      } else {
        console.log("🧹 Usuario de prueba eliminado.")
      }
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} verificación(es) fallaron.`)
    process.exit(1)
  }
  console.log("\nTodo el setup de autenticación está sano. 🎉")
}

main().catch((err) => {
  console.error("❌ Error:", err.message ?? err)
  process.exit(1)
})
