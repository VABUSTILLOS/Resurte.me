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
  sanitizeBumpLimit,
  detectCollectionsInCart,
  type BumpDiagnostics,
  type BumpProduct,
  type BumpRuleRow,
  type BumpTriggerType,
} from "@/lib/order-bumps"
import { MAX_BUMPS, MAX_BUMPS_REQUEST_LIMIT, BUMP_MIN_PRICE_MXN } from "@/lib/checkout-config"
import { createServiceClient } from "@/lib/supabase/service"
import type { AffinityPairRow, AffinityProduct } from "@/lib/ingredient-affinity"

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
    price: 120,
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

  it("un límite mayor permite encadenar más bumps (pool del checkout)", () => {
    const dup = rule("perishables", { id: 99, display_order: 4 })
    const slugs = new Set(["frutas-verduras", "bebidas"])
    const rules = [perishableRule, snacksRule, thresholdRule, dup]
    // Con el default de 3 el cuarto trigger queda fuera…
    expect(evaluateTriggerTypes(slugs, 600, rules)).toHaveLength(MAX_BUMPS)
    // …y con el tope de petición entra, que es lo que habilita el encadenado.
    expect(evaluateTriggerTypes(slugs, 600, rules, undefined, MAX_BUMPS_REQUEST_LIMIT)).toHaveLength(4)
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
  it("cobra el precio de catálogo: el bump no lleva descuento propio", () => {
    const result = resolveBumpPricing({
      bumpItems: [{ product_id: 100, quantity: 1 }],
      basePriceByProduct: new Map([[100, 25]]),
      activeRuleProductIds: new Set([100]),
    })
    expect(result).toEqual({ ok: true, pricesByProduct: new Map([[100, 25]]) })
  })

  it("usa sale_price como base si existe", () => {
    const result = resolveBumpPricing({
      bumpItems: [{ product_id: 100, quantity: 2 }],
      basePriceByProduct: new Map([[100, 30]]), // sale_price gana
      activeRuleProductIds: new Set([100]),
    })
    expect(result).toEqual({ ok: true, pricesByProduct: new Map([[100, 30]]) })
  })

  it("redondea a 2 decimales", () => {
    const result = resolveBumpPricing({
      bumpItems: [{ product_id: 100, quantity: 1 }],
      basePriceByProduct: new Map([[100, 7.777]]),
      activeRuleProductIds: new Set([100]),
    })
    expect(result).toEqual({ ok: true, pricesByProduct: new Map([[100, 7.78]]) })
  })

  it("rechaza un bump sin regla activa (no se puede inventar el artículo especial)", () => {
    const result = resolveBumpPricing({
      bumpItems: [
        { product_id: 100, quantity: 1 },
        { product_id: 999, quantity: 1 },
      ],
      basePriceByProduct: new Map([
        [100, 25],
        [999, 40],
      ]),
      activeRuleProductIds: new Set([100]),
    })
    expect(result).toEqual({ ok: false, missingProductId: 999 })
  })

  it("devuelve ok con map vacío si no hay bumps", () => {
    const result = resolveBumpPricing({
      bumpItems: [],
      basePriceByProduct: new Map(),
      activeRuleProductIds: new Set(),
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
   * - products select("id, name, slug") → catálogo para el índice de afinidad
   * - bump_affinity: eq(is_active) + in(source) → pares curados
   * - categories: in() → categorías
   * - restaurant_collections: eq(is_active) → colecciones
   * - rpc get_products_by_collection: productos de la colección (fallback dinámico)
   *
   * `catalog` y `affinityPairs` vacíos (default) apagan el tier de afinidad,
   * así que las pruebas existentes siguen midiendo el ranking previo.
   */
  function makeSupabase(opts: {
    rules?: BumpRuleRow[]
    cartProducts?: BumpProduct[]
    categories?: { id: number; slug: string }[]
    bumpProducts?: Record<number, BumpProduct>
    collections?: { id: number; slug: string; name: string; tags: string[]; is_active: boolean }[]
    rpcProducts?: Record<string, Record<string, unknown>[]>
    insertedRule?: BumpRuleRow | null
    catalog?: AffinityProduct[]
    affinityPairs?: AffinityPairRow[]
    affinityRules?: BumpRuleRow[]
    /** Candidatos que devuelve la búsqueda de sustituto (mismo pasillo). */
    substitutes?: BumpProduct[]
    /** Fuerza el fallo del re-apunte de la regla (UPDATE con error). */
    updateFails?: boolean
  }) {
    const {
      rules = [perishableRule],
      cartProducts = [product({ id: 1, name: "Manzana", category_id: 20 })],
      categories = [{ id: 20, slug: "frutas-verduras" }],
      bumpProducts = { 100: product() },
      collections = [],
      rpcProducts = {},
      insertedRule = null,
      catalog = [],
      affinityPairs = [],
      affinityRules = [],
      substitutes = [],
      updateFails = false,
    } = opts

    // Espía accesible para verificar que el fallback dinámico registró la regla.
    // Soporta las dos formas: individual (`.select().maybeSingle()`) y en lote
    // (`insert(array).select()` esperado directo). El lote devuelve las filas
    // del payload con ids sintéticos, como haría Postgres.
    let nextRuleId = 9000
    // Filtros aplicados a la query del índice de afinidad (regresión: debe pedir
    // solo productos publicados en tienda).
    const catalogFilters: { col: string; value: unknown }[] = []
    const insertBumpRules = vi.fn().mockImplementation((payload: unknown) => ({
      select: vi.fn().mockImplementation(() => {
        const rows = (Array.isArray(payload) ? payload : [payload]).filter(
          (row): row is Record<string, unknown> => Boolean(row)
        )
        const data = rows.map((row) => ({ ...row, id: nextRuleId++ }))
        return {
          maybeSingle: vi.fn().mockResolvedValue({ data: insertedRule ?? null, error: null }),
          then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
            Promise.resolve({ data, error: null }).then(resolve),
        }
      }),
    }))

    // Re-apunte de una regla rota: update({product_id}).eq(id).eq(product_id)    // .select("id"). El segundo `eq` es la guarda de carrera: exige que la regla
    // siga apuntando al producto roto.
    const updateBumpRules = vi.fn().mockImplementation(() => ({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue(
            updateFails
              ? { data: null, error: { message: "update boom" } }
              : { data: [{ id: 1 }], error: null }
          ),
        }),
      }),
    }))

    // Filtros de la búsqueda de sustituto (regresión: el piso de precio tiene
    // que filtrarse en la BD, no solo en el loop).
    const substituteFilters: { col: string; value: unknown }[] = []

    const supabase = {
      __insertBumpRules: insertBumpRules,
      __updateBumpRules: updateBumpRules,
      __catalogFilters: catalogFilters,
      __substituteFilters: substituteFilters,
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "bump_rules") {
          const selectStar = vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string) => {
              if (col === "is_active") {
                return {
                  order: vi.fn().mockResolvedValue({ data: rules, error: null }),
                }
              }
              // Recuperación de carrera: eq(trigger_type) → eq(collection_slug).
              // Resolución en lote: eq(trigger_type) → in(product_id).
              return {
                eq: vi.fn().mockResolvedValue({ data: insertedRule ?? null, error: null }),
                in: vi.fn().mockImplementation((_col: string, ids: number[]) =>
                  Promise.resolve({
                    data: affinityRules.filter((r) => ids.includes(r.product_id)),
                    error: null,
                  })
                ),
              }
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: insertedRule ?? null, error: null }),
          })
          return {
            select: selectStar,
            insert: insertBumpRules,
            update: updateBumpRules,
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
              // Catálogo mínimo para el índice de afinidad por ingrediente. El
              // motor lo pide filtrado por publicación (`is_visible = true`):
              // un producto oculto no puede tapar a su gemelo publicado.
              if (cols === "id, name, slug") {
                return {
                  eq: vi.fn().mockImplementation((col: string, value: unknown) => {
                    catalogFilters.push({ col, value })
                    return Promise.resolve({ data: catalog, error: null })
                  }),
                }
              }
              const eq = vi.fn().mockImplementation((col: string, value?: number) => {
                // Búsqueda de sustituto de una regla rota:
                // eq(category_id) → eq(is_visible) → neq(stock) → gte(price) →
                // order → limit. El `gte` es el piso de precio: se registra para
                // poder afirmar que el filtro llega a la BD y no solo al loop.
                if (col === "category_id") {
                  return {
                    eq: vi.fn().mockReturnValue({
                      neq: vi.fn().mockReturnValue({
                        gte: vi.fn().mockImplementation((gteCol: string, gteValue: number) => {
                          substituteFilters.push({ col: gteCol, value: gteValue })
                          return {
                            order: vi.fn().mockReturnValue({
                              limit: vi.fn().mockResolvedValue({ data: substitutes, error: null }),
                            }),
                          }
                        }),
                      }),
                    }),
                  }
                }
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data:
                      value !== undefined
                        ? (bumpProducts[value] ?? null)
                        : (bumpProducts[100] ?? null),
                    error: null,
                  }),
                }
              })
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
        if (table === "bump_affinity") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: affinityPairs, error: null }),
              }),
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

  it("devuelve bumps al precio de catálogo y excluye productos del carrito", async () => {
    vi.mocked(createServiceClient).mockResolvedValue(makeSupabase({}) as never)
    const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 2 }] })
    expect(bumps).toHaveLength(1)
    expect(bumps[0]?.trigger_type).toBe("perishables")
    // El artículo especial se cobra al precio de catálogo: sin descuento propio.
    expect(bumps[0]?.price).toBeCloseTo(120, 2)
    expect(bumps[0]?.ruleId).toBe(1)
  })

  it("omite el bump si su producto ya está en el carrito", async () => {
    const supabase = makeSupabase({})
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const bumps = await resolveBumps({ items: [{ product_id: 100, quantity: 1 }] })
    expect(bumps).toEqual([])
  })

  it("usa sale_price como precio del bump", async () => {
    const supabase = makeSupabase({
      bumpProducts: { 100: product({ id: 100, sale_price: 60 }) },
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })
    expect(bumps[0]?.price).toBeCloseTo(60, 2)
  })

  it("ignora sale_price si la oferta ya venció (00107)", async () => {
    const supabase = makeSupabase({
      bumpProducts: {
        100: product({
          id: 100,
          sale_price: 60,
          sale_ends_at: new Date(Date.now() - 3_600_000).toISOString(),
        }),
      },
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })
    expect(bumps[0]?.price).toBeCloseTo(120, 2)
  })

  it("usa sale_price si la ventana de la oferta está vigente (00107)", async () => {
    const supabase = makeSupabase({
      bumpProducts: {
        100: product({
          id: 100,
          sale_price: 60,
          sale_starts_at: new Date(Date.now() - 3_600_000).toISOString(),
          sale_ends_at: new Date(Date.now() + 3_600_000).toISOString(),
        }),
      },
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })
    expect(bumps[0]?.price).toBeCloseTo(60, 2)
  })

  it("sin sustituto usable omite el bump cuyo producto está agotado", async () => {
    const supabase = makeSupabase({
      bumpProducts: { 100: product({ id: 100, stock_status: "out_of_stock" }) },
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    expect(await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })).toEqual([])
  })

  it("sin sustituto usable omite el bump cuyo producto no es visible", async () => {
    const supabase = makeSupabase({
      bumpProducts: { 100: product({ id: 100, is_visible: false }) },
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    expect(await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })).toEqual([])
  })

  it("omite el bump si el llamador no trajo is_visible (fail-closed)", async () => {
    // El predicado de "publicado en tienda" es estricto (`is_visible === true`):
    // si una ruta olvida pedir la columna, el producto se descarta en vez de
    // colarse. Es la causa de raíz del bug de la oferta post-compra.
    const supabase = makeSupabase({
      bumpProducts: { 100: product({ id: 100, is_visible: undefined }) },
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    expect(await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })).toEqual([])
  })

  it("pide el índice de afinidad solo con productos publicados en tienda", async () => {
    // Antes traía el catálogo completo (378 de 646 filas ocultas) y un oculto
    // podía tapar a su gemelo publicado por nombre (Map first-match-wins).
    const supabase = makeSupabase({
      catalog: [{ id: 5, name: "Cebolla", slug: "cebolla" }],
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })
    expect(supabase.__catalogFilters).toEqual([{ col: "is_visible", value: true }])
  })

  it("re-apunta la regla a un sustituto del mismo pasillo si su producto está oculto", async () => {
    const supabase = makeSupabase({
      bumpProducts: { 100: product({ id: 100, is_visible: false, category_id: 10 }) },
      substitutes: [
        product({
          id: 555,
          name: "Orégano Molido 100g",
          description: "Orégano mexicano molido.",
          price: 65,
          category_id: 10,
        }),
      ],
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })
    expect(bumps).toHaveLength(1)
    expect(bumps[0]?.product.id).toBe(555)
    expect(bumps[0]?.ruleId).toBe(1)
    // La tarjeta subtitula con `rule.description`: si viaja la copy vieja, el
    // cliente lee una mentira ("Sazonador umami" sobre orégano).
    expect(bumps[0]?.description).toBe("Orégano mexicano molido.")
    // El re-apunte se PERSISTE: `POST /api/orders` valida el artículo especial
    // contra los `product_id` de las reglas activas, así que servir un producto
    // que la regla no apunta haría fallar el pedido en el último paso.
    expect(supabase.__updateBumpRules).toHaveBeenCalledWith({
      product_id: 555,
      title: "Orégano Molido 100g",
      description: "Orégano mexicano molido.",
    })
  })

  it("nunca sustituye con un producto que ya está en el carrito", async () => {
    // El más barato del pasillo ES el que el cliente ya lleva: si el motor lo
    // ofreciera como bump, el pedido cobraría dos veces el mismo artículo.
    const supabase = makeSupabase({
      cartProducts: [product({ id: 700, name: "Acelga", category_id: 20 })],
      bumpProducts: { 100: product({ id: 100, is_visible: false, category_id: 10 }) },
      substitutes: [
        product({ id: 700, name: "Acelga", price: 55, category_id: 10 }),
        product({ id: 555, name: "Sal de Mar", price: 64, category_id: 10 }),
      ],
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const bumps = await resolveBumps({ items: [{ product_id: 700, quantity: 1 }] })
    expect(bumps.map((b) => b.product.id)).toEqual([555])
  })

  it("usa copy de respaldo si el producto sustituto no trae descripción", async () => {
    const supabase = makeSupabase({
      bumpProducts: { 100: product({ id: 100, is_visible: false, category_id: 10 }) },
      substitutes: [
        product({ id: 555, name: "Sal de Mar", description: "   ", category_id: 10 }),
      ],
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })
    expect(bumps[0]?.description).toBe("Agrégalo a este envío.")
  })

  it("re-apunta la regla si su producto quedó sin precio ($0 no es oferta)", async () => {
    const supabase = makeSupabase({
      bumpProducts: { 100: product({ id: 100, price: 0, category_id: 10 }) },
      substitutes: [product({ id: 556, price: 62, category_id: 10 })],
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })
    expect(bumps[0]?.product.id).toBe(556)
  })

  it("no sirve el sustituto si el re-apunte falla (el pedido lo rechazaría)", async () => {
    const supabase = makeSupabase({
      bumpProducts: { 100: product({ id: 100, is_visible: false, category_id: 10 }) },
      substitutes: [product({ id: 555, category_id: 10 })],
      updateFails: true,
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const diagnostics: BumpDiagnostics = {}
    expect(
      await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] }, diagnostics)
    ).toEqual([])
    expect(diagnostics.state?.droppedRules).toEqual(["1:product_not_visible"])
  })

  it("registra el motivo de la regla descartada para cazar '0 bumps' en prod", async () => {
    const supabase = makeSupabase({
      bumpProducts: { 100: product({ id: 100, stock_status: "out_of_stock" }) },
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const diagnostics: BumpDiagnostics = {}
    await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] }, diagnostics)
    expect(diagnostics.state?.matchedTriggers).toContain("perishables")
    expect(diagnostics.state?.droppedRules).toEqual(["1:product_out_of_stock"])
    expect(diagnostics.state?.healedRules).toEqual([])
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
        100: product({ id: 100, name: "Empaque térmico", price: 90 }),
        600: product({ id: 600, name: "Guacamole preparado", price: 85 }),
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
    expect(bumps[0]?.price).toBeCloseTo(85, 2) // precio de catálogo
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
          { id: 900, name: "Guacamole preparado", slug: "guacamole", price: 80, sale_price: null, stock_status: "in_stock", is_visible: true, category_id: 1 },
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
    expect(bumps[0]?.price).toBeCloseTo(80, 2) // precio de catálogo (sin descuento)
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
        400: product({ id: 400, name: "Sazonador", price: 55 }),
        500: product({ id: 500, name: "Botana", price: 60 }),
        600: product({ id: 600, name: "Guacamole", price: 85 }),
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

  it("acepta un límite mayor y devuelve hasta el pool solicitado", async () => {
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
        400: product({ id: 400, name: "Sazonador", price: 55 }),
        500: product({ id: 500, name: "Botana", price: 60 }),
        600: product({ id: 600, name: "Guacamole", price: 85 }),
      },
      collections: [collection()],
    })
    vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
    const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] }, undefined, MAX_BUMPS_REQUEST_LIMIT)
    expect(bumps).toHaveLength(3)
    // El ranking sigue priorizando recetas aunque el límite sea amplio.
    expect(bumps[0]?.trigger_type).toBe("recipe_collection")
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

  describe("tier de afinidad por ingrediente (00112)", () => {
    const cebolla: AffinityProduct = { id: 1, name: "Cebolla Blanca", slug: "cebolla-blanca" }
    const chile: AffinityProduct = { id: 300, name: "Chile Serrano", slug: "chile-serrano" }
    const affinityRule = rule("ingredient_affinity", {
      id: 900,
      product_id: 300,
      title: "Chile Serrano",
      description: "Ideal con Cebolla Blanca",
      discount_pct: 0.1,
      display_order: 100,
    })

    it("sugiere un producto afín y usa el nombre real del catálogo como título", async () => {
      const supabase = makeSupabase({
        rules: [],
        cartProducts: [product({ id: 1, name: "Cebolla Blanca" })],
        categories: [],
        catalog: [cebolla, chile],
        affinityPairs: [
          { source_product_id: 1, target_product_id: 300, kind: "curated", weight: 5 },
        ],
        bumpProducts: { 300: product({ id: 300, name: "Chile Serrano" }) },
        insertedRule: affinityRule,
      })
      vi.mocked(createServiceClient).mockResolvedValue(supabase as never)

      const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })

      expect(bumps).toHaveLength(1)
      expect(bumps[0]?.trigger_type).toBe("ingredient_affinity")
      expect(bumps[0]?.product.name).toBe("Chile Serrano")
      // El encabezado de la tarjeta sale del producto, no del título de la regla.
      expect(bumps[0]?.title).toBe("Chile Serrano")
      expect(bumps[0]?.badgeLabel).toBe("Ideal con tu pedido")
    })

    it("coloca la afinidad por encima del tier de categoría", async () => {
      const supabase = makeSupabase({
        cartProducts: [product({ id: 1, name: "Cebolla Blanca", category_id: 20 })],
        catalog: [cebolla, chile],
        affinityPairs: [
          { source_product_id: 1, target_product_id: 300, kind: "curated", weight: 5 },
        ],
        bumpProducts: { 100: product(), 300: product({ id: 300, name: "Chile Serrano" }) },
        insertedRule: affinityRule,
      })
      vi.mocked(createServiceClient).mockResolvedValue(supabase as never)

      const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })

      expect(bumps[0]?.trigger_type).toBe("ingredient_affinity")
      expect(bumps.map((b) => b.product.id)).toContain(100)
    })

    it("omite el candidato afín agotado y conserva el resto del pool", async () => {
      const supabase = makeSupabase({
        rules: [],
        cartProducts: [product({ id: 1, name: "Cebolla Blanca" })],
        categories: [],
        catalog: [cebolla, chile, { id: 301, name: "Jitomate Bola", slug: "jitomate-bola" }],
        affinityPairs: [
          { source_product_id: 1, target_product_id: 300, kind: "curated", weight: 9 },
          { source_product_id: 1, target_product_id: 301, kind: "curated", weight: 8 },
        ],
        bumpProducts: {
          300: product({ id: 300, name: "Chile Serrano", stock_status: "out_of_stock" }),
          301: product({ id: 301, name: "Jitomate Bola" }),
        },
        insertedRule: affinityRule,
      })
      vi.mocked(createServiceClient).mockResolvedValue(supabase as never)

      const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })

      expect(bumps.map((b) => b.product.id)).toEqual([301])
    })

    it("no duplica el producto afín si además lo cubre el tier de receta", async () => {
      const recipeRule = rule("recipe_collection", {
        id: 6,
        product_id: 300,
        collection_slug: "taquerias-antojitos",
        display_order: 6,
      })
      const supabase = makeSupabase({
        rules: [recipeRule],
        cartProducts: [product({ id: 1, name: "Cebolla Blanca", tags: ["taqueria"] })],
        collections: [collection()],
        catalog: [cebolla, chile],
        affinityPairs: [
          { source_product_id: 1, target_product_id: 300, kind: "curated", weight: 5 },
        ],
        bumpProducts: { 300: product({ id: 300, name: "Chile Serrano" }) },
        insertedRule: affinityRule,
      })
      vi.mocked(createServiceClient).mockResolvedValue(supabase as never)

      const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })

      expect(bumps.map((b) => b.product.id)).toEqual([300])
      expect(bumps[0]?.trigger_type).toBe("ingredient_affinity")
    })

    it("resuelve las reglas en lote: cero inserts si ya existen (estado estable)", async () => {
      const stored = rule("ingredient_affinity", {
        id: 900,
        product_id: 300,
        title: "Chile Serrano",
        description: "Ideal con Cebolla Blanca",
        discount_pct: 0.1,
        display_order: 100,
      })
      const supabase = makeSupabase({
        rules: [],
        cartProducts: [product({ id: 1, name: "Cebolla Blanca" })],
        categories: [],
        catalog: [cebolla, chile],
        affinityPairs: [
          { source_product_id: 1, target_product_id: 300, kind: "curated", weight: 5 },
        ],
        bumpProducts: { 300: product({ id: 300, name: "Chile Serrano" }) },
        affinityRules: [stored],
      })
      vi.mocked(createServiceClient).mockResolvedValue(supabase as never)

      const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })

      expect(bumps).toHaveLength(1)
      expect(bumps[0]?.ruleId).toBe(900)
      // Antes: un INSERT→SELECT por bump (~87 ms cada uno) aunque la regla
      // existiera, porque el índice único hacía fallar siempre el insert.
      expect(
        (supabase as unknown as { __insertBumpRules: ReturnType<typeof vi.fn> })
          .__insertBumpRules
      ).not.toHaveBeenCalled()
    })

    it("registra las reglas faltantes en un solo insert (entorno frío)", async () => {
      const supabase = makeSupabase({
        rules: [],
        cartProducts: [product({ id: 1, name: "Cebolla Blanca" })],
        categories: [],
        catalog: [cebolla, chile, { id: 301, name: "Jitomate Bola", slug: "jitomate-bola" }],
        affinityPairs: [
          { source_product_id: 1, target_product_id: 300, kind: "curated", weight: 9 },
          { source_product_id: 1, target_product_id: 301, kind: "curated", weight: 8 },
        ],
        bumpProducts: {
          300: product({ id: 300, name: "Chile Serrano" }),
          301: product({ id: 301, name: "Jitomate Bola" }),
        },
        affinityRules: [],
      })
      vi.mocked(createServiceClient).mockResolvedValue(supabase as never)

      const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })
      const insert = (
        supabase as unknown as { __insertBumpRules: ReturnType<typeof vi.fn> }
      ).__insertBumpRules

      expect(bumps.map((b) => b.product.id)).toEqual([300, 301])
      expect(bumps.every((b) => b.trigger_type === "ingredient_affinity")).toBe(true)
      // Un insert con las dos reglas, no dos inserts de una.
      expect(insert).toHaveBeenCalledTimes(1)
      expect(insert.mock.calls[0]?.[0]).toHaveLength(2)
    })

    it("fail-open: si bump_affinity no está disponible no rompe el checkout", async () => {
      const supabase = makeSupabase({})
      vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
      supabase.from = vi.fn().mockImplementation((table: string) => {
        if (table === "bump_affinity") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: "42P01", message: "relation does not exist" },
                }),
              }),
            }),
          }
        }
        return makeSupabase({}).from(table)
      })

      const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 2 }] })

      expect(bumps).toHaveLength(1)
      expect(bumps[0]?.trigger_type).toBe("perishables")
    })
  })

  describe("piso de precio de los artículos especiales", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    /** Regla de categoría rota (producto oculto) para forzar el re-apunte. */
    function brokenRule(): BumpRuleRow {
      return rule("perishables", { id: 1, display_order: 1 })
    }

    it("re-apunta al más barato QUE PASA EL PISO, no al más barato a secas", async () => {
      const supabase = makeSupabase({
        rules: [brokenRule()],
        bumpProducts: { 100: product({ id: 100, is_visible: false, category_id: 10 }) },
        substitutes: [
          product({ id: 30, name: "Orégano Molido", price: 11, category_id: 10 }),
          product({ id: 60, name: "Aceite de Oliva 500ml", price: 65, category_id: 10 }),
          product({ id: 90, name: "Salsa BBQ", price: 120, category_id: 10 }),
        ],
      })
      vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
      const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })
      expect(bumps.map((b) => b.product.id)).toEqual([60])
      expect(bumps[0]?.price).toBeCloseTo(65, 2)
      // El piso se filtra también en la BD (no solo en el loop del motor): sin
      // esto, la query de 20 candidatos podía gastarse en productos baratos.
      expect(supabase.__substituteFilters).toEqual([
        { col: "price", value: BUMP_MIN_PRICE_MXN },
      ])
    })

    it("un producto por debajo del piso cuenta como no ofrecible y la regla se re-apunta", async () => {
      const supabase = makeSupabase({
        rules: [brokenRule()],
        // El caso real: la regla quedó apuntando a "Hoja de Laurel" ($4) cuando se
        // ocultó su producto y el sustituto se eligió entre los más baratos.
        bumpProducts: { 100: product({ id: 100, price: 4, category_id: 10 }) },
        substitutes: [product({ id: 60, name: "Aceite de Oliva 500ml", price: 65, category_id: 10 })],
      })
      vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
      const bumps = await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })
      expect(bumps.map((b) => b.product.id)).toEqual([60])
      expect(supabase.__updateBumpRules).toHaveBeenCalledWith({
        product_id: 60,
        title: "Aceite de Oliva 500ml",
        description: "Fuerte",
      })
    })

    it("sin candidato por encima del piso la regla queda muda y el motivo queda registrado", async () => {
      const supabase = makeSupabase({
        rules: [brokenRule()],
        bumpProducts: { 100: product({ id: 100, is_visible: false, category_id: 10 }) },
        substitutes: [
          product({ id: 30, name: "Hoja de Laurel", price: 4, category_id: 10 }),
          product({ id: 31, name: "Orégano Molido", price: 11, category_id: 10 }),
        ],
      })
      vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
      const diagnostics: BumpDiagnostics = {}
      expect(
        await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] }, diagnostics)
      ).toEqual([])
      expect(diagnostics.state?.droppedRules).toEqual(["1:product_not_visible"])
    })

    it("no sirve una regla del admin cuyo producto es barato (y lo deja registrado)", async () => {
      const supabase = makeSupabase({
        rules: [rule("perishables", { id: 2, product_id: 100, display_order: 2 })],
        // Producto usable (visible, con existencia) pero de $20.
        bumpProducts: { 100: product({ id: 100, price: 20 }) },
        substitutes: [],
      })
      vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
      const diagnostics: BumpDiagnostics = {}
      expect(
        await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] }, diagnostics)
      ).toEqual([])
      expect(diagnostics.state?.droppedRules).toEqual(["2:product_below_min_price"])
    })

    it("descarta un candidato afín por debajo del piso", async () => {
      const chile: AffinityProduct = { id: 300, name: "Chile Serrano", slug: "chile-serrano" }
      const supabase = makeSupabase({
        rules: [],
        cartProducts: [product({ id: 1, name: "Cebolla Blanca" })],
        categories: [],
        catalog: [{ id: 1, name: "Cebolla Blanca", slug: "cebolla-blanca" }, chile],
        affinityPairs: [
          { source_product_id: 1, target_product_id: 300, kind: "curated", weight: 5 },
        ],
        bumpProducts: { 300: product({ id: 300, name: "Chile Serrano", price: 18 }) },
      })
      vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
      expect(await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })).toEqual([])
    })

    it("el fallback dinámico no registra una regla con producto por debajo del piso", async () => {
      const supabase = makeSupabase({
        rules: [],
        cartProducts: [
          product({ id: 1, name: "Tortillas", category_id: 20, tags: ["taqueria"] }),
        ],
        categories: [{ id: 20, slug: "frutas-verduras" }],
        collections: [collection()],
        rpcProducts: {
          "taquerias-antojitos": [
            { id: 900, name: "Cilantro", slug: "cilantro", price: 7, sale_price: null, stock_status: "in_stock", is_visible: true, category_id: 1 },
            { id: 901, name: "Salsa Roja", slug: "salsa-roja", price: 15, sale_price: null, stock_status: "in_stock", is_visible: true, category_id: 1 },
          ],
        },
      })
      vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
      expect(await resolveBumps({ items: [{ product_id: 1, quantity: 1 }] })).toEqual([])
      expect(
        (supabase as unknown as { __insertBumpRules: ReturnType<typeof vi.fn> })
          .__insertBumpRules
      ).not.toHaveBeenCalled()
    })
  })
})

describe("sanitizeBumpLimit", () => {
  it("sin límite usa el default de la ventana visible", () => {
    expect(sanitizeBumpLimit(undefined)).toBe(MAX_BUMPS)
  })

  it("acepta un límite mayor para el pool encadenado del checkout", () => {
    expect(sanitizeBumpLimit(MAX_BUMPS_REQUEST_LIMIT)).toBe(MAX_BUMPS_REQUEST_LIMIT)
  })
  it("acota al tope de petición (un cliente no puede pedir un pool desmedido)", () => {
    expect(sanitizeBumpLimit(1000)).toBe(MAX_BUMPS_REQUEST_LIMIT)
  })

  it("cae al default con valores inválidos", () => {
    expect(sanitizeBumpLimit(0)).toBe(MAX_BUMPS)
    expect(sanitizeBumpLimit(-5)).toBe(MAX_BUMPS)
    expect(sanitizeBumpLimit(Number.NaN)).toBe(MAX_BUMPS)
    expect(sanitizeBumpLimit(Number.POSITIVE_INFINITY)).toBe(MAX_BUMPS)
  })

  it("trunca decimales a entero", () => {
    expect(sanitizeBumpLimit(5.9)).toBe(5)
  })
})
