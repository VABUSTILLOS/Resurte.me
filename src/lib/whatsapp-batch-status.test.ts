import { describe, expect, it } from "vitest"
import { isBatchFinished, parseBatchErrors } from "./whatsapp"
import { isOrphanRun, ORPHAN_RUN_MAX_AGE_HOURS } from "./whatsapp-batch-status"

describe("isBatchFinished", () => {
  it("solo 'finished' cuenta como terminado", () => {
    expect(isBatchFinished("finished")).toBe(true)
    expect(isBatchFinished("Finished")).toBe(true)
    expect(isBatchFinished("in_progress")).toBe(false)
    expect(isBatchFinished("started")).toBe(false)
  })
})

describe("parseBatchErrors", () => {
  it("devuelve vacío sin body o sin errors", () => {
    expect(parseBatchErrors(null)).toEqual([])
    expect(parseBatchErrors({ status: "finished" })).toEqual([])
  })

  it("parsea array directo con retailer_id y message", () => {
    const errors = parseBatchErrors({
      status: "finished",
      errors: [
        { retailer_id: "7", message: "image fetch failed" },
        { retailer_id: "9", message: "invalid price" },
      ],
    })
    expect(errors).toEqual([
      { retailer_id: "7", message: "image fetch failed" },
      { retailer_id: "9", message: "invalid price" },
    ])
  })

  it("tolera shapes alternativos: data anidado, item.retailer_id, strings", () => {
    const errors = parseBatchErrors({
      status: "finished",
      errors: {
        data: [
          { item: { retailer_id: "3" }, error: { message: "boom" } },
          "error genérico",
        ],
      } as unknown as unknown[],
    })
    expect(errors).toHaveLength(2)
    expect(errors[0]).toEqual({ retailer_id: "3", message: "boom" })
    expect(errors[1]).toEqual({ retailer_id: null, message: "error genérico" })
  })

  it("serializa objetos sin message conocido", () => {
    const errors = parseBatchErrors({ status: "finished", errors: [{ code: 123 }] })
    expect(errors[0]?.retailer_id).toBeNull()
    expect(errors[0]?.message).toContain("123")
  })
})

describe("isOrphanRun", () => {
  it("marca huérfanos pasadas las horas límite", () => {
    const now = new Date("2026-09-15T12:00:00Z")
    const recent = new Date(now.getTime() - 1 * 3_600_000)
    const old = new Date(now.getTime() - (ORPHAN_RUN_MAX_AGE_HOURS + 1) * 3_600_000)
    expect(isOrphanRun(recent, now)).toBe(false)
    expect(isOrphanRun(old, now)).toBe(true)
  })
})
