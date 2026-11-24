import { beforeEach, describe, expect, it, vi } from "vitest"

// Esta suite usa la config REAL de whatsapp-order-config.ts: la
// bandera del paso final propio nace APAGADA, así que un pedido de
// WhatsApp viejo se cancela por la regla general, con el aviso
// genérico de siempre. Encenderla es cambiar una constante; su
// comportamiento encendida lo cubre
// workflows-whatsapp-unpaid-cancel.test.ts.
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
  resolveReminderLevels: () => [1, 24, 48],
  isReminderDue: (hours: number, levels: number[]) => levels.includes(hours),
}))

import { checkAndSendPaymentReminders, sendPaymentReminder } from "@/lib/workflows"

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString()
const okRows = (data: unknown) => ({ data, error: null })
const okEmpty = () => ({ data: null, error: null })

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
    created_at: hoursAgo(24),
    customer_phone: "5216141047021",
    restore_token: "tok-123",
    city: { slug: "chihuahua" },
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

describe("recordatorio de pago con liga pública del pedido", () => {
  it("tras la plantilla, manda la liga de seguimiento como «link de pago»", async () => {
    queue.current = [
      okRows(detailsRow()), // getOrderDetails: orders
      okRows([]), // getOrderDetails: items
      okEmpty(), // logWorkflow
    ]

    const result = await sendPaymentReminder(501)

    expect(result?.status).toBe("sent")
    expect(sendTemplateMock).toHaveBeenCalledWith(
      expect.objectContaining({ templateName: "recordatorio_pago_resurte" })
    )
    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "5216141047021",
        text: expect.stringContaining(
          "https://resurte.me/chihuahua/pedido/501/seguimiento?token=tok-123"
        ),
      })
    )
  })

  it("sin token de restauración no inventa liga: solo sale la plantilla", async () => {
    queue.current = [
      okRows(detailsRow({ restore_token: null, city: null })),
      okRows([]),
      okEmpty(),
    ]

    const result = await sendPaymentReminder(501)

    expect(result?.status).toBe("sent")
    expect(sendTextMock).not.toHaveBeenCalled()
  })

  it("si la liga no se entrega (ventana de 24 h cerrada), el recordatorio igual cuenta como enviado", async () => {
    sendTextMock.mockRejectedValue(new Error("outside window"))
    queue.current = [okRows(detailsRow()), okRows([]), okEmpty()]

    const result = await sendPaymentReminder(501)

    expect(result?.status).toBe("sent")
  })
})

describe("con la bandera propia apagada (default), nada cambia", () => {
  it("un pedido de WhatsApp sin pagar a las 80 h se cancela por la regla general, con el aviso genérico", async () => {
    queue.current = [
      okRows([
        {
          id: 501,
          created_at: hoursAgo(80),
          status: "pending",
          payment_status: "pending",
          payment_method: "spei",
          source: "whatsapp",
          coupon_code: null,
        },
      ]),
      okRows([{ id: 501 }]), // update condicional
      okRows(detailsRow({ created_at: hoursAgo(80) })), // notifyCustomerStatusUpdate → getOrderDetails
      okRows([]),
      okEmpty(), // logWorkflow
    ]

    const result = await checkAndSendPaymentReminders()

    expect(result.cancelled).toBe(1)
    const templateArgs = sendTemplateMock.mock.calls[0]?.[0] as {
      components: { parameters: { text: string }[] }[]
    }
    // La novedad genérica de cancelación, NO la de "falta de pago".
    expect(templateArgs.components[0]?.parameters[2]?.text).toBe("fue cancelado")
  })
})
