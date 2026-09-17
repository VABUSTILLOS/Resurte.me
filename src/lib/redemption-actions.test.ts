import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))

import { advanceRedemption, attachRedemptionBrief } from "./redemption-actions"
import { createServiceClient } from "@/lib/supabase/service"

function mockClient(opts: {
  rpc?: unknown
  update?: unknown
}) {
  const rpc = vi.fn().mockResolvedValue(opts.rpc ?? { data: [], error: null })
  const builder: Record<string, unknown> = {}
  for (const m of ["update", "eq", "select"]) builder[m] = vi.fn().mockReturnValue(builder)
  builder.maybeSingle = vi.fn().mockResolvedValue(opts.update ?? { data: null, error: null })
  vi.mocked(createServiceClient).mockResolvedValue({ rpc, from: vi.fn(() => builder) } as never)
  return { rpc, builder }
}

describe("attachRedemptionBrief", () => {
  beforeEach(() => vi.clearAllMocks())

  it("rechaza ids inválidos sin tocar la base", async () => {
    const { builder } = mockClient({})
    for (const bad of [0, -1, NaN, 1.5]) {
      const res = await attachRedemptionBrief(bad, "u1", { restaurant_name: "X", maps_url: null, social_handle: null, notes: null })
      expect(res.ok).toBe(false)
    }
    expect(builder.update).not.toHaveBeenCalled()
  })

  it("exige la propiedad en el predicado, no sólo en el id", async () => {
    const { builder } = mockClient({
      update: { data: { id: 7, status: "requested", due_at: null }, error: null },
    })
    await attachRedemptionBrief(7, "user-1", {
      restaurant_name: "El Buen Pastor",
      maps_url: null,
      social_handle: null,
      notes: null,
    })
    expect(builder.eq).toHaveBeenCalledWith("id", 7)
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1")
  })

  it("devuelve el estado y el plazo reales de la fila", async () => {
    mockClient({
      update: { data: { id: 7, status: "in_progress", due_at: "2026-02-01T00:00:00.000Z" }, error: null },
    })
    const res = await attachRedemptionBrief(7, "u1", {
      restaurant_name: "X",
      maps_url: null,
      social_handle: null,
      notes: null,
    })
    expect(res).toEqual({ ok: true, status: "in_progress", due_at: "2026-02-01T00:00:00.000Z" })
  })

  it("no encontrada cuando el predicado no resuelve (id de otra persona)", async () => {
    mockClient({ update: { data: null, error: null } })
    const res = await attachRedemptionBrief(7, "u1", {
      restaurant_name: "X",
      maps_url: null,
      social_handle: null,
      notes: null,
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("Solicitud no encontrada")
  })
})

describe("advanceRedemption", () => {
  beforeEach(() => vi.clearAllMocks())

  it("omite las claves ausentes para que Postgres aplique sus DEFAULT", async () => {
    const { rpc } = mockClient({
      rpc: { data: [{ ok: true, new_status: "in_progress", changed: true, refunded: false }], error: null },
    })
    await advanceRedemption({ id: 5, status: "in_progress", actor: "Admin" })

    const args = rpc.mock.calls[0]![1] as Record<string, unknown>
    expect(args).toEqual({ p_id: 5, p_status: "in_progress", p_actor: "Admin" })
    expect("p_note" in args).toBe(false)
    expect("p_assigned_to" in args).toBe(false)
    expect("p_deliverable_url" in args).toBe(false)
  })

  it("sin status envía sólo metadatos: es el camino de 'sólo nota/asignación'", async () => {
    const { rpc } = mockClient({
      rpc: { data: [{ ok: true, new_status: "requested", changed: false, refunded: false }], error: null },
    })
    await advanceRedemption({ id: 5, actor: "Admin", note: "Llamado", assignedTo: "Ana" })

    const args = rpc.mock.calls[0]![1] as Record<string, unknown>
    expect("p_status" in args).toBe(false)
    expect(args.p_note).toBe("Llamado")
    expect(args.p_assigned_to).toBe("Ana")
  })

  it("status null explícito sí viaja: significa 'no transiciones'", async () => {
    const { rpc } = mockClient({
      rpc: { data: [{ ok: true, new_status: "requested", changed: false, refunded: false }], error: null },
    })
    await advanceRedemption({ id: 5, status: null, actor: "Admin" })
    expect((rpc.mock.calls[0]![1] as Record<string, unknown>).p_status).toBeNull()
  })

  it("cero filas es un error explícito, no un éxito silencioso", async () => {
    // Es el defecto de RETURNS TABLE + RETURN; que 00149 corrigió en
    // redeem_service: sin fila no hay resultado que interpretar.
    mockClient({ rpc: { data: [], error: null } })
    const res = await advanceRedemption({ id: 5, status: "delivered", actor: "Admin" })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("La operación no devolvió resultado")
  })

  it("propaga el error de la función y no reporta cambio", async () => {
    mockClient({
      rpc: {
        data: [{ ok: false, new_status: null, changed: false, refunded: false, error_msg: "Transición inválida: delivered → cancelled" }],
        error: null,
      },
    })
    const res = await advanceRedemption({ id: 5, status: "cancelled", actor: "Admin" })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("Transición inválida: delivered → cancelled")
    expect(res.changed).toBe(false)
  })

  it("changed=false se conserva: el llamador debe poder distinguir un no-op", async () => {
    mockClient({
      rpc: { data: [{ ok: true, new_status: "delivered", changed: false, refunded: false }], error: null },
    })
    const res = await advanceRedemption({ id: 5, status: "delivered", actor: "Admin" })
    expect(res).toEqual({ ok: true, status: "delivered", changed: false, refunded: false })
  })

  it("reporta el reembolso al cancelar", async () => {
    mockClient({
      rpc: { data: [{ ok: true, new_status: "cancelled", changed: true, refunded: true }], error: null },
    })
    const res = await advanceRedemption({ id: 5, status: "cancelled", actor: "Cliente" })
    expect(res.refunded).toBe(true)
  })

  it("propaga el error de red de PostgREST", async () => {
    mockClient({ rpc: { data: null, error: { message: "connection reset" } } })
    const res = await advanceRedemption({ id: 5, status: "in_progress", actor: "Admin" })
    expect(res.ok).toBe(false)
    expect(res.error).toBe("connection reset")
  })

  it("rechaza ids inválidos sin llamar a la RPC", async () => {
    const { rpc } = mockClient({})
    const res = await advanceRedemption({ id: 0, status: "in_progress", actor: "Admin" })
    expect(res.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})
