import { describe, expect, it } from "vitest"
import { partitionQueueByKind, WA_QUEUE_KINDS } from "./whatsapp-sync-queue"

const row = (kind: string, product_id = 1) => ({ kind, product_id })

describe("WA_QUEUE_KINDS", () => {
  it("declara las dos operaciones de la cola", () => {
    // Contrato con el CHECK de 00221: lo verifica el test de contrato.
    expect([...WA_QUEUE_KINDS]).toEqual(["upsert", "hide"])
  })
})

describe("partitionQueueByKind", () => {
  it("separa upserts de hides", () => {
    const { upserts, hides } = partitionQueueByKind([
      row("upsert", 1),
      row("hide", 2),
      row("upsert", 3),
    ])
    expect(upserts.map((r) => r.product_id)).toEqual([1, 3])
    expect(hides.map((r) => r.product_id)).toEqual([2])
  })

  it("un kind desconocido cae en upserts, no se descarta", () => {
    // Ante una versión futura de la cola es preferible volver a subir el
    // producto (idempotente) que dejarlo sin sincronizar en silencio.
    const { upserts, hides } = partitionQueueByKind([row("algo_nuevo", 7)])
    expect(upserts.map((r) => r.product_id)).toEqual([7])
    expect(hides).toEqual([])
  })

  it("conserva el orden de llegada dentro de cada grupo", () => {
    const { upserts } = partitionQueueByKind([row("upsert", 5), row("upsert", 2), row("upsert", 9)])
    expect(upserts.map((r) => r.product_id)).toEqual([5, 2, 9])
  })

  it("una cola vacía produce dos listas vacías", () => {
    expect(partitionQueueByKind([])).toEqual({ upserts: [], hides: [] })
  })

  it("no muta la entrada", () => {
    const input = [row("hide", 1), row("upsert", 2)]
    const snapshot = [...input]
    partitionQueueByKind(input)
    expect(input).toEqual(snapshot)
  })
})
