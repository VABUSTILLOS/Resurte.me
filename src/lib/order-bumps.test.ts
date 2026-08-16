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
  detectCollectionsInCart,
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
    collection_slug: null,
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
    tags: [],
    is_visible: true,
    ...overrides,
  }
}

function collection(overrides: Partial<{ id: number; slug: string; name: string; tags: string[]; is_active: boolean }> = {}) {
  return {
    id: 1,
    slug: "taquerias-antojitos",
    name: "Taquerías y Antojitos",
    tags: ["taqueria", "tacos"],
    is_active: true,
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

  it("nuevos triggers meat_bbq y drinks_sides disparan por categoría", () => {
    const meatRule = rule("meat_bbq", { id: 4, display_order: 4 })
    const drinksRule = rule("drinks_sides", { id: 5, display_order: 5 })
    expect(evaluateTriggerTypes(new Set(["carnes-aves-pescados"]), 100, [meatRule])).toContain("meat_bbq")
    expect(evaluateTriggerTypes(new Set(["bebidas"]), 100, [drinksRule])).toContain("drinks_sides")
    // botanas-dulces dispara snacks_drinks, NO drinks_sides (bebidas es el disparador).
    expect(evaluateTriggerTypes(new Set(["botanas-dulces"]), 100, [drinksRule])).not.toContain("drinks_sides")
    expect(evaluateTriggerTypes(new Set(["botanas-dulces"]), 100, [snacksRule])).toContain("snacks_drinks")
  })

  it("recipe_collection dispara cuando la colección está en el carrito", () => {
    const recipeRule = rule("recipe_collection", { id: 6, collection_slug: "taquerias-antojitos", display_order: 6 })
    const slugs = new Set(["taquerias-antojitos"])
    expect(evaluateTriggerTypes(new Set(), 100, [recipeRule], slugs)).toContain("recipe_collection")
    expect(evaluateTriggerTypes(new Set(), 100, [recipeRule], new Set(["otra"]))).toEqual([])
  })
})

