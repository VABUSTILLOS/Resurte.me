import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  AUDIENCE_PLAYBOOK,
  FOODOS_AUDIENCE_KEYS,
  SEGMENT_TO_AUDIENCE,
  audienceForScore,
  audienceMembers,
  birthdayMonth,
  buildAudiences,
  filterAbandonedCarts,
  isAudienceKey,
  isBirthdayToday,
  localDateParts,
  scoreCustomers,
} from "@/lib/foodos-rfm"
import type { FoodosCustomer } from "@/types/foodos"

const NOW = new Date("2026-03-15T12:00:00Z")

function customer(over: Partial<FoodosCustomer> & { id: string }): FoodosCustomer {
  return {
    restaurant_id: "r1",
    name: null,
    phone: "+525512345678",
    total_orders: 1,
    total_spend: 100,
    last_order_at: null,
    segment: "nuevo",
    birthday: null,
    sms_opt_in: false,
    ...over,
  } as FoodosCustomer
}

function daysAgo(days: number, from: Date = NOW): string {
  return new Date(from.getTime() - days * 86_400_000).toISOString()
}

describe("audienceForScore", () => {
  it("clasifica a los mejores clientes como champions", () => {
    expect(audienceForScore(5, 5, 5)).toBe("champions")
    expect(audienceForScore(4, 4, 4)).toBe("champions")
  })

  it("pone a los valiosos que se enfrían en cant_lose antes que at_risk", () => {
    expect(audienceForScore(2, 5, 5)).toBe("cant_lose")
    expect(audienceForScore(2, 4, 4)).toBe("cant_lose")
    expect(audienceForScore(2, 3, 3)).toBe("at_risk")
  })

  it("clasifica leales, nuevos y potenciales", () => {
    expect(audienceForScore(3, 3, 1)).toBe("loyal")
    expect(audienceForScore(4, 2, 1)).toBe("potential_loyalist")
    expect(audienceForScore(4, 1, 1)).toBe("new")
  })

  it("clasifica a los que se alejan", () => {
    expect(audienceForScore(3, 1, 1)).toBe("needs_attention")
    expect(audienceForScore(2, 1, 1)).toBe("about_to_sleep")
    expect(audienceForScore(1, 2, 1)).toBe("hibernating")
    expect(audienceForScore(1, 1, 1)).toBe("lost")
  })

  it("siempre devuelve una audiencia con playbook", () => {
    for (const r of [1, 2, 3, 4, 5] as const) {
      for (const f of [1, 2, 3, 4, 5] as const) {
        for (const m of [1, 2, 3, 4, 5] as const) {
          expect(AUDIENCE_PLAYBOOK[audienceForScore(r, f, m)]).toBeDefined()
        }
      }
    }
  })
})

