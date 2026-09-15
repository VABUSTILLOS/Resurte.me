import { describe, expect, it } from "vitest"
import {
  buildCatalogChatLink,
  buildCatalogShareText,
  buildCatalogShopLink,
  normalizeMxPhoneForWaMe,
} from "./whatsapp-share"

describe("normalizeMxPhoneForWaMe", () => {
  it("acepta 10 dígitos y agrega 52", () => {
    expect(normalizeMxPhoneForWaMe("6141234567")).toBe("526141234567")
  })

  it("acepta con 52, con +52 y con formato", () => {
    expect(normalizeMxPhoneForWaMe("526141234567")).toBe("526141234567")
    expect(normalizeMxPhoneForWaMe("+52 614 123 4567")).toBe("526141234567")
    expect(normalizeMxPhoneForWaMe("52 614-123-4567")).toBe("526141234567")
  })

  it("quita el 1 legacy de +52 1", () => {
    expect(normalizeMxPhoneForWaMe("5216141234567")).toBe("526141234567")
    expect(normalizeMxPhoneForWaMe("+52 1 614 123 4567")).toBe("526141234567")
  })

  it("rechaza números no plausibles", () => {
    expect(normalizeMxPhoneForWaMe("123")).toBeNull()
    expect(normalizeMxPhoneForWaMe("")).toBeNull()
    expect(normalizeMxPhoneForWaMe(null)).toBeNull()
    expect(normalizeMxPhoneForWaMe("9996141234567")).toBeNull()
  })
})

describe("enlaces de catálogo", () => {
  it("chat link incluye texto precargado", () => {
    const link = buildCatalogChatLink("6141234567", "Chihuahua")
    expect(link).toContain("https://wa.me/526141234567?text=")
    expect(link).toContain(encodeURIComponent("Chihuahua"))
  })

  it("shop link usa wa.me/c/", () => {
    expect(buildCatalogShopLink("+52 614 123 4567")).toBe("https://wa.me/c/526141234567")
  })

  it("share text incluye el shop link", () => {
    const text = buildCatalogShareText("6141234567", "Chihuahua")
    expect(text).toContain("https://wa.me/c/526141234567")
    expect(text).toContain("Chihuahua")
  })

  it("devuelve null sin teléfono válido", () => {
    expect(buildCatalogChatLink("", "X")).toBeNull()
    expect(buildCatalogShopLink("123")).toBeNull()
  })
})
