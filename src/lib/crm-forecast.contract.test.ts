import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Contrato del valor **previsto** del CRM: dónde vive, y qué no puede responder.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * El hallazgo (`CRM5` de la auditoría)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `crm_prospects.estimated_value` (migración `00184`) es el valor que el vendedor
 * declaró al abrir el trato. La auditoría lo describió como «`estimated_value` es
 * foto, no histórico», y la decisión de producto fue **declarar la limitación, no
 * construir la serie**: una tabla de snapshots sin lector es exactamente la
 * superficie muerta que `00189` acaba de eliminar en la Oleada C. El CRM puede
 * responder «cuánto vale el pipeline **ahora**» y **no** puede responder «cuánto
 * valía hace un mes», y esa segunda pregunta no se improvisa desde la primera.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Por qué esto necesita un contrato y no un comentario
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La limitación se declara en el docstring de `src/lib/crm-money.ts`. Un docstring
 * no impide nada por sí solo: lo que este contrato añade es que **la limitación
 * sea falsable**. Si alguien crea la tabla de snapshots, si alguien duplica
 * `estimated_value` en otra tabla, o si alguien empieza a derivar el previsto de
 * `orders` —que es el error que `CRM1` describía y que `00189` hizo imposible de
 * cometer con `seller_id`—, el test falla y obliga a actualizar la declaración.
 *
 * La segunda mitad del contrato vigila la frontera que sí importa para el dinero:
 * **previsto y real no pueden mezclarse**. El real se deriva de `orders` por
 * `crm_prospects.user_id → orders.user_id`; el previsto es un número declarado. La
 * regla compartida es que «lo no medido no es cero»: `null` se dice, no se pinta
 * `$0`.
 *
 * Cómo romperlo:
 *
 *   1. Añadir `estimated_value` a otra tabla, o una tabla de histórico/serie del
 *      previsto, sin actualizar `DONDE_VIVE` y la declaración.
 *   2. Hacer que el módulo del dinero derive el previsto desde `orders`.
 *   3. Quitar de `src/lib/crm-money.ts` la declaración de que es una foto y no una
 *      serie (el contrato la exige por texto, como `migration-docs` exige la suya).
 *   4. Volver a citar `orders.seller_id` como si existiera: es la regresión de
 *      `c1` vista desde el CRM.
 */

const REPO = process.cwd()
const MIGRATIONS_DIR = join(REPO, "supabase", "migrations")
const MONEY_MODULE = join(REPO, "src", "lib", "crm-money.ts")

const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()

/** Quita comentarios para que un `--` que nombre la columna no cuente como uso. */
function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ")
}

/**
 * Tablas que reciben una columna `estimated_value`: `ALTER TABLE ... ADD COLUMN`
 * o un `CREATE TABLE` que la declare en su cuerpo.
 */
function tablasConColumna(sql: string): string[] {
  const out: string[] = []
  const reAlter =
    /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\s*\.\s*)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))[\s\S]{0,400}?\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\s*\.\s*)?(?:"estimated_value"|estimated_value)\b/gi
  for (const m of sql.matchAll(reAlter)) out.push((m[1] ?? m[2] ?? "").toLowerCase())

  const reCreate =
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\s*\.\s*)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s*\(([\s\S]*?)\)\s*;/gi
  for (const m of sql.matchAll(reCreate)) {
    const cuerpo = m[3] ?? ""
    if (/(?:^|[\s,(])(?:"estimated_value"|estimated_value)\s/.test(cuerpo)) {
      out.push((m[1] ?? m[2] ?? "").toLowerCase())
    }
  }
  return out
}

/** Tablas cuyo nombre delata una serie temporal del previsto. */
function tablasDeSerie(sql: string): string[] {
  const re = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\s*\.\s*)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))/gi
  const out: string[] = []
  for (const m of sql.matchAll(re)) {
    const t = (m[1] ?? m[2] ?? "").toLowerCase()
    if (/(?:historial|history|snapshot|serie|serie_|_log$|_logs$)/.test(t) && t.includes("crm")) {
      out.push(t)
    }
  }
  return out
}

const FUENTES = MIGRATION_FILES.map((f) => sinComentarios(readFileSync(join(MIGRATIONS_DIR, f), "utf8")))

/** Único lugar del esquema donde vive el previsto. La declaración del contrato. */
const DONDE_VIVE = ["crm_prospects"]
const MIGRACION_QUE_LA_DECLARA = "00184_crm_deal_closure.sql"

const MONEDA = readFileSync(MONEY_MODULE, "utf8")