describe("FOODOS_AUDIENCE_KEYS", () => {
  it("no tiene duplicados", () => {
    expect(new Set(FOODOS_AUDIENCE_KEYS).size).toBe(FOODOS_AUDIENCE_KEYS.length)
  })

  it("coincide con el CHECK de la migración 00123", () => {
    const sql = readFileSync(
      new URL("../../supabase/migrations/00123_foodos_marketing_ia.sql", import.meta.url),
      "utf8"
    )
    const block = sql.match(
      /foodos_automations_audience_check[\s\S]*?IN\s*\(([\s\S]*?)\)/
    )
    expect(block).not.toBeNull()
    const keys = [...(block?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(keys.sort()).toEqual([...FOODOS_AUDIENCE_KEYS].sort())
  })

  it("isAudienceKey acepta solo las claves canónicas", () => {
    for (const key of FOODOS_AUDIENCE_KEYS) expect(isAudienceKey(key)).toBe(true)
    expect(isAudienceKey("vip")).toBe(false)
    expect(isAudienceKey(null)).toBe(false)
    expect(isAudienceKey(7)).toBe(false)
  })
})

describe("scoreCustomers", () => {
  const cohort = [
    customer({ id: "c1", last_order_at: daysAgo(1), total_orders: 1, total_spend: 100 }),
    customer({ id: "c2", last_order_at: daysAgo(10), total_orders: 2, total_spend: 200 }),
    customer({ id: "c3", last_order_at: daysAgo(20), total_orders: 3, total_spend: 300 }),
    customer({ id: "c4", last_order_at: daysAgo(30), total_orders: 4, total_spend: 400 }),
    customer({ id: "c5", last_order_at: daysAgo(40), total_orders: 5, total_spend: 500 }),
  ]

  it("puntúa por quintiles relativos a la cohorte", () => {
    const scores = scoreCustomers(cohort, NOW)
    expect(scores.get("c1")?.r).toBe(5)
    expect(scores.get("c1")?.f).toBe(1)
    expect(scores.get("c5")?.r).toBe(1)
    expect(scores.get("c5")?.f).toBe(5)
    expect(scores.get("c3")?.r).toBe(3)
  })

  it("reparte la cohorte en audiencias coherentes", () => {
    const scores = scoreCustomers(cohort, NOW)
    expect(scores.get("c1")?.audience).toBe("new")
    expect(scores.get("c2")?.audience).toBe("potential_loyalist")
    expect(scores.get("c3")?.audience).toBe("loyal")
    // c4 y c5 gastan mucho pero llevan semanas sin volver: cant_lose, no champions.
    expect(scores.get("c4")?.audience).toBe("cant_lose")
    expect(scores.get("c5")?.audience).toBe("cant_lose")
  })

  it("corona champions solo a quien es reciente, frecuente y de alto gasto", () => {
    const scores = scoreCustomers(
      [
        customer({ id: "a", last_order_at: daysAgo(1), total_orders: 10, total_spend: 1000 }),
        customer({ id: "b", last_order_at: daysAgo(2), total_orders: 8, total_spend: 800 }),
        customer({ id: "c", last_order_at: daysAgo(30), total_orders: 2, total_spend: 100 }),
        customer({ id: "d", last_order_at: daysAgo(60), total_orders: 1, total_spend: 50 }),
      ],
      NOW
    )
    expect(scores.get("a")?.audience).toBe("champions")
    expect(scores.get("b")?.audience).toBe("champions")
    expect(scores.get("c")?.audience).toBe("about_to_sleep")
    expect(scores.get("d")?.audience).toBe("lost")
  })

  it("calcula los días desde la última compra", () => {
    const scores = scoreCustomers(cohort, NOW)
    expect(scores.get("c1")?.daysSinceLastOrder).toBeCloseTo(1, 5)
  })

  it("sin historial de compra la recencia es la peor posible", () => {
    const scores = scoreCustomers(
      [customer({ id: "nuevo", last_order_at: null, total_orders: 0, total_spend: 0 })],
      NOW
    )
    expect(scores.get("nuevo")?.r).toBe(1)
    expect(scores.get("nuevo")?.daysSinceLastOrder).toBeNull()
  })

  it("una cohorte de un solo cliente no rompe los percentiles", () => {
    const scores = scoreCustomers([customer({ id: "solo" })], NOW)
    expect(scores.get("solo")?.f).toBe(3)
    expect(scores.get("solo")?.m).toBe(3)
  })
})

describe("buildAudiences / audienceMembers", () => {
  const cohort = [
    customer({ id: "c1", last_order_at: daysAgo(1), total_orders: 1, total_spend: 100 }),
    customer({ id: "c2", last_order_at: daysAgo(10), total_orders: 2, total_spend: 200 }),
    customer({ id: "c3", last_order_at: daysAgo(20), total_orders: 3, total_spend: 300 }),
    customer({ id: "c4", last_order_at: daysAgo(30), total_orders: 4, total_spend: 400 }),
    customer({ id: "c5", last_order_at: daysAgo(40), total_orders: 5, total_spend: 500 }),
  ]

  it("ordena por urgencia y omite audiencias vacías", () => {
    const audiences = buildAudiences(cohort, NOW)
    const priorities = audiences.map((a) => a.playbook.priority)
    expect([...priorities].sort()).toEqual(priorities)
    expect(audiences.every((a) => a.count > 0)).toBe(true)
    expect(audiences.map((a) => a.key)).not.toContain("lost")
  })

  it("suma ingresos y cuenta alcanzables", () => {
    const audiences = buildAudiences(
      [
        customer({ id: "a", phone: "+525511111111", last_order_at: daysAgo(1), total_orders: 10, total_spend: 1000 }),
        customer({ id: "b", phone: "123", last_order_at: daysAgo(2), total_orders: 8, total_spend: 800 }),
        customer({ id: "c", phone: "+525522222222", last_order_at: daysAgo(30), total_orders: 2, total_spend: 100 }),
        customer({ id: "d", phone: "+525533333333", last_order_at: daysAgo(60), total_orders: 1, total_spend: 50 }),
      ],
      NOW
    )
    const champions = audiences.find((a) => a.key === "champions")
    expect(champions?.count).toBe(2)
    expect(champions?.revenue).toBe(1800)
    // avgSpend es el ticket promedio del grupo (ingresos / pedidos), no por cliente.
    expect(champions?.avgSpend).toBe(100)
    // "123" no es un teléfono usable.
    expect(champions?.reachable).toBe(1)
  })

  it("audienceMembers devuelve solo los de esa audiencia", () => {
    expect(audienceMembers(cohort, "loyal", NOW).map((c) => c.id)).toEqual(["c3"])
    expect(audienceMembers(cohort, "champions", NOW)).toEqual([])
  })
})

describe("SEGMENT_TO_AUDIENCE", () => {
  it("traduce los 4 segmentos simples", () => {
    expect(SEGMENT_TO_AUDIENCE.nuevo).toBe("new")
    expect(SEGMENT_TO_AUDIENCE.recurrente).toBe("loyal")
    expect(SEGMENT_TO_AUDIENCE.vip).toBe("champions")
    expect(SEGMENT_TO_AUDIENCE.inactivo).toBe("at_risk")
  })

  it("solo apunta a audiencias válidas", () => {
    for (const key of Object.values(SEGMENT_TO_AUDIENCE)) {
      expect(isAudienceKey(key)).toBe(true)
    }
  })
})

describe("localDateParts", () => {
  it("usa la zona del restaurante, no la del servidor", () => {
    const parts = localDateParts("America/Mexico_City", new Date("2026-03-15T08:00:00Z"))
    expect(parts).toEqual({ year: 2026, month: 3, day: 15, hour: 2 })
  })

  it("cambia de día antes de medianoche UTC", () => {
    const parts = localDateParts("America/Mexico_City", new Date("2026-03-01T03:00:00Z"))
    expect(parts).toEqual({ year: 2026, month: 2, day: 28, hour: 21 })
  })

  it("sin zona asume CDMX", () => {
    const parts = localDateParts(null, new Date("2026-03-15T08:00:00Z"))
    expect(parts.hour).toBe(2)
  })

  it("una zona inválida degrada a UTC en vez de romper", () => {
    const parts = localDateParts("Marte/Olympus", new Date("2026-03-15T08:00:00Z"))
    expect(parts).toEqual({ year: 2026, month: 3, day: 15, hour: 8 })
  })

  it("normaliza la medianoche a hora 0", () => {
    const parts = localDateParts("UTC", new Date("2026-03-15T00:30:00Z"))
    expect(parts.hour).toBe(0)
  })
})

describe("isBirthdayToday / birthdayMonth", () => {
  const parts = { year: 2026, month: 3, day: 15, hour: 12 }

  it("detecta el cumpleaños por mes y día", () => {
    expect(isBirthdayToday("1990-03-15", parts)).toBe(true)
    expect(isBirthdayToday("1990-03-16", parts)).toBe(false)
    expect(isBirthdayToday("1990-04-15", parts)).toBe(false)
  })

  it("no rompe con fechas ausentes o inválidas", () => {
    expect(isBirthdayToday(null, parts)).toBe(false)
    expect(isBirthdayToday("", parts)).toBe(false)
    expect(isBirthdayToday("sin-fecha", parts)).toBe(false)
  })

  it("birthdayMonth extrae el mes", () => {
    expect(birthdayMonth("1990-03-15")).toBe(3)
    expect(birthdayMonth("1990-13-15")).toBeNull()
    expect(birthdayMonth(null)).toBeNull()
  })
})

describe("filterAbandonedCarts", () => {
  const now = new Date("2026-03-15T12:00:00Z")
  const orders = [
    { customer_id: "c1", created_at: daysAgo(3, now), total: 250 },
    { customer_id: "c2", created_at: daysAgo(0.5, now), total: 100 },
    { customer_id: "c3", created_at: daysAgo(20, now), total: 400 },
  ]
  const customers = [
    { id: "c1", last_order_at: daysAgo(30, now) },
    { id: "c2", last_order_at: daysAgo(30, now) },
    { id: "c3", last_order_at: daysAgo(30, now) },
  ]

  it("solo devuelve abandonos con la antigüedad mínima", () => {
    const out = filterAbandonedCarts(orders, customers, { hoursAfter: 2, now })
    // c2 (12h) y c1 (72h) califican; c3 (20 días) queda fuera por maxAgeDays.
    expect(out.map((o) => o.customer_id)).toEqual(["c2", "c1"])
  })

  it("descarta a quien volvió a comprar después de abandonar", () => {
    const out = filterAbandonedCarts(orders, [
      { id: "c1", last_order_at: daysAgo(1, now) },
      { id: "c2", last_order_at: daysAgo(30, now) },
      { id: "c3", last_order_at: daysAgo(30, now) },
    ], { hoursAfter: 2, now })
    expect(out.map((o) => o.customer_id)).toEqual(["c2"])
  })

  it("descarta los abandonos más recientes que la ventana", () => {
    const out = filterAbandonedCarts(orders, customers, { hoursAfter: 48, now })
    expect(out.map((o) => o.customer_id)).toEqual(["c1"])
  })

  it("de varios abandonos usa el más reciente por cliente", () => {
    const out = filterAbandonedCarts(
      [
        { customer_id: "c1", created_at: daysAgo(5, now), total: 100 },
        { customer_id: "c1", created_at: daysAgo(3, now), total: 250 },
      ],
      customers,
      { hoursAfter: 2, now }
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.total).toBe(250)
  })

  it("respeta maxAgeDays", () => {
    const out = filterAbandonedCarts(
      [{ customer_id: "c1", created_at: daysAgo(3, now), total: 250 }],
      customers,
      { hoursAfter: 2, maxAgeDays: 1, now }
    )
    expect(out).toHaveLength(0)
  })

  it("ignora fechas inválidas", () => {
    const out = filterAbandonedCarts(
      [{ customer_id: "c1", created_at: "no-es-fecha", total: 250 }],
      customers,
      { hoursAfter: 2, now }
    )
    expect(out).toHaveLength(0)
  })
})
