import { beforeEach, describe, expect, it, vi } from "vitest"

// El flujo resuelve el perfil por teléfono con el MISMO helper que la
// captura de dirección; aquí se controla por prueba para no arrastrar
// su grafo (productos, perfiles) a esta suite.
const findProfileMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/whatsapp-orders", () => ({
  findProfileByPhone: findProfileMock,
}))

import {
  buildWhatsAppScheduleOptions,
  handleWhatsAppFlowReply,
  parseWhatsAppPaymentChoice,
  parseWhatsAppScheduleChoice,
  startWhatsAppPaymentStep,
} from "@/lib/whatsapp-order-flow"

// ============================================================
// Supabase falso en memoria: aplica eq/is/not/gte/order/limit y los
// UPDATE condicionales sobre las filas, como haría PostgREST.
// ============================================================

type Row = Record<string, unknown>

interface FakeOptions {
  /** Simula la migración 00228 sin aplicar: toda operación sobre orders falla 42703. */
  failFlowColumn?: boolean
}

function createFakeSupabase(rows: Row[], opts: FakeOptions = {}) {
  const state = { rows: rows.map((r) => ({ ...r })) }

  const missingColumnError = () => ({
    data: null,
    error: {
      code: "42703",
      message: "column orders.wa_flow_step does not exist",
    },
  })

  function makeQuery() {
    const filters: ((r: Row) => boolean)[] = []
    let patch: Row | null = null
    let orderCol: string | null = null
    let limitN: number | null = null

    const execute = async () => {
      if (opts.failFlowColumn) return missingColumnError()
      const matched = state.rows.filter((r) => filters.every((f) => f(r)))
      if (patch) {
        for (const r of matched) Object.assign(r, patch)
        return { data: matched.map((r) => ({ id: r.id })), error: null }
      }
      let out = [...matched]
      if (orderCol) {
        out.sort((a, b) => String(b[orderCol as string]).localeCompare(String(a[orderCol as string])))
      }
      if (limitN !== null) out = out.slice(0, limitN)
      return { data: out, error: null }
    }

    const q: Record<string, unknown> = {
      select: () => q,
      update: (p: Row) => {
        patch = p
        return q
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val)
        return q
      },
      is: (col: string, val: unknown) => {
        filters.push((r) => (r[col] ?? null) === val)
        return q
      },
      not: (col: string, op: string, val: unknown) => {
        if (op === "is") filters.push((r) => (r[col] ?? null) !== val)
        if (op === "in") {
          const list = String(val).slice(1, -1).split(",")
          filters.push((r) => !list.includes(String(r[col])))
        }
        return q
      },
      gte: (col: string, val: unknown) => {
        filters.push((r) => String(r[col]) >= String(val))
        return q
      },
      order: (col: string) => {
        orderCol = col
        return q
      },
      limit: (n: number) => {
        limitN = n
        return q
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        execute().then(resolve, reject),
    }
    return q
  }

  return {
    state,
    from: () => makeQuery(),
  }
}

const PHONE = "5216141047021"
const recentIso = () => new Date(Date.now() - 60 * 60 * 1000).toISOString()

function flowOrder(over: Row = {}): Row {
  return {
    id: 501,
    total: 612,
    payment_method: "cash_on_delivery",
    wa_flow_step: "payment",
    customer_phone: PHONE,
    user_id: null,
    status: "pending",
    source: "whatsapp",
    created_at: recentIso(),
    priority: false,
    scheduled_for: null,
    ...over,
  }
}

beforeEach(() => {
  findProfileMock.mockReset()
  findProfileMock.mockResolvedValue({ profile: null, error: null })
})

// ============================================================
// Parsers
// ============================================================

describe("parseWhatsAppPaymentChoice", () => {
  it("acepta el número del menú", () => {
    expect(parseWhatsAppPaymentChoice("1")).toBe("spei")
    expect(parseWhatsAppPaymentChoice(" 2 ")).toBe("cash_on_delivery")
  })

  it("acepta el nombre del método", () => {
    expect(parseWhatsAppPaymentChoice("SPEI")).toBe("spei")
    expect(parseWhatsAppPaymentChoice("por transferencia")).toBe("spei")
    expect(parseWhatsAppPaymentChoice("efectivo")).toBe("cash_on_delivery")
    expect(parseWhatsAppPaymentChoice("contra entrega")).toBe("cash_on_delivery")
  })

  it("reconoce tarjeta como caso propio (para explicarle, no como error)", () => {
    expect(parseWhatsAppPaymentChoice("tarjeta")).toBe("card")
    expect(parseWhatsAppPaymentChoice("con tarjeta")).toBe("card")
  })

  it("lo que no entiende es null, no una elección inventada", () => {
    expect(parseWhatsAppPaymentChoice("hola")).toBeNull()
    expect(parseWhatsAppPaymentChoice("")).toBeNull()
    expect(parseWhatsAppPaymentChoice("3")).toBeNull()
  })
})

