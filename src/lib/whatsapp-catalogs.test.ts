import { describe, expect, it } from "vitest"
import {
  buildAdminCatalogProducts,
  buildAdminProductListSections,
  buildCatalogSyncDiff,
  compareMetaVsStore,
  computeCatalogHealth,
  orderCatalogItems,
  validateCatalogProducts,
  type AdminProduct,
  type WaCatalogItemRow,
} from "./whatsapp-catalogs"

const product = (partial: Partial<AdminProduct> = {}): AdminProduct => ({
  id: 1,
  name: "Producto",
  brand: null,
  category_id: null,
  category_name: null,
  image_url: null,
  price: 50,
  sale_price: null,
  unit: null,
  ...partial,
})

const item = (product_id: number, position: number, is_visible = true): WaCatalogItemRow => ({
  catalog_id: "c1",
  product_id,
  position,
  is_visible,
})

describe("orderCatalogItems", () => {
  it("ordena por posición de la curaduría", () => {
    const ordered = orderCatalogItems([item(1, 3), item(2, 1), item(3, 2)])
    expect(ordered.map((i) => i.product_id)).toEqual([2, 3, 1])
  })
})

describe("buildAdminCatalogProducts", () => {
  it("mapea solo visibles con precio > 0, en orden, con sale_price", () => {
    const products = [
      product({ id: 1, name: "A", price: 100 }),
      product({ id: 2, name: "B", price: 80, sale_price: 60, brand: "Marca", unit: "kg" }),
      product({ id: 3, name: "C", price: 0 }),
    ]
    const curated = [item(3, 1), item(1, 2), item(2, 3), item(99, 4)]
    const result = buildAdminCatalogProducts(curated, products)
    // id 3 (precio 0) y 99 (inexistente) se omiten; orden 1→2 por posición
    expect(result.map((p) => p.id)).toEqual(["1", "2"])
    expect(result[1]).toMatchObject({
      name: "B",
      price: 60,
      description: "Marca · kg",
      sale_price: 60,
    })
  })

  it("respeta is_visible = false", () => {
    const result = buildAdminCatalogProducts(
      [item(1, 1, false), item(2, 2)],
      [product({ id: 1 }), product({ id: 2 })]
    )
    expect(result.map((p) => p.id)).toEqual(["2"])
  })
})

describe("buildAdminProductListSections", () => {
  it("agrupa por categoría preservando el orden y limita a 30", () => {
    const products = [
      product({ id: 1, category_name: "Lácteos" }),
      product({ id: 2, category_name: "Frutas" }),
      product({ id: 3, category_name: "Lácteos" }),
    ]
    const sections = buildAdminProductListSections([item(1, 1), item(2, 2), item(3, 3)], products)
    expect(sections).toHaveLength(2)
    expect(sections[0]).toEqual({
      title: "Lácteos",
      product_items: [{ product_retailer_id: "1" }, { product_retailer_id: "3" }],
    })
    expect(sections[1]?.title).toBe("Frutas")
  })
})

describe("buildCatalogSyncDiff", () => {
  it("clasifica crear, actualizar y stale sin borrar nada", () => {
    const desired = [
      { id: "1", name: "A", price: 10 },
      { id: "2", name: "B", price: 20 },
    ]
    const diff = buildCatalogSyncDiff(desired, [
      { retailer_id: "2" },
      { retailer_id: "9" },
    ])
    expect(diff.toCreate).toEqual(["1"])
    expect(diff.toUpdate).toEqual(["2"])
    expect(diff.stale).toEqual(["9"])
  })

  it("ignora filas de Meta sin retailer_id", () => {
    const diff = buildCatalogSyncDiff(
      [{ id: "1", name: "A", price: 10 }],
      [{ retailer_id: "" }]
    )
    expect(diff.stale).toEqual([])
    expect(diff.toCreate).toEqual(["1"])
  })
})

