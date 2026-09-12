import { describe, it, expect } from "vitest"
import {
  isAuditAction,
  normalizeAuditFilters,
  logAdminAction,
  AUDIT_ACTION_LABEL,
  AUDIT_ACTIONS,
} from "./audit-log"

describe("isAuditAction", () => {
  it("valida contra el catálogo cerrado", () => {
    expect(isAuditAction("order_status")).toBe(true)
    expect(isAuditAction("drop_table")).toBe(false)
  })

  it("todas las acciones tienen etiqueta", () => {
    for (const a of AUDIT_ACTIONS) {
      expect(AUDIT_ACTION_LABEL[a]).toBeTruthy()
    }
  })
})

describe("normalizeAuditFilters", () => {
  it("conserva acción válida y descarta inválida", () => {
    expect(normalizeAuditFilters({ action: "coupon_create" }).action).toBe("coupon_create")
    expect(normalizeAuditFilters({ action: "hack" }).action).toBeUndefined()
  })

  it("sanea fechas: solo YYYY-MM-DD pasa", () => {
    const r = normalizeAuditFilters({ from: "2026-09-01", to: "12/09/2026" })
    expect(r.from).toBe("2026-09-01")
    expect(r.to).toBeUndefined()
  })
})

describe("logAdminAction", () => {
  it("inserta el evento con entity_id serializado", async () => {
    const inserted: Record<string, unknown>[] = []
    const supabase = {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row)
          return { error: null }
        },
      }),
    }
    await logAdminAction(supabase, {
      actorId: "u1",
      actorEmail: "a@b.c",
      action: "order_status",
      entity: "orders",
      entityId: 42,
      detail: { from: "pending", to: "confirmed" },
    })
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      actor_id: "u1",
      action: "order_status",
      entity: "orders",
      entity_id: "42",
      detail: { from: "pending", to: "confirmed" },
    })
  })

  it("nunca lanza aunque falle el insert", async () => {
    const supabase = {
      from: () => ({
        insert: async () => {
          throw new Error("boom")
        },
      }),
    }
    await expect(
      logAdminAction(supabase, {
        actorId: null,
        actorEmail: null,
        action: "coupon_delete",
        entity: "coupons",
      })
    ).resolves.toBeUndefined()
  })
})
