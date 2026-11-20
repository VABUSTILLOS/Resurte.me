import { createHmac } from "crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>()
  return {
    ...actual,
    after: (fn: () => void) => fn(),
  }
})
vi.mock("@/lib/whatsapp", () => ({
  verifyWebhook: vi.fn((mode: string, token: string, challenge: string, verifyToken: string) =>
    mode === "subscribe" && token === verifyToken ? challenge : null
  ),
  sendTextMessage: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/whatsapp-orders", () => ({
  createWhatsAppOrder: vi.fn(),
  findProfileByPhone: vi.fn(),
}))
vi.mock("@/lib/workflows", () => ({
  runNewOrderWorkflows: vi.fn().mockResolvedValue({ staff: [], customer: null }),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { NextRequest } from "next/server"
import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { sendTextMessage } from "@/lib/whatsapp"
import { createWhatsAppOrder, findProfileByPhone } from "@/lib/whatsapp-orders"
import { runNewOrderWorkflows } from "@/lib/workflows"

/**
 * Webhook de WhatsApp: la rama de pedidos del catálogo (type "order").
 *
 * Lo que estas pruebas protegen:
 *   · Que un mensaje "order" se convierta en pedido ANTES del routing
 *     de texto, dispare los workflows de pedido nuevo y responda al
 *     cliente con su número de pedido pidiéndole la dirección.
 *   · El fail-closed de la ruta: sin app secret → 503, firma
 *     inválida → 401, y en ambos casos no se crea nada.
 *   · Que un duplicado (reintento de Meta) no responda de nuevo.
 *   · Que el routing de texto ("mi pedido") siga intacto.
 */

const SECRET = "test-app-secret"
const FROM = "5216141261296"

interface Row {
  data?: unknown
  error?: { code?: string; message?: string } | null
}

/** Builder PostgREST chainable y awaitable; todo resuelve sin filas salvo lo configurado. */
function builder(result: Row = { data: null, error: null }) {
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq", "ilike", "in", "is", "not", "order", "limit", "insert", "update", "delete"]) {
    b[m] = vi.fn(() => b)
  }
  b.maybeSingle = vi.fn(() => Promise.resolve(result))
  b.single = vi.fn(() => Promise.resolve(result))
  b.then = (resolve: (v: Row) => void) => resolve(result)
  return b
}

function mockClient() {
  return { from: vi.fn(() => builder()) }
}

function signedRequest(body: unknown, secret: string = SECRET) {
  const raw = JSON.stringify(body)
  const signature = createHmac("sha256", secret).update(raw).digest("hex")
  return new NextRequest("https://resurte.me/api/whatsapp/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${signature}`,
    },
    body: raw,
  })
}

function webhookBody(message: Record<string, unknown>) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "123456", display_phone_number: FROM },
              messages: [message],
            },
          },
        ],
      },
    ],
  }
}

const ORDER_MESSAGE = {
  from: FROM,
  id: "wamid.order.1",
  timestamp: "1763660000",
  type: "order",
  order: {
    catalog_id: "1114464434652320",
    product_items: [
      { product_retailer_id: "abarrotes-curcuma", quantity: 3, item_price: 203, currency: "MXN" },
    ],
  },
}

beforeEach(() => {
  process.env.WHATSAPP_APP_SECRET = SECRET
  vi.mocked(createServiceClient).mockResolvedValue(mockClient() as never)
  vi.mocked(findProfileByPhone).mockResolvedValue({ profile: null, error: null })
})

afterEach(() => {
  delete process.env.WHATSAPP_APP_SECRET
})

describe("POST /api/whatsapp/webhook — pedidos del catálogo", () => {
  it("un mensaje order crea el pedido, dispara workflows y responde pidiendo la dirección", async () => {
    vi.mocked(createWhatsAppOrder).mockResolvedValue({
      kind: "created",
      orderId: 555,
      subtotal: 609,
      deliveryFee: 0,
      total: 609,
      unresolved: [],
    })

    const res = await POST(signedRequest(webhookBody(ORDER_MESSAGE)))

    expect(res.status).toBe(200)
    expect(createWhatsAppOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        from: FROM,
        waMessageId: "wamid.order.1",
        catalogId: "1114464434652320",
        productItems: ORDER_MESSAGE.order.product_items,
        noteText: null,
      })
    )
    expect(runNewOrderWorkflows).toHaveBeenCalledWith(555)
    const sent = vi.mocked(sendTextMessage).mock.calls.map((c) => c[0])
    expect(sent.some((m) => m.to === FROM && m.text.includes("#555"))).toBe(true)
    expect(sent.some((m) => m.text.includes("dirección"))).toBe(true)
  })

  it("por debajo del mínimo responde cuánto falta y no dispara workflows", async () => {
    vi.mocked(createWhatsAppOrder).mockResolvedValue({
      kind: "below_minimum",
      subtotal: 203,
      minimum: 500,
      missingAmount: 297,
      unresolved: [],
    })

    const res = await POST(signedRequest(webhookBody(ORDER_MESSAGE)))

    expect(res.status).toBe(200)
    expect(runNewOrderWorkflows).not.toHaveBeenCalled()
    const sent = vi.mocked(sendTextMessage).mock.calls.map((c) => c[0])
    expect(sent.some((m) => m.text.includes("$297.00"))).toBe(true)
  })

  it("un duplicado (reintento de Meta) no responde ni crea de nuevo", async () => {
    vi.mocked(createWhatsAppOrder).mockResolvedValue({ kind: "duplicate", orderId: 555 })

    const res = await POST(signedRequest(webhookBody(ORDER_MESSAGE)))

    expect(res.status).toBe(200)
    expect(sendTextMessage).not.toHaveBeenCalled()
    expect(runNewOrderWorkflows).not.toHaveBeenCalled()
  })

  it("firma inválida → 401 y no se crea nada", async () => {
    const res = await POST(signedRequest(webhookBody(ORDER_MESSAGE), "otro-secret"))

    expect(res.status).toBe(401)
    expect(createWhatsAppOrder).not.toHaveBeenCalled()
  })

  it("sin WHATSAPP_APP_SECRET → 503 (fail-closed) y no se crea nada", async () => {
    delete process.env.WHATSAPP_APP_SECRET

    const res = await POST(signedRequest(webhookBody(ORDER_MESSAGE)))

    expect(res.status).toBe(503)
    expect(createWhatsAppOrder).not.toHaveBeenCalled()
  })

  it("un mensaje de texto sigue yendo al routing actual (mi pedido)", async () => {
    const textMessage = {
      from: FROM,
      id: "wamid.text.1",
      timestamp: "1763660000",
      type: "text",
      text: { body: "mi pedido" },
    }

    const res = await POST(signedRequest(webhookBody(textMessage)))

    expect(res.status).toBe(200)
    expect(createWhatsAppOrder).not.toHaveBeenCalled()
    expect(findProfileByPhone).toHaveBeenCalled()
    const sent = vi.mocked(sendTextMessage).mock.calls.map((c) => c[0])
    expect(sent.some((m) => m.text.includes("No encontramos un pedido"))).toBe(true)
  })
})
