import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { PATCH } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"

const URL = "http://localhost/api/admin/foodos/restaurants/r1/platform-fee"
const RESTAURANT = "11111111-2222-3333-4444-555555555555"

const ROW = { id: RESTAURANT, name: "Taquería Centro", platform_fee_percent: 0 }

type StoreOptions = {
  restaurant?: unknown
  readError?: unknown
  updateError?: unknown
}

/** `from(...).select(...).eq(...).maybeSingle()` y `from(...).update(...).eq(...)`. */
function serviceWith(opts: StoreOptions = {}) {
  const updateEq = vi.fn((..._args: unknown[]) =>
    Promise.resolve({ error: opts.updateError ?? null })
  )
  const update = vi.fn((..._args: unknown[]) => ({ eq: updateEq }))
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: opts.restaurant ?? null, error: opts.readError ?? null })
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select, update }))
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from, update, updateEq }
}

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: "admin-1", email: "admin@resurte.me" },
    response: null,
  } as never)
}

function asDenied() {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: null,
    response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  } as never)
}

function patchRequest(body: unknown) {
  return new NextRequest(URL, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function params(id = RESTAURANT) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("PATCH /api/admin/foodos/restaurants/[id]/platform-fee", () => {
  it("403 sin rol admin y no toca la base", async () => {
    asDenied()
    const res = await PATCH(patchRequest({ platform_fee_percent: 3 }), params())
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con cuerpo inválido", async () => {
    asAdmin()
    const res = await PATCH(
      new NextRequest(URL, { method: "PATCH", body: "no-json" }),
      params()
    )
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 sin el campo de comisión", async () => {
    asAdmin()
    const res = await PATCH(patchRequest({}), params())
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con una comisión fuera de rango y no escribe", async () => {
    asAdmin()
    const { update } = serviceWith({ restaurant: ROW })
    const res = await PATCH(patchRequest({ platform_fee_percent: 120 }), params())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("menor que 100")
    expect(update).not.toHaveBeenCalled()
  })

  it("404 si el restaurante no existe", async () => {
    asAdmin()
    const { update } = serviceWith({ restaurant: null })
    const res = await PATCH(patchRequest({ platform_fee_percent: 3 }), params())
    expect(res.status).toBe(404)
    expect(update).not.toHaveBeenCalled()
  })

  it("500 si la lectura falla", async () => {
    asAdmin()
    serviceWith({ readError: { code: "42P01", message: "no existe" } })
    const res = await PATCH(patchRequest({ platform_fee_percent: 3 }), params())
    expect(res.status).toBe(500)
    expect(logger.error).toHaveBeenCalledWith(
      "admin.platform_fee.read_failed",
      expect.objectContaining({ restaurantId: RESTAURANT })
    )
  })

  it("guarda la comisión y la audita con el valor anterior", async () => {
    asAdmin()
    const { update, updateEq } = serviceWith({
      restaurant: { ...ROW, platform_fee_percent: 2.5 },
    })

    const res = await PATCH(patchRequest({ platform_fee_percent: 3.5 }), params())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      restaurant_id: RESTAURANT,
      platform_fee_percent: 3.5,
      previous_percent: 2.5,
    })
    expect(update).toHaveBeenCalledWith({ platform_fee_percent: 3.5 })
    expect(updateEq).toHaveBeenCalledWith("id", RESTAURANT)
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "foodos_platform_fee_update",
        entity: "foodos_restaurants",
        entityId: RESTAURANT,
        detail: expect.objectContaining({ previous_percent: 2.5, platform_fee_percent: 3.5 }),
      })
    )
  })

  it("acepta 0 para volver a la paridad con Take App", async () => {
    asAdmin()
    const { update } = serviceWith({ restaurant: { ...ROW, platform_fee_percent: 4 } })

    const res = await PATCH(patchRequest({ platform_fee_percent: 0 }), params())

    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ platform_fee_percent: 0 })
    expect((await res.json()).previous_percent).toBe(4)
  })

  it("acepta lo que teclea un humano (cadena con coma)", async () => {
    asAdmin()
    serviceWith({ restaurant: ROW })
    const res = await PATCH(patchRequest({ platform_fee_percent: "2,5" }), params())
    expect(res.status).toBe(200)
    expect((await res.json()).platform_fee_percent).toBe(2.5)
  })

  it("500 si la escritura falla y no audita un cambio que no ocurrió", async () => {
    asAdmin()
    serviceWith({ restaurant: ROW, updateError: { message: "boom" } })

    const res = await PATCH(patchRequest({ platform_fee_percent: 3 }), params())

    expect(res.status).toBe(500)
    expect(logAdminAction).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      "admin.platform_fee.write_failed",
      expect.objectContaining({ restaurantId: RESTAURANT })
    )
  })
})
