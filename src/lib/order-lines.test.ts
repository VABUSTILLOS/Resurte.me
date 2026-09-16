import { describe, expect, it } from "vitest"
import { resolveQuantityChange } from "./order-lines"

describe("resolveQuantityChange", () => {
  it("ajusta la cantidad de una línea que sigue en el carrito", () => {
    expect(resolveQuantityChange(true, 5)).toEqual({ type: "set", quantity: 5 })
    expect(resolveQuantityChange(true, 1)).toEqual({ type: "set", quantity: 1 })
  })

  it("baja a 0 sin eliminar: la línea se vacía pero sigue en el pedido", () => {
    expect(resolveQuantityChange(true, 0)).toEqual({ type: "empty" })
  })

  it("un segundo \"−\" sobre una línea en 0 pide confirmación", () => {
    expect(resolveQuantityChange(true, -1)).toEqual({ type: "confirm-remove" })
    expect(resolveQuantityChange(false, -1)).toEqual({ type: "confirm-remove" })
  })

  it("una línea vacía que sube de 0 se restaura en el carrito", () => {
    expect(resolveQuantityChange(false, 1)).toEqual({ type: "restore", quantity: 1 })
    expect(resolveQuantityChange(false, 4)).toEqual({ type: "restore", quantity: 4 })
  })

  it("una línea vacía sin cambio de cantidad también pide confirmación", () => {
    expect(resolveQuantityChange(false, 0)).toEqual({ type: "confirm-remove" })
  })
})
