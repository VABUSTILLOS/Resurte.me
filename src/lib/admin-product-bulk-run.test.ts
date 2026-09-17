import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  BULK_CLIENT_CHUNK,
  bulkPatch,
  bulkPatchEach,
  postBulk,
  runPerId,
  summarizeBulkFailures,
} from "./admin-product-bulk-run"

const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

function ok(body: unknown) {
  return jsonResponse(200, body)
}

function err(status: number, body: unknown) {
  return jsonResponse(status, body)
}

function requestBody(index = 0): Record<string, unknown> {
  const call = fetchMock.mock.calls[index]
  if (!call) throw new Error(`petición ${index} no enviada`)
  const init = call[1] as RequestInit | undefined
  return JSON.parse(String(init?.body))
}

beforeEach(() => {
  fetchMock.mockReset()
})

describe("postBulk", () => {
  it("no llama al endpoint si no hay ids", async () => {
    const result = await postBulk([], { patch: { is_visible: true } })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual({ updated: [], failed: [], cancelled: false })
  })

  it("trocea por BULK_CLIENT_CHUNK y acumula el progreso", async () => {
    fetchMock.mockResolvedValue(ok({ updated: [], failed: [] }))
    const ids = Array.from({ length: BULK_CLIENT_CHUNK + 5 }, (_, i) => i + 1)
    const progress: [number, number][] = []

    await postBulk(ids, { patch: { is_visible: true } }, { onProgress: (d, t) => progress.push([d, t]) })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(progress).toEqual([
      [BULK_CLIENT_CHUNK, ids.length],
      [ids.length, ids.length],
    ])
    const firstBody = requestBody()
    expect(firstBody.ids).toHaveLength(BULK_CLIENT_CHUNK)
    expect(firstBody.patch).toEqual({ is_visible: true })
  })

  it("cancela entre bloques y no envía los restantes", async () => {
    fetchMock.mockResolvedValue(ok({ updated: [], failed: [] }))
    const ids = Array.from({ length: BULK_CLIENT_CHUNK * 3 }, (_, i) => i + 1)
    let calls = 0

    const result = await postBulk(ids, { patch: { is_visible: true } }, { isCancelled: () => calls++ >= 1 })

    expect(result.cancelled).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("traduce un error HTTP a un fallo por id con el motivo del servidor", async () => {
    fetchMock.mockResolvedValue(err(400, { error: "patch vacío" }))
    const result = await postBulk([1, 2, 3], { patch: {} })
    expect(result.failed).toEqual([
      { id: 1, reason: "patch vacío" },
      { id: 2, reason: "patch vacío" },
      { id: 3, reason: "patch vacío" },
    ])
    expect(result.updated).toEqual([])
  })

  it("usa un motivo genérico si el error no trae cuerpo JSON", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error("boom") } })
    const result = await postBulk([7], { patch: { is_visible: true } })
    expect(result.failed).toEqual([{ id: 7, reason: "Error al actualizar en lote" }])
  })

  it("marca los ids como fallidos si la petición no llega", async () => {
    fetchMock.mockRejectedValue(new Error("offline"))
    const result = await postBulk([4, 5], { patch: { is_visible: true } })
    expect(result.failed).toEqual([
      { id: 4, reason: "Sin conexión" },
      { id: 5, reason: "Sin conexión" },
    ])
  })

  it("reparte updated y failed cuando el servidor responde parcial", async () => {
    fetchMock.mockResolvedValue(ok({ updated: [1, 2], failed: [{ id: 3, reason: "SKU duplicado" }] }))
    const result = await postBulk([1, 2, 3], { patch: { is_visible: true } })
    expect(result.updated).toEqual([1, 2])
    expect(result.failed).toEqual([{ id: 3, reason: "SKU duplicado" }])
  })

  it("envía patches indexados por id cuando se usa la vía por producto", async () => {
    fetchMock.mockResolvedValue(ok({ updated: [1], failed: [] }))
    await postBulk([1], { patches: { "1": { price: 20 } } })
    const body = requestBody()
    expect(body.patches).toEqual({ "1": { price: 20 } })
    expect(body.patch).toBeUndefined()
  })
})

