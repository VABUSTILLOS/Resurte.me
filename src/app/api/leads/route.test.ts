import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({
  rateLimited: vi.fn(),
  clientIp: vi.fn(() => "1.2.3.4"),
  rateLimitResponse: vi.fn(() =>
    new Response(JSON.stringify({ error: "Rate limit" }), { status: 429 })
  ),
}))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { rateLimited } from "@/lib/rate-limit"

function post(body: unknown) {
  return new NextRequest("https://resurte.me/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/leads", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
    vi.mocked(createServiceClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) }),
    } as never)
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never)
  })

  it("guarda el lead con source por defecto checkout_drawer", async () => {
    const res = await POST(post({ email: "  Comprador@Example.com " }))
    expect(res.status).toBe(200)

    const supabase = await createServiceClient()
    const insert = supabase.from("leads").insert
    expect(insert).toHaveBeenCalledWith({ email: "comprador@example.com", source: "checkout_drawer" })
  })

  it("guarda phone, coupon y user_id cuando llegan", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } } }) },
    } as never)

    const res = await POST(
      post({
        email: "a@b.com",
        phone: "555-1234",
        source: "exit_intent",
        coupon_code: "WELCOME10",
      })
    )
    expect(res.status).toBe(200)

    const supabase = await createServiceClient()
    expect(supabase.from("leads").insert).toHaveBeenCalledWith({
      email: "a@b.com",
      source: "exit_intent",
      phone: "555-1234",
      coupon_code: "WELCOME10",
      user_id: "u-1",
    })
  })

  it("acepta el source del calificador de /restaurantes y deriva el diagnóstico", async () => {
    const res = await POST(
      post({
        email: "dueno@restaurante.com",
        source: "restaurantes_landing",
        restaurant_name: "  Taquería Doña Rosa  ",
        answers: {
          weeklyOrders: 250,
          averageTicket: 300,
          channels: ["apps_delivery", "whatsapp"],
          biggestPain: "comisiones",
        },
      })
    )
    expect(res.status).toBe(200)

    const supabase = await createServiceClient()
    expect(supabase.from("leads").insert).toHaveBeenCalledWith({
      email: "dueno@restaurante.com",
      source: "restaurantes_landing",
      restaurant_name: "Taquería Doña Rosa",
      qualification: {
        score: 86,
        segment: "A",
        recommended_tier: "Diamante",
        recommended_features: ["mesero_ia", "app_marca"],
        reasons: expect.any(Array),
        answers: {
          weeklyOrders: 250,
          averageTicket: 300,
          channels: ["apps_delivery", "whatsapp"],
          biggestPain: "comisiones",
          usesDeliveryApp: true,
        },
      },
    })
  })

  it("ignora el puntaje que mande el navegador: lo recalcula desde las respuestas", async () => {
    const res = await POST(
      post({
        email: "tramposo@restaurante.com",
        source: "restaurantes_landing",
        score: 100,
        segment: "A",
        qualification: { score: 100, segment: "A" },
        answers: { weeklyOrders: 5, averageTicket: 80 },
      })
    )
    expect(res.status).toBe(200)

    const supabase = await createServiceClient()
    const insert = supabase.from("leads").insert as ReturnType<typeof vi.fn>
    const payload = insert.mock.calls[0]?.[0] as { qualification: { score: number; segment: string } }
    expect(payload.qualification.score).toBe(12)
    expect(payload.qualification.segment).toBe("C")
  })

  it("no adjunta diagnóstico a los leads del checkout", async () => {
    const res = await POST(post({ email: "comprador@example.com" }))
    expect(res.status).toBe(200)

    const supabase = await createServiceClient()
    expect(supabase.from("leads").insert).toHaveBeenCalledWith({
      email: "comprador@example.com",
      source: "checkout_drawer",
    })
  })

  it("rechaza email inválido con 400", async () => {
    const res = await POST(post({ email: "no-es-un-email" }))
    expect(res.status).toBe(400)
  })

  it("rechaza source inválido con 400", async () => {
    const res = await POST(post({ email: "a@b.com", source: "other" }))
    expect(res.status).toBe(400)
  })

  it("responde 429 cuando el rate limit está agotado", async () => {
    vi.mocked(rateLimited).mockResolvedValue({ allowed: false } as never)
    const insert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createServiceClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert }),
    } as never)
    const res = await POST(post({ email: "a@b.com" }))
    expect(res.status).toBe(429)
    expect(insert).not.toHaveBeenCalled()
  })

  it("fail-open: si la BD falla responde 200 sin bloquear el checkout", async () => {
    vi.mocked(createServiceClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: new Error("db down") }) }),
    } as never)
    const res = await POST(post({ email: "a@b.com" }))
    expect(res.status).toBe(200)
  })
})
