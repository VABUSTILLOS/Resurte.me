import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/whatsapp", () => ({ sendTextMessage: vi.fn() }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: vi.fn(),
}))

import { notifyFoodosCustomer } from "./foodos-notifications"
import { sendTextMessage } from "@/lib/whatsapp"
import { sendEmail } from "@/lib/email"
import { createServiceClient } from "@/lib/supabase/service"

const ORDER_ID = "11111111-2222-3333-4444-abcdef"
const PHONE = "+5215512345678"
const EMAIL = "cliente@example.com"

const ORDER = {
  id: ORDER_ID,
  restaurant_id: "rest-1",
  customer_id: "cust-1",
  customer_phone: PHONE,
  total: 250,
  slug: "tacos",
}

const RESTAURANT = { name: "Taquería El Sol", slug: "tacos" }
const CUSTOMER = { email: EMAIL }

interface Spec {
  data?: unknown
  error?: unknown
}

interface TableSpec {
  select?: Spec
  /** Un spec por llamada a insert(); el último se reutiliza. */
  insert?: Spec | Spec[]
  update?: Spec
}

interface Recorded {
  inserts: unknown[]
  updates: unknown[]
  selects: string[]
}

/**
 * Cliente Supabase falso. `from()` devuelve un builder encadenable que
 * recuerda si la última operación fue insert/update para que
 * `maybeSingle()` resuelva el resultado correcto.
 */
function setup(tables: Record<string, TableSpec> = {}) {
  const recorded: Record<string, Recorded> = {}
  const insertCounts: Record<string, number> = {}
  const builders: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {}

  const from = vi.fn((table: string) => {
    const spec = tables[table] ?? {}
    const log: Recorded = (recorded[table] ??= { inserts: [], updates: [], selects: [] })

    let mode: "select" | "insert" | "update" = "select"
    const builder: Record<string, unknown> = {}

    for (const m of ["eq", "in", "order", "limit"]) {
      builder[m] = vi.fn(() => builder)
    }
    builder.select = vi.fn((cols: string) => {
      log.selects.push(cols)
      return builder
    })
    builder.insert = vi.fn((payload: unknown) => {
      mode = "insert"
      log.inserts.push(payload)
      return builder
    })
    builder.update = vi.fn((payload: unknown) => {
      mode = "update"
      log.updates.push(payload)
      return builder
    })
    builder.maybeSingle = vi.fn(() => {
      if (mode !== "insert") {
        return Promise.resolve({
          data: spec.select?.data ?? null,
          error: spec.select?.error ?? null,
        })
      }
      const queue = Array.isArray(spec.insert) ? spec.insert : [spec.insert]
      const index = insertCounts[table] ?? 0
      insertCounts[table] = index + 1
      const current = queue[Math.min(index, queue.length - 1)]
      return Promise.resolve({ data: current?.data ?? null, error: current?.error ?? null })
    })
    builder.then = (onFulfilled: (v: unknown) => unknown) =>
      onFulfilled({ data: null, error: spec.update?.error ?? null })

    builders[table] = builder as Record<string, ReturnType<typeof vi.fn>>
    return builder
  })

  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from, recorded, builders }
}

/** Escenario feliz: pedido, restaurante y cliente existen. */
function happy(overrides: Record<string, TableSpec> = {}) {
  return setup({
    foodos_orders: { select: { data: ORDER } },
    foodos_restaurants: { select: { data: RESTAURANT } },
    foodos_customers: { select: { data: CUSTOMER } },
    foodos_order_notifications: { insert: { data: { id: 7 } } },
    ...overrides,
  })
}

function sentText(): string {
  const call = vi.mocked(sendTextMessage).mock.calls[0]
  return (call?.[0] as { text: string }).text
}

function sentHtml(): string {
  const call = vi.mocked(sendEmail).mock.calls[0]
  return (call?.[0] as { html: string }).html
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(sendTextMessage).mockResolvedValue({} as never)
  vi.mocked(sendEmail).mockResolvedValue({ ok: true, id: "resend-1" })
})

