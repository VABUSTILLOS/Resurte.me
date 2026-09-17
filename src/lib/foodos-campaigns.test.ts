import { describe, expect, it, vi } from "vitest"

// El módulo foodos-campaigns importa el service client (que usa
// next/headers) y el cliente de WhatsApp. Los mockeamos para poder
// testear funciones puras en node.
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}))
vi.mock("@/lib/whatsapp", () => ({
  sendTextMessage: vi.fn().mockResolvedValue({ ok: true }),
}))
// El motor ya no habla con WhatsApp directo: enruta por `sendMarketingMessage`,
// que decide entre WhatsApp y SMS. Se mockea el enrutador completo.
vi.mock("@/lib/messaging/send", () => ({
  loadMessagingCapabilities: vi.fn(),
  sendMarketingMessage: vi.fn(),
}))

import { afterEach, beforeEach } from "vitest"

import {
  renderMessage,
  fetchTargetCustomers,
  effectiveAudience,
  runFoodosCampaign,
} from "@/lib/foodos-campaigns"
import { createServiceClient } from "@/lib/supabase/service"
import { loadMessagingCapabilities, sendMarketingMessage } from "@/lib/messaging/send"
import { pickVariant } from "@/lib/messaging/channel"
import { segmentCustomer } from "@/lib/foodos"
import type {
  FoodosAutomation,
  FoodosCustomer,
  FoodosRestaurant,
} from "@/types/foodos"

const restaurant: FoodosRestaurant = {
  id: "r1",
  user_id: "u1",
  name: "Taquería El Fuego",
  slug: "el-fuego",
  status: "active",
} as FoodosRestaurant

const customer: FoodosCustomer = {
  id: "c1",
  restaurant_id: "r1",
  name: "María López",
  phone: "+525512345678",
  total_orders: 3,
  total_spend: 850,
  last_order_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  segment: "recurrente",
} as FoodosCustomer

function automation(overrides: Partial<FoodosAutomation> = {}): FoodosAutomation {
  return {
    id: "a1",
    restaurant_id: "r1",
    name: "Gracias",
    type: "thank_you",
    is_active: true,
    trigger_config: {},
    incentive_config: null,
    ...overrides,
  } as FoodosAutomation
}

describe("segmentCustomer", () => {
  it("clasifica sin pedidos como nuevo", () => {
    expect(segmentCustomer({ total_orders: 0, total_spend: 0, last_order_at: null })).toBe("nuevo")
  })

  it("clasifica inactivo si pasaron más de 30 días", () => {
    const c = {
      total_orders: 1,
      total_spend: 100,
      last_order_at: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    }
    expect(segmentCustomer(c)).toBe("inactivo")
  })

  it("clasifica VIP por spend alto", () => {
    const c = {
      total_orders: 1,
      total_spend: 6000,
      last_order_at: new Date().toISOString(),
    }
    expect(segmentCustomer(c)).toBe("vip")
  })

  it("clasifica recurrente con >=2 pedidos", () => {
    const c = {
      total_orders: 2,
      total_spend: 300,
      last_order_at: new Date().toISOString(),
    }
    expect(segmentCustomer(c)).toBe("recurrente")
  })
})

describe("renderMessage", () => {
  it("sustituye placeholders con datos del cliente y restaurante", () => {
    const ctx = { customer, restaurant, automation: automation() }
    const out = renderMessage(
      "Hola {nombre}, gracias por pedir en {restaurante}: {link}",
      ctx
    )
    expect(out).toContain("María López")
    expect(out).toContain("Taquería El Fuego")
    expect(out).toContain("/r/el-fuego")
  })

  it("usa 'amig@' si no hay nombre", () => {
    const ctx = { customer: { ...customer, name: null }, restaurant, automation: automation() }
    expect(renderMessage("Hola {nombre}", ctx)).toBe("Hola amig@")
  })

  it("inserta descuento y código de incentivo cuando existen", () => {
    const a = automation({
      incentive_config: { discount_pct: 15, promo_code: "FUEGO15" },
    })
    const ctx = { customer, restaurant, automation: a }
    const out = renderMessage("{descuento} {codigo}", ctx)
    expect(out).toBe("15% FUEGO15")
  })
})

