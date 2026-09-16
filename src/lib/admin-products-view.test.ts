import { describe, expect, it } from "vitest"
import { resolveProductsView } from "./admin-products-view"

describe("admin-products-view: resolveProductsView", () => {
  it("abre en tarjetas en móvil cuando la URL no fija vista", () => {
    expect(resolveProductsView(null, true, null)).toBe("grid")
  })

  it("deja la tabla por defecto en escritorio", () => {
    expect(resolveProductsView(null, false, null)).toBe("table")
  })

  it("respeta la vista explícita de la URL en ambos breakpoints", () => {
    expect(resolveProductsView("table", true, null)).toBe("table")
    expect(resolveProductsView("grid", false, null)).toBe("grid")
  })

  it("ignora valores de vista desconocidos", () => {
    expect(resolveProductsView("cards", true, null)).toBe("grid")
    expect(resolveProductsView("cards", false, null)).toBe("table")
  })

  it("la elección del usuario gana sobre la URL y sobre el default", () => {
    expect(resolveProductsView("grid", true, "table")).toBe("table")
    expect(resolveProductsView(null, false, "grid")).toBe("grid")
  })
})
