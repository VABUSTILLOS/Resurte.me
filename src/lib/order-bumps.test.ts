import { describe, expect, it, vi, beforeEach } from "vitest"

// El motor consulta Supabase vía service client; se mockea para aislar la
// lógica pura (evaluateTriggerTypes) y el flujo de resolución.
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}))

import {
  evaluateTriggerTypes,
  resolveBumps,
  resolveBumpPricing,
  type BumpProduct,
  type BumpRuleRow,
  type BumpTriggerType,
} from "@/lib/order-bumps"
import { createServiceClient } from "@/lib/supabase/service"

function rule(
  trigger: BumpTriggerType,
  overrides: Partial<BumpRuleRow> = {}
): BumpRuleRow {
  return {
    id: 1,
    trigger_type: trigger,
    category_slugs: [],
    subtotal_min: trigger === "subtotal_threshold" ? 500 : null,
    product_id: 100,
    title: "Test",
    description: "Test bump",
    discount_pct: 0.1,
    is_active: true,
    display_order: 1,
    ...overrides,
  }
}

function product(overrides: Partial<BumpProduct> = {}): BumpProduct {
  return {
    id: 100,
    name: "Bolsa reutilizable",
    slug: "bolsa",
    description: "Fuerte",
    image_url: "",
    price: 25,
    sale_price: null,
    stock_status: "in_stock",
    category_id: 10,
    ...overrides,
  }
}

const perishableRule = rule("perishables", { id: 1, display_order: 1 })
const snacksRule = rule("snacks_drinks", { id: 2, display_order: 2 })
const thresholdRule = rule("subtotal_threshold", { id: 3, subtotal_min: 500, display_order: 3 })

describe("evaluateTriggerTypes", () => {
  it("sin categorías ni umbral no dispara ninguna regla", () => {
    expect(evaluateTriggerTypes(new Set(), 100, [perishableRule, snacksRule, thresholdRule])).toEqual([])
  })

  it("perecederos en el carrito dispara la regla de empaque térmico", () => {
    const slugs = new Set(["frutas-verduras", "limpieza-cocina"])
    const matched = evaluateTriggerTypes(slugs, 100, [perishableRule])
    expect(matched).toContain("perishables")
  })

  it("bebidas/botanas dispara la regla de impulso", () => {
    const slugs = new Set(["bebidas"])
    expect(evaluateTriggerTypes(slugs, 100, [snacksRule])).toContain("snacks_drinks")
  })

  it("subtotal >= mínimo dispara la regla de umbral", () => {
    expect(evaluateTriggerTypes(new Set(), 500, [thresholdRule])).toContain("subtotal_threshold")
    expect(evaluateTriggerTypes(new Set(), 499.99, [thresholdRule])).not.toContain("subtotal_threshold")
  })

  it("regla inactiva se ignora", () => {
    const inactive = rule("perishables", { is_active: false })
    expect(evaluateTriggerTypes(new Set(["frutas-verduras"]), 100, [inactive])).toEqual([])
  })

  it("máximo 3 bumps, uno por trigger_type, en display_order", () => {
    const dup = rule("perishables", { id: 99, display_order: 4 })
    const slugs = new Set(["frutas-verduras", "bebidas"])
    const matched = evaluateTriggerTypes(slugs, 600, [perishableRule, snacksRule, thresholdRule, dup])
    expect(matched).toHaveLength(3)
    expect(new Set(matched).size).toBe(3)
    expect(matched[0]).toBe("perishables")
  })
})

