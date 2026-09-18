import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/notifications", () => ({ notifyUser: vi.fn() }))
vi.mock("@/lib/push-server", () => ({ sendPushToUser: vi.fn() }))
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: vi.fn(),
}))

import { notifyFoodosOwner, FOODOS_OWNER_EVENTS, isFoodosOwnerEvent } from "./foodos-owner-notifications"
import { createServiceClient } from "@/lib/supabase/service"
import { sendEmail } from "@/lib/email"
import { notifyUser } from "@/lib/notifications"
import { sendPushToUser } from "@/lib/push-server"

const ORDER_ID = "11111111-2222-3333-4444-abcdef"
const OWNER_ID = "owner-uuid-1"
const OWNER_EMAIL = "dueno@taqueria.mx"

const ORDER = {
  id: ORDER_ID,
  restaurant_id: "rest-1",
  total: 250,
  slug: "tacos",
  customer_name: "Ana",
}

const RESTAURANT = { name: "Taquería El Sol", user_id: OWNER_ID }

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
 * Cliente Supabase falso, con `auth.admin.getUserById` porque el correo del
 * dueño vive en `auth.users` y no en `profiles` (esa tabla no tiene correo).
 */
function setup(
  tables: Record<string, TableSpec> = {},
  owner: { email?: string | null; error?: unknown } = {}
) {
  const recorded: Record<string, Recorded> = {}
  const insertCounts: Record<string, number> = {}

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

    return builder
  })

  const getUserById = vi.fn(() =>
    Promise.resolve(
      owner.error
        ? { data: { user: null }, error: owner.error }
        : { data: { user: owner.email === undefined ? { email: OWNER_EMAIL } : { email: owner.email } }, error: null }
    )
  )

  vi.mocked(createServiceClient).mockResolvedValue({
    from,
    auth: { admin: { getUserById } },
  } as never)
  return { from, recorded, getUserById }
}