describe("detectores — se prueban antes de mirar el perímetro", () => {
  it("reconoce la columna añadida con ALTER TABLE", () => {
    expect(
      tablasConColumna("ALTER TABLE public.crm_prospects ADD COLUMN IF NOT EXISTS estimated_value NUMERIC(12,2);"),
    ).toEqual(["crm_prospects"])
  })

  it("reconoce la columna declarada dentro de un CREATE TABLE", () => {
    const sql = `CREATE TABLE IF NOT EXISTS public.x (
      id UUID PRIMARY KEY,
      estimated_value NUMERIC(12,2)
    );`
    expect(tablasConColumna(sql)).toEqual(["x"])
  })

  it("reconoce la columna aunque el CREATE TABLE quepa en una línea", () => {
    // Un detector que solo entiende la forma bonita no mide lo que dice medir.
    expect(tablasConColumna("CREATE TABLE public.x (id UUID, estimated_value NUMERIC(12,2));")).toEqual(["x"])
    expect(tablasConColumna("CREATE TABLE x (estimated_value NUMERIC);")).toEqual(["x"])
  })

  it("no se deja engañar por un paréntesis de precisión antes del cierre", () => {
    const sql = `CREATE TABLE public.x (
      id UUID,
      estimated_value NUMERIC(12,2) CHECK (estimated_value >= 0)
    );`
    expect(tablasConColumna(sql)).toEqual(["x"])
  })

  it("no confunde otra columna que empiece igual", () => {
    expect(tablasConColumna("ALTER TABLE public.x ADD COLUMN estimated_value_cents NUMERIC;")).toEqual([])
    expect(tablasConColumna("ALTER TABLE public.x ADD COLUMN real_value NUMERIC;")).toEqual([])
  })

  it("no cuenta la columna si solo aparece en un comentario", () => {
    const sql = sinComentarios("-- ALTER TABLE public.x ADD COLUMN estimated_value NUMERIC;")
    expect(tablasConColumna(sql)).toEqual([])
  })

  it("reconoce una tabla de serie del CRM por su nombre", () => {
    expect(tablasDeSerie("CREATE TABLE IF NOT EXISTS public.crm_prospects_history (id UUID);")).toEqual([
      "crm_prospects_history",
    ])
    expect(tablasDeSerie("CREATE TABLE IF NOT EXISTS public.orders (id UUID);")).toEqual([])
  })
})

describe("perímetro — el valor previsto del CRM", () => {
  it("estimated_value vive en una sola tabla, y es crm_prospects", () => {
    const tablas = [...new Set(FUENTES.flatMap(tablasConColumna))].sort()
    expect(tablas).toEqual(DONDE_VIVE)
  })

  it("ninguna migración crea una serie temporal del previsto", () => {
    // La limitación declarada: el previsto es una foto. Si aparece la serie, hay
    // que actualizar la declaración de `src/lib/crm-money.ts` y este contrato.
    const series = [...new Set(FUENTES.flatMap(tablasDeSerie))].sort()
    expect(series).toEqual([])
  })

  it("crm_prospects no tiene columnas de serie para el previsto", () => {
    const conSerie = FUENTES.filter((sql) =>
      /\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\s*\.\s*)?(?:"estimated_value_[a-z_]+"|estimated_value_[a-z_]+)\b/i.test(
        sql,
      ),
    )
    expect(conSerie).toEqual([])
  })

  it("la migración que la declara existe y la comenta", () => {
    expect(MIGRATION_FILES).toContain(MIGRACION_QUE_LA_DECLARA)
    const sql = readFileSync(join(MIGRATIONS_DIR, MIGRACION_QUE_LA_DECLARA), "utf8")
    expect(sql).toMatch(/COMMENT\s+ON\s+COLUMN\s+public\.crm_prospects\.estimated_value\s+IS/i)
    // El comentario de la columna ya declara la frontera con el real.
    expect(sql).toMatch(/se deriva de orders/i)
  })

  it("el módulo del dinero declara que el previsto es una foto y no una serie", () => {
    expect(MONEDA).toMatch(/foto, no una serie/i)
    expect(MONEDA).toMatch(/no conserva ningún histórico/i)
  })

  it("el módulo del dinero es puro: no consulta orders ni la base", () => {
    // La frontera: el previsto es un número declarado y el real llega ya
    // calculado en `actualRevenue`. Si el módulo empezara a consultar `orders`,
    // previsto y real dejarían de ser dos cosas distintas y el módulo dejaría de
    // poder probarse sin base.
    const cuerpo = MONEDA.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ")
    expect(cuerpo).not.toMatch(/\borders\b/)
    expect(cuerpo).not.toMatch(/supabase|createServiceClient|createClient/)
    expect(cuerpo).not.toMatch(/["']use server["']/)
    // Y sí lee el previsto del input declarado, no de una consulta.
    expect(cuerpo).toMatch(/input\.estimatedValue/)
  })

  it("el módulo del dinero ya no cita orders.seller_id como si existiera", () => {
    // Regresión de `c1` vista desde el CRM.
    const citas = [...MONEDA.matchAll(/orders\.seller_id/g)]
    expect(citas).toHaveLength(1)
    expect(MONEDA).toMatch(/orders\.seller_id[^\n]*00189/)
  })

  it("previsto y real son dos campos distintos y ninguno se rellena con el otro", () => {
    expect(MONEDA).toMatch(/estimatedValue: number \| null/)
    expect(MONEDA).toMatch(/actualRevenue: number \| null/)
    expect(MONEDA).toMatch(/revenueTruncated/)
  })
})
