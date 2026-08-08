import { describe, expect, it } from "vitest"
import {
  getCityLandingSchema,
  getOrganizationSchema,
  getProductSchema,
  generateSitemapXml,
} from "./structured-data"

describe("getProductSchema", () => {
  it("usa la imagen real del producto cuando se pasa", () => {
    const schema = getProductSchema(
      "Aguacate Hass",
      "Aguacate de Michoacán",
      "Michoacán",
      120,
      "in_stock",
      "https://supabase.co/storage/producto.png"
    )
    expect(schema.image).toBe("https://supabase.co/storage/producto.png")
    expect(schema.image).not.toContain("placeholder-product")
  })

  it("no usa el placeholder-product.png inexistente como fallback", () => {
    const schema = getProductSchema("X", "Y", "Z", 1, "in_stock")
    expect(schema.image).not.toContain("placeholder-product")
  })

  it("mapea stock_status a availability de schema.org", () => {
    expect(getProductSchema("X", "Y", "Z", 1, "in_stock").offers.availability).toBe(
      "https://schema.org/InStock"
    )
    expect(getProductSchema("X", "Y", "Z", 1, "low_stock").offers.availability).toBe(
      "https://schema.org/LimitedAvailability"
    )
    expect(getProductSchema("X", "Y", "Z", 1, "out_of_stock").offers.availability).toBe(
      "https://schema.org/OutOfStock"
    )
  })
})

describe("getOrganizationSchema", () => {
  it("usa un logo real (images/store/logo.webp), no el logo.png inexistente", () => {
    const schema = getOrganizationSchema()
    expect(schema.logo).toBe("https://resurte.me/images/store/logo.webp")
    expect(schema.logo).not.toContain("logo.png")
  })
})

describe("getCityLandingSchema", () => {
  it("usa la ruta dinámica /opengraph-image en vez del og-image.png inexistente", () => {
    const schema = getCityLandingSchema("Chihuahua", "Chihuahua", 28.6, -106.07)
    expect(schema.image).toBe("https://resurte.me/opengraph-image")
    expect(schema.image).not.toContain("og-image.png")
  })
})

describe("generateSitemapXml", () => {
  it("genera urlset con las entradas dadas", () => {
    const xml = generateSitemapXml([{ url: "https://resurte.me/", priority: 1.0 }])
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain("<loc>https://resurte.me/</loc>")
    expect(xml).toContain("<priority>1</priority>")
  })
})