describe("detectCollectionsInCart", () => {
  it("detecta colección por intersección de tags", () => {
    const cartProducts = [{ tags: ["taqueria", "mexicana"] }]
    const collections = [collection(), collection({ slug: "postres", name: "Postres", tags: ["postres"] })]
    const detected = detectCollectionsInCart(cartProducts, collections as never)
    expect(detected.has("taquerias-antojitos")).toBe(true)
    expect(detected.has("postres")).toBe(false)
  })

  it("carrito sin tags no detecta nada (fail-open)", () => {
    const cartProducts = [{ tags: [] }]
    expect(detectCollectionsInCart(cartProducts, [collection()] as never).size).toBe(0)
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

  /**
   * Construye el mock de Supabase con respuestas por tabla/query.
   * - bump_rules: select("*") → reglas; insert → regla insertada (fallback dinámico)
   * - products: in() → productos del carrito; eq(id) → bumpProduct por producto
   * - categories: in() → categorías
   * - restaurant_collections: eq(is_active) → colecciones
   * - rpc get_products_by_collection: productos de la colección (fallback dinámico)
   */
  function makeSupabase(opts: {
    rules?: BumpRuleRow[]
    cartProducts?: BumpProduct[]
    categories?: { id: number; slug: string }[]
    bumpProducts?: Record<number, BumpProduct>
    collections?: { id: number; slug: string; name: string; tags: string[]; is_active: boolean }[]
    rpcProducts?: Record<string, Record<string, unknown>[]>
    insertedRule?: BumpRuleRow | null
  }) {
    const {
      rules = [perishableRule],
      cartProducts = [product({ id: 1, name: "Manzana", category_id: 20 })],
      categories = [{ id: 20, slug: "frutas-verduras" }],
      bumpProducts = { 100: product() },
      collections = [],
      rpcProducts = {},
      insertedRule = null,
    } = opts

    // Espía accesible para verificar que el fallback dinámico registró la regla.
    const insertBumpRules = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: insertedRule ?? null, error: null }),
      }),
    })

    const supabase = {
      __insertBumpRules: insertBumpRules,
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "bump_rules") {
          const selectStar = vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string) => {
              if (col === "is_active") {
                return {
                  order: vi.fn().mockResolvedValue({ data: rules, error: null }),
                }
              }
              // Recuperación de carrera: eq(trigger_type) → eq(collection_slug)
              return {
                eq: vi.fn().mockResolvedValue({ data: insertedRule ?? null, error: null }),
              }
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: insertedRule ?? null, error: null }),
          })
          return {
            select: selectStar,
            insert: insertBumpRules,
          }
        }
        if (table === "products") {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === "id, category_id") {
                return {
                  in: vi.fn().mockResolvedValue({
                    data: cartProducts.map((p) => ({ id: p.id, category_id: p.category_id })),
                    error: null,
                  }),
                }
              }
              const eq = vi.fn().mockImplementation((_col: string, value?: number) => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data:
                    value !== undefined ? (bumpProducts[value] ?? null) : (bumpProducts[100] ?? null),
                  error: null,
                }),
              }))
              // Query del carrito (incluye "tags"): devuelve los productos del
              // carrito. Consultas batched de bumps (sin tags): resuelve por id.
              if (cols.includes("tags")) {
                return {
                  in: vi.fn().mockResolvedValue({ data: cartProducts, error: null }),
                  eq,
                }
              }
              return {
                in: vi.fn().mockImplementation((_col: string, ids?: number[]) => ({
                  data: (ids ?? [])
                    .map((id) => bumpProducts[id] ?? null)
                    .filter(Boolean),
                  error: null,
                })),
                eq,
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
        if (table === "restaurant_collections") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: collections, error: null }),
            }),
          }
        }
        return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
      }),
      rpc: vi.fn().mockImplementation((name: string, args: { p_slug?: string }) => {
        if (name === "get_products_by_collection") {
          return Promise.resolve({ data: rpcProducts[args?.p_slug ?? ""] ?? [], error: null })
        }
        return Promise.resolve({ data: null, error: null })
      }),
    }
    return supabase
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
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }
      }),
      rpc: vi.fn(),
    }
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    expect(await resolveBumps({ items: [{ product_id: 1, quantity: 2 }] })).toEqual([])
  })

  it("devuelve bumps con precio descontado y excluye productos del carrito", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(makeSupabase({}) as never)
    const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 2 }] })
    expect(bumps).toHaveLength(1)
    expect(bumps[0]?.trigger_type).toBe("perishables")
    expect(bumps[0]?.price).toBeCloseTo(22.5, 2) // 25 * 0.9
    expect(bumps[0]?.original_price).toBe(25)
    expect(bumps[0]?.ruleId).toBe(1)
  })

  it("omite el bump si su producto ya está en el carrito", async () => {
    const supabase = makeSupabase({})
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const bumps = await resolveBumps({ items: [{ product_id: 100, quantity: 1 }] })
    expect(bumps).toEqual([])
  })

  it("usa sale_price cuando existe para el precio original y descontado", async () => {
    const supabase = makeSupabase({
      bumpProducts: { 100: product({ id: 100, sale_price: 20 }) },
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })
    expect(bumps[0]?.original_price).toBe(20)
    expect(bumps[0]?.price).toBeCloseTo(18, 2) // 20 * 0.9
  })

  it("omite bumps cuyo producto está agotado", async () => {
    const supabase = makeSupabase({
      bumpProducts: { 100: product({ id: 100, stock_status: "out_of_stock" }) },
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    expect(await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })).toEqual([])
  })

  it("omite bumps cuyo producto no es visible (is_visible = false)", async () => {
    const supabase = makeSupabase({
      bumpProducts: { 100: product({ id: 100, is_visible: false }) },
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

  // ── Cross-sell por receta/colección (motor de recomendación) ──

  it("detecta colección por tags y ofrece el bump de receta con badge", async () => {
    const recipeRule = rule("recipe_collection", {
      id: 6,
      product_id: 600,
      collection_slug: "taquerias-antojitos",
      display_order: 6,
    })
    const supabase = makeSupabase({
      rules: [perishableRule, recipeRule],
      cartProducts: [
        product({ id: 1, name: "Tortillas", category_id: 20, tags: ["taqueria"] }),
      ],
      categories: [{ id: 20, slug: "frutas-verduras" }],
      bumpProducts: {
        100: product({ id: 100, name: "Empaque térmico", price: 40 }),
        600: product({ id: 600, name: "Guacamole preparado", price: 35 }),
      },
      collections: [collection()],
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })
    // La receta/colección gana el ranking aunque ambas reglas apliquen.
    expect(bumps).toHaveLength(2)
    expect(bumps[0]?.trigger_type).toBe("recipe_collection")
    expect(bumps[0]?.product.id).toBe(600)
    expect(bumps[0]?.isRecipeMatch).toBe(true)
    expect(bumps[0]?.badgeLabel).toBe("Sugerido para tu receta / pedido")
    expect(bumps[0]?.collection_slug).toBe("taquerias-antojitos")
    expect(bumps[0]?.price).toBeCloseTo(31.5, 2) // 35 * 0.9
  })

  it("omite el bump de colección si su producto ya está en el carrito", async () => {
    const recipeRule = rule("recipe_collection", {
      id: 6,
      product_id: 600,
      collection_slug: "taquerias-antojitos",
      display_order: 6,
    })
    const supabase = makeSupabase({
      rules: [recipeRule],
      cartProducts: [
        product({ id: 600, name: "Guacamole", category_id: 20, tags: ["taqueria"] }),
      ],
      categories: [{ id: 20, slug: "frutas-verduras" }],
      bumpProducts: { 600: product({ id: 600 }) },
      collections: [collection()],
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    expect(await resolveBumps({ items: [{ product_id: 600, quantity: 1 }] })).toEqual([])
  })

  it("fallback dinámico: colección detectada sin regla admin genera bump propio", async () => {
    const supabase = makeSupabase({
      rules: [],
      cartProducts: [
        product({ id: 1, name: "Tortillas", category_id: 20, tags: ["taqueria"] }),
      ],
      categories: [{ id: 20, slug: "frutas-verduras" }],
      collections: [collection()],
      rpcProducts: {
        "taquerias-antojitos": [
          { id: 900, name: "Guacamole preparado", slug: "guacamole", price: 30, sale_price: null, stock_status: "in_stock", is_visible: true, category_id: 1 },
        ],
      },
      insertedRule: rule("recipe_collection", {
        id: 60,
        product_id: 900,
        collection_slug: "taquerias-antojitos",
        display_order: 0,
      }),
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })
    expect(bumps).toHaveLength(1)
    expect(bumps[0]?.product.id).toBe(900)
    expect(bumps[0]?.isRecipeMatch).toBe(true)
    expect(bumps[0]?.collection_slug).toBe("taquerias-antojitos")
    expect(bumps[0]?.price).toBeCloseTo(27, 2) // 30 * 0.9 (descuento dinámico 10%)
    // Verifica que el motor registró la regla para que POST /api/orders valide.
    expect((supabase as unknown as { __insertBumpRules: ReturnType<typeof vi.fn> }).__insertBumpRules).toHaveBeenCalled()
  })

  it("máximo 3 bumps simultáneos con prioridad de recetas", async () => {
    const meatRule = rule("meat_bbq", { id: 4, product_id: 400, display_order: 4 })
    const drinksRule = rule("drinks_sides", { id: 5, product_id: 500, display_order: 5 })
    const recipeRule = rule("recipe_collection", {
      id: 6,
      product_id: 600,
      collection_slug: "taquerias-antojitos",
      display_order: 6,
    })
    const supabase = makeSupabase({
      rules: [meatRule, drinksRule, recipeRule],
      cartProducts: [
        product({ id: 1, name: "Arrachera", category_id: 4, tags: ["taqueria"] }),
        product({ id: 2, name: "Cerveza", category_id: 6, tags: ["bar"] }),
      ],
      categories: [
        { id: 4, slug: "carnes-aves-pescados" },
        { id: 6, slug: "bebidas" },
      ],
      bumpProducts: {
        400: product({ id: 400, name: "Sazonador", price: 15 }),
        500: product({ id: 500, name: "Botana", price: 20 }),
        600: product({ id: 600, name: "Guacamole", price: 35 }),
      },
      collections: [collection()],
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })
    expect(bumps).toHaveLength(3)
    // Ranking: receta primero, luego categorías.
    expect(bumps[0]?.trigger_type).toBe("recipe_collection")
    expect(new Set(bumps.map((b) => b.product.id)).size).toBe(3)
  })

  it("fail-open: error en rpc de colección no rompe el flujo", async () => {
    const recipeRule = rule("recipe_collection", {
      id: 6,
      product_id: 600,
      collection_slug: "taquerias-antojitos",
      display_order: 6,
    })
    const supabase = makeSupabase({
      rules: [recipeRule],
      cartProducts: [product({ id: 1, tags: ["taqueria"] })],
      collections: [collection()],
      bumpProducts: { 600: product({ id: 600 }) },
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    supabase.rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("rpc boom") })
    // La regla admin de la colección existe y es usable → el bump sale igual.
    const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })
    expect(Array.isArray(bumps)).toBe(true)
    expect(bumps.some((b) => b.product.id === 600)).toBe(true)
  })
})