describe("buildWhatsAppScheduleOptions", () => {
  it("hoy ofrece la primera ventana que aún no empieza", () => {
    // 2026-11-24 15:00 hora de Chihuahua (UTC-6): la ventana de las
    // 14:00 ya empezó; la primera ofrecible es la de las 16:00.
    const options = buildWhatsAppScheduleOptions(new Date("2026-11-24T15:00:00-06:00"))
    expect(options).toHaveLength(3)
    expect(options[0]?.dayValue).toBe("2026-11-24")
    expect(options[0]?.windowLabel).toBe("4:00 PM — 6:00 PM")
    // El mismo armado que el checkout web: día + hora con -06:00.
    expect(options[0]?.scheduledFor).toBe("2026-11-24T22:00:00.000Z")
    expect(options[1]?.dayValue).toBe("2026-11-25")
    expect(options[1]?.windowLabel).toBe("8:00 AM — 10:00 AM")
  })

  it("si hoy ya no cabe ninguna ventana, hoy no se ofrece", () => {
    const options = buildWhatsAppScheduleOptions(new Date("2026-11-24T19:30:00-06:00"))
    expect(options.map((o) => o.dayValue)).toEqual(["2026-11-25", "2026-11-26", "2026-11-27"])
  })

  it("temprano, hoy entra desde la primera ventana", () => {
    const options = buildWhatsAppScheduleOptions(new Date("2026-11-24T06:30:00-06:00"))
    expect(options[0]?.dayValue).toBe("2026-11-24")
    expect(options[0]?.windowLabel).toBe("8:00 AM — 10:00 AM")
  })
})

describe("parseWhatsAppScheduleChoice", () => {
  const now = new Date("2026-11-24T10:00:00-06:00")
  const options = buildWhatsAppScheduleOptions(now)

  it("acepta el número del menú", () => {
    expect(parseWhatsAppScheduleChoice("1", options, now)?.dayValue).toBe("2026-11-24")
    expect(parseWhatsAppScheduleChoice("2", options, now)?.dayValue).toBe("2026-11-25")
  })

  it("acepta hoy y mañana por nombre", () => {
    expect(parseWhatsAppScheduleChoice("hoy", options, now)?.dayValue).toBe("2026-11-24")
    expect(parseWhatsAppScheduleChoice("mañana", options, now)?.dayValue).toBe("2026-11-25")
    expect(parseWhatsAppScheduleChoice("manana", options, now)?.dayValue).toBe("2026-11-25")
  })

  it("fuera del menú no elige nada", () => {
    expect(parseWhatsAppScheduleChoice("9", options, now)).toBeNull()
    expect(parseWhatsAppScheduleChoice("el viernes", options, now)).toBeNull()
  })

  it("si hoy no se ofreció, 'hoy' no elige el día equivocado", () => {
    const late = new Date("2026-11-24T19:30:00-06:00")
    const lateOptions = buildWhatsAppScheduleOptions(late)
    expect(parseWhatsAppScheduleChoice("hoy", lateOptions, late)).toBeNull()
    expect(parseWhatsAppScheduleChoice("mañana", lateOptions, late)?.dayValue).toBe("2026-11-25")
  })
})

// ============================================================
// Máquina de estados
// ============================================================

