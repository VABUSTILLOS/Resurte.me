import { describe, expect, it } from "vitest"
import {
  DELIVERY_PROOF_BUCKET,
  DELIVERY_PROOF_MAX_BYTES,
  DELIVERY_PROOF_MIME_EXT,
  DELIVERY_PROOF_PREFIX,
  deliveryProofPath,
  isMarketplaceProofPath,
  validateDeliveryProofFile,
} from "./delivery-proof"

const MB = 1024 * 1024

describe("validateDeliveryProofFile", () => {
  it("acepta lo que produce una cámara de teléfono", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validateDeliveryProofFile({ type, size: 1.5 * MB })).toEqual({ ok: true })
    }
  })

  it("rechaza SVG aunque sea image/*", () => {
    // Un SVG servido en línea ejecuta script; por eso la lista blanca es
    // explícita y no `startsWith("image/")`.
    expect(validateDeliveryProofFile({ type: "image/svg+xml", size: 1024 })).toEqual({
      ok: false,
      error: "Formato no válido. Sube una foto JPG, PNG o WebP.",
    })
    expect(DELIVERY_PROOF_MIME_EXT["image/svg+xml"]).toBeUndefined()
  })

  it("rechaza cualquier cosa que no sea imagen", () => {
    for (const type of ["application/pdf", "text/html", "application/octet-stream", ""]) {
      expect(validateDeliveryProofFile({ type, size: 1024 }).ok).toBe(false)
    }
  })

  it("rechaza un archivo vacío", () => {
    expect(validateDeliveryProofFile({ type: "image/jpeg", size: 0 })).toEqual({
      ok: false,
      error: "El archivo está vacío.",
    })
  })

  it("acepta exactamente el límite y rechaza un byte más", () => {
    expect(validateDeliveryProofFile({ type: "image/jpeg", size: DELIVERY_PROOF_MAX_BYTES }).ok).toBe(
      true
    )
    expect(
      validateDeliveryProofFile({ type: "image/jpeg", size: DELIVERY_PROOF_MAX_BYTES + 1 }).ok
    ).toBe(false)
  })

  it("dice cuánto pesa cuando se pasa del límite", () => {
    const result = validateDeliveryProofFile({ type: "image/jpeg", size: 12 * MB })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("12.0 MB")
  })
})

describe("deliveryProofPath", () => {
  it("va bajo el prefijo del marketplace y lleva el id del pedido", () => {
    expect(deliveryProofPath(4321, "image/png", "abc-123")).toBe(
      `${DELIVERY_PROOF_PREFIX}/4321/abc-123.png`
    )
  })

  it("deriva la extensión del MIME, no del nombre del archivo", () => {
    // Declarar image/png y subir un .svg no cambia la extensión resultante.
    expect(deliveryProofPath(1, "image/jpeg", "u")).toMatch(/\.jpg$/)
    expect(deliveryProofPath(1, "image/webp", "u")).toMatch(/\.webp$/)
  })

  it("cae a jpg con un MIME desconocido en lugar de dejar la ruta sin extensión", () => {
    expect(deliveryProofPath(7, "application/octet-stream", "u")).toBe(
      `${DELIVERY_PROOF_PREFIX}/7/u.jpg`
    )
  })

  it("genera un UUID distinto por llamada, para que reemplazar no pise el anterior", () => {
    expect(deliveryProofPath(9, "image/jpeg")).not.toBe(deliveryProofPath(9, "image/jpeg"))
  })

  it("no colisiona con las rutas de FoodOS (`<restaurant_id>/…`)", () => {
    const path = deliveryProofPath(12, "image/jpeg", "u")
    expect(path.split("/")[0]).toBe(DELIVERY_PROOF_PREFIX)
    expect(path.split("/")[0]).not.toBe("12")
  })
})

describe("isMarketplaceProofPath", () => {
  it("reconoce una ruta propia", () => {
    expect(isMarketplaceProofPath(deliveryProofPath(3, "image/jpeg", "u"))).toBe(true)
  })

  it("no reclama rutas de FoodOS ni rutas vacías", () => {
    // El borrado best-effort del objeto anterior solo debe tocar lo propio.
    expect(isMarketplaceProofPath("restaurante-1/pedido-9/foto.jpg")).toBe(false)
    expect(isMarketplaceProofPath("")).toBe(false)
    expect(isMarketplaceProofPath("marketplaceish/1/a.jpg")).toBe(false)
  })
})

describe("constantes del bucket", () => {
  it("reutiliza el bucket privado de FoodOS", () => {
    expect(DELIVERY_PROOF_BUCKET).toBe("entregas")
  })
})