/** Escenario feliz: pedido, restaurante con dueño, y claim libre. */
function happy(overrides: Record<string, TableSpec> = {}) {
  return setup({
    foodos_orders: { select: { data: ORDER } },
    foodos_restaurants: { select: { data: RESTAURANT } },
    foodos_order_notifications: { insert: { data: { id: 7 } } },
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(notifyUser).mockResolvedValue(undefined)
  vi.mocked(sendPushToUser).mockResolvedValue({ sent: 1, removed: 0 } as never)
  vi.mocked(sendEmail).mockResolvedValue({ ok: true, id: "resend-1" })
})

describe("notifyFoodosOwner · campana", () => {
  it("escribe la fila persistente y cierra el claim como sent", async () => {
    happy()

    const outcome = await notifyFoodosOwner(ORDER_ID, "status:pending")

    expect(outcome.bell).toBe("sent")
    expect(notifyUser).toHaveBeenCalledTimes(1)
    expect(vi.mocked(notifyUser).mock.calls[0]?.[0]).toEqual({
      userId: OWNER_ID,
      type: "foodos_order_created",
      title: "🧾 Pedido nuevo · #ABCDEF",
      body: "Pedido #ABCDEF · $250.00 MXN · Ana. Confírmalo para que entre a cocina.",
      actionUrl: `/panel/foodos/pedidos/${ORDER_ID}`,
    })
  })

  it("el tipo de la campana lleva prefijo foodos_ para poder filtrarla en el panel", async () => {
    happy()

    await notifyFoodosOwner(ORDER_ID, "status:pending")
    await notifyFoodosOwner(ORDER_ID, "payment:proof_pending")

    const types = vi.mocked(notifyUser).mock.calls.map((c) => (c[0] as { type: string }).type)
    expect(types.every((t) => t.startsWith("foodos_"))).toBe(true)
    expect(types).toContain("foodos_order_created")
    expect(types).toContain("foodos_payment_proof_pending")
  })

  it("reclama con audiencia owner y canal bell — sin esto chocaría con el aviso del comensal", async () => {
    const { recorded } = happy()

    await notifyFoodosOwner(ORDER_ID, "status:pending")

    const first = recorded.foodos_order_notifications!.inserts[0] as Record<string, unknown>
    expect(first.audience).toBe("owner")
    expect(first.channel).toBe("bell")
    expect(first.recipient).toBe(OWNER_ID)
    expect(first.status).toBe("pending")
  })
})

describe("notifyFoodosOwner · push", () => {
  it("usa la etiqueta de pedido FoodOS, no la numérica del marketplace", async () => {
    happy()

    await notifyFoodosOwner(ORDER_ID, "status:pending")

    expect(sendPushToUser).toHaveBeenCalledTimes(1)
    const [userId, payload] = vi.mocked(sendPushToUser).mock.calls[0]!
    expect(userId).toBe(OWNER_ID)
    expect((payload as { tag: string }).tag).toBe(`foodos-order-${ORDER_ID}`)
    expect((payload as { url: string }).url).toBe(`/panel/foodos/pedidos/${ORDER_ID}`)
  })

  it("sin suscripción ni VAPID el push queda failed, no sent: así se reintenta cuando existan las claves", async () => {
    vi.mocked(sendPushToUser).mockResolvedValue({ sent: 0, removed: 0 } as never)
    const { recorded } = happy()

    const outcome = await notifyFoodosOwner(ORDER_ID, "status:pending")

    expect(outcome.push).toBe("failed")
    // El claim del push queda `failed`, que es lo que el índice parcial
    // (WHERE status <> 'failed') necesita para no bloquear el reintento.
    const updates = recorded.foodos_order_notifications!.updates
    expect(updates.some((u) => (u as { status: string }).status === "failed")).toBe(true)
    expect(updates.some((u) => (u as { error: string }).error === "sin_dispositivo_o_sin_vapid")).toBe(true)
  })
})

describe("notifyFoodosOwner · correo", () => {
  it("manda el correo al dueño y cierra el claim como sent", async () => {
    happy()

    const outcome = await notifyFoodosOwner(ORDER_ID, "status:pending")

    expect(outcome.email).toBe("sent")
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(sendEmail).mock.calls[0]?.[0] as {
      to: string
      subject: string
      html: string
      tag: string
    }
    expect(payload.to).toBe(OWNER_EMAIL)
    expect(payload.tag).toBe("foodos_owner_order")
    expect(payload.subject).toContain("Pedido nuevo")
    expect(payload.subject).toContain("#ABCDEF")
    expect(payload.subject).toContain("Taquería El Sol")
    expect(payload.html).toContain("$250.00 MXN")
    expect(payload.html).toContain("Ana")
    expect(payload.html).toContain(`/panel/foodos/pedidos/${ORDER_ID}`)
  })

  it("sin RESEND_API_KEY el envío falla y se reporta failed, nunca sent", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: false, error: "sin_api_key" } as never)
    const { recorded } = happy()

    const outcome = await notifyFoodosOwner(ORDER_ID, "status:pending")

    expect(outcome.email).toBe("failed")
    expect(
      recorded.foodos_order_notifications!.updates.some(
        (u) => (u as { error: string }).error === "sin_api_key"
      )
    ).toBe(true)
  })

  it("sin correo de dueño no intenta enviar", async () => {
    setup(
      {
        foodos_orders: { select: { data: ORDER } },
        foodos_restaurants: { select: { data: RESTAURANT } },
        foodos_order_notifications: { insert: { data: { id: 7 } } },
      },
      { email: null }
    )

    const outcome = await notifyFoodosOwner(ORDER_ID, "status:pending")

    expect(outcome.email).toBe("failed")
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe("notifyFoodosOwner · deduplicación e idempotencia", () => {
  it("un claim ya tomado deja ese canal en skipped sin afectar a los demás", async () => {
    const { recorded } = happy({
      foodos_order_notifications: {
        insert: [
          { error: { code: "23505", message: "duplicate key" } }, // bell: ya avisado
          { data: { id: 8 } }, // push
          { data: { id: 9 } }, // email
        ],
      },
    })

    const outcome = await notifyFoodosOwner(ORDER_ID, "status:pending")

    expect(outcome.bell).toBe("skipped")
    expect(notifyUser).not.toHaveBeenCalled()
    expect(outcome.push).toBe("sent")
    expect(outcome.email).toBe("sent")
    expect(recorded.foodos_order_notifications!.inserts).toHaveLength(3)
  })

  it("reclama los tres canales por separado, todos con audiencia owner", async () => {
    const { recorded } = happy()

    await notifyFoodosOwner(ORDER_ID, "status:pending")

    const channels = recorded.foodos_order_notifications!.inserts.map(
      (i) => (i as { channel: string }).channel
    )
    expect(channels).toEqual(["bell", "push", "email"])
    const audiences = new Set(
      recorded.foodos_order_notifications!.inserts.map((i) => (i as { audience: string }).audience)
    )
    expect([...audiences]).toEqual(["owner"])
  })

  it("un error de claim que no sea duplicado NO silencia el aviso", async () => {
    happy({
      foodos_order_notifications: { insert: { error: { code: "42P01", message: "no existe" } } },
    })

    const outcome = await notifyFoodosOwner(ORDER_ID, "status:pending")

    // Sin bitácora (id null) pero con aviso: es la decisión de fail-open que ya
    // toma el canal del comensal, y evita que un fallo de la tabla deje mudo al
    // dueño.
    expect(outcome.bell).toBe("sent")
    expect(notifyUser).toHaveBeenCalledTimes(1)
  })
})

describe("notifyFoodosOwner · casos límite", () => {
  it("un pedido inexistente no avisa a nadie y no lanza", async () => {
    setup({ foodos_orders: { select: { data: null } } })

    const outcome = await notifyFoodosOwner(ORDER_ID, "status:pending")

    expect(outcome).toEqual({ bell: "skipped", push: "skipped", email: "skipped" })
    expect(notifyUser).not.toHaveBeenCalled()
    expect(sendPushToUser).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it("un restaurante sin dueño no avisa a nadie", async () => {
    setup({
      foodos_orders: { select: { data: ORDER } },
      foodos_restaurants: { select: { data: { name: "X", user_id: null } } },
    })

    const outcome = await notifyFoodosOwner(ORDER_ID, "status:pending")

    expect(outcome.bell).toBe("skipped")
    expect(notifyUser).not.toHaveBeenCalled()
  })

  it("un evento desconocido no reclama nada", async () => {
    const { recorded } = happy()

    // @ts-expect-error — se prueba justo el caso de un evento fuera del tipo.
    const outcome = await notifyFoodosOwner(ORDER_ID, "status:inventado")

    expect(outcome).toEqual({ bell: "skipped", push: "skipped", email: "skipped" })
    expect(recorded.foodos_order_notifications).toBeUndefined()
  })

  it("nunca lanza aunque la base entera falle", async () => {
    vi.mocked(createServiceClient).mockRejectedValue(new Error("db caída"))

    await expect(notifyFoodosOwner(ORDER_ID, "status:pending")).resolves.toEqual({
      bell: "skipped",
      push: "skipped",
      email: "skipped",
    })
  })

  it("nunca lanza aunque el transporte de la campana reviente", async () => {
    vi.mocked(notifyUser).mockRejectedValue(new Error("boom"))
    happy()

    const outcome = await notifyFoodosOwner(ORDER_ID, "status:pending")

    expect(outcome.bell).toBe("failed")
    expect(outcome.push).toBe("sent")
  })
})

describe("catálogo de eventos del dueño", () => {
  it("solo incluye eventos que le cambian el trabajo al dueño", () => {
    expect([...FOODOS_OWNER_EVENTS]).toEqual(["status:pending", "payment:proof_pending"])
  })

  it("no incluye los pasos de cocina que el dueño ya sigue en el panel", () => {
    for (const event of ["status:confirmed", "status:preparing", "status:out_for_delivery"]) {
      expect(isFoodosOwnerEvent(event)).toBe(false)
    }
  })

  it("reconoce sus propios eventos", () => {
    expect(isFoodosOwnerEvent("status:pending")).toBe(true)
    expect(isFoodosOwnerEvent("payment:proof_pending")).toBe(true)
  })
})
