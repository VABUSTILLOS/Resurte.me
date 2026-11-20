import { describe, expect, it } from "vitest"
import {
  buildRetailerIdIndex,
  resolveOrderItems,
  resolveRetailerId,
  type OrderDbProduct,
} from "@/lib/whatsapp-order-items"
import type { Category, Product } from "@/types"

/**
 * Resolución retailer_id (Meta) → producto de la tienda.
 *
 * Lo que estas pruebas protegen:
 *   · Que los DOS esquemas de retailer_id resuelvan: el id fijo del
 *     feed (meta-feed-map.json, incluidos los derivados del nombre
 *     viejo) y el numérico del sync del admin.
 *   · Que el precio cobrado sea el de la BD y nunca el `item_price`
 *     que manda Meta.
 *   · Que cantidades, agotados e ids desconocidos (los 7 productos
 *     sin página que Meta conserva) se toleren sin tumbar el pedido.
 */

const CATEGORIES: Category[] = [
  { id: 1, name: "Abarrotes", slug: "abarrotes", icon: "", parent_id: null },
  { id: 2, name: "Carnes, Aves y Pescados", slug: "carnes", icon: "", parent_id: null },
]

function product(partial: Partial<Product> & { id: number; slug: string }): Product {
  return {
    name: partial.slug,
    description: "",
    image_url: "",
    brand: "",
    category_id: 1,
    price: 100,
    sale_price: null,
    stock_status: "in_stock",
    show_in_whatsapp: true,
    whatsapp_product_id: null,
    ...partial,
  }
}

// Slugs reales de meta-feed-map.json:
// - "curcuma" → id del mapa "abarrotes-curcuma".
// - "ala-iqf-pilgrims-caja-12kg" → id del mapa derivado del NOMBRE VIEJO:
//   "carnes-aves-y-pescados-ala-1-2-iqf-pilgrim-s" (no invertible a ojo).
const CURCUMA = product({ id: 101, slug: "curcuma", name: "Cúrcuma", category_id: 1, price: 203 })
const ALA = product({
  id: 102,
  slug: "ala-iqf-pilgrims-caja-12kg",
  name: "Ala 1-2 IQF Pilgrim's (caja 12 kg)",
  category_id: 2,
  price: 118,
})
// Sin entrada en el mapa: su id es slugify(categoría) + "-" + slug.
const SALSA_NUEVA = product({ id: 103, slug: "salsa-nueva", name: "Salsa Nueva", category_id: 1, price: 55 })

const PRODUCTS = [CURCUMA, ALA, SALSA_NUEVA]
const INDEX = buildRetailerIdIndex(PRODUCTS, CATEGORIES)

function dbRow(p: Product, overrides: Partial<OrderDbProduct> = {}): OrderDbProduct {
  return {
    id: p.id,
    price: p.price,
    sale_price: p.sale_price,
    stock_status: p.stock_status,
    stock_quantity: 50,
    ...overrides,
  }
}

const DB = new Map<number, OrderDbProduct>(PRODUCTS.map((p) => [p.id, dbRow(p)]))

describe("resolveRetailerId", () => {
  it("resuelve el id fijo del mapa del feed", () => {
    expect(resolveRetailerId(INDEX, "abarrotes-curcuma")?.id).toBe(101)
  })

  it("resuelve un id derivado del nombre viejo (no invertible parseando)", () => {
    expect(resolveRetailerId(INDEX, "carnes-aves-y-pescados-ala-1-2-iqf-pilgrim-s")?.id).toBe(102)
  })

  it("resuelve el id derivado por slug de un producto nuevo (sin entrada en el mapa)", () => {
    expect(resolveRetailerId(INDEX, "abarrotes-salsa-nueva")?.id).toBe(103)
  })

  it("resuelve el esquema numérico del admin (String(products.id))", () => {
    expect(resolveRetailerId(INDEX, "102")?.id).toBe(102)
  })

  it("un id desconocido no resuelve (los 7 sin página viven solo en Meta)", () => {
    expect(resolveRetailerId(INDEX, "frutas-y-verduras-aguacate-hass")).toBeUndefined()
    expect(resolveRetailerId(INDEX, "999999")).toBeUndefined()
  })
})

