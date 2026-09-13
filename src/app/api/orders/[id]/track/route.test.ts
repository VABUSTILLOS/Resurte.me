import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({
  rateLimited: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, retry_after_seconds: 0 }),
  clientIp: vi.fn(() => "127.0.0.1"),
  rateLimitResponse: vi.fn(
    (rate: { retry_after_seconds: number }) =>
      new Response(JSON.stringify({ error: "Demasiadas solicitudes" }), {
        status: 429,
        headers: { "Retry-After": String(rate.retry_after_seconds) },
      })
  ),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { GET } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { rateLimited } from "@/lib/rate-limit"

const ORDER_ROW = {
  id: 42,
  status: "preparing",
  payment_status: "pending",
  payment_method: "cash_on_delivery",
  subtotal: "100.00",
  discount: null,
  delivery_fee: "35.00",
  total: "135.00",
  scheduled_for: "2026-09-13T16:00:00Z",
  created_at: "2026-09-12T16:00:00Z",
  restore_token: "tok-1",
  cities: { slug: "cdmx", name: "Ciudad de México" },
  order_items: [
    { quantity: 2, unit_price: "50.00", products: { id: 7, name: "Aguacate", image_url: null, slug: "aguacate" } },
  ],
}

function serviceReturning(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const m of ["select", "eq"]) builder[m] = vi.fn().mockReturnValue(builder)
  builder.maybeSingle = vi.fn().mockResolvedValue(result)
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => builder) } as never)
  return builder
}

function req(url: string) {
  return new NextRequest(`http://localhost${url}`)
}

const params42 = Promise.resolve({ id: "42" })

describe("GET /api/orders/[id]/track", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({ allowed: true, remaining: 29, retry_after_seconds: 0 })
  })

  it("429 cuando el rate limit no permite", async () => {
    vi.mocked(rateLimited).mockResolvedValue({ allowed: false, remaining: 0, retry_after_seconds: 42 })
    const res = await GET(req("http://localhost/api/orders/42/track?t=tok-1"), { params: params42 })
    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("42")
  })

  it("400 sin token", async () => {
    const res = await GET(req("http://localhost/api/orders/42/track"), { params: params42 })
    expect(res.status).toBe(400)
  })

  it("400 con id inválido", async () => {
    const res = await GET(req("http://localhost/api/orders/abc/track?t=x"), {
      params: Promise.resolve({ id: "abc" }),
    })
    expect(res.status).toBe(400)
  })

  it("404 cuando token/pedido no coinciden", async () => {
    serviceReturning({ data: null, error: null })
    const res = await GET(req("http://localhost/api/orders/42/track?t=malo"), { params: params42 })
    expect(res.status).toBe(404)
  })

  it("200 devuelve estado, items y totales sin PII", async () => {
    serviceReturning({ data: ORDER_ROW, error: null })
    const res = await GET(req("http://localhost/api/orders/42/track?t=tok-1"), { params: params42 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.order.id).toBe(42)
    expect(body.order.status).toBe("preparing")
    expect(body.order.total).toBe(135)
    expect(body.order.items[0]).toMatchObject({ name: "Aguacate", quantity: 2, unit_price: 50 })
    expect(body.order.city).toMatchObject({ slug: "cdmx" })
    // Capability URL: el token consulta pero no se expone en la respuesta
    expect(JSON.stringify(body)).not.toContain("tok-1")
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("500 ante error de la consulta", async () => {
    serviceReturning({ data: null, error: { message: "boom" } })
    const res = await GET(req("http://localhost/api/orders/42/track?t=tok-1"), { params: params42 })
    expect(res.status).toBe(500)
  })
})
