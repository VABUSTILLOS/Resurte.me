import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"

const ADMIN = { id: "admin-1", email: "admin@resurte.me" }

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admin/orders/undo-bulk", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

/**
 * `revert_payment_confirmation` devuelve un booleano por pedido: `true` cuando
 * revirtió algo, `false` cuando el pedido ya no estaba en `paid`.
 */
function setup(byId: Record<number, { data?: unknown; error?: unknown }> = {}) {
  const rpc = vi.fn(async (_fn: string, args: { p_order_id: number }) => {
    const entry = byId[args.p_order_id]
    if (entry) return { data: entry.data ?? null, error: entry.error ?? null }
    return { data: true, error: null }
  })

  vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, response: null } as never)
  vi.mocked(createServiceClient).mockResolvedValue({ rpc } as never)
  vi.mocked(logAdminAction).mockResolvedValue(undefined)

  return { rpc }
}

describe("POST /api/admin/orders/undo-bulk", () => {
  beforeEach(() => vi.clearAllMocks())

  it("devuelve la respuesta de requireAdmin si la sesión no es de admin", async () => {
    const denied = new Response(JSON.stringify({ error: "Acceso restringido" }), { status: 403 })
    vi.mocked(requireAdmin).mockResolvedValue({ user: null, response: denied } as never)

    const res = await POST(req({ ids: [1] }))

    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un cuerpo sin `ids`", async () => {
    setup()
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it("rechaza JSON inválido", async () => {
    setup()
    const res = await POST(req("{no es json"))
    expect(res.status).toBe(400)
  })

  it("rechaza una lista vacía tras normalizar", async () => {
    setup()
    const res = await POST(req({ ids: [-1, 0, "3", null, 1.5] }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Sin pedidos válidos" })
  })

  it("rechaza más de 100 pedidos por operación", async () => {
    setup()
    const ids = Array.from({ length: 101 }, (_, i) => i + 1)
    const res = await POST(req({ ids }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("100") })
  })

  it("descarta ids inválidos y duplicados antes de llamar a la RPC", async () => {
    const { rpc } = setup()

    const res = await POST(req({ ids: [5, 5, "6", -2, 0, 7.5, 9] }))

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls.map((c) => c[1])).toEqual([
      { p_order_id: 5 },
      { p_order_id: 9 },
    ])
    expect(await res.json()).toEqual({ ok: 2, failed: 0, failedIds: [], total: 2 })
  })

  it("cuenta como revertido solo lo que devuelve true", async () => {
    setup({
      1: { data: true },
      2: { data: false },
      3: { error: { message: "boom" } },
    })

    const res = await POST(req({ ids: [1, 2, 3] }))

    expect(await res.json()).toEqual({ ok: 1, failed: 2, failedIds: [2, 3], total: 3 })
  })

  it("registra en la bitácora cada pedido realmente revertido", async () => {
    setup({ 2: { data: false } })

    await POST(req({ ids: [1, 2] }))

    expect(logAdminAction).toHaveBeenCalledTimes(1)
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: "admin-1",
        actorEmail: "admin@resurte.me",
        action: "order_payment_revert",
        entity: "orders",
        entityId: 1,
        detail: { from: "paid", to: "pending", via: "bulk_undo" },
      })
    )
  })

  it("solo cuenta como revertido un `true` estricto de la RPC", async () => {
    setup({
      1: { data: "true" },
      2: { data: null },
      3: { data: true },
    })

    const res = await POST(req({ ids: [1, 2, 3] }))

    expect(await res.json()).toEqual({ ok: 1, failed: 2, failedIds: [1, 2], total: 3 })
  })
})
