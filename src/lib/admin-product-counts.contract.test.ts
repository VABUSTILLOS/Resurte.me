import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  PRODUCT_TAG_LIMIT,
  parseProductCountsPayload,
  type ProductCountsPayload,
} from "@/lib/admin-product-counts"

/**
 * Contrato SQL ↔ TypeScript de `admin_product_filter_counts` (00118).
 *
 * Los contadores del panel se calculan en dos sitios: el RPC v2 (una consulta) y
 * el camino antiguo en JS, que sigue vivo como fallback cuando la migración no
 * está aplicada. Nada ata ambos lados: si alguien renombra una clave en el SQL
 * (`tagCounts` → `tag_counts`) o añade un contador y olvida leerlo, el panel
 * sigue pintando chips, pero con un 0 silencioso — el peor tipo de bug, porque
 * parece "no hay productos sin precio".
 *
 * Estas pruebas fijan las claves que el SQL emite y exigen que el lector las
 * consuma todas, además de blindar la discriminación v1/v2 que decide si el
 * panel usa el RPC o el fallback.
 */

const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "00118_admin_product_filter_counts_v2.sql"
)

const sql = readFileSync(MIGRATION, "utf8")

/** Claves de primer nivel del `jsonb_build_object(...)` final del RPC. */
function rpcKeys(): string[] {
  const start = sql.indexOf("SELECT jsonb_build_object(")
  expect(start).toBeGreaterThan(-1)
  const body = sql.slice(start, sql.indexOf("$$;", start))
  return [...body.matchAll(/^\s*'([A-Za-z][A-Za-z0-9_]*)',/gm)].flatMap((m) =>
    m[1] ? [m[1]] : []
  )
}

/** Claves que el lector consume hoy. Si el SQL añade una, esta lista falla. */
const RPC_KEYS = [
  "noCitiesIds",
  "dupNameIds",
  "underThresholdIds",
  "categoryCounts",
  "catalogTotal",
  "published",
  "noImage",
  "lowStock",
  "outStock",
  "noPrice",
  "noCategory",
  "waMismatch",
  "onSale",
  "staleSale",
  "trash",
  "brands",
  "tagCounts",
]

/** Forma pública que el panel consume (`tags`, no `tagCounts`). */
const PAYLOAD_KEYS = [
  "counts",
  "brands",
  "tags",
  "noCitiesIds",
  "dupNameIds",
  "underThresholdIds",
  "categoryCounts",
]

const COUNT_KEYS = [
  "catalogTotal",
  "published",
  "unpublished",
  "noImage",
  "lowStock",
  "outStock",
  "noCities",
  "noPrice",
  "noCategory",
  "waMismatch",
  "onSale",
  "staleSale",
  "dupNames",
  "underThreshold",
  "trash",
]

/** Payload con la forma exacta del RPC, con un valor distinto por clave. */
const RPC_PAYLOAD = {
  noCitiesIds: [11, 12],
  dupNameIds: [21],
  underThresholdIds: [31, 32, 33],
  categoryCounts: { "5": 2, "6": 1 },
  catalogTotal: 40,
  published: 30,
  noImage: 7,
  lowStock: 6,
  outStock: 5,
  noPrice: 4,
  noCategory: 3,
  waMismatch: 2,
  onSale: 9,
  staleSale: 8,
  trash: 1,
  brands: ["Zeta", "Acme"],
  tagCounts: { oferta: 5, promo: 2 },
}

describe("contrato admin_product_filter_counts (00118)", () => {
  it("el SQL emite exactamente las claves que el lector espera", () => {
    expect([...rpcKeys()].sort()).toEqual([...RPC_KEYS].sort())
    expect(rpcKeys()).toHaveLength(17)
  })

  it("la fixture cubre todas las claves del SQL", () => {
    // Si el RPC gana un contador, hay que darle un valor aquí para que la
    // prueba de abajo exija que el lector lo mapee.
    expect(Object.keys(RPC_PAYLOAD).sort()).toEqual([...RPC_KEYS].sort())
  })

  it("no emite `unpublished`: el lector lo deriva de catalogTotal - published", () => {
    expect(rpcKeys()).not.toContain("unpublished")
  })

  it("mapea cada clave del SQL a un campo del payload, sin pérdidas", () => {
    const parsed = parseProductCountsPayload(RPC_PAYLOAD)
    expect(parsed).toEqual({
      counts: {
        catalogTotal: 40,
        published: 30,
        unpublished: 10,
        noImage: 7,
        lowStock: 6,
        outStock: 5,
        noCities: 2,
        noPrice: 4,
        noCategory: 3,
        waMismatch: 2,
        onSale: 9,
        staleSale: 8,
        dupNames: 1,
        underThreshold: 3,
        trash: 1,
      },
      brands: ["Acme", "Zeta"],
      tags: ["oferta", "promo"],
      noCitiesIds: [11, 12],
      dupNameIds: [21],
      underThresholdIds: [31, 32, 33],
      categoryCounts: { "5": 2, "6": 1 },
    })
  })

  it("expone `tags` (nunca `tagCounts`) con la forma pública estable", () => {
    const parsed = parseProductCountsPayload(RPC_PAYLOAD) as ProductCountsPayload
    expect(Object.keys(parsed).sort()).toEqual([...PAYLOAD_KEYS].sort())
    expect(Object.keys(parsed.counts).sort()).toEqual([...COUNT_KEYS].sort())
    expect(parsed).not.toHaveProperty("tagCounts")
  })

  it("el pre-límite de etiquetas del SQL no recorta antes que el lector", () => {
    // El RPC corta a N etiquetas por frecuencia y el lector ordena y recorta a
    // PRODUCT_TAG_LIMIT. Si N bajase del tope del panel, habría etiquetas que
    // desaparecerían del selector sin dejar rastro.
    const match = /ORDER BY n DESC,\s*tag ASC\s*LIMIT (\d+)/.exec(sql)
    expect(match).not.toBeNull()
    expect(Number(match?.[1] ?? 0)).toBeGreaterThanOrEqual(PRODUCT_TAG_LIMIT)
  })

  it("discrimina v2 de v1 por `brands` + `tagCounts`", () => {
    const cases: Record<string, unknown> = {
      // v1 (00115): ni marcas ni recuento por etiqueta.
      "payload v1": {
        noCitiesIds: [],
        dupNameIds: [],
        underThresholdIds: [],
        categoryCounts: {},
        catalogTotal: 1,
      },
      "sin brands": { ...RPC_PAYLOAD, brands: undefined },
      "brands no es array": { ...RPC_PAYLOAD, brands: { Acme: 1 } },
      "sin tagCounts": { ...RPC_PAYLOAD, tagCounts: undefined },
      "tagCounts no es objeto": { ...RPC_PAYLOAD, tagCounts: ["promo"] },
      "tagCounts null": { ...RPC_PAYLOAD, tagCounts: null },
    }
    for (const [name, payload] of Object.entries(cases)) {
      expect(parseProductCountsPayload(payload), name).toBeNull()
    }
  })

  it("rechaza payloads que no son objetos", () => {
    for (const payload of [null, undefined, 42, "v2", [], true]) {
      expect(parseProductCountsPayload(payload)).toBeNull()
    }
  })
})
