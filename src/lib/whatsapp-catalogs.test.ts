import { describe, expect, it } from "vitest"
import {
  buildAdminCatalogProducts,
  buildAdminProductListSections,
  orderCatalogItems,
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
