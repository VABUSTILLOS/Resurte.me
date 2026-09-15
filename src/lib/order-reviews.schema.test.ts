import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { buildReviewUpsertPayload } from "@/lib/order-reviews"

/**
 * Contrato de esquema: verifica que el payload que /api/reviews escribe en
 * `public.order_reviews` SIEMPRE satisface las restricciones del esquema real
 * definido por las migraciones de Supabase (sin requerir una base de datos).
 *
 * ¿Qué detecta?
 *  - Columnas NOT NULL sin DEFAULT que el payload no provee → el upsert
 *    fallaría con SQLSTATE 23502 (not_null_violation).
 *  - Claves del payload que no existen en el esquema → SQLSTATE 42703
 *    (undefined_column). La tabla se creó DESPUÉS de escribir la ruta: si
 *    alguien renombra una columna, este test lo detecta sin tocar producción.
 *  - Pérdida del UNIQUE(order_id), del CHECK 1-5 o del límite de 500
 *    caracteres, que son el contrato que la ruta asume.
 *  - Deriva futura: una migración nueva que añada una columna NOT NULL sin
 *    DEFAULT rompe el guardado de reseñas.
 */

interface ColumnInfo {
  type: string
  notNull: boolean
  hasDefault: boolean
}

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations")

/** Nombres que abren una restricción de tabla, no una columna. */
const TABLE_CONSTRAINT_KEYWORDS = new Set([
  "CONSTRAINT",
  "PRIMARY",
  "UNIQUE",
  "CHECK",
  "FOREIGN",
  "EXCLUDE",
  "LIKE",
])

function readMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
}

function parseReviewsSchema(sql: string): Map<string, ColumnInfo> {
  const cols = new Map<string, ColumnInfo>()

  // CREATE TABLE [IF NOT EXISTS] public.order_reviews ( ... )
  const tableMatch = sql.match(
    /CREATE TABLE (?:IF NOT EXISTS\s+)?(?:public\.)?order_reviews\s*\(([\s\S]*?)\n\s*\)\s*;/i
  )
  if (tableMatch) {
    for (const line of (tableMatch[1] ?? "").split("\n")) {
      const m = line.match(/^\s*(?:"([a-zA-Z_]+)"|([a-zA-Z_]+))\s+([^\s,]+)(.*)$/)
      if (!m) continue
      const name = m[1] ?? m[2] ?? ""
      // `CONSTRAINT order_reviews_order_key UNIQUE (order_id)` no es una columna.
      if (TABLE_CONSTRAINT_KEYWORDS.has(name.toUpperCase())) continue
      const type = m[3] ?? ""
      const rest = m[4] ?? ""
      cols.set(name, {
        type,
        notNull: /NOT NULL/.test(rest),
        hasDefault:
          /DEFAULT/.test(rest) ||
          /SERIAL/.test(type) ||
          /PRIMARY KEY/.test(rest) ||
          /GENERATED/.test(rest),
      })
    }
  }

  // ALTER TABLE ... ADD COLUMN [IF NOT EXISTS] ...
  const alterRe =
    /ALTER TABLE (?:public\.)?order_reviews\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?(?:"([a-zA-Z_]+)"|([a-zA-Z_]+))\s+([^;\n]+)/gi
  for (const m of sql.matchAll(alterRe)) {
    const name = m[1] ?? m[2] ?? ""
    const def = m[3] ?? ""
    cols.set(name, {
      type: def.trim().split(/\s+/)[0] ?? "",
      notNull: /NOT NULL/.test(def),
      hasDefault: /DEFAULT/.test(def) || /SERIAL/.test(def),
    })
  }

  // ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL
  const dropRe =
    /ALTER TABLE (?:public\.)?order_reviews\s+ALTER COLUMN\s+([a-zA-Z_]+)\s+DROP NOT NULL/gi
  for (const m of sql.matchAll(dropRe)) {
    const existing = cols.get(m[1] ?? "")
    if (existing) existing.notNull = false
  }

  return cols
}

