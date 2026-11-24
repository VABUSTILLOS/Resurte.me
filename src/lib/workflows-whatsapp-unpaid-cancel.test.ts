import { beforeEach, describe, expect, it, vi } from "vitest"

// Suite del paso final PROPIO de WhatsApp (cancelación por falta de
// pago): la bandera se enciende SOLO en este mock — en producción
// nace apagada (whatsapp-order-config.ts) y el barrido se comporta
// como siempre; eso lo cubre workflows-payment-recovery.test.ts.
vi.mock("@/lib/whatsapp-order-config", () => ({
  WHATSAPP_UNPAID_CANCEL_ENABLED: true,
  WHATSAPP_UNPAID_CANCEL_GRACE_HOURS: 24,
}))

const queue = vi.hoisted(() => ({ current: [] as unknown[] }))
const sendTemplateMock = vi.hoisted(() => vi.fn())
const sendTextMock = vi.hoisted(() => vi.fn())
const cancelEffectsMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: async () => ({
    from: () => {
      const result = queue.current.shift()
      const chain: Record<string, unknown> = {}
      for (const m of ["select", "eq", "neq", "or", "order", "limit", "gte", "in", "is", "not"]) {
        chain[m] = () => chain
      }
      chain.update = () => chain
      chain.insert = () => Promise.resolve({ error: null })
      chain.single = () => Promise.resolve(result)
      chain.maybeSingle = () => Promise.resolve(result)
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject)
      return chain
    },
  }),
}))
vi.mock("@/lib/whatsapp", () => ({
  sendTextMessage: sendTextMock,
  sendTemplate: sendTemplateMock,
}))
vi.mock("@/lib/order-emails", () => ({
  sendOrderConfirmationEmail: vi.fn(),
  sendOrderStatusEmail: vi.fn(),
  buildTrackingUrl: vi.fn(
    (city: string, id: number, token: string) =>
      `https://resurte.me/${city}/pedido/${id}/seguimiento?token=${token}`
  ),
}))
vi.mock("@/lib/order-cancellation", () => ({
  applyOrderCancellationEffects: cancelEffectsMock,
}))
vi.mock("@/lib/whatsapp-automations-engine", () => ({
  getAutomationConfig: vi.fn(async () => null),
  effectiveAutomationConfig: () => ({ is_active: true }),
  // Último nivel 24 h + gracia 24 h = la regla propia vence a las 48 h,
  // ANTES que la general (72 h): así se distingue cuál regla canceló.
  resolveReminderLevels: () => [1, 24],
  isReminderDue: (hours: number, levels: number[]) => levels.includes(hours),
}))

import { checkAndSendPaymentReminders } from "@/lib/workflows"

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString()
const okRows = (data: unknown) => ({ data, error: null })
const okEmpty = () => ({ data: null, error: null })

function sweepRow(over: Record<string, unknown> = {}) {
  return {
    id: 501,
    created_at: hoursAgo(50),
    status: "pending",
    payment_status: "pending",
    payment_method: "spei",
    source: "whatsapp",
    coupon_code: null,
    ...over,
  }
}

function detailsRow(over: Record<string, unknown> = {}) {
  return {
    id: 501,
    user_id: "user-1",
    status: "pending",
    payment_status: "pending",
    payment_method: "spei",
    total: 612,
    subtotal: 612,
    delivery_fee: 0,
    scheduled_for: null,
    source: "whatsapp",
    created_at: hoursAgo(50),
    customer_phone: "5216141047021",
    profile: { full_name: "Ana", phone: null },
    ...over,
  }
}

beforeEach(() => {
  queue.current = []
  sendTemplateMock.mockReset()
  sendTemplateMock.mockResolvedValue({ messages: [{ id: "wamid.test" }] })
  sendTextMock.mockReset()
  sendTextMock.mockResolvedValue({ messages: [{ id: "wamid.test" }] })
  cancelEffectsMock.mockReset()
  cancelEffectsMock.mockResolvedValue(undefined)
})

describe("paso final propio de WhatsApp (bandera encendida en esta suite)", () => {
  it("cancela el pedido de WhatsApp sin pagar al vencer SU regla (48 h), no la general (72 h)", async () => {
    queue.current = [
      okRows([sweepRow()]), // lista de pendientes
      okRows([{ id: 501 }]), // update condicional → cancelado
      okRows(detailsRow()), // getOrderDetails: orders
      okRows([]), // getOrderDetails: items
      okEmpty(), // logWorkflow cliente
      okEmpty(), // logWorkflow staff
    ]

    const result = await checkAndSendPaymentReminders()

    expect(result.cancelled).toBe(1)
    expect(cancelEffectsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orderId: 501 })
    )
    // El aviso al cliente dice el motivo, no la novedad genérica.
    const templateArgs = sendTemplateMock.mock.calls[0]?.[0] as {
      components: { parameters: { text: string }[] }[]
    }
    const novelty = templateArgs.components[0]?.parameters[2]?.text ?? ""
    expect(novelty).toContain("se canceló por falta de pago")
    // Y el staff recibe su aviso en texto libre.
    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("cancelado por falta de pago"),
      })
    )
  })

  it("la regla propia NO alcanza a pedidos web: a las 50 h un web sigue vivo", async () => {
    queue.current = [okRows([sweepRow({ source: "web" })])]

    const result = await checkAndSendPaymentReminders()

    expect(result.cancelled).toBe(0)
    expect(cancelEffectsMock).not.toHaveBeenCalled()
  })

  it("antes de su vencimiento (30 h) no cancela ni adelanta nada", async () => {
    queue.current = [okRows([sweepRow({ created_at: hoursAgo(30) })])]

    const result = await checkAndSendPaymentReminders()

    expect(result.cancelled).toBe(0)
    expect(cancelEffectsMock).not.toHaveBeenCalled()
  })

  it("en un nivel de recordatorio (24 h) el recordatorio sigue saliendo igual", async () => {
    queue.current = [
      okRows([sweepRow({ created_at: hoursAgo(24) })]),
      okRows(detailsRow({ created_at: hoursAgo(24) })), // sendPaymentReminder → getOrderDetails
      okRows([]),
      okEmpty(), // logWorkflow del recordatorio
    ]

    const result = await checkAndSendPaymentReminders()

    expect(result.reminded).toBe(1)
    expect(result.cancelled).toBe(0)
    expect(sendTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({ templateName: "recordatorio_pago_resurte" })
    )
  })

  it("contra entrega jamás entra, ni con la bandera encendida", async () => {
    queue.current = [
      okRows([sweepRow({ payment_method: "cash_on_delivery", created_at: hoursAgo(100) })]),
    ]

    const result = await checkAndSendPaymentReminders()

    expect(result.cancelled).toBe(0)
    expect(cancelEffectsMock).not.toHaveBeenCalled()
  })
})
