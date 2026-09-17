import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/redemption-actions", () => ({ advanceRedemption: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ notifyUser: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({
  rateLimited: vi.fn(),
  rateLimitResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "Demasiadas solicitudes" }), { status: 429 })
  ),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { POST } from "./route"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { advanceRedemption } from "@/lib/redemption-actions"
import { notifyUser } from "@/lib/notifications"
import { rateLimited } from "@/lib/rate-limit"

const URL = "http://localhost/api/redemptions/7/cancel"

function asUser(id = "user-1") {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id } }, error: null }) },
  } as never)
}

function asAnonymous() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  } as never)
}

function allowRate() {
  vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
}

function blockRate() {
  vi.mocked(rateLimited).mockResolvedValue({
    allowed: false,
    limit: 10,
    remaining: 0,
    resetAt: Date.now() + 60_000,
  } as never)
}

type StoreOptions = {
  row?: Record<string, unknown> | null
  readError?: unknown
}

function serviceWith(opts: StoreOptions = {}) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: opts.row ?? null, error: opts.readError ?? null })
  const eq = vi.fn()
  const builder: Record<string, unknown> = { maybeSingle }
  eq.mockReturnValue(builder)
  builder.eq = eq
  const select = vi.fn(() => builder)
  const from = vi.fn(() => ({ select }))
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { eq, select }
}

function request(method = "POST") {
  return new NextRequest(URL, { method })
}

function params(id = "7") {
  return { params: Promise.resolve({ id }) }
}

const ROW = {
  id: 7,
  user_id: "user-1",
  status: "requested",
  service_name: "Google Maps",
  cost_credits: 2800,
  refunded_at: null,
}

describe("POST /api/redemptions/[id]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    allowRate()
    asUser()
  })

  it("400 con id no numérico", async () => {
    const res = await POST(request(), params("abc"))
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con id decimal", async () => {
    // 1.5 pasaba Number.isFinite y llegaba a Postgres.
    const res = await POST(request(), params("1.5"))
    expect(res.status).toBe(400)
  })

  it("401 sin sesión", async () => {
    asAnonymous()
    const res = await POST(request(), params())
    expect(res.status).toBe(401)
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("429 cuando se pasa del límite, sin leer ni cancelar", async () => {
    blockRate()
    const store = serviceWith({ row: ROW })
    const res = await POST(request(), params())
    expect(res.status).toBe(429)
    expect(store.select).not.toHaveBeenCalled()
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("el límite es por usuario", async () => {
    serviceWith({ row: ROW })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: true,
      status: "cancelled",
      changed: true,
      refunded: true,
    })
    await POST(request(), params())
    expect(rateLimited).toHaveBeenCalledWith(expect.anything(), "redeem-cancel:user-1", 10, 60)
  })

  it("404 cuando la solicitud es de otra persona", async () => {
    // La propiedad va en el predicado: el id de otro no resuelve.
    const store = serviceWith({ row: null })
    const res = await POST(request(), params())
    expect(res.status).toBe(404)
    expect(store.eq).toHaveBeenCalledWith("id", 7)
    expect(store.eq).toHaveBeenCalledWith("user_id", "user-1")
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("500 si falla la lectura", async () => {
    serviceWith({ readError: { message: "boom" } })
    const res = await POST(request(), params())
    expect(res.status).toBe(500)
  })

  it("409 en una solicitud ya entregada y no toca el saldo", async () => {
    serviceWith({ row: { ...ROW, status: "delivered" } })
    const res = await POST(request(), params())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.status).toBe("delivered")
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("409 en una solicitud ya cancelada", async () => {
    serviceWith({ row: { ...ROW, status: "cancelled", refunded_at: "2026-10-01T00:00:00.000Z" } })
    const res = await POST(request(), params())
    expect(res.status).toBe(409)
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("cancela por la fuente única de verdad, no reimplementa el reembolso", async () => {
    serviceWith({ row: ROW })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: true,
      status: "cancelled",
      changed: true,
      refunded: true,
    })
    const res = await POST(request(), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, status: "cancelled", refunded: true })
    expect(advanceRedemption).toHaveBeenCalledWith({
      id: 7,
      status: "cancelled",
      actor: "Cliente",
      note: "Cancelada por el cliente desde su historial",
    })
  })

  it("avisa al cliente solo cuando hubo devolución", async () => {
    serviceWith({ row: ROW })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: true,
      status: "cancelled",
      changed: true,
      refunded: true,
    })
    await POST(request(), params())
    expect(notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", type: "redemption" })
    )
  })

  it("no avisa si no hubo devolución", async () => {
    serviceWith({ row: ROW })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: true,
      status: "cancelled",
      changed: false,
      refunded: false,
    })
    const res = await POST(request(), params())
    expect(res.status).toBe(200)
    expect((await res.json()).refunded).toBe(false)
    expect(notifyUser).not.toHaveBeenCalled()
  })

  it("400 si la transición es rechazada por la función", async () => {
    serviceWith({ row: ROW })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: false,
      status: "requested",
      changed: false,
      refunded: false,
      error: "Transición inválida: requested → cancelled",
    })
    const res = await POST(request(), params())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("Transición inválida")
    expect(notifyUser).not.toHaveBeenCalled()
  })
})