describe("fetchTargetCustomers", () => {
  // Builder de query encadenable con la API mínima que usa el motor.
  // Acumula predicados y resuelve `{ data }` al hacer `await`, como
  // el cliente real de Supabase.
  function mockQuery(data: FoodosCustomer[]) {
    const preds: ((c: FoodosCustomer) => boolean)[] = []
    const apply = (c: FoodosCustomer) => preds.every((p) => p(c))
    const get = (c: FoodosCustomer, col: string): unknown =>
      (c as unknown as Record<string, unknown>)[col]
    const q: Record<string, unknown> = {
      eq: (col: string, val: unknown) => {
        preds.push((c) => get(c, col) === val)
        return self
      },
      not: (col: string, op: string, val: unknown) => {
        if (op === "is" && val === null) {
          preds.push((c) => get(c, col) != null)
        }
        return self
      },
      lt: (col: string, val: unknown) => {
        preds.push((c) => (get(c, col) as number | string) < (val as number | string))
        return self
      },
      then: (resolve: (rows: { data: FoodosCustomer[] }) => unknown) =>
        Promise.resolve(resolve({ data: data.filter(apply) })),
    }
    // `self` permite que las llamadas encadenadas (eq/not/lt) devuelvan
    // un objeto que sigue siendo thenable al hacer `await`.
    const self = q as typeof q & PromiseLike<{ data: FoodosCustomer[] }>
    return self
  }

  const supabase = {
    from: () => ({
      select: () => mockQuery([customer, { ...customer, id: "c2", segment: "vip" } as FoodosCustomer]),
    }),
  } as unknown as Parameters<typeof fetchTargetCustomers>[0]

  it("sin target_segment devuelve todos los clientes del restaurante", async () => {
    const rows = await fetchTargetCustomers(supabase, automation(), "r1")
    expect(rows.length).toBe(2)
  })

  it("filtra por target_segment en SQL", async () => {
    const rows = await fetchTargetCustomers(
      supabase,
      automation({ trigger_config: { target_segment: "vip" } }),
      "r1"
    )
    expect(rows.length).toBe(1)
    expect(rows[0]!.segment).toBe("vip")
  })

  it("winback filtra por antigüedad de last_order_at", async () => {
    const old = {
      ...customer,
      id: "c2",
      last_order_at: new Date(Date.now() - 45 * 86_400_000).toISOString(),
    } as FoodosCustomer
    const winbackSupabase = {
      from: () => ({ select: () => mockQuery([customer, old]) }),
    } as unknown as Parameters<typeof fetchTargetCustomers>[0]
    const rows = await fetchTargetCustomers(
      winbackSupabase,
      automation({ type: "winback", trigger_config: { days_without_order: 30 } }),
      "r1"
    )
    expect(rows.map((r) => r.id)).toEqual(["c2"])
  })
})

// ------------------------------------------------------------
// Cliente falso: suficiente para el motor, sin red ni Supabase.
// ------------------------------------------------------------

type Row = Record<string, unknown>

type Filter =
  | { kind: "eq"; col: string; val: unknown }
  | { kind: "neq"; col: string; val: unknown }
  | { kind: "notNull"; col: string }
  | { kind: "in"; col: string; vals: unknown[] }
  | { kind: "gte"; col: string; val: string }
  | { kind: "lt"; col: string; val: string }

interface FakeRecorder {
  updates: { table: string; values: Row }[]
  inserts: { table: string; rows: Row[] }[]
}

function recorder(): FakeRecorder {
  return { updates: [], inserts: [] }
}

