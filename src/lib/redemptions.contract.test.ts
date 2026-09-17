import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  REDEMPTION_STATUSES,
  REDEMPTION_TRANSITIONS,
  type RedemptionStatus,
} from "./redemptions"

/**
 * Contrato entre la máquina de estados de TypeScript y la de PostgreSQL.
 *
 * Incidente que lo motivó: el canje de créditos tenía dos verdades que no se
 * hablaban. `public.advance_redemption()` (migraciones 00151/00152) es la que
 * decide de verdad —valida la transición, devuelve los créditos y escribe el
 * evento del timeline—, mientras `REDEMPTION_TRANSITIONS` decide qué botones
 * ve el equipo. Si divergen, el equipo ve un botón que la base rechaza, o peor:
 * la base permite un salto que la UI nunca ofrece y la solicitud avanza por una
 * ruta que nadie probó.
 *
 * El caso hermano ya ocurrió una vez en este repositorio con el enum de
 * `payment_status`: el código declaraba ocho valores, la base tenía seis, y la
 * conciliación diaria murió entera con `22P02`. Este test lee las migraciones
 * como texto y falla si las dos matrices dejan de coincidir.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations")
const ADVANCE_SQL = "00152_advance_redemption_reports_change.sql"

/**
 * Quita sólo los comentarios. Los literales de cadena se conservan a
 * propósito: la matriz de transiciones y el vocabulario viven dentro de
 * literales, así que borrarlos dejaría a los parsers sin nada que leer (y los
 * tests pasarían en vacío en lugar de fallar).
 */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
}

const raw = readFileSync(path.join(MIGRATIONS_DIR, ADVANCE_SQL), "utf8")
const sql = stripComments(raw)

/**
 * Extrae la matriz de la forma `IF v_r.status = 'x' THEN v_allowed :=
 * ARRAY['a','b'];` — es la única fuente de verdad de las transiciones.
 */
function parseSqlMatrix(source: string): Record<string, string[]> {
  const matrix: Record<string, string[]> = {}
  const re = /v_r\.status\s*=\s*'([a-z_]+)'\s*THEN\s*v_allowed\s*:=\s*ARRAY\[([^\]]*)\]/gi
  for (const match of source.matchAll(re)) {
    const from = match[1]
    const body = match[2] ?? ""
    if (!from) continue
    matrix[from] = [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] ?? "").filter(Boolean)
  }
  return matrix
}

describe("contrato de transiciones redemptions.ts ↔ advance_redemption()", () => {
  it(`la migración ${ADVANCE_SQL} define una matriz parseable`, () => {
    const matrix = parseSqlMatrix(sql)
    // Si el SQL se reescribe y el parser deja de encontrarla, este test debe
    // fallar en lugar de pasar en vacío.
    expect(Object.keys(matrix).sort()).toEqual(["in_progress", "requested"])
  })

  it("las transiciones permitidas coinciden exactamente con el SQL", () => {
    const matrix = parseSqlMatrix(sql)

    for (const status of REDEMPTION_STATUSES) {
      const fromTs = [...REDEMPTION_TRANSITIONS[status]].sort()
      // El SQL no lista los terminales: su ELSE deja `v_allowed` vacío.
      const fromSql = [...(matrix[status] ?? [])].sort()
      expect({ status, allowed: fromTs }).toEqual({ status, allowed: fromSql })
    }
  })

  it("el vocabulario de estados coincide con el CHECK de la base", () => {
    // 00152 sólo acepta estos cuatro; `pending`/`completed` son el vocabulario
    // anterior que 00151 renombró.
    const guard = sql.match(/p_status\s+NOT\s+IN\s*\(([^)]*)\)/i)
    expect(guard, "no se encontró la guarda de vocabulario en el SQL").toBeTruthy()
    const sqlStatuses = [...(guard?.[1] ?? "").matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1] ?? "")
      .filter(Boolean)
      .sort()
    expect(sqlStatuses).toEqual([...REDEMPTION_STATUSES].sort())
  })

  it("el SQL emite fila en todas sus salidas (defecto RETURNS TABLE)", () => {
    // Un `RETURN;` sin `RETURN NEXT;` en una función RETURNS TABLE no emite
    // nada y el llamador lee `data[0] === undefined`. 00149 corrigió ese
    // defecto en `redeem_service`; aquí se blinda `advance_redemption`.
    const bareReturns = [...sql.matchAll(/\bRETURN\s*;/g)].length
    const emitReturns = [...sql.matchAll(/\bRETURN\s+NEXT\s*;/g)].length
    expect(emitReturns).toBeGreaterThan(0)
    expect(emitReturns).toBe(bareReturns)

    // Y cada `RETURN NEXT;` debe ir seguido de su `RETURN;`: `RETURN NEXT`
    // emite pero NO termina la función.
    const paired = [...sql.matchAll(/\bRETURN\s+NEXT\s*;\s*RETURN\s*;/g)].length
    expect(paired).toBe(emitReturns)
  })

  it("el reembolso al cancelar es idempotente por construcción", () => {
    // Sin `refunded_at IS NULL` un segundo cancelar devolvería los créditos
    // otra vez. La condición tiene que estar en el mismo IF que el INSERT.
    const refundBlock = sql.match(
      /IF\s+v_status\s*=\s*'cancelled'[\s\S]{0,400}?THEN/i
    )
    expect(refundBlock, "no se encontró el bloque de reembolso").toBeTruthy()
    expect(refundBlock?.[0]).toContain("refunded_at IS NULL")
    expect(refundBlock?.[0]).toMatch(/v_r\.status\s+IN\s*\(\s*'requested'\s*,\s*'in_progress'\s*\)/)
  })

  it("la función no queda ejecutable por anon ni por authenticated", () => {
    // `advance_redemption` es SECURITY DEFINER y no comprueba al dueño: su ACL
    // es la única barrera contra el IDOR de mover la solicitud de otro.
    const grants = [...raw.matchAll(/^\s*(REVOKE|GRANT)[^\n]*$/gim)].map((m) => m[0].trim())
    const joined = grants.join("\n")
    expect(joined).toMatch(/REVOKE[\s\S]*FROM[^;]*\b(anon|authenticated|PUBLIC)\b/i)
    expect(joined).toMatch(/GRANT[\s\S]*TO[^;]*service_role/i)
    expect(joined).not.toMatch(/GRANT[\s\S]*TO[^;]*\banon\b/i)
    expect(joined).not.toMatch(/GRANT[\s\S]*TO[^;]*\bauthenticated\b/i)
  })
})

describe("cobertura del vocabulario", () => {
  it("todo estado declarado tiene etiqueta y entrada en la matriz", () => {
    for (const status of REDEMPTION_STATUSES) {
      expect(REDEMPTION_TRANSITIONS).toHaveProperty(status)
    }
  })

  it("ningún estado apunta a uno inexistente", () => {
    for (const targets of Object.values(REDEMPTION_TRANSITIONS)) {
      for (const to of targets as RedemptionStatus[]) {
        expect(REDEMPTION_STATUSES).toContain(to)
      }
    }
  })

  it("los estados terminales no aparecen como destino de un ciclo", () => {
    // Nada debe devolver una solicitud a `requested`: reiniciaría el SLA.
    const targets = Object.values(REDEMPTION_TRANSITIONS).flat()
    expect(targets).not.toContain("requested")
  })
})
