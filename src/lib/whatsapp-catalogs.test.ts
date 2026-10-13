import { describe, expect, it } from "vitest"
import {
  buildAdminCatalogProducts,
  buildAdminProductListSections,
  buildCatalogSyncDiff,
  compareMetaVsStore,
  computeCatalogHealth,
  groupCuratedByCategory,
  orderCatalogItems,
  toWhatsAppProduct,
  validateCatalogProducts,
  type AdminProduct,
  type WaCatalogItemRow,
} from "./whatsapp-catalogs"
import {
  addableSupplierProductIds,
  countAddableSupplierProducts,
  isCatalogSyncable,
  splitSyncable,
} from "./whatsapp-catalog-shared"

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

describe("isCatalogSyncable", () => {
  it("exige precio mayor a 0", () => {
    expect(isCatalogSyncable({ price: 50, sale_price: null })).toBe(true)
    expect(isCatalogSyncable({ price: 0, sale_price: null })).toBe(false)
    expect(isCatalogSyncable({ price: null, sale_price: null })).toBe(false)
  })

  it("el precio de oferta manda sobre el de lista, incluso en 0", () => {
    // Un producto con lista 0 y oferta 30 sí se puede vender.
    expect(isCatalogSyncable({ price: 0, sale_price: 30 })).toBe(true)
    // `sale_price = 0` GANA (?? no cae con 0), así que el producto queda sin
    // precio. Es la semántica que ya tenía toWhatsAppProduct y la misma que
    // pinta el panel (`$0.00`), así que se conserva tal cual: cambiarla
    // alteraría lo que se empuja a Meta.
    expect(isCatalogSyncable({ price: 30, sale_price: 0 })).toBe(false)
  })

  it("coincide con lo que toWhatsAppProduct descarta", () => {
    // La UI marca "sin precio" con esta función y el sync excluye con
    // toWhatsAppProduct: si divergieran, se ofrecería un producto que después
    // desaparece en silencio.
    for (const price of [0, null, 25]) {
      const p = product({ price, sale_price: null })
      expect(isCatalogSyncable(p)).toBe(toWhatsAppProduct(p) !== null)
    }
  })
})

describe("splitSyncable", () => {
  it("separa los publicables de los que no tienen precio", () => {
    const { syncable, unsyncable } = splitSyncable([
      { id: 1, price: 50, sale_price: null },
      { id: 2, price: 0, sale_price: null },
      { id: 3, price: null, sale_price: null },
      { id: 4, price: 80, sale_price: 60 },
    ])
    expect(syncable.map((p) => p.id)).toEqual([1, 4])
    expect(unsyncable.map((p) => p.id)).toEqual([2, 3])
  })

  it("no pierde ni duplica: los dos grupos suman la entrada", () => {
    const input = [
      { id: 1, price: 10, sale_price: null },
      { id: 2, price: 0, sale_price: null },
    ]
    const { syncable, unsyncable } = splitSyncable(input)
    expect(syncable.length + unsyncable.length).toBe(input.length)
  })

  it("una lista vacía devuelve los dos grupos vacíos", () => {
    expect(splitSyncable([])).toEqual({ syncable: [], unsyncable: [] })
  })
})

describe("addableSupplierProductIds", () => {
  it("devuelve los ids que faltan por curar, en orden", () => {
    expect(addableSupplierProductIds([1, 2, 3], new Set([3]), new Set([1, 2, 3]))).toEqual([1, 2])
  })

  it("omite los que la lista no puede ofrecer", () => {
    expect(addableSupplierProductIds([1, 9], new Set(), new Set([1]))).toEqual([1])
  })

  it("deduplica: varias filas del mismo producto (distinto SKU) cuentan una vez", () => {
    expect(addableSupplierProductIds([1, 1, 2], new Set(), new Set([1, 2]))).toEqual([1, 2])
  })

  it("sin nada pendiente devuelve vacío", () => {
    expect(addableSupplierProductIds([1, 2], new Set([1, 2]), new Set([1, 2]))).toEqual([])
  })

  it("el conteo es exactamente la longitud de esta lista", () => {
    // El número del chip y el del botón "Agregar todo el proveedor" tienen que
    // salir de la misma definición, o el botón promete algo distinto de lo que
    // el chip anuncia.
    const productIds = [5, 3, 5, 8, 99]
    const curated = new Set([3])
    const known = new Set([5, 3, 8])
    expect(countAddableSupplierProducts(productIds, curated, known)).toBe(
      addableSupplierProductIds(productIds, curated, known).length
    )
  })
})

