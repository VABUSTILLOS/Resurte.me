import { describe, expect, it } from "vitest"
import {
  activeVariantsOf,
  deriveParentStockStatus,
  groupVariantsByProduct,
  uniqueVariantSlug,
  validateProductVariantInput,
  variantEffectivePrice,
  variantSlugBase,
} from "@/lib/product-variants"
import type { ProductVariant } from "@/types"

function variant(overrides: Partial<ProductVariant>): ProductVariant {
  return {
    id: 1,
    product_id: 7,
    name: "Bolsa 5 kg",
    slug: "bolsa-5-kg",
    sku: null,
    price: 290,
    sale_price: null,
    stock_quantity: 4,
    stock_status: "in_stock",
    is_active: true,
    position: 0,
    ...overrides,
  }
}

describe("variantEffectivePrice", () => {
  it("la oferta gana; sin oferta, el precio", () => {
    expect(variantEffectivePrice({ price: 100, sale_price: 80 })).toBe(80)
    expect(variantEffectivePrice({ price: 100, sale_price: null })).toBe(100)
  })
})

describe("slug de variante", () => {
  it("se deriva del nombre sin acentos", () => {
    expect(variantSlugBase("Bolsa 5 kg")).toBe("bolsa-5-kg")
    expect(variantSlugBase("Tamaño jalapeño")).toBe("tamano-jalapeno")
    expect(variantSlugBase("¡¡¡")).toBe("presentacion")
  })

  it("desduplica con sufijo numérico", () => {
    const existing = new Set(["bolsa-5-kg", "bolsa-5-kg-2"])
    expect(uniqueVariantSlug("bolsa-1-kg", existing)).toBe("bolsa-1-kg")
    expect(uniqueVariantSlug("bolsa-5-kg", existing)).toBe("bolsa-5-kg-3")
  })
})

describe("deriveParentStockStatus", () => {
  it("con variantes activas: agotado solo si todas lo están", () => {
    expect(
      deriveParentStockStatus([{ stock_status: "out_of_stock" }, { stock_status: "in_stock" }], {
        stock_quantity: null,
      })
    ).toBe("in_stock")
    expect(
      deriveParentStockStatus(
        [{ stock_status: "out_of_stock" }, { stock_status: "out_of_stock" }],
        { stock_quantity: null }
      )
    ).toBe("out_of_stock")
  })

  it("sin variantes activas manda la existencia propia del producto", () => {
    expect(deriveParentStockStatus([], { stock_quantity: 0 })).toBe("out_of_stock")
    expect(deriveParentStockStatus([], { stock_quantity: 3 })).toBe("low_stock")
    expect(deriveParentStockStatus([], { stock_quantity: null })).toBe("in_stock")
  })
})

describe("groupVariantsByProduct / activeVariantsOf", () => {
  it("agrupa por producto y filtra activas en orden de exhibición", () => {
    const all = [
      variant({ id: 1, position: 2 }),
      variant({ id: 2, position: 1 }),
      variant({ id: 3, is_active: false, position: 0 }),
      variant({ id: 4, product_id: 9 }),
    ]
    expect(groupVariantsByProduct(all).get(7)).toHaveLength(3)
    expect(activeVariantsOf(all, 7).map((v) => v.id)).toEqual([2, 1])
  })
})

describe("validateProductVariantInput", () => {
  it("alta: exige nombre y precio mayor a 0", () => {
    expect(validateProductVariantInput({}, { partial: false }).ok).toBe(false)
    expect(validateProductVariantInput({ name: "Bolsa 1 kg" }, { partial: false }).ok).toBe(false)
    expect(
      validateProductVariantInput({ name: "Bolsa 1 kg", price: 0 }, { partial: false }).ok
    ).toBe(false)
    const ok = validateProductVariantInput(
      { name: "  Bolsa 1 kg ", price: 68.5, stock_quantity: "" },
      { partial: false }
    )
    expect(ok).toEqual({
      ok: true,
      value: { name: "Bolsa 1 kg", price: 68.5, stock_quantity: null },
    })
  })

  it("edición parcial: solo valida lo que viene", () => {
    expect(validateProductVariantInput({ is_active: false }, { partial: true })).toEqual({
      ok: true,
      value: { is_active: false },
    })
    const bad = validateProductVariantInput({ stock_quantity: 1.5 }, { partial: true })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.field).toBe("stock_quantity")
  })

  it("la oferta no puede ser negativa; el SKU largo se rechaza", () => {
    expect(
      validateProductVariantInput({ sale_price: -1 }, { partial: true }).ok
    ).toBe(false)
    expect(
      validateProductVariantInput({ sku: "x".repeat(65) }, { partial: true }).ok
    ).toBe(false)
    expect(validateProductVariantInput({ sku: "" }, { partial: true })).toEqual({
      ok: true,
      value: { sku: null },
    })
  })
})
