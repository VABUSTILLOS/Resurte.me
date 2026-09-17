import { beforeEach, describe, expect, it, vi } from "vitest"

// La API del repartidor no tiene sesión: el token es una capability URL.
// Estos tests cubren justo eso — que un token solo mueva SUS entregas y que
// el PIN de 4 dígitos no se pueda adivinar por fuerza bruta.

const mocks = vi.hoisted(() => ({
  loadCourierByToken: vi.fn(),
  listCourierJobs: vi.fn(),
  advanceDelivery: vi.fn(),
  deliverWithPin: vi.fn(),
  notifyFoodosCustomer: vi.fn(),
  rateLimited: vi.fn(),
}))

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>()
  return { ...actual, after: (fn: () => unknown) => void fn() }
})

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn().mockResolvedValue({}) }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/rate-limit", async () => {
  const { NextResponse } = await import("next/server")
  return {
    rateLimited: mocks.rateLimited,
    clientIp: vi.fn(() => "127.0.0.1"),
    rateLimitResponse: vi.fn(() =>
      NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 })
    ),
  }
})
vi.mock("@/lib/flotilla/deliveries", () => ({
  loadCourierByToken: mocks.loadCourierByToken,
  listCourierJobs: mocks.listCourierJobs,
  advanceDelivery: mocks.advanceDelivery,
  deliverWithPin: mocks.deliverWithPin,
}))
vi.mock("@/lib/foodos-notifications", () => ({
  notifyFoodosCustomer: mocks.notifyFoodosCustomer,
}))

import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { GET, POST } from "./route"

const TOKEN = "a".repeat(32)
const COURIER_ID = "cour-1"
const RESTAURANT_ID = "rest-1"
const DELIVERY_ID = "del-1"

const SESSION = {
  courier: { id: COURIER_ID, name: "Beto", phone: "5512345678", vehicle: "moto", capacity: 2 },
  restaurant: { id: RESTAURANT_ID, name: "Tacos", timezone: "America/Mexico_City", logo_url: null },
}

/** Cliente falso: `owned` decide si la entrega pertenece al repartidor. */
function serviceClient(owned: boolean) {
  const builder: Record<string, unknown> = {}
  for (const method of ["select", "eq"]) builder[method] = () => builder
  builder.maybeSingle = async () =>
    owned ? { data: { id: DELIVERY_ID }, error: null } : { data: null, error: null }
  return { from: () => builder }
}

function params(token = TOKEN) {
  return { params: Promise.resolve({ token }) }
}

