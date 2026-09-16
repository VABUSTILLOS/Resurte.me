import { describe, expect, it } from "vitest"
import {
  chunk,
  classifyImageProbe,
  imageProbeReason,
  isProbeableImageUrl,
  shouldRetryWithGet,
} from "./product-images"

describe("isProbeableImageUrl", () => {
  it("acepta solo URLs absolutas http(s)", () => {
    expect(isProbeableImageUrl("https://cdn.resurte.me/a.jpg")).toBe(true)
    expect(isProbeableImageUrl("http://cdn.resurte.me/a.jpg")).toBe(true)
    expect(isProbeableImageUrl("  https://cdn.resurte.me/a.jpg  ")).toBe(true)
  })

  it("rechaza rutas locales, esquemas raros y valores vacíos", () => {
    expect(isProbeableImageUrl("/productos/a.jpg")).toBe(false)
    expect(isProbeableImageUrl("data:image/png;base64,AAAA")).toBe(false)
    expect(isProbeableImageUrl("")).toBe(false)
    expect(isProbeableImageUrl(null)).toBe(false)
    expect(isProbeableImageUrl(undefined)).toBe(false)
    expect(isProbeableImageUrl(42)).toBe(false)
  })
})

describe("classifyImageProbe", () => {
  it("marca viva cualquier respuesta 2xx/3xx", () => {
    expect(classifyImageProbe(200)).toBe("ok")
    expect(classifyImageProbe(206)).toBe("ok")
    expect(classifyImageProbe(304)).toBe("ok")
  })

  it("marca rota cualquier respuesta 4xx/5xx", () => {
    expect(classifyImageProbe(403)).toBe("broken")
    expect(classifyImageProbe(404)).toBe("broken")
    expect(classifyImageProbe(500)).toBe("broken")
  })

  it("marca rota la falta de respuesta (timeout o error de red)", () => {
    expect(classifyImageProbe(null)).toBe("broken")
  })
})

describe("shouldRetryWithGet", () => {
  it("reintenta solo cuando el servidor rechazó el HEAD", () => {
    expect(shouldRetryWithGet(403)).toBe(true)
    expect(shouldRetryWithGet(405)).toBe(true)
    expect(shouldRetryWithGet(501)).toBe(true)
  })

  it("no reintenta en respuestas concluyentes ni en fallo de red", () => {
    expect(shouldRetryWithGet(200)).toBe(false)
    expect(shouldRetryWithGet(404)).toBe(false)
    expect(shouldRetryWithGet(500)).toBe(false)
    expect(shouldRetryWithGet(null)).toBe(false)
  })
})

describe("imageProbeReason", () => {
  it("explica cada caso en español", () => {
    expect(imageProbeReason(null)).toContain("timeout")
    expect(imageProbeReason(404)).toContain("ya no existe")
    expect(imageProbeReason(503)).toContain("falló")
    expect(imageProbeReason(403)).toContain("no es accesible")
    expect(imageProbeReason(204)).toBe("HTTP 204")
  })
})

describe("chunk", () => {
  it("parte la lista en tandas del tamaño pedido", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it("devuelve una sola tanda cuando el tamaño es inválido", () => {
    expect(chunk([1, 2, 3], 0)).toEqual([[1, 2, 3]])
    expect(chunk([1, 2, 3], -1)).toEqual([[1, 2, 3]])
  })

  it("devuelve una lista vacía sin elementos", () => {
    expect(chunk([], 3)).toEqual([])
  })
})
