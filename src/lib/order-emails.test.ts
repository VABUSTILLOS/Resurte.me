import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true, id: "re_1" }),
  orderConfirmationEmailHtml: vi.fn(() => "<html>confirm</html>"),
  orderStatusEmailHtml: vi.fn(() => "<html>status</html>"),
  escapeHtml: (s: string) => s,
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import {
  sendOrderConfirmationEmail,
  sendOrderStatusEmail,
  buildTrackingUrl,
  retryFailedOrderEmails,
  EMAILED_STATUSES,
} from "./order-emails"
import { createServiceClient } from "@/lib/supabase/service"
import { sendEmail } from "@/lib/email"

const ORDER = {
  id: 42,
  user_id: "u1",
  customer_email: "cliente@x.mx",
  total: 135,
  payment_method: "cash_on_delivery",
  scheduled_for: "2026-09-13T16:00:00Z",
  restore_token: "tok-1",
  cities: { slug: "cdmx" },
}

/**
 * Service client simulado por tabla:
 *  - orders.maybeSingle → orderRow
 *  - email_logs.limit → dedupeRows; email_logs.insert → logOk
 *  - order_items.select → itemsRows
 */
function serviceWith(opts: {
  orderRow?: unknown
  dedupeRows?: unknown[]
  itemsRows?: unknown[]
  logRows?: unknown[]
  logError?: { message: string } | null
}) {
  const inserts: unknown[] = []
  const from = vi.fn((table: string) => {
    const b: Record<string, unknown> = {}
    for (const m of ["select", "eq", "order", "gte", "not", "or"]) b[m] = vi.fn().mockReturnValue(b)
    if (table === "orders") {
      b.maybeSingle = vi.fn().mockResolvedValue({ data: opts.orderRow ?? ORDER, error: null })
    } else if (table === "email_logs") {
      b.limit = vi.fn().mockResolvedValue({ data: opts.dedupeRows ?? [], error: null })
      b.insert = vi.fn().mockImplementation((row: unknown) => {
        inserts.push(row)
        return Promise.resolve({ error: null })
      })
      // Cadena del retry (.select().gte().not().or()) → await directo (thenable)
      b.then = (resolve: (v: unknown) => void) =>
        resolve({ data: opts.logRows ?? [], error: opts.logError ?? null })
    } else if (table === "order_items") {
      // .select().eq() → await directo (thenable)
      b.eq = vi.fn().mockReturnValue({
        ...b,
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: opts.itemsRows ?? [{ quantity: 2, products: { name: "Aguacate" } }], error: null }),
      })
    }
    return b
  })
  vi.mocked(createServiceClient).mockResolvedValue({
    from,
    auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: "cuenta@x.mx" } }, error: null }) } },
  } as never)
  return { inserts }
}

describe("buildTrackingUrl", () => {
  it("construye la capability URL del pedido", () => {
    expect(buildTrackingUrl("cdmx", 42, "tok")).toMatch(/\/cdmx\/pedido\/42\?t=tok$/)
  })
})

describe("sendOrderConfirmationEmail", () => {
  beforeEach(() => vi.clearAllMocks())

  it("envía y registra en email_logs", async () => {
    const { inserts } = serviceWith({})
    await sendOrderConfirmationEmail(42)
    expect(sendEmail).toHaveBeenCalledOnce()
    expect(vi.mocked(sendEmail).mock.calls[0]![0]).toMatchObject({
      to: "cliente@x.mx",
      tag: "order_confirmation",
    })
    expect(inserts[0]).toMatchObject({
      email_type: "order_confirmation",
      order_id: 42,
      status: "sent",
    })
  })

  it("no reenvía si ya hay un log 'sent' (dedupe)", async () => {
    serviceWith({ dedupeRows: [{ id: 1 }] })
    await sendOrderConfirmationEmail(42)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("sin email del cliente usa el email de la cuenta", async () => {
    serviceWith({ orderRow: { ...ORDER, customer_email: null } })
    await sendOrderConfirmationEmail(42)
    expect(vi.mocked(sendEmail).mock.calls[0]![0].to).toBe("cuenta@x.mx")
  })

  it("sin destinatario ni token no envía nada", async () => {
    serviceWith({
      orderRow: { ...ORDER, customer_email: null, user_id: null, restore_token: null },
    })
    await sendOrderConfirmationEmail(42)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe("sendOrderStatusEmail", () => {
  beforeEach(() => vi.clearAllMocks())

  it("solo notifica los hitos logísticos", async () => {
    expect(EMAILED_STATUSES).toEqual(["confirmed", "out_for_delivery", "delivered"])
    serviceWith({})
    await sendOrderStatusEmail(42, "pending")
    await sendOrderStatusEmail(42, "preparing")
    await sendOrderStatusEmail(42, "cancelled")
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("envía con tipo por estado y dedupe propio", async () => {
    const { inserts } = serviceWith({})
    await sendOrderStatusEmail(42, "out_for_delivery")
    expect(sendEmail).toHaveBeenCalledOnce()
    expect(inserts[0]).toMatchObject({ email_type: "order_status_out_for_delivery" })
  })

  it("no duplica el hito ya enviado", async () => {
    serviceWith({ dedupeRows: [{ id: 9 }] })
    await sendOrderStatusEmail(42, "delivered")
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe("retryFailedOrderEmails", () => {
  beforeEach(() => vi.clearAllMocks())

  it("reintenta un fallo reciente de confirmación", async () => {
    serviceWith({
      logRows: [{ order_id: 42, email_type: "order_confirmation", status: "failed" }],
    })
    const result = await retryFailedOrderEmails()
    expect(result).toEqual({ retried: 1, skipped: 0 })
    expect(sendEmail).toHaveBeenCalledOnce()
  })

  it("reintenta un hito logístico fallido", async () => {
    serviceWith({
      logRows: [{ order_id: 42, email_type: "order_status_out_for_delivery", status: "failed" }],
    })
    const result = await retryFailedOrderEmails()
    expect(result.retried).toBe(1)
    expect(vi.mocked(sendEmail).mock.calls[0]![0]).toMatchObject({
      tag: "order_status_out_for_delivery",
    })
  })

  it("no reintenta si ya existe un 'sent' para ese tipo", async () => {
    serviceWith({
      logRows: [
        { order_id: 42, email_type: "order_confirmation", status: "failed" },
        { order_id: 42, email_type: "order_confirmation", status: "sent" },
      ],
    })
    const result = await retryFailedOrderEmails()
    expect(result).toEqual({ retried: 0, skipped: 1 })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("respeta el tope de intentos (original + reintentos)", async () => {
    serviceWith({
      logRows: [
        { order_id: 42, email_type: "order_confirmation", status: "failed" },
        { order_id: 42, email_type: "order_confirmation", status: "failed" },
        { order_id: 42, email_type: "order_confirmation", status: "failed" },
      ],
    })
    const result = await retryFailedOrderEmails()
    expect(result).toEqual({ retried: 0, skipped: 1 })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("ante error de consulta devuelve ceros sin lanzar", async () => {
    serviceWith({ logError: { message: "boom" } })
    const result = await retryFailedOrderEmails()
    expect(result).toEqual({ retried: 0, skipped: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