describe("resolveOrderItems", () => {
  it("recalcula el precio contra la BD e ignora el item_price de Meta", () => {
    const result = resolveOrderItems(
      [{ product_retailer_id: "abarrotes-curcuma", quantity: 2, item_price: 1, currency: "MXN" }],
      INDEX,
      DB
    )
    expect(result.unresolved).toEqual([])
    expect(result.lines).toEqual([
      { product_id: 101, name: "Cúrcuma", quantity: 2, unit_price: 203 },
    ])
    expect(result.subtotal).toBe(406)
  })

  it("usa el precio de oferta de la BD cuando existe (sale_price gana)", () => {
    const db = new Map(DB)
    db.set(101, dbRow(CURCUMA, { sale_price: 180 }))
    const result = resolveOrderItems(
      [{ product_retailer_id: "abarrotes-curcuma", quantity: 1, item_price: 203 }],
      INDEX,
      db
    )
    expect(result.lines[0]?.unit_price).toBe(180)
    expect(result.subtotal).toBe(180)
  })

  it("topa la cantidad a 99 y fusiona líneas repetidas del mismo producto", () => {
    const result = resolveOrderItems(
      [
        { product_retailer_id: "abarrotes-curcuma", quantity: 60 },
        { product_retailer_id: "101", quantity: 60 },
      ],
      INDEX,
      DB
    )
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]?.quantity).toBe(99)
  })

  it("una cantidad inválida no resuelve esa línea pero no tumba el pedido", () => {
    const result = resolveOrderItems(
      [
        { product_retailer_id: "abarrotes-curcuma", quantity: 0 },
        { product_retailer_id: "abarrotes-salsa-nueva", quantity: 1 },
      ],
      INDEX,
      DB
    )
    expect(result.lines.map((l) => l.product_id)).toEqual([103])
    expect(result.unresolved).toEqual([
      { retailer_id: "abarrotes-curcuma", name: "Cúrcuma", reason: "invalid_quantity" },
    ])
  })

  it("un producto agotado en la BD no resuelve", () => {
    const db = new Map(DB)
    db.set(102, dbRow(ALA, { stock_status: "out_of_stock" }))
    const result = resolveOrderItems(
      [{ product_retailer_id: "carnes-aves-y-pescados-ala-1-2-iqf-pilgrim-s", quantity: 1 }],
      INDEX,
      db
    )
    expect(result.lines).toEqual([])
    expect(result.unresolved).toEqual([
      {
        retailer_id: "carnes-aves-y-pescados-ala-1-2-iqf-pilgrim-s",
        name: "Ala 1-2 IQF Pilgrim's (caja 12 kg)",
        reason: "out_of_stock",
      },
    ])
  })

  it("un id desconocido queda como unresolved sin nombre", () => {
    const result = resolveOrderItems(
      [{ product_retailer_id: "frutas-y-verduras-aguacate-hass", quantity: 3 }],
      INDEX,
      DB
    )
    expect(result.lines).toEqual([])
    expect(result.subtotal).toBe(0)
    expect(result.unresolved).toEqual([
      { retailer_id: "frutas-y-verduras-aguacate-hass", name: null, reason: "unknown" },
    ])
  })

  it("un producto que resuelve en el índice pero falta en la lectura de BD no resuelve", () => {
    const result = resolveOrderItems(
      [{ product_retailer_id: "abarrotes-salsa-nueva", quantity: 1 }],
      INDEX,
      new Map()
    )
    expect(result.unresolved).toEqual([
      { retailer_id: "abarrotes-salsa-nueva", name: "Salsa Nueva", reason: "missing_in_db" },
    ])
  })
})
