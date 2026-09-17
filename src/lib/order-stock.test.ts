import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { callStockRpc, describeStockConflicts, type SupabaseRpcLike } from "./order-stock"
import { logger } from "@/lib/logger"

function client(rpc: SupabaseRpcLike["rpc"]): SupabaseRpcLike {
  return { rpc }
}

describe("callStockRpc", () => {
  it("pasa el orderId como p_order_id y devuelve el resultado de la RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: { ok: true, reason: "reserved", reserved: [{ product_id: 1, quantity: 2 }] },
      error: null,
    }))

    const result = await callStockRpc(client(rpc), "reserve_order_stock", 42)

    expect(rpc).toHaveBeenCalledWith("reserve_order_stock", { p_order_id: 42 })
    expect(result).toMatchObject({ ok: true, reason: "reserved" })
  })

  it("propaga un conflicto real de existencia (ok: false)", async () => {
    const result = await callStockRpc(
      client(async () => ({
        data: { ok: false, reason: "insufficient_stock", conflicts: [{ product_id: 9, requested: 3, available: 1 }] },
        error: null,
      })),
      "reserve_order_stock",
      7
    )

    expect(result?.ok).toBe(false)
    expect(result?.conflicts?.[0]?.available).toBe(1)
  })

  it("devuelve null y registra cuando la RPC no está desplegada (error de infraestructura)", async () => {
    const result = await callStockRpc(
      client(async () => ({ data: null, error: { message: "does not exist", code: "42883" } })),
      "reserve_order_stock",
      7
    )

    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalled()
  })

  it("devuelve null si la RPC lanza en vez de devolver un error", async () => {
    const result = await callStockRpc(
      client(async () => {
        throw new Error("network down")
      }),
      "release_order_stock",
      7
    )

    expect(result).toBeNull()
    expect(logger.error).toHaveBeenCalled()
  })

  it("normaliza un data nulo sin error a un objeto vacío", async () => {
    const result = await callStockRpc(client(async () => ({ data: null, error: null })), "reserve_order_stock", 1)

    expect(result).toEqual({})
  })
})

describe("describeStockConflicts", () => {
  it("usa el nombre del carrito y las cantidades concretas", () => {
    const message = describeStockConflicts(
      [
        { product_id: 1, requested: 4, available: 1 },
        { product_id: 2, requested: 2, available: 0 },
      ],
      new Map([
        [1, "Jitomate"],
        [2, "Cebolla"],
      ])
    )

    expect(message).toBe("Jitomate (pediste 4, hay 1); Cebolla (pediste 2, hay 0)")
  })

  it("cae al id cuando el carrito no trae nombre", () => {
    const message = describeStockConflicts(
      [{ product_id: 77, requested: 1, available: 0 }],
      new Map([[77, undefined]])
    )

    expect(message).toBe("Producto 77 (pediste 1, hay 0)")
  })
})