describe("bulkPatch", () => {
  it("aplica el mismo parche a todos los ids", async () => {
    fetchMock.mockResolvedValue(ok({ updated: [1, 2], failed: [] }))
    const result = await bulkPatch([1, 2], { is_visible: false })
    expect(result.updated).toEqual([1, 2])
    expect(requestBody().patch).toEqual({ is_visible: false })
  })
})

describe("bulkPatchEach", () => {
  it("omite los productos sin parche y no los reporta como fallo", async () => {
    fetchMock.mockResolvedValue(ok({ updated: [1, 3], failed: [] }))
    const products = [
      { id: 1, price: 100 },
      { id: 2, price: 0 },
      { id: 3, price: 300 },
    ]

    const result = await bulkPatchEach(products, (p) => (p.price > 0 ? { price: p.price * 2 } : null))

    const body = requestBody()
    expect(body.ids).toEqual([1, 3])
    expect(body.patches).toEqual({ "1": { price: 200 }, "3": { price: 600 } })
    expect(result.failed).toEqual([])
  })

  it("no llama al endpoint si ningún producto necesita cambio", async () => {
    const result = await bulkPatchEach([{ id: 1 }], () => null)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.updated).toEqual([])
  })
})

describe("runPerId", () => {
  it("reporta progreso por id y separa éxitos de fallos", async () => {
    const progress: [number, number][] = []
    const result = await runPerId(
      [1, 2, 3],
      async (id) => (id === 2 ? err(409, { error: "tiene pedidos" }) : ok({})),
      { onProgress: (d, t) => progress.push([d, t]) }
    )

    expect(result.ok).toEqual([1, 3])
    expect(result.failed).toEqual([{ id: 2, reason: "tiene pedidos" }])
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ])
  })

  it("corta al cancelar y no procesa los ids restantes", async () => {
    const seen: number[] = []
    const result = await runPerId(
      [1, 2, 3, 4],
      async (id) => {
        seen.push(id)
        return ok({})
      },
      { isCancelled: () => seen.length >= 2 }
    )

    expect(result.cancelled).toBe(true)
    expect(result.ok).toEqual([1, 2])
    expect(seen).toEqual([1, 2])
  })

  it("trata una petición rechazada como fallo de ese id", async () => {
    const result = await runPerId([9], async () => {
      throw new Error("offline")
    })
    expect(result.failed).toEqual([{ id: 9, reason: "Sin conexión" }])
    expect(result.cancelled).toBe(false)
  })
})

describe("summarizeBulkFailures", () => {
  it("agrupa por motivo, de más a menos frecuente", () => {
    const summary = summarizeBulkFailures([
      { id: 1, reason: "SKU duplicado" },
      { id: 2, reason: "Sin conexión" },
      { id: 3, reason: "SKU duplicado" },
    ])
    expect(summary.count).toBe(3)
    expect(summary.reasons).toEqual([
      { reason: "SKU duplicado", count: 2 },
      { reason: "Sin conexión", count: 1 },
    ])
  })

  it("desempata por motivo para que el orden sea estable", () => {
    const summary = summarizeBulkFailures([
      { id: 1, reason: "Zeta" },
      { id: 2, reason: "Alfa" },
    ])
    expect(summary.reasons.map((r) => r.reason)).toEqual(["Alfa", "Zeta"])
  })

  it("normaliza motivos vacíos", () => {
    const summary = summarizeBulkFailures([{ id: 1, reason: "   " }])
    expect(summary.reasons).toEqual([{ reason: "Error desconocido", count: 1 }])
  })

  it("devuelve un resumen vacío sin fallos", () => {
    expect(summarizeBulkFailures([])).toEqual({ count: 0, reasons: [] })
  })
})
