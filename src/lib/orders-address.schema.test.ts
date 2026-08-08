import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import {
  buildAddressInsertPayload,
  type AddressInsertInput,
} from "@/lib/orders-address"

/**
 * Contrato de esquema: verifica que el payload que la app inserta en
 * `public.addresses` SIEMPRE satisface las restricciones del esquema real
 * definido por las migraciones de Supabase (sin requerir una base de datos).
 *
 * ¿Qué detecta?
 *  - Columnas NOT NULL sin DEFAULT que el payload no provee → el INSERT
 *    fallaría con "null value in column ... violates not-null constraint".
 *  - Claves del payload que no existen en el esquema → SQLSTATE 42703
 *    (undefined_column), el bug exacto de "Error al guardar la dirección".
 *  - Deriva de esquema futura (nueva columna NOT NULL sin default en una
 *    migración nueva) que rompa el guardado.
 */

interface ColumnInfo {
  type: string
  notNull: boolean
  hasDefault: boolean
}

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations")

function readMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
}

function parseAddressesSchema(sql: string): Map<string, ColumnInfo> {
  const cols = new Map<string, ColumnInfo>()

  // CREATE TABLE addresses ( ... )
  const tableMatch = sql.match(/CREATE TABLE (?:public\.)?addresses\s*\(([\s\S]*?)\)\s*;/)
  if (tableMatch) {
    for (const line of tableMatch[1].split("\n")) {
      const m = line.match(/^\s*(?:"([a-zA-Z_]+)"|([a-zA-Z_]+))\s+([^\s,]+)(.*)$/)
      if (!m) continue
      const name = m[1] ?? m[2]
      const type = m[3]
      const rest = m[4] ?? ""
      cols.set(name, {
        type,
        notNull: /NOT NULL/.test(rest),
        hasDefault:
          /DEFAULT/.test(rest) || /SERIAL/.test(type) || /PRIMARY KEY/.test(rest) ||
          /GENERATED/.test(rest),
      })
    }
  }

  // ALTER TABLE ... ADD COLUMN [IF NOT EXISTS] ...
  const alterRe =
    /ALTER TABLE (?:public\.)?addresses\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?(?:"([a-zA-Z_]+)"|([a-zA-Z_]+))\s+([^;\n]+)/g
  for (const m of sql.matchAll(alterRe)) {
    const name = m[1] ?? m[2]
    const def = m[3]
    cols.set(name, {
      type: def.trim().split(/\s+/)[0],
      notNull: /NOT NULL/.test(def),
      hasDefault: /DEFAULT/.test(def) || /SERIAL/.test(def),
    })
  }

  // ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL
  const dropRe = /ALTER TABLE (?:public\.)?addresses\s+ALTER COLUMN\s+([a-zA-Z_]+)\s+DROP NOT NULL/g
  for (const m of sql.matchAll(dropRe)) {
    const existing = cols.get(m[1])
    if (existing) existing.notNull = false
  }

  return cols
}

describe("contrato de esquema public.addresses vs payload de guardado", () => {
  const schema = parseAddressesSchema(readMigrations().join("\n"))
  const requiredColumns = [...schema.entries()]
    .filter(([, c]) => c.notNull && !c.hasDefault)
    .map(([name]) => name)
  const knownColumns = new Set(schema.keys())

  const GUEST_INPUT: AddressInsertInput = {
    user_id: null,
    guest_token: "gt-xyz",
    street: "Av. Siempre Viva",
    number: "742",
    interior: null,
    neighborhood: "Centro",
    city: "León",
    state: "Guanajuato",
    zip_code: "37000",
    references: null,
    city_id: null,
  }

  it("el esquema migrado incluye las columnas esperadas", () => {
    expect(schema.has("id")).toBe(true)
    expect(schema.get("user_id")?.type.toLowerCase()).toBe("uuid")
    expect(schema.get("street")?.notNull).toBe(true)
    expect(schema.get("is_default")?.notNull).toBe(true)
    expect(schema.get("is_default")?.hasDefault).toBe(true)
    expect(schema.has("guest_token")).toBe(true)
    expect(schema.has("city_id")).toBe(true)
  })

  it("todo NOT NULL sin DEFAULT está presente en el payload del checkout", () => {
    const payload = buildAddressInsertPayload(GUEST_INPUT)
    for (const col of requiredColumns) {
      expect(payload, `columna requerida faltante: ${col}`).toHaveProperty(col)
    }
  })

  it("el payload NO referencia columnas que no existen en el esquema", () => {
    const payload = buildAddressInsertPayload(GUEST_INPUT)
    for (const key of Object.keys(payload)) {
      expect(knownColumns, `columna desconocida: ${key}`).toContain(key)
    }
  })

  it("el payload logueado con city_id también es válido contra el esquema", () => {
    const input: AddressInsertInput = {
      ...GUEST_INPUT,
      user_id: "00000000-0000-4000-8000-000000000000",
      guest_token: null,
      city_id: 42,
    }
    // El helper añade city_id SOLO si el esquema lo soporta (base + city_id).
    const payload = { ...buildAddressInsertPayload(input), city_id: input.city_id }
    for (const col of requiredColumns) {
      expect(payload, `columna requerida faltante: ${col}`).toHaveProperty(col)
    }
    for (const key of Object.keys(payload)) {
      expect(knownColumns, `columna desconocida: ${key}`).toContain(key)
    }
    expect(payload.city_id).toBe(42)
    // El builder base NO incluye city_id (se añade en insertAddressResilient).
    expect(buildAddressInsertPayload(input)).not.toHaveProperty("city_id")
  })

  it("el payload del panel mis-direcciones satisface las columnas requeridas", () => {
    // Reconstrucción del payload de src/app/[slug]/mis-direcciones/page.tsx
    const payload = {
      user_id: "00000000-0000-4000-8000-000000000000",
      label: "Casa",
      street: "Av. Siempre Viva",
      number: "742",
      interior: null,
      neighborhood: "Centro",
      city: "León",
      state: "Guanajuato",
      zip_code: "37000",
      references: null,
    }
    for (const col of requiredColumns) {
      expect(payload, `columna requerida faltante: ${col}`).toHaveProperty(col)
    }
    for (const key of Object.keys(payload)) {
      expect(knownColumns, `columna desconocida: ${key}`).toContain(key)
    }
  })

  it("las columnas con DEFAULT (label, created_at, is_default, id) no se exigen en el payload", () => {
    for (const col of ["label", "created_at", "is_default", "id"]) {
      const info = schema.get(col)
      expect(info, `no se encontró la columna ${col}`).toBeDefined()
      expect(info?.hasDefault, `${col} debería tener DEFAULT`).toBe(true)
      expect(requiredColumns).not.toContain(col)
    }
  })
})