describe("notifyFoodosCustomer · WhatsApp", () => {
  it("envía el aviso y cierra el claim como sent", async () => {
    const { recorded } = happy()

    const outcome = await notifyFoodosCustomer(ORDER_ID, "status:confirmed")

    expect(outcome.whatsapp).toBe("sent")
    expect(sendTextMessage).toHaveBeenCalledTimes(1)
    expect(sendTextMessage).toHaveBeenCalledWith({ to: PHONE, text: expect.any(String) })

    const text = sentText()
    expect(text).toContain("Taquería El Sol")
    expect(text).toContain("Pedido confirmado")
    expect(text).toContain("#ABCDEF")
    expect(text).toContain("$250.00 MXN")
    expect(text).toContain(`/r/tacos/pedido/${ORDER_ID}`)

    expect(recorded.foodos_order_notifications!.inserts[0]).toEqual({
      order_id: ORDER_ID,
      restaurant_id: "rest-1",
      event: "status:confirmed",
      channel: "whatsapp",
      recipient: PHONE,
      status: "pending",
    })
    expect(recorded.foodos_order_notifications!.updates[0]).toEqual({
      status: "sent",
      error: null,
      updated_at: expect.any(String),
    })
  })

  it("no envía ni toma claim si el pedido no tiene teléfono", async () => {
    const { recorded } = happy({
      foodos_orders: { select: { data: { ...ORDER, customer_phone: "   " } } },
    })

    const outcome = await notifyFoodosCustomer(ORDER_ID, "status:confirmed")

    expect(outcome.whatsapp).toBe("skipped")
    expect(sendTextMessage).not.toHaveBeenCalled()
    const channels = recorded.foodos_order_notifications!.inserts.map(
      (i) => (i as { channel: string }).channel
    )
    expect(channels).not.toContain("whatsapp")
  })

  it("no reenvía si ya existe un claim (23505)", async () => {
    const { recorded } = happy({
      foodos_order_notifications: { insert: { error: { code: "23505" } } },
    })

    const outcome = await notifyFoodosCustomer(ORDER_ID, "status:confirmed")

    expect(outcome.whatsapp).toBe("skipped")
    expect(sendTextMessage).not.toHaveBeenCalled()
    expect(recorded.foodos_order_notifications!.updates).toEqual([])
  })

  it("fail-open: un error de BD distinto de 23505 no bloquea el aviso", async () => {
    const { recorded } = happy({
      foodos_order_notifications: { insert: { error: { code: "42P01", message: "no existe" } } },
    })

    const outcome = await notifyFoodosCustomer(ORDER_ID, "status:confirmed")

    expect(outcome.whatsapp).toBe("sent")
    expect(sendTextMessage).toHaveBeenCalledTimes(1)
    // Sin id de claim no hay nada que cerrar.
    expect(recorded.foodos_order_notifications!.updates).toEqual([])
  })

  it("marca failed y no propaga cuando el mensajero falla", async () => {
    const { recorded } = happy()
    vi.mocked(sendTextMessage).mockRejectedValue(new Error("Meta 500"))

    const outcome = await notifyFoodosCustomer(ORDER_ID, "status:confirmed")

    expect(outcome.whatsapp).toBe("failed")
    // El correo del mismo evento no se ve afectado por el fallo de WhatsApp.
    expect(outcome.email).toBe("sent")
    expect(recorded.foodos_order_notifications!.updates[0]).toEqual({
      status: "failed",
      error: "Meta 500",
      updated_at: expect.any(String),
    })
  })
})