describe("contrato de esquema public.order_reviews vs payload de reseñas", () => {
  const migration = readMigrations().join("\n")
  const schema = parseReviewsSchema(migration)
  const requiredColumns = [...schema.entries()]
    .filter(([, c]) => c.notNull && !c.hasDefault)
    .map(([name]) => name)
  const knownColumns = new Set(schema.keys())

  const payload = buildReviewUpsertPayload({
    orderId: 42,
    userId: "00000000-0000-4000-8000-000000000000",
    rating: 5,
    comment: "  Muy fresco  ",
  })

  /**
   * Asserts booleanos: `expect(migration).toMatch(re)` volcaría la
   * concatenación completa de migraciones en cada fallo.
   */
  function has(re: RegExp, label: string) {
    expect(re.test(migration), label).toBe(true)
  }

  function hasNot(re: RegExp, label: string) {
    expect(re.test(migration), label).toBe(false)
  }

  it("el esquema migrado incluye las columnas esperadas", () => {
    for (const col of ["id", "order_id", "user_id", "rating", "comment", "created_at", "updated_at"]) {
      expect(schema.has(col), `falta la columna ${col}`).toBe(true)
    }
    expect(schema.get("order_id")?.type?.toLowerCase()).toBe("bigint")
    expect(schema.get("rating")?.type?.toLowerCase()).toBe("smallint")
  })

  it("order_id y rating son NOT NULL sin DEFAULT: el payload debe proveerlos", () => {
    expect(requiredColumns).toContain("order_id")
    expect(requiredColumns).toContain("rating")
    expect(payload).toHaveProperty("order_id")
    expect(payload).toHaveProperty("rating")
  })

  it("todo NOT NULL sin DEFAULT está presente en el payload", () => {
    for (const col of requiredColumns) {
      expect(payload, `columna requerida faltante: ${col}`).toHaveProperty(col)
      expect(
        (payload as Record<string, unknown>)[col],
        `columna requerida con valor null: ${col}`
      ).not.toBeNull()
    }
  })

  it("el payload NO referencia columnas que no existen en el esquema", () => {
    for (const key of Object.keys(payload)) {
      expect(knownColumns, `columna desconocida: ${key}`).toContain(key)
    }
  })

  it("user_id y comment son opcionales: la reseña de invitado guarda null", () => {
    expect(schema.get("user_id")?.notNull).toBe(false)
    expect(schema.get("comment")?.notNull).toBe(false)

    const guest = buildReviewUpsertPayload({
      orderId: 42,
      userId: null,
      rating: 3,
      comment: "",
    })
    expect(guest.user_id).toBeNull()
    expect(guest.comment).toBeNull()
    // Aun siendo null, el payload sigue siendo insertable
    for (const col of requiredColumns) {
      expect(guest).toHaveProperty(col)
    }
  })

  it("created_at y updated_at tienen DEFAULT, así que no se exigen en el payload", () => {
    for (const col of ["created_at", "updated_at", "id"]) {
      expect(schema.get(col)?.hasDefault, `${col} debería tener DEFAULT`).toBe(true)
      expect(requiredColumns).not.toContain(col)
    }
  })

  it("no hay trigger de updated_at: la ruta debe fijarlo explícitamente", () => {
    hasNot(
      /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER[\s\S]{0,200}order_reviews/i,
      "la tabla no debe tener trigger de updated_at"
    )
    expect(payload.updated_at).toBeDefined()
    expect(new Date(payload.updated_at).toISOString()).toBe(payload.updated_at)
  })

  it("UNIQUE(order_id) respalda el onConflict de la ruta", () => {
    has(/UNIQUE\s*\(\s*order_id\s*\)/i, "falta el UNIQUE(order_id)")
  })

  it("el CHECK de rating 1-5 coincide con la validación de la ruta", () => {
    has(
      /CHECK\s*\(\s*rating\s+BETWEEN\s+1\s+AND\s+5\s*\)/i,
      "falta el CHECK de rating 1-5"
    )
    // La ruta rechaza fuera de rango antes de llegar a la base
    for (const rating of [1, 5]) {
      expect(buildReviewUpsertPayload({ orderId: 1, userId: null, rating, comment: "" }).rating)
        .toBe(rating)
    }
  })

  it("el límite de 500 caracteres del CHECK coincide con el recorte del payload", () => {
    has(
      /char_length\s*\(\s*comment\s*\)\s*<=\s*500/i,
      "falta el CHECK de 500 caracteres del comentario"
    )

    const long = buildReviewUpsertPayload({
      orderId: 42,
      userId: null,
      rating: 4,
      comment: "x".repeat(600),
    })
    expect(long.comment).toHaveLength(500)
    // Nunca se envía un comentario que viole el CHECK
    expect((long.comment ?? "").length).toBeLessThanOrEqual(500)
  })

  it("la FK a orders borra la reseña en cascada con el pedido", () => {
    has(
      /order_id\s+BIGINT\s+NOT NULL\s+REFERENCES\s+public\.orders\s*\(\s*id\s*\)\s+ON DELETE CASCADE/i,
      "falta la FK ON DELETE CASCADE a public.orders"
    )
  })

  it("RLS activo con lectura pública y sin política de escritura", () => {
    has(
      /ALTER TABLE public\.order_reviews ENABLE ROW LEVEL SECURITY/i,
      "falta ENABLE ROW LEVEL SECURITY"
    )
    has(
      /CREATE POLICY[\s\S]{0,80}ON public\.order_reviews\s+FOR SELECT\s+USING\s*\(\s*true\s*\)/i,
      "falta la política pública de SELECT"
    )
    // Solo hay SELECT: los INSERT/UPDATE los hace el service role (bypassa RLS)
    hasNot(
      /CREATE POLICY[\s\S]{0,120}ON public\.order_reviews\s+FOR (?:INSERT|UPDATE|DELETE|ALL)/i,
      "no debe existir política de escritura"
    )
  })

  it("la migración es re-ejecutable: DROP POLICY antes de CREATE POLICY", () => {
    const drop = migration.search(/DROP POLICY IF EXISTS[\s\S]{0,80}ON public\.order_reviews/i)
    const create = migration.search(/CREATE POLICY[\s\S]{0,80}ON public\.order_reviews/i)

    expect(drop, "falta DROP POLICY IF EXISTS").toBeGreaterThanOrEqual(0)
    expect(create).toBeGreaterThan(drop)
  })
})