describe("resolveBumpPricing", () => {
  it("calcula el precio con descuento a partir del precio base y la regla", () => {
    const result = resolveBumpPricing({
      bumpItems: [{ product_id: 100, quantity: 1 }],
      basePriceByProduct: new Map([[100, 25]]),
      discountPctByProduct: new Map([[100, 0.1]]),
    })
    expect(result).toEqual({ ok: true, pricesByProduct: new Map([[100, 22.5]]) })
  })

  it("usa sale_price como base si existe", () => {
    const result = resolveBumpPricing({
      bumpItems: [{ product_id: 100, quantity: 2 }],
      basePriceByProduct: new Map([[100, 30]]), // sale_price gana
      discountPctByProduct: new Map([[100, 0.25]]),
    })
    expect(result).toEqual({ ok: true, pricesByProduct: new Map([[100, 22.5]]) })
  })

  it("redondea a 2 decimales", () => {
    const result = resolveBumpPricing({
      bumpItems: [{ product_id: 100, quantity: 1 }],
      basePriceByProduct: new Map([[100, 33.33]]),
      discountPctByProduct: new Map([[100, 0.1]]),
    })
    expect(result).toEqual({ ok: true, pricesByProduct: new Map([[100, 30]]) })
  })

  it("rechaza un bump sin regla activa (no se puede inventar el descuento)", () => {
    const result = resolveBumpPricing({
      bumpItems: [
        { product_id: 100, quantity: 1 },
        { product_id: 999, quantity: 1 },
      ],
      basePriceByProduct: new Map([
        [100, 25],
        [999, 40],
      ]),
      discountPctByProduct: new Map([[100, 0.1]]),
    })
    expect(result).toEqual({ ok: false, missingProductId: 999 })
  })

  it("devuelve ok con map vacío si no hay bumps", () => {
    const result = resolveBumpPricing({
      bumpItems: [],
      basePriceByProduct: new Map(),
      discountPctByProduct: new Map(),
    })
    expect(result).toEqual({ ok: true, pricesByProduct: new Map() })
  })
})

describe("resolveBumps", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /** Construye el mock de Supabase con respuestas por tabla/query. */
  function makeSupabase(opts: {
    rules?: BumpRuleRow[]
    cartProducts?: BumpProduct[]
    cartCategoryIds?: { id: number; category_id: number }[]
    categories?: { id: number; slug: string }[]
    bumpProduct?: BumpProduct
  }) {
    const {
      rules = [perishableRule],
      cartProducts = [product({ id: 1, name: "Manzana", category_id: 20 })],
      cartCategoryIds = [{ id: 1, category_id: 20 }],
      categories = [{ id: 20, slug: "frutas-verduras" }],
      bumpProduct = product(),
    } = opts

    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "bump_rules") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: rules, error: null }),
              }),
            }),
          }
        }
        if (table === "products") {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === "id, category_id") {
                return {
                  in: vi.fn().mockResolvedValue({ data: cartCategoryIds, error: null }),
                }
              }
              // Cols completas de producto.
              return {
                in: vi.fn().mockResolvedValue({ data: cartProducts, error: null }),
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: bumpProduct, error: null }),
                }),
              }
            }),
          }
        }
        if (table === "categories") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: categories, error: null }),
            }),
          }
        }
        return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
      }),
    }
  }

  it("carrito vacío devuelve []", async () => {
    expect(await resolveBumps({ items: [] })).toEqual([])
  })

  it("fail-open: error al cargar productos devuelve []", async () => {
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "bump_rules") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [perishableRule], error: null }),
              }),
            }),
          }
        }
        if (table === "products") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: null, error: new Error("boom") }),
            }),
          }
        }
        return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
      }),
    }
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    expect(await resolveBumps({ items: [{ product_id: 1, quantity: 2 }] })).toEqual([])
  })

  it("devuelve bumps con precio descontado y excluye productos del carrito", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeSupabase({}) as never
    )
    const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 2 }] })
    expect(bumps).toHaveLength(1)
    expect(bumps[0]?.trigger_type).toBe("perishables")
    expect(bumps[0]?.price).toBeCloseTo(22.5, 2) // 25 * 0.9
    expect(bumps[0]?.original_price).toBe(25)
    expect(bumps[0]?.ruleId).toBe(1)
  })

  it("omite el bump si su producto ya está en el carrito", async () => {
    // El producto del bump (id 100) ya está en el carrito → se excluye.
    const supabase = makeSupabase({})
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const bumps = await resolveBumps({ items: [{ product_id: 100, quantity: 1 }] })
    expect(bumps).toEqual([])
  })

  it("usa sale_price cuando existe para el precio original y descontado", async () => {
    const supabase = makeSupabase({
      bumpProduct: product({ id: 100, sale_price: 20 }),
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })
    expect(bumps[0]?.original_price).toBe(20)
    expect(bumps[0]?.price).toBeCloseTo(18, 2) // 20 * 0.9
  })

  it("omite bumps cuyo producto está agotado", async () => {
    const supabase = makeSupabase({
      bumpProduct: product({ id: 100, stock_status: "out_of_stock" }),
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    expect(await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })).toEqual([])
  })

  it("sin reglas que apliquen devuelve []", async () => {
    const supabase = makeSupabase({
      categories: [{ id: 20, slug: "limpieza-cocina" }],
      rules: [perishableRule],
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    expect(await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })).toEqual([])
  })
})
