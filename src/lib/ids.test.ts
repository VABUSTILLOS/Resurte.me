import { describe, expect, it } from "vitest"
import { uid } from "@/lib/ids"

describe("uid", () => {
  it("usa el prefijo por defecto 'id'", () => {
    expect(uid().startsWith("id-")).toBe(true)
  })

  it("usa el prefijo indicado", () => {
    expect(uid("order").startsWith("order-")).toBe(true)
    expect(uid("sku").startsWith("sku-")).toBe(true)
  })

  it("tiene el formato prefijo-timestamp-contador-aleatorio", () => {
    expect(uid("x").split("-")).toHaveLength(4)
  })

  it("no genera IDs duplicados en el mismo milisegundo", () => {
    const ids = new Set<string>()
    for (let i = 0; i < 1_000; i++) {
      ids.add(uid())
    }
    expect(ids.size).toBe(1_000)
  })

  it("genera IDs distintos entre prefijos", () => {
    expect(uid("a")).not.toBe(uid("b"))
  })
})