describe("countAddableSupplierProducts", () => {
  it("cuenta sólo los que no están ya en la curaduría", () => {
    // 3 ya está curado ⇒ no se cuenta.
    expect(countAddableSupplierProducts([1, 2, 3], new Set([3]), new Set([1, 2, 3]))).toBe(2)
  })

  it("no cuenta un producto que la lista no puede ofrecer", () => {
    // 9 no está entre los conocidos: contarlo prometería algo que el botón no
    // va a agregar.
    expect(countAddableSupplierProducts([1, 9], new Set(), new Set([1]))).toBe(1)
  })

  it("un proveedor sin productos da 0", () => {
    expect(countAddableSupplierProducts([], new Set([1]), new Set([1]))).toBe(0)
  })

  it("un proveedor con todo ya curado da 0", () => {
    expect(countAddableSupplierProducts([1, 2], new Set([1, 2]), new Set([1, 2]))).toBe(0)
  })

  it("no cuenta ids repetidos dos veces", () => {
    // `product_suppliers` puede tener varias filas del mismo producto (distinto
    // SKU); el resumen ya deduplica, y el conteo tampoco debe inflarse.
    expect(countAddableSupplierProducts([1, 1], new Set(), new Set([1]))).toBe(1)
  })
})

describe("groupCuratedByCategory", () => {
  const ref = (id: number, category_id: number | null) => ({ id, category_id })

  it("junta los productos de cada categoría", () => {
    // 1 y 3 son de la categoría 10; 2 y 4 de la 20.
    const ordered = groupCuratedByCategory(
      [item(1, 1), item(2, 2), item(3, 3), item(4, 4)],
      [ref(1, 10), ref(2, 20), ref(3, 10), ref(4, 20)]
    )
    expect(ordered).toEqual([1, 3, 2, 4])
  })

  it("el orden de las categorías es el de su primera aparición", () => {
    // La categoría 20 aparece primero (posición 1) ⇒ va antes, aunque su id sea
    // mayor. No se inventa un orden: se respeta el que ya tenía la curaduría.
    const ordered = groupCuratedByCategory(
      [item(1, 1), item(2, 2), item(3, 3)],
      [ref(1, 20), ref(2, 10), ref(3, 10)]
    )
    expect(ordered).toEqual([1, 2, 3])
  })

  it("conserva el orden interno de cada grupo", () => {
    // 9 va antes que 5 dentro de la categoría 10: junta, no reordena.
    const ordered = groupCuratedByCategory(
      [item(9, 1), item(5, 2), item(7, 3)],
      [ref(9, 10), ref(5, 10), ref(7, 20)]
    )
    expect(ordered).toEqual([9, 5, 7])
  })

  it("manda los productos sin categoría al final", () => {
    // Aunque el sin categoría esté en la posición 1.
    const ordered = groupCuratedByCategory(
      [item(1, 1), item(2, 2), item(3, 3)],
      [ref(1, null), ref(2, 10), ref(3, 20)]
    )
    expect(ordered).toEqual([2, 3, 1])
  })

  it("un producto ausente del catálogo cuenta como sin categoría", () => {
    // No se puede saber su categoría: al final, no en medio de un grupo.
    const ordered = groupCuratedByCategory([item(1, 1), item(2, 2)], [ref(1, 10)])
    expect(ordered).toEqual([1, 2])
  })

  it("ignora las filas ocultas", () => {
    const ordered = groupCuratedByCategory(
      [item(1, 1), item(2, 2, false), item(3, 3)],
      [ref(1, 10), ref(2, 10), ref(3, 10)]
    )
    expect(ordered).toEqual([1, 3])
  })

  it("no pierde ni duplica ids", () => {
    const rows = [item(1, 1), item(2, 2), item(3, 3), item(4, 4), item(5, 5)]
    const refs = [ref(1, 10), ref(2, 20), ref(3, 10), ref(4, null), ref(5, 20)]
    const ordered = groupCuratedByCategory(rows, refs)
    expect(ordered).toHaveLength(5)
    expect(new Set(ordered).size).toBe(5)
    expect([...ordered].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })

  it("es idempotente: aplicarla sobre su resultado no cambia nada", () => {
    const rows = [item(1, 1), item(2, 2), item(3, 3), item(4, 4), item(5, 5)]
    const refs = [ref(1, 10), ref(2, 20), ref(3, 10), ref(4, null), ref(5, 20)]
    const once = groupCuratedByCategory(rows, refs)
    const reordered = once.map((id, idx) => item(id, idx + 1))
    expect(groupCuratedByCategory(reordered, refs)).toEqual(once)
  })

  it("una curaduría vacía devuelve vacío", () => {
    expect(groupCuratedByCategory([], [])).toEqual([])
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
