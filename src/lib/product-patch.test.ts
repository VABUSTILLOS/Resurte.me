import { describe, it, expect } from "vitest"
import { validateProductPatch } from "./product-patch"

const validate = (fields: Record<string, unknown>) =>
  validateProductPatch(fields, { productId: 7 })

/**
 * `field` es el contrato que usa el modal de producto para marcar el control
 * culpable (B12): sin él, un 400/409 solo puede pintarse como aviso general.
 */
describe("validateProductPatch — campo culpable", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["name", { name: "   " }],
    ["brand", { brand: 5 }],
    ["description", { description: 5 }],
    ["unit", { unit: 5 }],
    ["publish_at", { publish_at: "ayer" }],
    ["unpublish_at", { unpublish_at: "ayer" }],
    ["sale_starts_at", { sale_starts_at: "ayer" }],
    ["sale_ends_at", { sale_ends_at: "ayer" }],
    ["admin_note", { admin_note: 5 }],
    ["images", { images: "https://x/y.png" }],
    ["price", { price: -1 }],
    ["price", { price: "12" }],
    ["sale_price", { sale_price: -0.01 }],
    ["sku", { sku: "sku inválido!" }],
    ["barcode", { barcode: "12ab" }],
    ["tags", { tags: "verano" }],
    ["tags", { tags: [1] }],
    ["tags", { tags: ["a".repeat(41)] }],
    ["tags", { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }],
    ["low_stock_threshold", { low_stock_threshold: 1.5 }],
    ["low_stock_threshold", { low_stock_threshold: -1 }],
    ["related_product_ids", { related_product_ids: "7" }],
    ["related_product_ids", { related_product_ids: ["a"] }],
    ["related_product_ids", { related_product_ids: Array.from({ length: 14 }, (_, i) => i + 1) }],
    ["stock_status", { stock_status: "casi" }],
    ["stock_quantity", { stock_quantity: 1.5 }],
    ["stock_quantity", { stock_quantity: -1 }],
    ["cost", { cost: -1 }],
    ["seo_title", { seo_title: 5 }],
    ["seo_description", { seo_description: 5 }],
    ["category_id", { category_id: 1.5 }],
    ["image_url", { image_url: "ftp://x/y.png" }],
  ]

  it.each(cases)("marca %s cuando el valor no es válido", (field, fields) => {
    const result = validate(fields)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.field).toBe(field)
  })

  it("un patch válido no lleva campo culpable", () => {
    const result = validate({ name: "Agua 600 ml", price: 12.5, sku: "AGUA-600" })
    expect(result.ok).toBe(true)
  })
})
