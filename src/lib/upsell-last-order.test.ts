import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { updateLastOrder } from "./upsell-last-order"

const offer = {
  productId: 42,
  quantity: 1,
  price: 59.5,
  product: { name: "Empaque térmico" },
}

describe("updateLastOrder", () => {
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v
        },
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("suma el monto al total previo y agrega el item del upsell", () => {
    store.last_order = JSON.stringify({
      orderId: 7,
      total: 300,
      items: [{ id: "1", name: "Leche", quantity: 2, price: 30 }],
    })
    updateLastOrder(offer, 59.5)
    const saved = JSON.parse(store.last_order ?? "")
    expect(saved.orderId).toBe(7)
    expect(saved.total).toBe(359.5)
    expect(saved.items).toHaveLength(2)
    expect(saved.items[1]).toEqual({
      id: "42",
      name: "Empaque térmico",
      quantity: 1,
      price: 59.5,
    })
  })

  it("funciona sin last_order previo (empieza de cero)", () => {
    updateLastOrder(offer, 59.5)
    const saved = JSON.parse(store.last_order ?? "")
    expect(saved.total).toBe(59.5)
    expect(saved.items).toHaveLength(1)
  })

  it("no rompe si last_order tiene JSON inválido", () => {
    store.last_order = "{invalid"
    expect(() => updateLastOrder(offer, 59.5)).not.toThrow()
  })

  it("no rompe si items previo no es un array", () => {
    store.last_order = JSON.stringify({ total: 100, items: "no-array" })
    updateLastOrder(offer, 10)
    const saved = JSON.parse(store.last_order ?? "")
    expect(saved.total).toBe(110)
    expect(saved.items).toHaveLength(1)
  })
})
