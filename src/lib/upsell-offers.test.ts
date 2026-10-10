import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { resolveUpsellOffers } from "@/lib/upsell-offers"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

const ORDER = {
  id: 1,
  user_id: "user-1",
  payment_status: "paid",
  status: "confirmed",
  stripe_payment_method_id: "pm_1",
  address_id: 5,
  total: 300,
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 77,
    name: "Salsa Maggi 200 ml",
    slug: "salsa-maggi",
    description: "Sazonador umami.",
    image_url: "",
    price: 42,
    sale_price: null,
    stock_status: "in_stock",
    category_id: 2,
    is_visible: true,
    ...overrides,
  }
}

function rule(overrides: Record<string, unknown> = {}) {
  return {
    id: 2,
    trigger_type: "perishables",
    category_slugs: ["frutas-verduras"],
    subtotal_min: null,
    product_id: 77,
    title: "Salsa Maggi 200 ml",
    description: "Sazonador umami.",
    discount_pct: 0.1,
    is_active: true,
    display_order: 1,
    collection_slug: null,
    product: product(),
    ...overrides,
  }
}

/** Cadena de PostgREST encadenable y "thenable", como en el resto de los tests. */
function table(result: { data: unknown; error: unknown }) {
  const p = Promise.resolve(result)
  const node: Record<string, unknown> = {
    eq: () => node,
    neq: () => node,
    order: () => node,
    in: () => node,
    limit: () => node,
    maybeSingle: () => p,
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      p.then(res as never, rej as never),
    catch: (rej: (e: unknown) => unknown) => p.catch(rej as never),
  }
  return node
}

function setup(opts: { rules?: Record<string, unknown>[]; orderItems?: number[] } = {}) {
  const rules = opts.rules ?? [rule()]
  const items = (opts.orderItems ?? []).map((product_id) => ({ product_id }))
  const from = vi.fn((name: string) => ({
    select: () => {
      if (name === "orders") return table({ data: ORDER, error: null })
      if (name === "order_items") return table({ data: items, error: null })
      return table({ data: rules, error: null })
    },
  }))
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from }
}

const PARAMS = { orderId: 1, userId: "user-1" }

describe("resolveUpsellOffers · solo productos publicados en tienda", () => {
  beforeEach(() => vi.clearAllMocks())

  it("ofrece una regla cuyo producto está publicado", async () => {
    setup()
    const result = await resolveUpsellOffers(PARAMS)
    expect(result.upsell?.productId).toBe(77)
    expect(result.orderConfirmed).toBe(true)
  })

  it("NO ofrece una regla cuyo producto está oculto en la tienda", async () => {
    // Es el caso real: las 5 reglas de categoría apuntan desde 2026-10-03 a
    // productos despublicados, y el modal llegaba a ofrecerlos.
    setup({ rules: [rule({ product: product({ is_visible: false }) })] })
    const result = await resolveUpsellOffers(PARAMS)
    expect(result.upsell).toBeNull()
    expect(result.downsell).toBeNull()
    expect(result.orderConfirmed).toBe(true)
    expect(logger.warn).toHaveBeenCalledWith(
      "[UPSELL] regla con producto no publicado, omitida",
      expect.objectContaining({ ruleId: 2, productId: 77 })
    )
  })

  it("no ofrece un producto sin la columna is_visible (fail-closed)", async () => {
    setup({ rules: [rule({ product: product({ is_visible: undefined }) })] })
    const result = await resolveUpsellOffers(PARAMS)
    expect(result.upsell).toBeNull()
  })

  it("con una regla oculta y otra publicada, ofrece la publicada", async () => {
    setup({
      rules: [
        rule({ id: 1, product: product({ is_visible: false }) }),
        rule({
          id: 9,
          product_id: 200,
          product: product({ id: 200, name: "Orégano Molido 100g", price: 11 }),
        }),
      ],
    })
    const result = await resolveUpsellOffers(PARAMS)
    expect(result.upsell?.productId).toBe(200)
    expect(result.upsell?.ruleId).toBe(9)
  })
})