function makeFakeClient(
  tables: Record<string, Row[]>,
  rec: FakeRecorder,
  failing: readonly string[] = []
) {
  const matches = (row: Row, filters: Filter[]) =>
    filters.every((f) => {
      if (f.kind === "eq") return row[f.col] === f.val
      if (f.kind === "neq") return row[f.col] !== f.val
      if (f.kind === "notNull") return row[f.col] != null
      if (f.kind === "in") return f.vals.includes(row[f.col])
      const actual = String(row[f.col] ?? "")
      if (f.kind === "gte") return actual >= f.val
      return actual < f.val
    })

  function builder(table: string) {
    const filters: Filter[] = []
    let mode: "select" | "update" | "insert" = "select"
    let payload: Row | Row[] | undefined

    const api: Record<string, unknown> = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters.push({ kind: "eq", col, val })
        return api
      },
      neq: (col: string, val: unknown) => {
        filters.push({ kind: "neq", col, val })
        return api
      },
      gte: (col: string, val: string) => {
        filters.push({ kind: "gte", col, val })
        return api
      },
      lt: (col: string, val: string) => {
        filters.push({ kind: "lt", col, val })
        return api
      },
      not: (col: string, _op: string, val: unknown) => {
        if (val === null) filters.push({ kind: "notNull", col })
        return api
      },
      in: (col: string, vals: unknown[]) => {
        filters.push({ kind: "in", col, vals })
        return api
      },
      maybeSingle: async () => ({
        data: (tables[table] ?? []).find((r) => matches(r, filters)) ?? null,
        error: null,
      }),
      update: (values: Row) => {
        mode = "update"
        payload = values
        return api
      },
      insert: (values: Row | Row[]) => {
        mode = "insert"
        payload = values
        return api
      },
      then: (resolve: (value: unknown) => unknown) => {
        if (failing.includes(table)) {
          return Promise.resolve(
            resolve({ data: null, error: { message: `${table} caída` } })
          )
        }
        if (mode === "select") {
          const data = (tables[table] ?? []).filter((r) => matches(r, filters))
          return Promise.resolve(resolve({ data, error: null }))
        }
        if (mode === "update") rec.updates.push({ table, values: payload as Row })
        else
          rec.inserts.push({
            table,
            rows: (Array.isArray(payload) ? payload : [payload]) as Row[],
          })
        return Promise.resolve(resolve({ data: null, error: null }))
      },
    }
    return api
  }

  return { from: (table: string) => builder(table) } as unknown as Awaited<
    ReturnType<typeof createServiceClient>
  >
}

function mkCustomer(id: string, over: Partial<FoodosCustomer> = {}): Row {
  return { ...customer, id, ...over } as unknown as Row
}

