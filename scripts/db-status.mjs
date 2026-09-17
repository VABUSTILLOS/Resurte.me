#!/usr/bin/env node
// ¿Me falta correr alguna migración? Read-only.
//
// Uso:
//   npm run db:status             # una línea: al día, o qué pasa
//   npm run db:status --verbose   # + las últimas filas del ledger
//
// Por qué existe: `supabase db push` responde "upToDate" en dos escenarios muy
// distintos, y solo uno es bueno.
//
//   1. El ledger está sano y todo está aplicado.  -> nada que hacer.
//   2. Hay migraciones que se aplicaron a mano (SQL Editor) o por MCP: no
//      tienen fila propia, así que el ledger no las conoce. Como `db push`
//      solo empuja versiones locales MAYORES que la máxima remota, esas
//      migraciones nunca se re-aplican en un entorno nuevo y el "al día" es
//      mentira por omisión. Le pasó a `00082`-`00085`, `00116` y `00117`.
//
// Y el caso peor, que `db push` no sabe explicar: si una migración se aplicó
// por MCP, el ledger guarda un TIMESTAMP (`20260917190303`) en vez del número
// del archivo (`00154`). Eso rompe la regla de prefijo de la CLI y `db push`
// falla entero con `LegacyDbPushMissingLocalError` — no se puede aplicar nada
// más hasta repararlo. Por eso este comando compara el ledger en las dos
// direcciones en vez de confiar en el "upToDate" de `push`.
//
// Ver docs/OPS.md §«Migraciones históricas de aplicación manual» y §9.
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

const EXIT_OK = 0
const EXIT_WORK_PENDING = 1
const EXIT_UNAVAILABLE = 2

const verbose = process.argv.includes("--verbose")
const cwd = process.cwd()

function supabaseBin() {
  const local = join(cwd, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase")
  return existsSync(local) ? local : null
}

function listMigrations() {
  const bin = supabaseBin()
  const command = bin ?? "npx"
  const args = bin ? ["migration", "list", "--linked"] : ["supabase", "migration", "list", "--linked"]

  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    // `supabase` es una dependencia de desarrollo: si no está instalada, el
    // fallo tiene que ser un mensaje, no un volcado de npx.
    stdio: ["ignore", "pipe", "pipe"],
  })

  if (result.error) {
    return { ok: false, reason: `no se pudo ejecutar la CLI de Supabase (${result.error.message})` }
  }

  const stdout = result.stdout ?? ""
  const stderr = result.stderr ?? ""

  // El CLI imprime JSON en stdout y las líneas de progreso en stderr. Aun así
  // se toleran líneas sueltas antes del JSON.
  const jsonStart = stdout.indexOf("{")
  if (jsonStart === -1) {
    return { ok: false, reason: firstMeaningfulLine(stderr) || firstMeaningfulLine(stdout) || "la CLI no devolvió JSON" }
  }

  let parsed
  try {
    parsed = JSON.parse(stdout.slice(jsonStart))
  } catch {
    return { ok: false, reason: "la CLI devolvió algo que no es JSON válido" }
  }

  if (parsed.error) {
    return { ok: false, reason: parsed.error.message ?? "error desconocido de la CLI" }
  }
  if (!Array.isArray(parsed.migrations)) {
    return { ok: false, reason: firstMeaningfulLine(stderr) || "la CLI no devolvió la lista de migraciones" }
  }

  return { ok: true, rows: parsed.migrations }
}

function firstMeaningfulLine(text) {
  return (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("Initialising") && !line.startsWith("Connecting"))
    .at(0)
}

const result = listMigrations()

if (!result.ok) {
  console.error(`⚠️  No se pudo leer el ledger: ${result.reason}`)
  console.error("    ¿Está el proyecto vinculado? `npx supabase link --project-ref <ref>` y `npx supabase login`.")
  process.exit(EXIT_UNAVAILABLE)
}

const { rows } = result
const pending = rows.filter((row) => row.local && !row.remote)
const orphanRemote = rows.filter((row) => row.remote && !row.local)
const applied = rows.filter((row) => row.local && row.remote)

if (verbose) {
  // "sin fila en el ledger", no "pendientes": una migración puede estar aplicada
  // en la base y aun así no tener fila con su número (ver el caso MCP más abajo).
  console.log(`Ledger: ${applied.length} aplicadas · ${pending.length} sin fila numérica · ${orphanRemote.length} remotas sin archivo local`)
  if (orphanRemote.length > 0 && orphanRemote.length === pending.length) {
    console.log(`  ↳ las ${pending.length} sin fila y las ${orphanRemote.length} huérfanas cuadran 1:1:`)
    console.log("    son las MISMAS migraciones, aplicadas por MCP. No están pendientes.")
  }
  for (const row of rows.slice(-10)) {
    const local = row.local || "—"
    const remote = row.remote || "—"
    console.log(`  ${local.padEnd(16)} ${remote.padEnd(16)} ${row.time ?? ""}`)
  }
  console.log("")
}

// El caso peor va primero: con una versión remota huérfana, `db push` no
// funciona en absoluto, así que "faltan N por aplicar" sería un diagnóstico
// engañoso — el usuario lo intentaría y fallaría.
if (orphanRemote.length > 0) {
  console.error("⚠️  Ledger desincronizado: la base tiene versiones que no existen como archivo local.")
  console.error("    `supabase db push` está BLOQUEADO (LegacyDbPushMissingLocalError) hasta repararlo.")
  for (const row of orphanRemote) {
    console.error(`    · ${row.remote}  (${row.time ?? "sin fecha"})`)
  }
  console.error("")
  console.error("    Pasa cuando la migración se aplicó por MCP `apply_migration`, que registra un")
  console.error("    timestamp en vez del número del archivo. Reparación (escribe SOLO el ledger,")
  console.error("    no ejecuta SQL de la migración):")
  for (const row of orphanRemote) {
    console.error(`      npx supabase migration repair --status reverted ${row.remote}`)
  }
  const missing = pending.map((row) => row.local)
  if (missing.length > 0) {
    console.error("    Y después, la fila con el número del archivo. Confirma ANTES que el DDL")
    console.error("    está aplicado (sonda REST, o compara el esquema): `repair` no ejecuta SQL.")
    for (const version of missing) {
      console.error(`      npx supabase migration repair --status applied ${version}`)
    }
  }
  process.exit(EXIT_WORK_PENDING)
}

if (pending.length > 0) {
  console.log(`🔜 Faltan ${pending.length} migración(es) por aplicar: ${pending.map((row) => row.local).join(", ")}`)
  console.log("   Aplícalas con: npx supabase db push")
  process.exit(EXIT_WORK_PENDING)
}

console.log(`✅ Al día — ${applied.length} migraciones aplicadas, nada que correr.`)
process.exit(EXIT_OK)
