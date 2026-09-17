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

const USER = { id: "user-1", email: "cliente@taqueria.mx" }

function authed(user: unknown = USER) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
  } as never)
}

function unauthed() {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "no session" } }),
    },
  } as never)
}

const OPEN_ROW = {
  id: 9,
  user_id: "user-1",
  status: "requested",
  service_name: "Gestión de Reseñas Google",
  cost_credits: 2200,
  refunded_at: null,
}

function serviceWith(row: unknown, error: unknown = null) {
  const builder: Record<string, unknown> = {}
  for (const m of ["select", "eq"]) builder[m] = vi.fn().mockReturnValue(builder)
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: row, error })
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => builder) } as never)
  return builder
}

const call = (id: string) =>
  POST(new NextRequest(`http://localhost/api/redemptions/${id}/cancel`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  })

describe("POST /api/redemptions/[id]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authed()
    serviceWith(OPEN_ROW)
    vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: true,
      status: "cancelled",
      changed: true,
      refunded: true,
    })
  })

  it("400 con id no numérico, sin tocar la base", async () => {
    for (const bad of ["abc", "0", "-2", "1.5"]) {
      const res = await call(bad)
      expect(res.status).toBe(400)
    }
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("401 sin sesión", async () => {
    unauthed()
    const res = await call("9")
    expect(res.status).toBe(401)
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("429 cuando se abusa del endpoint", async () => {
    vi.mocked(rateLimited).mockResolvedValue({ allowed: false } as never)
    const res = await call("9")
    expect(res.status).toBe(429)
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("la propiedad viaja en el predicado, no sólo el id", async () => {
    const builder = serviceWith(OPEN_ROW)
    await call("9")
    expect(builder.eq).toHaveBeenCalledWith("id", 9)
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1")
  })

  it("404 cuando la fila es de otra persona (el predicado no resuelve)", async () => {
    serviceWith(null)
    const res = await call("9")
    expect(res.status).toBe(404)
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("409 si ya está entregada: no se toca el saldo", async () => {
    serviceWith({ ...OPEN_ROW, status: "delivered" })
    const res = await call("9")
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.status).toBe("delivered")
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("409 si ya estaba cancelada", async () => {
    serviceWith({ ...OPEN_ROW, status: "cancelled" })
    const res = await call("9")
    expect(res.status).toBe(409)
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("happy path: delega el reembolso y avisa al cliente", async () => {
    const res = await call("9")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, status: "cancelled", refunded: true })

    // El dinero lo ejecuta la fuente única de verdad, no esta ruta.
    expect(advanceRedemption).toHaveBeenCalledWith({
      id: 9,
      status: "cancelled",
      actor: "Cliente",
      note: "Cancelada por el cliente desde su historial",
    })

    expect(notifyUser).toHaveBeenCalledTimes(1)
    const notice = vi.mocked(notifyUser).mock.calls[0]![0]
    expect(notice.userId).toBe("user-1")
    expect(notice.body).toContain("2200")
    expect(notice.body).toContain("Gestión de Reseñas Google")
  })

  it("no avisa un reembolso que no ocurrió", async () => {
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: true,
      status: "cancelled",
      changed: true,
      refunded: false,
    })
    const res = await call("9")
    expect(res.status).toBe(200)
    expect(notifyUser).not.toHaveBeenCalled()
  })

  it("propaga el rechazo de la base y no avisa nada", async () => {
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: false,
      status: null,
      changed: false,
      refunded: false,
      error: "La operación no devolvió resultado",
    })
    const res = await call("9")
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("La operación no devolvió resultado")
    expect(notifyUser).not.toHaveBeenCalled()
  })

  it("500 si la lectura falla", async () => {
    serviceWith(null, { message: "boom" })
    const res = await call("9")
    expect(res.status).toBe(500)
  })
})