function postReq(body: unknown) {
  return new NextRequest(`https://resurte.me/api/reparto/${TOKEN}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rateLimited.mockResolvedValue({ allowed: true })
  mocks.loadCourierByToken.mockResolvedValue(SESSION)
  mocks.listCourierJobs.mockResolvedValue([])
  mocks.advanceDelivery.mockResolvedValue({
    ok: true,
    status: "picked_up",
    orderId: "order-1",
    orderStatus: "out_for_delivery",
  })
  mocks.deliverWithPin.mockResolvedValue({
    ok: true,
    status: "delivered",
    orderId: "order-1",
    orderStatus: "delivered",
  })
  vi.mocked(createServiceClient).mockResolvedValue(serviceClient(true) as never)
})

describe("GET /api/reparto/[token]", () => {
  it("rechaza un token demasiado corto sin tocar la base", async () => {
    const res = await GET(new NextRequest("https://resurte.me/api/reparto/abc"), params("abc"))

    expect(res.status).toBe(404)
    expect(mocks.loadCourierByToken).not.toHaveBeenCalled()
  })

  it("devuelve 404 si el enlace fue revocado", async () => {
    mocks.loadCourierByToken.mockResolvedValue(null)

    const res = await GET(new NextRequest("https://resurte.me/api/reparto/x"), params())

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: "Enlace no válido o revocado" })
  })

  it("devuelve la sesión y las entregas del repartidor", async () => {
    mocks.listCourierJobs.mockResolvedValue([{ id: DELIVERY_ID, status: "assigned" }])

    const res = await GET(new NextRequest("https://resurte.me/api/reparto/x"), params())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.courier.id).toBe(COURIER_ID)
    expect(body.restaurant.id).toBe(RESTAURANT_ID)
    expect(body.jobs).toHaveLength(1)
    expect(mocks.listCourierJobs).toHaveBeenCalledWith(expect.anything(), {
      courierId: COURIER_ID,
      restaurantId: RESTAURANT_ID,
    })
  })

  it("corta con 429 cuando se agota el límite", async () => {
    mocks.rateLimited.mockResolvedValue({ allowed: false, retry_after_seconds: 10 })

    const res = await GET(new NextRequest("https://resurte.me/api/reparto/x"), params())

    expect(res.status).toBe(429)
  })
})

describe("POST /api/reparto/[token]", () => {
  it("exige una acción conocida", async () => {
    const res = await POST(postReq({ delivery_id: DELIVERY_ID, action: "hackear" }), params())

    expect(res.status).toBe(400)
    expect(mocks.advanceDelivery).not.toHaveBeenCalled()
  })

  it("exige delivery_id", async () => {
    const res = await POST(postReq({ action: "picked_up" }), params())

    expect(res.status).toBe(400)
    expect(mocks.advanceDelivery).not.toHaveBeenCalled()
  })

  it("no deja mover una entrega asignada a otro repartidor", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(serviceClient(false) as never)

    const res = await POST(postReq({ delivery_id: DELIVERY_ID, action: "picked_up" }), params())

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: "Entrega no asignada a ti" })
    expect(mocks.advanceDelivery).not.toHaveBeenCalled()
  })

  it("marca la recogida y avisa al comensal", async () => {
    const res = await POST(
      postReq({ delivery_id: DELIVERY_ID, action: "picked_up", lat: 19.43, lng: -99.13 }),
      params()
    )

    expect(res.status).toBe(200)
    expect(mocks.advanceDelivery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        deliveryId: DELIVERY_ID,
        restaurantId: RESTAURANT_ID,
        status: "picked_up",
        actor: "courier",
        lat: 19.43,
        lng: -99.13,
      })
    )
    expect(mocks.notifyFoodosCustomer).toHaveBeenCalledWith("order-1", "status:out_for_delivery")
  })

  it("cierra con PIN aplicando un límite por entrega", async () => {
    const res = await POST(
      postReq({ delivery_id: DELIVERY_ID, action: "delivered", pin: "1234" }),
      params()
    )

    expect(res.status).toBe(200)
    // Sin límite por entrega, 4 dígitos se adivinan por fuerza bruta.
    expect(mocks.rateLimited).toHaveBeenCalledWith(expect.anything(), `reparto_pin:${DELIVERY_ID}`, 8, 300)
    expect(mocks.deliverWithPin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ deliveryId: DELIVERY_ID, pin: "1234", actor: "courier" })
    )
  })

  it("devuelve 409 con PIN incorrecto sin avisar al comensal", async () => {
    mocks.deliverWithPin.mockResolvedValue({ ok: false, error: "PIN incorrecto" })

    const res = await POST(
      postReq({ delivery_id: DELIVERY_ID, action: "delivered", pin: "0000" }),
      params()
    )

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: "PIN incorrecto" })
    expect(mocks.notifyFoodosCustomer).not.toHaveBeenCalled()
  })

  it("corta el PIN con 429 antes de intentar adivinarlo", async () => {
    mocks.rateLimited
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retry_after_seconds: 300 })

    const res = await POST(
      postReq({ delivery_id: DELIVERY_ID, action: "delivered", pin: "1234" }),
      params()
    )

    expect(res.status).toBe(429)
    expect(mocks.deliverWithPin).not.toHaveBeenCalled()
  })

  it("propaga el fallo de la capa de servidor como 409", async () => {
    mocks.advanceDelivery.mockResolvedValue({ ok: false, error: "Transición no permitida" })

    const res = await POST(postReq({ delivery_id: DELIVERY_ID, action: "failed" }), params())

    expect(res.status).toBe(409)
    expect(mocks.notifyFoodosCustomer).not.toHaveBeenCalled()
  })

  it("trunca la nota del repartidor a 300 caracteres", async () => {
    await POST(
      postReq({ delivery_id: DELIVERY_ID, action: "failed", note: "x".repeat(500) }),
      params()
    )

    const call = mocks.advanceDelivery.mock.calls[0]?.[1] as { note: string }
    expect(call.note).toHaveLength(300)
  })
})
