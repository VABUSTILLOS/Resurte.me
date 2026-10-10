import { describe, expect, it } from "vitest"
import { isOfferableProduct, isPublishedInStore } from "@/lib/published-product"

describe("isPublishedInStore", () => {
  it("solo el producto publicado en tienda cuenta", () => {
    expect(isPublishedInStore({ is_visible: true })).toBe(true)
    expect(isPublishedInStore({ is_visible: false })).toBe(false)
  })

  it("es estricto: sin la columna no se considera publicado", () => {
    // Fail-closed a propósito: una ruta que olvide pedir `is_visible` descarta el
    // producto en vez de ofrecerlo (es el bug que tuvo la oferta post-compra).
    expect(isPublishedInStore({})).toBe(false)
    expect(isPublishedInStore({ is_visible: undefined })).toBe(false)
    expect(isPublishedInStore({ is_visible: null })).toBe(false)
    expect(isPublishedInStore(null)).toBe(false)
    expect(isPublishedInStore(undefined)).toBe(false)
  })
})

describe("isOfferableProduct", () => {
  it("publicado y con existencia", () => {
    expect(isOfferableProduct({ is_visible: true, stock_status: "in_stock" })).toBe(true)
    expect(isOfferableProduct({ is_visible: true, stock_status: "low_stock" })).toBe(true)
  })

  it("descarta agotados aunque estén publicados", () => {
    expect(isOfferableProduct({ is_visible: true, stock_status: "out_of_stock" })).toBe(false)
  })

  it("descarta lo no publicado aunque tenga existencia", () => {
    expect(isOfferableProduct({ is_visible: false, stock_status: "in_stock" })).toBe(false)
    expect(isOfferableProduct({ stock_status: "in_stock" })).toBe(false)
  })
})
