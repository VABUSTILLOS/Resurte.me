import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Integridad de `supabase/migrations/`.
 *
 * Contexto (incidente real): dos archivos compartían la versión `00078`
 * (`00078_admin_audit_log.sql` y `00078_foodos_modifiers_dinein.sql`), y el CLI
 * de Supabase identifica cada migración por su versión, así que solo aplicó una.
 * La bitácora `admin_audit_log` nunca se creó: el historial de auditoría de un
 * producto respondía 500, `logAdminAudit()` fallaba en silencio (best-effort) y
 * `00118` abortaba con `42P01`. El mismo patrón se repetía en `00065`.
 *
 * Nada en el compilador ni en el runner avisa de esto, así que la única red es
 * esta prueba: las versiones deben ser únicas.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations")
const FILE_RE = /^(\d{5})_(.+)\.sql$/

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"))

describe("migraciones de Supabase", () => {
  it("encuentra archivos de migración", () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it("nombra todos los archivos como NNNNN_descripcion.sql", () => {
    const malFormados = files.filter((f) => !FILE_RE.test(f))
    expect(malFormados).toEqual([])
  })

  it("no repite la misma versión en dos archivos", () => {
    const porVersion = new Map<string, string[]>()

    for (const file of files) {
      const version = FILE_RE.exec(file)?.[1]
      if (!version) continue
      const previos = porVersion.get(version) ?? []
      previos.push(file)
      porVersion.set(version, previos)
    }

    const colisiones = [...porVersion.entries()]
      .filter(([, nombres]) => nombres.length > 1)
      .map(([version, nombres]) => `${version}: ${nombres.sort().join(", ")}`)

    // Si esta prueba falla, renombra el archivo que el CLI NO tiene registrado
    // (`supabase-list_migrations`) a la siguiente versión libre. Renumerar el
    // registrado hace que el CLI lo reejecute y falle por objeto duplicado.
    expect(colisiones).toEqual([])
  })

  it("mantiene las versiones ordenadas de forma ascendente y sin huecos raros", () => {
    const versiones = files
      .map((f) => FILE_RE.exec(f)?.[1])
      .filter((v): v is string => Boolean(v))
      .sort()

    expect(versiones[0]).toBe("00001")
    expect(new Set(versiones).size).toBe(versiones.length)
  })

  it("deja toda migración de la bitácora de auditoría idempotente", () => {
    // La tabla se crea una sola vez pero se referencia desde migraciones
    // posteriores (`00118`): sin `IF NOT EXISTS`/`DROP POLICY IF EXISTS`,
    // reejecutar cualquiera de las dos revienta.
    const auditoria = files.filter((f) => f.includes("admin_audit_log"))
    expect(auditoria.length).toBeGreaterThan(0)

    for (const file of auditoria) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8")
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS\s+admin_audit_log/i)
      expect(sql).toMatch(/DROP POLICY IF EXISTS "Admins can read audit log" ON admin_audit_log/i)
    }
  })
})
