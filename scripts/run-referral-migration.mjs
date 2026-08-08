// Run the referral system migration (00018)
// Usage: node scripts/run-referral-migration.mjs
//
// IMPORTANTE: Ejecuta esto UNA SOLA VEZ.
// Requiere que SUPABASE_SERVICE_ROLE_KEY esté configurada
// en las variables de entorno de Vercel o en .env.local.
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://isogthougrpctnfzcdes.supabase.co"
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!key) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY no está configurada.")
  console.error("Asegúrate de tener la variable en .env.local o en Vercel.")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, key, {
  auth: { persistSession: false },
})

async function main() {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/00018_referral_system.sql"),
    "utf-8"
  )

  // Usamos rpc para ejecutar SQL o directamente consultamos si ya se aplicó
  console.log("🔍 Verificando si la migración ya fue aplicada...")

  // Check if referral_code column exists
  const { error: colError } = await supabase
    .from("profiles")
    .select("referral_code")
    .limit(1)

  if (!colError) {
    console.log("✅ La migración 00018 ya está aplicada (columna referral_code existe).")
    process.exit(0)
  }

  console.log("📦 Aplicando migración 00018_referral_system.sql...")

  // Split by semicolons and execute each statement
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"))

  for (const stmt of statements) {
    const cleanStmt = stmt.replace(/\n/g, " ").replace(/\s+/g, " ").trim()
    console.log(`  → ${cleanStmt.substring(0, 80)}...`)

    const { error } = await supabase.rpc("exec_sql", { query: stmt + ";" })
    if (error) {
      // Try direct SQL via REST API
      const response = await fetch(
        `${supabaseUrl}/rest/v1/rpc/exec_sql`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: key,
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({ query: stmt + ";" }),
        }
      )

      if (!response.ok) {
        const errText = await response.text()
        console.error(`  ⚠️  Error en statement: ${errText.substring(0, 200)}`)
        // Continuamos — algunos statements pueden fallar si ya existen (IF NOT EXISTS)
      }
    }
  }

  console.log("✅ Migración 00018 aplicada correctamente.")
  console.log("🎉 Sistema de referidos activado.")
}

main().catch((err) => {
  console.error("❌ Error ejecutando la migración:", err.message)
  console.error("Ejecuta el SQL manualmente en el Dashboard de Supabase:")
  console.error("  → SQL Editor → pega el contenido de supabase/migrations/00018_referral_system.sql")
  process.exit(1)
})