describe("validateCatalogProducts", () => {
  const wa = (partial: Record<string, unknown> = {}) => ({
    id: "1",
    name: "Producto",
    price: 50,
    ...partial,
  })

  it("separa válidos de inválidos con motivos", () => {
    const { valid, invalid } = validateCatalogProducts([
      wa({ id: "ok" }),
      wa({ id: "sin-precio", price: 0 }),
      wa({ id: "img-relativa", image_url: "/img/p.png" }),
      wa({ id: "nombre-largo", name: "x".repeat(151) }),
    ])
    expect(valid.map((p) => p.id)).toEqual(["ok"])
    expect(invalid).toHaveLength(3)
    expect(invalid.find((i) => i.id === "sin-precio")?.reasons[0]).toContain("precio")
    expect(invalid.find((i) => i.id === "img-relativa")?.reasons[0]).toContain("https")
    expect(invalid.find((i) => i.id === "nombre-largo")?.reasons[0]).toContain("150")
  })

  it("acepta imágenes https y productos sin imagen", () => {
    const { valid, invalid } = validateCatalogProducts([
      wa({ id: "a", image_url: "https://cdn.x/p.png" }),
      wa({ id: "b" }),
    ])
    expect(invalid).toHaveLength(0)
    expect(valid).toHaveLength(2)
  })
})

describe("compareMetaVsStore", () => {
  const metaProduct = (partial: Record<string, unknown> = {}) => ({
    id: "m1",
    name: "P",
    retailer_id: "1",
    ...partial,
  })
  const storeProduct = (partial: Record<string, unknown> = {}) => ({
    id: "1",
    name: "P",
    price: 50,
    ...partial,
  })

  it("match cuando precio e imagen coinciden", () => {
    const [row] = compareMetaVsStore(
      [metaProduct({ price: "5000", image_url: "https://x/p.png" })],
      [storeProduct({ price: 50, image_url: "https://x/p.png" })]
    )
    expect(row?.status).toBe("match")
    expect(row?.metaPrice).toBe(50)
  })

  it("price_diff cuando el precio regular difiere", () => {
    const [row] = compareMetaVsStore(
      [metaProduct({ price: "6000" })],
      [storeProduct({ price: 50 })]
    )
    expect(row?.status).toBe("price_diff")
    expect(row?.metaPrice).toBe(60)
    expect(row?.storePrice).toBe(50)
  })

  it("sale_price_diff cuando solo difiere el sale_price", () => {
    const [row] = compareMetaVsStore(
      [metaProduct({ price: "5000", sale_price: "4500" })],
      [storeProduct({ price: 50, sale_price: 40 })]
    )
    expect(row?.status).toBe("sale_price_diff")
  })

  it("image_missing_meta cuando la tienda tiene imagen y Meta no", () => {
    const [row] = compareMetaVsStore(
      [metaProduct({ price: "5000" })],
      [storeProduct({ price: 50, image_url: "https://x/p.png" })]
    )
    expect(row?.status).toBe("image_missing_meta")
  })

  it("only_meta y only_store en los extremos", () => {
    const rows = compareMetaVsStore(
      [metaProduct({ retailer_id: "9", price: "1000" })],
      [storeProduct({ id: "2", price: 20 })]
    )
    expect(rows.find((r) => r.retailer_id === "9")?.status).toBe("only_meta")
    expect(rows.find((r) => r.retailer_id === "2")?.status).toBe("only_store")
  })
})

describe("computeCatalogHealth", () => {
  const row = (status: "match" | "price_diff" | "sale_price_diff" | "image_missing_meta" | "only_meta" | "only_store", id = "1") => ({
    retailer_id: id,
    status,
    metaPrice: null,
    storePrice: null,
    metaSalePrice: null,
    storeSalePrice: null,
    metaImageUrl: null,
    storeImageUrl: null,
    metaAvailability: null,
    metaReviewStatus: null,
  })

  it("catálogo vacío tiene score 100", () => {
    const health = computeCatalogHealth([])
    expect(health.score).toBe(100)
    expect(health.total).toBe(0)
  })

  it("todo sano da score 100 sin issues", () => {
    const health = computeCatalogHealth([row("match", "1"), row("match", "2")])
    expect(health.score).toBe(100)
    expect(health.healthy).toBe(2)
    expect(health.issues).toHaveLength(0)
  })

  it("mezcla calcula score y severidades", () => {
    const health = computeCatalogHealth([
      row("match", "1"),
      row("price_diff", "2"),
      row("image_missing_meta", "3"),
      row("only_meta", "4"),
    ])
    expect(health.score).toBe(25)
    const byId = new Map(health.issues.map((i) => [i.retailer_id, i.severity]))
    expect(byId.get("2")).toBe("alta")
    expect(byId.get("3")).toBe("media")
    expect(byId.get("4")).toBe("info")
  })
})