beforeEach(() => {
  vi.mocked(createServiceClient).mockReset()
  vi.mocked(loadMessagingCapabilities).mockReset()
  vi.mocked(loadMessagingCapabilities).mockResolvedValue({
    whatsapp: true,
    sms: false,
    waConfig: null,
  })
  vi.mocked(sendMarketingMessage).mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("fetchTargetCustomers · cumpleaños", () => {
  const rows = [
    mkCustomer("c1", { birthday: "1990-03-15" }),
    mkCustomer("c2", { birthday: "1990-03-16" }),
    mkCustomer("c3", { birthday: null }),
  ]
  const fake = makeFakeClient({ foodos_customers: rows }, recorder())

  it("solo devuelve a quien cumple años hoy", async () => {
    const out = await fetchTargetCustomers(fake, automation({ type: "birthday" }), "r1", {
      timezone: "America/Mexico_City",
      now: new Date("2026-03-15T18:00:00Z"),
    })
    expect(out.map((c) => c.id)).toEqual(["c1"])
  })

  it("usa la fecha local del restaurante, no la UTC", async () => {
    // 03:00 UTC del 16 ya es la noche del 15 en CDMX.
    const out = await fetchTargetCustomers(fake, automation({ type: "birthday" }), "r1", {
      timezone: "America/Mexico_City",
      now: new Date("2026-03-16T03:00:00Z"),
    })
    expect(out.map((c) => c.id)).toEqual(["c1"])
  })
})

describe("fetchTargetCustomers · carrito abandonado", () => {
  const now = new Date("2026-03-15T18:00:00Z")
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
  const longAgo = new Date(now.getTime() - 10 * 86_400_000).toISOString()
  const tables: Record<string, Row[]> = {
    foodos_orders: [
      { restaurant_id: "r1", customer_id: "c1", created_at: hoursAgo(3), total: 200, payment_status: "pending", status: "pending" },
      { restaurant_id: "r1", customer_id: "c2", created_at: hoursAgo(1), total: 150, payment_status: "pending", status: "pending" },
    ],
    // Ambos compraron antes de abandonar: si no, se descartan.
    foodos_customers: [
      mkCustomer("c1", { last_order_at: longAgo }),
      mkCustomer("c2", { last_order_at: longAgo }),
    ],
  }

  it("solo incluye el checkout abandonado más antiguo que la ventana", async () => {
    const out = await fetchTargetCustomers(
      makeFakeClient(tables, recorder()),
      automation({ type: "abandoned_cart", trigger_config: { hours_after: 2 } }),
      "r1",
      { now }
    )
    expect(out.map((c) => c.id)).toEqual(["c1"])
  })

  it("sin horas configuradas asume 2", async () => {
    const out = await fetchTargetCustomers(
      makeFakeClient(tables, recorder()),
      automation({ type: "abandoned_cart" }),
      "r1",
      { now }
    )
    expect(out.map((c) => c.id)).toEqual(["c1"])
  })
})

describe("fetchTargetCustomers · petición de reseña", () => {
  const now = new Date("2026-03-15T18:00:00Z")
  const delivered = new Date(now.getTime() - 12 * 3_600_000).toISOString()
  const tables: Record<string, Row[]> = {
    foodos_orders: [
      { id: "o1", restaurant_id: "r1", customer_id: "c1", created_at: delivered, status: "delivered" },
      { id: "o2", restaurant_id: "r1", customer_id: "c2", created_at: delivered, status: "delivered" },
      { id: "o3", restaurant_id: "r1", customer_id: "c3", created_at: delivered, status: "delivered" },
    ],
    foodos_reviews: [{ restaurant_id: "r1", order_id: "o2" }],
    foodos_customers: [mkCustomer("c1"), mkCustomer("c2"), mkCustomer("c3")],
  }

  it("excluye a quien ya reseñó y no repite clientes", async () => {
    const out = await fetchTargetCustomers(
      makeFakeClient(tables, recorder()),
      automation({ type: "review_request" }),
      "r1",
      { now }
    )
    expect(out.map((c) => c.id)).toEqual(["c1", "c3"])
  })
})

describe("audiencia RFM", () => {
  const now = new Date("2026-03-15T18:00:00Z")
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()
  const tables: Record<string, Row[]> = {
    foodos_customers: [
      mkCustomer("a", { last_order_at: daysAgo(1), total_orders: 10, total_spend: 1000, segment: "vip" }),
      mkCustomer("b", { last_order_at: daysAgo(2), total_orders: 8, total_spend: 800, segment: "vip" }),
      mkCustomer("c", { last_order_at: daysAgo(30), total_orders: 2, total_spend: 100, segment: "recurrente" }),
      mkCustomer("d", { last_order_at: daysAgo(60), total_orders: 1, total_spend: 50, segment: "inactivo" }),
    ],
  }

  it("gana sobre target_segment", async () => {
    const out = await fetchTargetCustomers(
      makeFakeClient(tables, recorder()),
      automation({ audience: "champions", trigger_config: { target_segment: "inactivo" } }),
      "r1",
      { now }
    )
    expect(out.map((c) => c.id)).toEqual(["a", "b"])
  })

  it("effectiveAudience traduce el segmento simple y valida la audiencia", () => {
    expect(effectiveAudience(automation({ audience: "champions" }))).toBe("champions")
    expect(
      effectiveAudience(automation({ trigger_config: { target_segment: "inactivo" } }))
    ).toBe("at_risk")
    expect(effectiveAudience(automation({ audience: "inventada" }))).toBeNull()
  })
})

describe("runFoodosCampaign", () => {
  const isoDays = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()

  const cohort: Row[] = [
    mkCustomer("a", { last_order_at: isoDays(1), total_orders: 10, total_spend: 1000, phone: "+525511111111" }),
    mkCustomer("b", { last_order_at: isoDays(2), total_orders: 8, total_spend: 800, phone: "+525522222222" }),
    mkCustomer("c", { last_order_at: isoDays(30), total_orders: 2, total_spend: 100, phone: "+525533333333" }),
    mkCustomer("d", { last_order_at: isoDays(60), total_orders: 1, total_spend: 50, phone: "+525544444444" }),
  ]

  const AUTOMATION: Row = {
    id: "a1",
    restaurant_id: "r1",
    type: "season_promo",
    name: "Promo de temporada",
    is_active: true,
    trigger_config: {},
    incentive_config: null,
    message: "Hola {nombre}, A {link}",
    message_b: "Hola {nombre}, B {link}",
    ab_test: true,
    audience: "champions",
    channel: "whatsapp",
  }

  function scenario(
    over: {
      campaign?: Row
      automation?: Row
      restaurant?: Row
      customers?: Row[]
      platformSends?: Row[]
    } = {}
  ) {
    const rec = recorder()
    const tables: Record<string, Row[]> = {
      foodos_campaigns: [
        {
          id: "camp1",
          restaurant_id: "r1",
          automation_id: "a1",
          customer_id: null,
          status: "scheduled",
          scheduled_for: null,
          ...over.campaign,
        },
      ],
      foodos_restaurants: [
        over.restaurant ?? {
          id: "r1",
          name: "Taquería El Fuego",
          slug: "el-fuego",
          status: "active",
          timezone: "America/Mexico_City",
        },
      ],
      foodos_automations: [over.automation ?? AUTOMATION],
      foodos_customers: over.customers ?? cohort,
      whatsapp_automation_sends: over.platformSends ?? [],
    }
    vi.mocked(createServiceClient).mockResolvedValue(makeFakeClient(tables, rec))
    return rec
  }

  it("envía a la audiencia, aplica A/B y omite lo que no tiene canal", async () => {
    const rec = scenario()
    vi.mocked(sendMarketingMessage)
      .mockResolvedValueOnce({ ok: true, channel: "whatsapp", provider: "whatsapp", reason: "ok", error: null })
      .mockResolvedValueOnce({ ok: false, channel: null, provider: null, reason: "whatsapp_unavailable", error: null })

    const result = await runFoodosCampaign("camp1")
    expect(result).toEqual({ campaignId: "camp1", sent: 1, failed: 0, skipped: 1 , skippedByPlatform: 0 })

    const payloads = vi.mocked(sendMarketingMessage).mock.calls.map(([p]) => p)
    expect(payloads.map((p) => p.to)).toEqual(["525511111111", "525522222222"])
    // El brazo A/B es determinista: se calcula por hash del cliente.
    expect(payloads[0]?.text).toContain(pickVariant("a", true) === "b" ? ", B " : ", A ")
    expect(payloads[1]?.text).toContain(pickVariant("b", true) === "b" ? ", B " : ", A ")

    const children = rec.inserts.find((i) => i.table === "foodos_campaigns")?.rows ?? []
    expect(children).toHaveLength(1)
    expect(children[0]).toMatchObject({
      customer_id: "a",
      status: "sent",
      audience: "champions",
      provider: "whatsapp",
    })
    expect(rec.updates.at(-1)?.values).toMatchObject({
      status: "sent",
      error: null,
      audience: "champions",
    })
  })

  it("marca la campaña como fallida si ningún objetivo tiene canal", async () => {
    const rec = scenario()
    vi.mocked(loadMessagingCapabilities).mockResolvedValue({ whatsapp: false, sms: false, waConfig: null })
    vi.mocked(sendMarketingMessage).mockResolvedValue({
      ok: false,
      channel: null,
      provider: null,
      reason: "whatsapp_unavailable",
      error: null,
    })

    const result = await runFoodosCampaign("camp1")
    expect(result).toEqual({ campaignId: "camp1", sent: 0, failed: 0, skipped: 2 , skippedByPlatform: 0 })
    expect(rec.inserts.find((i) => i.table === "foodos_campaigns")).toBeUndefined()
    expect(rec.updates.at(-1)?.values).toMatchObject({
      status: "failed",
      error: "Sin canal disponible para los clientes objetivo",
    })
  })

  it("distingue 'sin objetivos' de 'sin canal'", async () => {
    const rec = scenario({ automation: { ...AUTOMATION, audience: "hibernating" } })
    const result = await runFoodosCampaign("camp1")
    expect(result).toEqual({ campaignId: "camp1", sent: 0, failed: 0, skipped: 0 , skippedByPlatform: 0 })
    expect(rec.updates.at(-1)?.values).toMatchObject({
      status: "failed",
      error: "Sin clientes objetivo para esta automatización",
    })
  })

  it("cuenta como fallido el error del proveedor y lo guarda en el hijo", async () => {
    const rec = scenario()
    vi.mocked(sendMarketingMessage).mockResolvedValue({
      ok: false,
      channel: "whatsapp",
      provider: "whatsapp",
      reason: "ok",
      error: "proveedor 500",
    })

    const result = await runFoodosCampaign("camp1")
    expect(result).toEqual({ campaignId: "camp1", sent: 0, failed: 2, skipped: 0 , skippedByPlatform: 0 })
    const children = rec.inserts.find((i) => i.table === "foodos_campaigns")?.rows ?? []
    expect(children).toHaveLength(2)
    expect(children[0]).toMatchObject({ status: "failed", error: "proveedor 500" })
    expect(rec.updates.at(-1)?.values).toMatchObject({
      status: "failed",
      error: "2 envío(s) fallidos de 2",
    })
  })

  it("no envía si el restaurante no está activo", async () => {
    const rec = scenario({
      restaurant: { id: "r1", name: "X", slug: "x", status: "paused", timezone: null },
    })
    const result = await runFoodosCampaign("camp1")
    expect(result).toEqual({ campaignId: "camp1", sent: 0, failed: 0, skipped: 1 , skippedByPlatform: 0 })
    expect(sendMarketingMessage).not.toHaveBeenCalled()
    expect(rec.updates.at(-1)?.values).toMatchObject({
      status: "failed",
      error: "Restaurante inactivo (paused)",
    })
  })

  it("ignora una campaña que ya no está programada", async () => {
    const rec = scenario({ campaign: { status: "sent" } })
    const result = await runFoodosCampaign("camp1")
    expect(result).toEqual({ campaignId: "camp1", sent: 0, failed: 0, skipped: 0 , skippedByPlatform: 0 })
    expect(rec.updates).toHaveLength(0)
    expect(sendMarketingMessage).not.toHaveBeenCalled()
  })

  it("una campaña hija actualiza su fila en vez de insertar", async () => {
    const rec = scenario({ campaign: { customer_id: "a" } })
    vi.mocked(sendMarketingMessage).mockResolvedValue({
      ok: true,
      channel: "whatsapp",
      provider: "whatsapp",
      reason: "ok",
      error: null,
    })

    const result = await runFoodosCampaign("camp1")
    expect(result).toEqual({ campaignId: "camp1", sent: 1, failed: 0, skipped: 0 , skippedByPlatform: 0 })
    expect(rec.inserts.find((i) => i.table === "foodos_campaigns")).toBeUndefined()
    expect(sendMarketingMessage).toHaveBeenCalledTimes(1)
  })

  it("respeta el canal preferido y el opt-in de SMS del cliente", async () => {
    scenario({
      automation: { ...AUTOMATION, audience: null, channel: "sms" },
      customers: [
        { ...mkCustomer("a", { last_order_at: isoDays(1), total_orders: 10, total_spend: 1000 }), sms_opt_in: true },
      ],
    })
    vi.mocked(sendMarketingMessage).mockResolvedValue({
      ok: true,
      channel: "sms",
      provider: "twilio",
      reason: "ok",
      error: null,
    })

    await runFoodosCampaign("camp1")
    const payloads = vi.mocked(sendMarketingMessage).mock.calls.map(([p]) => p)
    expect(payloads[0]).toMatchObject({ preferred: "sms", smsOptIn: true })
  })

  // Fase 9: el dedupe entre los dos motores de mensajería.
  it("omite a quien la plataforma ya contactó hoy con la misma intención", async () => {
    const winback = { ...AUTOMATION, type: "winback", channel: "whatsapp" }
    vi.mocked(sendMarketingMessage).mockResolvedValue({
      ok: true,
      channel: "whatsapp",
      provider: "whatsapp",
      reason: "ok",
      error: null,
    })

    scenario({ automation: winback })
    const base = await runFoodosCampaign("camp1")
    const basePhones = vi.mocked(sendMarketingMessage).mock.calls.map(([p]) => p.to)
    expect(basePhones.length).toBeGreaterThan(1)
    expect(base.skippedByPlatform).toBe(0)

    // El destinatario de la plataforma es el mismo número con formato humano
    // (espacios y el + del país): la identidad debe reconocerlo igual.
    const victim = basePhones[0]!
    const formatted = `+${victim.slice(0, 2)} ${victim.slice(2, 4)} ${victim.slice(4, 8)} ${victim.slice(8)}`
    vi.mocked(sendMarketingMessage).mockClear()
    scenario({
      automation: winback,
      platformSends: [
        {
          automation_type: "reactivation",
          recipient: formatted,
          created_at: new Date().toISOString(),
        },
      ],
    })

    const result = await runFoodosCampaign("camp1")
    expect(result.skippedByPlatform).toBe(1)
    expect(result.sent).toBe(base.sent - 1)
    const phones = vi.mocked(sendMarketingMessage).mock.calls.map(([p]) => p.to)
    expect(phones).not.toContain(victim)
  })

  it("no aplica el dedupe a las intenciones que solo tiene el restaurante", async () => {
    // `season_promo` no existe en la plataforma: un envío de otro tipo hoy
    // no debe silenciar la promoción del restaurante.
    scenario({
      platformSends: [
        {
          automation_type: "reactivation",
          recipient: "+525511111111",
          created_at: new Date().toISOString(),
        },
      ],
    })
    vi.mocked(sendMarketingMessage).mockResolvedValue({
      ok: true,
      channel: "whatsapp",
      provider: "whatsapp",
      reason: "ok",
      error: null,
    })

    const result = await runFoodosCampaign("camp1")
    expect(result.skippedByPlatform).toBe(0)
  })

  it("un envío de la plataforma de ayer no bloquea el de hoy", async () => {
    const yesterday = new Date(Date.now() - 30 * 3_600_000).toISOString()
    scenario({
      automation: { ...AUTOMATION, type: "winback" },
      platformSends: [
        {
          automation_type: "reactivation",
          recipient: "+525511111111",
          created_at: yesterday,
        },
      ],
    })
    vi.mocked(sendMarketingMessage).mockResolvedValue({
      ok: true,
      channel: "whatsapp",
      provider: "whatsapp",
      reason: "ok",
      error: null,
    })

    const result = await runFoodosCampaign("camp1")
    expect(result.skippedByPlatform).toBe(0)
  })

  it("si la bitácora de la plataforma no responde, la campaña sale igual", async () => {
    const rec = recorder()
    vi.mocked(createServiceClient).mockResolvedValue(
      makeFakeClient(
        {
          foodos_campaigns: [
            {
              id: "camp1",
              restaurant_id: "r1",
              automation_id: "a1",
              customer_id: null,
              status: "scheduled",
              scheduled_for: null,
            },
          ],
          foodos_restaurants: [
            {
              id: "r1",
              name: "Taquería El Fuego",
              slug: "el-fuego",
              status: "active",
              timezone: "America/Mexico_City",
            },
          ],
          foodos_automations: [{ ...AUTOMATION, type: "winback" }],
          foodos_customers: cohort,
        },
        rec,
        ["whatsapp_automation_sends"]
      )
    )
    vi.mocked(sendMarketingMessage).mockResolvedValue({
      ok: true,
      channel: "whatsapp",
      provider: "whatsapp",
      reason: "ok",
      error: null,
    })

    const result = await runFoodosCampaign("camp1")
    expect(result.skippedByPlatform).toBe(0)
    expect(result.sent).toBeGreaterThan(0)
  })
})
