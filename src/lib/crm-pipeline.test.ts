import { describe, it, expect } from "vitest"
import {
  nextCrmStatus,
  isCrmStatus,
  groupIntoBoard,
  isFollowUpDue,
  CRM_BOARD_COLUMNS,
  type CrmProspect,
} from "./crm-pipeline"

describe("nextCrmStatus", () => {
  it("avanza por el embudo feliz", () => {
    expect(nextCrmStatus("nuevo")).toBe("contactado")
    expect(nextCrmStatus("contactado")).toBe("en_seguimiento")
    expect(nextCrmStatus("en_seguimiento")).toBe("cliente_activo")
  })

  it("cliente_activo y cerrados no avanzan", () => {
    expect(nextCrmStatus("cliente_activo")).toBeNull()
    expect(nextCrmStatus("inactivo")).toBeNull()
    expect(nextCrmStatus("perdido")).toBeNull()
  })
})

describe("isCrmStatus", () => {
  it("valida contra la lista cerrada", () => {
    expect(isCrmStatus("nuevo")).toBe(true)
    expect(isCrmStatus("borrado")).toBe(false)
  })
})

describe("groupIntoBoard", () => {
  const p = (id: number, status: string, created = "2026-09-01T00:00:00Z"): CrmProspect => ({
    id, name: `P${id}`, restaurant_name: null, phone: null, whatsapp: null,
    email: null, status, notes: null, next_follow_up_at: null,
    last_contact_at: null, created_at: created,
  })

  it("agrupa por columnas y mete inactivo/perdido en cerrados", () => {
    const board = groupIntoBoard([p(1, "nuevo"), p(2, "perdido"), p(3, "inactivo")])
    expect(board["nuevo"]!.map((x) => x.id)).toEqual([1])
    expect(board["cerrados"]!.map((x) => x.id).sort()).toEqual([2, 3])
  })

  it("ordena más recientes primero dentro de la columna", () => {
    const board = groupIntoBoard([
      p(1, "nuevo", "2026-09-01T00:00:00Z"),
      p(2, "nuevo", "2026-09-10T00:00:00Z"),
    ])
    expect(board["nuevo"]!.map((x) => x.id)).toEqual([2, 1])
  })

  it("cubre todas las columnas declaradas aunque estén vacías", () => {
    const board = groupIntoBoard([])
    expect(Object.keys(board)).toEqual(CRM_BOARD_COLUMNS.map((c) => c.key))
  })
})

describe("isFollowUpDue", () => {
  const now = new Date("2026-09-12T12:00:00Z")
  it("sin fecha no está vencido", () => {
    expect(isFollowUpDue(null, now)).toBe(false)
  })
  it("fecha pasada vencida, futura no", () => {
    expect(isFollowUpDue("2026-09-11T00:00:00Z", now)).toBe(true)
    expect(isFollowUpDue("2026-09-13T00:00:00Z", now)).toBe(false)
  })
})
