import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ notifyUser: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { notifyUser } from "@/lib/notifications"
import { logAdminAction } from "@/lib/audit-log"

const ADMIN = { id: "admin-1", email: "admin@resurte.me" }
const SUBMISSION = {
  id: 7,
  user_id: "u-1",
  image_path: "u-1/fac.jpg",
  total_amount: 1000,
  notes: null,
  status: "pending",
  credits_granted: null,
}

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admin/facturas", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

/**
 * Mock de service client: `from().select().eq().single()` para leer el envío,
 * `from().update().eq().eq()` para marcarlo y `rpc()` para las RPC de 00144.
 */
function setup(opts: {
  submission?: unknown
  fetchError?: unknown
  rpc?: { data: unknown; error: unknown }
  updateError?: unknown
} = {}) {
  const rpc = vi.fn().mockResolvedValue(opts.rpc ?? { data: { ok: true, credits: 50 }, error: null })
  const single = vi.fn().mockResolvedValue({
    data: opts.submission === undefined ? SUBMISSION : opts.submission,
    error: opts.fetchError ?? null,
  })
  const updateEq = vi.fn().mockResolvedValue({ error: opts.updateError ?? null })
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    single,
    update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: updateEq })) })),
  }
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)

  vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, response: null } as never)
  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn(() => builder),
    rpc,
  } as never)
  return { rpc, updateEq }
}

describe("POST /api/admin/facturas", () => {
  beforeEach(() => vi.clearAllMocks())

  it("devuelve la respuesta de requireAdmin si el admin no está autorizado", async () => {
    const denied = new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 })
    vi.mocked(requireAdmin).mockResolvedValue({ user: null, response: denied } as never)
    const res = await POST(req({ id: 7, action: "approve" }))
    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con acción desconocida", async () => {
    setup()
    const res = await POST(req({ id: 7, action: "delete" }))
    expect(res.status).toBe(400)
  })

  it("404 si el envío no existe", async () => {
    setup({ submission: null, fetchError: { message: "no rows" } })
    const res = await POST(req({ id: 7, action: "approve" }))
    expect(res.status).toBe(404)
  })

  it("aprueba con el 5% del total capturado como default", async () => {
    const { rpc } = setup()
    const res = await POST(req({ id: 7, action: "approve" }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, status: "approved" })
    expect(rpc).toHaveBeenCalledWith("approve_invoice_submission", {
      p_id: 7,
      p_credits: 50,
      p_admin: ADMIN.id,
    })
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "invoice_approve",
        entityId: 7,
        detail: expect.objectContaining({ credits_granted: 50 }),
      })
    )
  })

  it("aprueba con créditos explícitos redondeados a 2 decimales", async () => {
    const { rpc } = setup()
    await POST(req({ id: 7, action: "approve", credits: 123.456 }))
    expect(rpc).toHaveBeenCalledWith(
      "approve_invoice_submission",
      expect.objectContaining({ p_credits: 123.46 })
    )
  })

  it("400 si no hay total capturado ni créditos explícitos", async () => {
    const { rpc } = setup({ submission: { ...SUBMISSION, total_amount: null } })
    const res = await POST(req({ id: 7, action: "approve" }))
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it("409 cuando la RPC reporta already_reviewed (sin doble abono)", async () => {
    setup({ rpc: { data: { ok: false, reason: "already_reviewed" }, error: null } })
    const res = await POST(req({ id: 7, action: "approve" }))
    expect(res.status).toBe(409)
    expect(notifyUser).not.toHaveBeenCalled()
  })

  it("400 cuando la RPC rechaza los créditos", async () => {
    setup({ rpc: { data: { ok: false, reason: "invalid_credits" }, error: null } })
    const res = await POST(req({ id: 7, action: "approve" }))
    expect(res.status).toBe(400)
  })

  it("500 si la RPC falla por infraestructura", async () => {
    setup({ rpc: { data: null, error: { message: "boom" } } })
    const res = await POST(req({ id: 7, action: "approve" }))
    expect(res.status).toBe(500)
  })

  it("rechaza un envío pendiente y notifica, sin tocar el monedero", async () => {
    const { rpc } = setup()
    const res = await POST(req({ id: 7, action: "reject" }))
    expect(res.status).toBe(200)
    expect(rpc).not.toHaveBeenCalled()
    expect(notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ type: "invoice_rejected", userId: "u-1" })
    )
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "invoice_reject", entityId: 7 })
    )
  })

  it("409 al rechazar un envío ya aprobado", async () => {
    const { rpc } = setup({ submission: { ...SUBMISSION, status: "approved", credits_granted: 50 } })
    const res = await POST(req({ id: 7, action: "reject" }))
    expect(res.status).toBe(409)
    expect(rpc).not.toHaveBeenCalled()
  })

  it("revoca una aprobación y reporta los créditos devueltos", async () => {
    const { rpc } = setup({
      submission: { ...SUBMISSION, status: "approved", credits_granted: 50 },
      rpc: { data: { ok: true, reason: "revoked", reversed: 50, shortfall: 0 }, error: null },
    })
    const res = await POST(req({ id: 7, action: "revoke", reason: "ticket duplicado" }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      status: "revoked",
      credits_reversed: 50,
      shortfall: 0,
    })
    expect(rpc).toHaveBeenCalledWith("revoke_invoice_submission", {
      p_id: 7,
      p_admin: ADMIN.id,
      p_reason: "ticket duplicado",
    })
    expect(notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ type: "invoice_revoked", userId: "u-1" })
    )
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "invoice_revoke",
        entity: "invoice_submissions",
        entityId: 7,
        detail: expect.objectContaining({ credits_reversed: 50 }),
      })
    )
  })

  it("revoca sin motivo (p_reason null)", async () => {
    const { rpc } = setup({
      submission: { ...SUBMISSION, status: "approved", credits_granted: 50 },
      rpc: { data: { ok: true, reversed: 50, shortfall: 0 }, error: null },
    })
    await POST(req({ id: 7, action: "revoke" }))
    expect(rpc).toHaveBeenCalledWith(
      "revoke_invoice_submission",
      expect.objectContaining({ p_reason: null })
    )
  })

  it("reporta el faltante cuando el cliente ya gastó los créditos", async () => {
    setup({
      submission: { ...SUBMISSION, status: "approved", credits_granted: 100 },
      rpc: { data: { ok: true, reversed: 0, shortfall: 100 }, error: null },
    })
    const res = await POST(req({ id: 7, action: "revoke" }))
    await expect(res.json()).resolves.toMatchObject({ credits_reversed: 0, shortfall: 100 })
  })

  it("409 al revocar un envío que no está aprobado", async () => {
    setup({ rpc: { data: { ok: false, reason: "not_approved" }, error: null } })
    const res = await POST(req({ id: 7, action: "revoke" }))
    expect(res.status).toBe(409)
    expect(notifyUser).not.toHaveBeenCalled()
  })

  it("409 al revocar dos veces", async () => {
    setup({
      submission: { ...SUBMISSION, status: "revoked", credits_granted: 50 },
      rpc: { data: { ok: false, reason: "already_revoked" }, error: null },
    })
    const res = await POST(req({ id: 7, action: "revoke" }))
    expect(res.status).toBe(409)
  })

  it("404 si la RPC no encuentra el envío", async () => {
    setup({ rpc: { data: { ok: false, reason: "not_found" }, error: null } })
    const res = await POST(req({ id: 7, action: "revoke" }))
    expect(res.status).toBe(404)
  })
})