describe("handleWhatsAppFlowReply — paso de pago", () => {
  it("SPEI: guarda el método, deriva la prioridad y avanza al horario", async () => {
    const fake = createFakeSupabase([flowOrder()])
    const result = await handleWhatsAppFlowReply(fake as never, { from: PHONE, text: "1" })

    expect(result.kind).toBe("payment_chosen")
    if (result.kind === "payment_chosen") {
      expect(result.method).toBe("spei")
      expect(result.orderId).toBe(501)
      expect(result.scheduleOptions.length).toBeGreaterThan(0)
    }
    const row = fake.state.rows[0]
    expect(row?.payment_method).toBe("spei")
    expect(row?.priority).toBe(true)
    expect(row?.wa_flow_step).toBe("schedule")
  })

  it("efectivo: queda contra entrega, sin prioridad", async () => {
    const fake = createFakeSupabase([flowOrder()])
    const result = await handleWhatsAppFlowReply(fake as never, { from: PHONE, text: "efectivo" })

    expect(result.kind).toBe("payment_chosen")
    const row = fake.state.rows[0]
    expect(row?.payment_method).toBe("cash_on_delivery")
    expect(row?.priority).toBe(false)
    expect(row?.wa_flow_step).toBe("schedule")
  })

  it("tarjeta: se explica y el paso NO avanza", async () => {
    const fake = createFakeSupabase([flowOrder()])
    const result = await handleWhatsAppFlowReply(fake as never, { from: PHONE, text: "tarjeta" })

    expect(result.kind).toBe("card_unavailable")
    expect(fake.state.rows[0]?.wa_flow_step).toBe("payment")
    expect(fake.state.rows[0]?.payment_method).toBe("cash_on_delivery")
  })

  it("respuesta ininteligible: repite la pregunta sin tocar el pedido", async () => {
    const fake = createFakeSupabase([flowOrder()])
    const result = await handleWhatsAppFlowReply(fake as never, { from: PHONE, text: "cuánto debo" })

    expect(result.kind).toBe("reprompt")
    expect(fake.state.rows[0]?.wa_flow_step).toBe("payment")
  })

  it("sin pedido en flujo, el mensaje no es del flujo", async () => {
    const fake = createFakeSupabase([flowOrder({ wa_flow_step: null })])
    const result = await handleWhatsAppFlowReply(fake as never, { from: PHONE, text: "1" })
    expect(result.kind).toBe("none")
  })

  it("con DOS pedidos en flujo no adivina: no actúa", async () => {
    const fake = createFakeSupabase([flowOrder(), flowOrder({ id: 502 })])
    const result = await handleWhatsAppFlowReply(fake as never, { from: PHONE, text: "1" })
    expect(result.kind).toBe("none")
  })

  it("el pedido de otro teléfono no se toca", async () => {
    const fake = createFakeSupabase([flowOrder({ customer_phone: "5219998887776" })])
    const result = await handleWhatsAppFlowReply(fake as never, { from: PHONE, text: "1" })
    expect(result.kind).toBe("none")
  })

  it("también encuentra el pedido por el perfil del teléfono", async () => {
    findProfileMock.mockResolvedValue({ profile: { id: "user-9" }, error: null })
    const fake = createFakeSupabase([
      flowOrder({ customer_phone: null, user_id: "user-9" }),
    ])
    const result = await handleWhatsAppFlowReply(fake as never, { from: PHONE, text: "2" })
    expect(result.kind).toBe("payment_chosen")
  })
})

describe("handleWhatsAppFlowReply — paso de horario", () => {
  it("guarda scheduled_for y cierra la conversación", async () => {
    const fake = createFakeSupabase([
      flowOrder({ wa_flow_step: "schedule", payment_method: "spei", priority: true }),
    ])
    const result = await handleWhatsAppFlowReply(fake as never, { from: PHONE, text: "1" })

    expect(result.kind).toBe("schedule_chosen")
    if (result.kind === "schedule_chosen") {
      expect(result.method).toBe("spei")
      expect(result.dayLabel.length).toBeGreaterThan(0)
    }
    const row = fake.state.rows[0]
    // El instante guardado es una de las opciones ofrecidas (la #1).
    const offered = buildWhatsAppScheduleOptions().map((o) => o.scheduledFor)
    expect(offered).toContain(row?.scheduled_for)
    expect(row?.wa_flow_step).toBeNull()
  })

  it("número fuera del menú: repite la pregunta de horario", async () => {
    const fake = createFakeSupabase([flowOrder({ wa_flow_step: "schedule" })])
    const result = await handleWhatsAppFlowReply(fake as never, { from: PHONE, text: "9" })
    expect(result.kind).toBe("reprompt")
    if (result.kind === "reprompt") expect(result.step).toBe("schedule")
    expect(fake.state.rows[0]?.scheduled_for).toBeNull()
  })
})

describe("degradación sin la migración 00228", () => {
  it("startWhatsAppPaymentStep devuelve false si la columna no existe", async () => {
    const fake = createFakeSupabase([flowOrder({ wa_flow_step: null })], { failFlowColumn: true })
    await expect(startWhatsAppPaymentStep(fake as never, 501)).resolves.toBe(false)
  })

  it("el flujo no encuentra pedidos y el webhook sigue su routing normal", async () => {
    const fake = createFakeSupabase([flowOrder()], { failFlowColumn: true })
    const result = await handleWhatsAppFlowReply(fake as never, { from: PHONE, text: "1" })
    expect(result.kind).toBe("none")
  })

  it("con la columna presente, el paso sí se abre", async () => {
    const fake = createFakeSupabase([flowOrder({ wa_flow_step: null })])
    await expect(startWhatsAppPaymentStep(fake as never, 501)).resolves.toBe(true)
    expect(fake.state.rows[0]?.wa_flow_step).toBe("payment")
  })
})
