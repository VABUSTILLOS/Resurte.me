import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({
  rateLimited: vi.fn(async () => ({ allowed: true })),
  clientIp: vi.fn(() => "1.2.3.4"),
  rateLimitResponse: vi.fn(() =>
    NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 })
  ),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/stripe-payment-link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe-payment-link")>()
  return { ...actual, getOrCreateOrderPaymentLink: vi.fn() }
})

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { getOrCreateOrderPaymentLink, PaymentLinkError } from "@/lib/stripe-payment-link"

const ORDER = {
  id: 501,
  user_id: "user-1",
  total: 612,
  payment_status: "pending",
  status: "pending",
  customer_email: null,
  restore_token: "tok-123",
  cities: { slug: "chihuahua" },
}

function orderBuilder(data: unknown) {
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq"]) b[m] = vi.fn().mockReturnValue(b)
  b.maybeSingle = vi.fn().mockResolvedValue({ data, error: null })
  return b
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/orders/501/payment-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: "501" })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn(() => orderBuilder(ORDER)),
  } as never)
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  } as never)
  vi.mocked(getOrCreateOrderPaymentLink).mockResolvedValue({
    url: "https://checkout.stripe.com/c/pay/cs_1",
    sessionId: "cs_1",
    amount: 612,
    balance: 612,
    reused: false,
  } as never)
})

describe("POST /api/orders/[id]/payment-link — link público de pago", () => {
  it("con el token del pedido devuelve el link generado desde la BD", async () => {
    const res = await POST(postRequest({ t: "tok-123" }), { params })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.url).toBe("https://checkout.stripe.com/c/pay/cs_1")
    expect(json.amount).toBe(612)
    // El monto jamás viene del cliente: la ruta no manda amount.
    expect(getOrCreateOrderPaymentLink).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 501, total: 612, city_slug: "chihuahua" })
    )
  })

  it("sin token válido responde 404 genérico y no genera nada", async () => {
    const res = await POST(postRequest({ t: "tok-equivocado" }), { params })
    expect(res.status).toBe(404)
    expect(getOrCreateOrderPaymentLink).not.toHaveBeenCalled()
  })

  it("un pedido pagado no genera link (409)", async () => {
    vi.mocked(createServiceClient).mockResolvedValue({
      from: vi.fn(() => orderBuilder({ ...ORDER, payment_status: "paid" })),
    } as never)
    const res = await POST(postRequest({ t: "tok-123" }), { params })
    expect(res.status).toBe(409)
    expect(getOrCreateOrderPaymentLink).not.toHaveBeenCalled()
  })

  it("un pedido cancelado no genera link (409)", async () => {
    vi.mocked(createServiceClient).mockResolvedValue({
      from: vi.fn(() => orderBuilder({ ...ORDER, status: "cancelled" })),
    } as never)
    const res = await POST(postRequest({ t: "tok-123" }), { params })
    expect(res.status).toBe(409)
  })

  it("sin Stripe configurado responde 503 sin filtrar detalle interno", async () => {
    vi.mocked(getOrCreateOrderPaymentLink).mockRejectedValue(
      new PaymentLinkError("stripe_not_configured", "STRIPE_SECRET_KEY no está configurada")
    )
    const res = await POST(postRequest({ t: "tok-123" }), { params })
    expect(res.status).toBe(503)
    expect((await res.json()).error).not.toContain("STRIPE_SECRET_KEY")
  })
})