describe("notifyFoodosCustomer · email", () => {
  it("manda correo en los hitos que le importan al comensal", async () => {
    happy()

    const outcome = await notifyFoodosCustomer(ORDER_ID, "payment:paid")

    expect(outcome.email).toBe("sent")
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(sendEmail).mock.calls[0]![0]
    expect(payload.to).toBe(EMAIL)
    expect(payload.subject).toContain("Pago confirmado")
    expect(payload.subject).toContain("#ABCDEF")
    expect(payload.tag).toBe("foodos_order_update")
    expect(payload.html).toContain("Taquería El Sol")
    expect(payload.html).toContain(`/r/tacos/pedido/${ORDER_ID}`)
  })

  it("no manda correo en pasos intermedios de cocina", async () => {
    const { recorded } = happy()

    const outcome = await notifyFoodosCustomer(ORDER_ID, "status:preparing")

    expect(outcome.email).toBe("skipped")
    expect(sendEmail).not.toHaveBeenCalled()
    expect(recorded.foodos_order_notifications!.inserts).toHaveLength(1)
    expect(recorded.foodos_order_notifications!.inserts[0]).toMatchObject({ channel: "whatsapp" })
  })

  it("no manda correo si el cliente no dejó dirección", async () => {
    const { from } = happy({
      foodos_orders: { select: { data: { ...ORDER, customer_id: null } } },
    })

    const outcome = await notifyFoodosCustomer(ORDER_ID, "payment:paid")

    expect(outcome.email).toBe("skipped")
    expect(sendEmail).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalledWith("foodos_customers")
  })

  it("marca failed cuando Resend responde ok:false", async () => {
    const { recorded } = happy()
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, error: "dominio no verificado" })

    const outcome = await notifyFoodosCustomer(ORDER_ID, "payment:paid")

    expect(outcome.email).toBe("failed")
    expect(recorded.foodos_order_notifications!.updates).toContainEqual({
      status: "failed",
      error: "dominio no verificado",
      updated_at: expect.any(String),
    })
  })

  it("deduplica el correo por canal, sin afectar el WhatsApp", async () => {
    // El claim de WhatsApp pasa; el de email choca con el índice único.
    const { recorded } = happy({
      foodos_order_notifications: { insert: [{ data: { id: 7 } }, { error: { code: "23505" } }] },
    })

    const outcome = await notifyFoodosCustomer(ORDER_ID, "payment:paid")

    expect(outcome.whatsapp).toBe("sent")
    expect(outcome.email).toBe("skipped")
    expect(sendTextMessage).toHaveBeenCalledTimes(1)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(recorded.foodos_order_notifications!.inserts).toHaveLength(2)
    expect(recorded.foodos_order_notifications!.inserts[1]).toMatchObject({ channel: "email" })
  })

  it("escapa el HTML del nombre del restaurante", async () => {
    happy({ foodos_restaurants: { select: { data: { name: "<b>Tacos</b>", slug: "tacos" } } } })

    await notifyFoodosCustomer(ORDER_ID, "payment:paid")

    expect(sentHtml()).toContain("&lt;b&gt;Tacos&lt;/b&gt;")
    expect(sentHtml()).not.toContain("<b>Tacos</b>")
  })
})

describe("notifyFoodosCustomer · casos límite", () => {
  it("no hace nada si el pedido no existe", async () => {
    happy({ foodos_orders: { select: { data: null } } })

    const outcome = await notifyFoodosCustomer(ORDER_ID, "status:confirmed")

    expect(outcome).toEqual({ whatsapp: "skipped", email: "skipped" })
    expect(sendTextMessage).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("no propaga si la BD no responde", async () => {
    vi.mocked(createServiceClient).mockRejectedValue(new Error("sin conexión"))

    const outcome = await notifyFoodosCustomer(ORDER_ID, "status:confirmed")

    expect(outcome).toEqual({ whatsapp: "skipped", email: "skipped" })
  })

  it("incluye el motivo cuando se rechaza un comprobante", async () => {
    happy()

    const outcome = await notifyFoodosCustomer(ORDER_ID, "payment:proof_rejected", {
      reason: "  el monto no coincide  ",
    })

    expect(outcome.whatsapp).toBe("sent")
    expect(sentText()).toContain("Motivo: el monto no coincide")
  })

  it("mantiene el detalle por defecto si no hay motivo", async () => {
    happy()

    await notifyFoodosCustomer(ORDER_ID, "payment:proof_rejected", { reason: "   " })

    expect(sentText()).toContain("Sube de nuevo tu comprobante")
    expect(sentText()).not.toContain("Motivo:")
  })

  it("omite el enlace de seguimiento si no hay slug en ningún lado", async () => {
    happy({
      foodos_orders: { select: { data: { ...ORDER, slug: null } } },
      foodos_restaurants: { select: { data: { name: "Taquería El Sol", slug: null } } },
    })

    await notifyFoodosCustomer(ORDER_ID, "payment:paid")

    expect(sentText()).not.toContain("/pedido/")
    expect(sentHtml()).not.toContain("<a href")
  })

  it("usa un nombre genérico si el restaurante no se encuentra", async () => {
    happy({ foodos_restaurants: { select: { data: null } } })

    await notifyFoodosCustomer(ORDER_ID, "status:confirmed")

    expect(sentText()).toContain("Tu restaurante")
  })

  it("cae al texto genérico en un evento sin copy propio", async () => {
    happy()

    // Evento fuera del catálogo: cubre el copy defensivo.
    await notifyFoodosCustomer(ORDER_ID, "status:desconocido" as never)

    expect(sentText()).toContain("Actualización de tu pedido")
  })
})
