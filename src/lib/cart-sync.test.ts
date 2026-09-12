import { describe, expect, it } from "vitest"
import { mergeCarts, type LocalCartSnapshot, type ServerCartSnapshot } from "./cart-sync"
import type { CartItem } from "@/types"

const item = (id: number, qty = 1): CartItem =>
  ({ product_id: id, quantity: qty, name: `P${id}`, price: 10 }) as CartItem

function local(items: CartItem[], updatedAt: number | null = 1000): LocalCartSnapshot {
  return { cart: { items }, coupon: null, updatedAt }
}

function server(items: CartItem[], updated_at: string | null): ServerCartSnapshot {
  return { items, coupon: null, updated_at }
}

describe("mergeCarts", () => {
  it("sin items en ninguno → none", () => {
    expect(mergeCarts(local([], null), server([], null)).action).toBe("none")
    expect(mergeCarts(local([], null), null).action).toBe("none")
  })

  it("solo local tiene items → upload-local", () => {
    expect(mergeCarts(local([item(1)]), server([], null)).action).toBe("upload-local")
    expect(mergeCarts(local([item(1)]), null).action).toBe("upload-local")
  })

  it("solo servidor tiene items → use-server con su contenido", () => {
    const d = mergeCarts(local([], null), server([item(2, 3)], "2026-01-01T00:00:01Z"))
    expect(d.action).toBe("use-server")
    if (d.action === "use-server") {
      expect(d.cart.items).toHaveLength(1)
      expect(d.cart.items[0]).toMatchObject({ product_id: 2, quantity: 3 })
    }
  })

  it("ambos con items, servidor más reciente → use-server", () => {
    const d = mergeCarts(local([item(1)], 1000), server([item(2)], "2026-01-01T00:00:01Z"))
    expect(d.action).toBe("use-server")
  })

  it("ambos con items, local más reciente → upload-local", () => {
    const d = mergeCarts(
      local([item(1)], Date.parse("2026-06-01T00:00:00Z")),
      server([item(2)], "2026-01-01T00:00:01Z")
    )
    expect(d.action).toBe("upload-local")
  })

  it("local legacy sin timestamp → upload-local (no perder el estado del dispositivo)", () => {
    const d = mergeCarts(local([item(1)], null), server([item(2)], "2026-01-01T00:00:01Z"))
    expect(d.action).toBe("upload-local")
  })

  it("servidor sin updated_at válido → upload-local", () => {
    const d = mergeCarts(local([item(1)], 1000), server([item(2)], "no-es-fecha"))
    expect(d.action).toBe("upload-local")
  })
})
