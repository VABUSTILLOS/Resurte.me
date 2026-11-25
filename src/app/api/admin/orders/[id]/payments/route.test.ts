import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/notifications", () => ({
  notifyCashbackCredited: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/order-payments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/order-payments")>()
  return {
    ...actual,
    getOrderPaymentSummary: vi.fn(),
    recordOrderPayment: vi.fn(),
  }
})
vi.mock("@/lib/stripe-payment-link", () => ({
  readPersistedOrderPaymentLink: vi.fn(async () => null),
}))

import { GET, POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"
import { notifyCashbackCredited } from "@/lib/notifications"
import { getOrderPaymentSummary, recordOrderPayment } from "@/lib/order-payments"

const ORDER = { id: 501, total: 612, payment_status: "pending", status: "pending" }

function orderBuilder(data: unknown) {
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq"]) b[m] = vi.fn().mockReturnValue(b)
  b.maybeSingle = vi.fn().mockResolvedValue({ data, error: null })
  return b
}

function summary(over: Record<string, unknown> = {}) {
  return {
    available: true,
    total: 612,
    paidAmount: 0,
    balance: 612,
    coveredByPayments: false,
    isPaidStatus: false,
    payments: [],
    ...over,
  }
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/orders/501/payments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: "501" })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue({
    response: null,
    user: { id: "admin-1", email: "admin@resurte.me" },
  } as never)
  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn(() => orderBuilder(ORDER)),
  } as never)
  vi.mocked(getOrderPaymentSummary).mockResolvedValue(summary() as never)
  vi.mocked(recordOrderPayment).mockResolvedValue({
    recorded: true,
    alreadyRecorded: false,
    schemaMissing: false,
    becamePaid: false,
    summary: summary({ paidAmount: 200, balance: 412 }),
  } as never)
})

describe("POST /api/admin/orders/[id]/payments — registrar un pago manual", () => {
  it("registra un abono parcial y lo deja en bitácora", async () => {
    const res = await POST(postRequest({ amount: 200, method: "spei" }), { params })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.balance).toBe(412)
    expect(json.becamePaid).toBe(false)
    expect(recordOrderPayment).toHaveBeenCalledWith(
      expect.anything(),
      ORDER,
      expect.objectContaining({ amount: 200, method: "spei", origin: "manual", createdBy: "admin-1" })
    )
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "order_payment", entityId: 501 })
    )
    expect(notifyCashbackCredited).not.toHaveBeenCalled()
  })

  it("cuando el registro cubre el total, avisa el cashback", async () => {
    vi.mocked(recordOrderPayment).mockResolvedValue({
      recorded: true,
      alreadyRecorded: false,
      schemaMissing: false,
      becamePaid: true,
      summary: summary({ paidAmount: 612, balance: 0, coveredByPayments: true }),
    } as never)

    const res = await POST(postRequest({ amount: 612, method: "spei" }), { params })

    expect(res.status).toBe(200)
    expect((await res.json()).becamePaid).toBe(true)
    expect(notifyCashbackCredited).toHaveBeenCalledWith(501)
  })

  it("rechaza montos inválidos y métodos fuera del catálogo", async () => {
    expect((await POST(postRequest({ amount: 0, method: "spei" }), { params })).status).toBe(400)
    expect((await POST(postRequest({ amount: "200", method: "spei" }), { params })).status).toBe(400)
    expect((await POST(postRequest({ amount: 200, method: "bitcoin" }), { params })).status).toBe(400)
    expect(recordOrderPayment).not.toHaveBeenCalled()
  })

  it("rechaza un monto mayor al saldo de la BD", async () => {
    const res = await POST(postRequest({ amount: 700, method: "spei" }), { params })
    expect(res.status).toBe(400)
    expect(recordOrderPayment).not.toHaveBeenCalled()
  })

  it("sin la migración 00233 responde 409 explicándolo, sin registrar nada", async () => {
    vi.mocked(getOrderPaymentSummary).mockResolvedValue(
      summary({ available: false }) as never
    )
    const res = await POST(postRequest({ amount: 200, method: "spei" }), { params })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("00233")
    expect(recordOrderPayment).not.toHaveBeenCalled()
  })

  it("un pedido ya pagado no admite más registros", async () => {
    vi.mocked(getOrderPaymentSummary).mockResolvedValue(
      summary({ isPaidStatus: true, balance: 0 }) as never
    )
    const res = await POST(postRequest({ amount: 200, method: "spei" }), { params })
    expect(res.status).toBe(409)
    expect(recordOrderPayment).not.toHaveBeenCalled()
  })

  it("pedido inexistente: 404", async () => {
    vi.mocked(createServiceClient).mockResolvedValue({
      from: vi.fn(() => orderBuilder(null)),
    } as never)
    const res = await POST(postRequest({ amount: 200, method: "spei" }), { params })
    expect(res.status).toBe(404)
  })
})

describe("GET /api/admin/orders/[id]/payments — resumen del libro", () => {
  it("devuelve total, abonado, saldo y el link persistido", async () => {
    vi.mocked(getOrderPaymentSummary).mockResolvedValue(
      summary({ paidAmount: 200, balance: 412 }) as never
    )
    const res = await GET(
      new NextRequest("http://localhost/api/admin/orders/501/payments"),
      { params }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ total: 612, paidAmount: 200, balance: 412, paymentLink: null })
  })
})
