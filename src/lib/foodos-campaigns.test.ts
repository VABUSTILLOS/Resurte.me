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

import {
  renderMessage,
  fetchTargetCustomers,
} from "@/lib/foodos-campaigns"
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
