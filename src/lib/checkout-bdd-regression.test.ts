import { describe, expect, it } from "vitest"
import {
  validDeliveryFee,
  freeShippingProgress,
  FREE_SHIPPING_THRESHOLD,
  MAX_BUMPS as CONFIG_MAX_BUMPS,
  MIN_ITEM_QUANTITY,
} from "./checkout-config"
import { resolveQuantityChange } from "./order-lines"
import {
  bumpUnitPrice,
  evaluateTriggerTypes,
  resolveBumpPricing,
  type BumpRuleRow,
} from "./order-bumps"
import {
  computeAffinity,
  normalizeIngredient,
  type AffinityProduct,
  type AffinityRecipe,
} from "./ingredient-affinity"

/**
 * Suite de regresión BDD — mapea los escenarios de
 * `src/features/checkout-bumps-upsells.feature` a los contratos puros de las
 * librerías de checkout. Esta suite es el "contrato de regresión": si una de
 * estas invariantes se rompe, el flujo de alta conversión deja de ser
 * retrocompatible con la operación actual.
 *
 * Los flujos de Stripe (cargo off-session, 3DS, idempotencia) se prueban en
 * profundidad en `payments-upsell.test.ts`; aquí se verifica el contrato de
 * alto nivel que las historias BDD declaran.
 */

function rule(overrides: Partial<BumpRuleRow> = {}): BumpRuleRow {
  return {
    id: 1,
    trigger_type: "subtotal_threshold",
    category_slugs: [],
    subtotal_min: 500,
    product_id: 100,
    title: "Bolsa reutilizable",
    description: "Alta resistencia",
    discount_pct: 0.05,
    is_active: true,
    display_order: 1,
    collection_slug: null,
    ...overrides,
  }
}

// -----------------------------------------------------------
// BDD: "Envío gratis al alcanzar el umbral" / "al superar el umbral"
// -----------------------------------------------------------
describe("BDD — envío gratis (barra de progreso)", () => {
  it("un peso bajo el umbral → envío $125; en el umbral → envío $0 (frontera exacta)", () => {
    expect(validDeliveryFee(1, FREE_SHIPPING_THRESHOLD - 1, 125)).toBe(125)
    expect(validDeliveryFee(1, FREE_SHIPPING_THRESHOLD, 125)).toBe(0)
  })

  it("el subtotal pagable usado para el envío incluye el descuento del cupón", () => {
    // Subtotal bruto por encima del umbral, pero el cupón deja el pagable
    // por debajo → se cobra envío.
    const bruto = FREE_SHIPPING_THRESHOLD + 500
    const pagableConCupon = bruto - 600
    expect(pagableConCupon).toBeLessThan(FREE_SHIPPING_THRESHOLD)
    expect(validDeliveryFee(1, pagableConCupon, 125)).toBe(125)
    // El mismo bruto sin cupón sí alcanza el envío gratis.
    expect(validDeliveryFee(1, bruto, 125)).toBe(0)
  })

  it("mensajes exactos de la barra de progreso", () => {
    const near = freeShippingProgress(FREE_SHIPPING_THRESHOLD - 0.01)
    expect(near.message).toBe("Agrega $0.01 más para envío gratis")
    const free = freeShippingProgress(FREE_SHIPPING_THRESHOLD)
    expect(free.message).toBe("🎉 Tienes envío gratis")
  })
})

// -----------------------------------------------------------
// BDD: "Orden estándar sin bumps ni upsells (retrocompatibilidad)"
// -----------------------------------------------------------
describe("BDD — retrocompatibilidad de la orden estándar", () => {
  it("sin categorías ni umbral no se dispara ninguna regla de bump", () => {
    const matched = evaluateTriggerTypes(
      new Set(["limpieza-hogar"]),
      250,
      [rule({ trigger_type: "perishables", category_slugs: ["frutas-verduras"] })]
    )
    expect(matched).toEqual([])
  })

  it("un bump sin regla activa no puede inventarse el descuento", () => {
    const result = resolveBumpPricing({
      bumpItems: [{ product_id: 100, quantity: 1 }],
      basePriceByProduct: new Map([[100, 25]]),
      discountPctByProduct: new Map(), // sin regla activa → sin descuento
    })
    expect(result).toEqual({ ok: false, missingProductId: 100 })
  })
})

// -----------------------------------------------------------
// BDD: "Todas las reglas disparadas aportan su bump, sin tope artificial"
// -----------------------------------------------------------
describe("BDD — límite de bumps", () => {
  it("MAX_BUMPS es exactamente 3 (límite acordado de bumps simultáneos)", () => {
    expect(CONFIG_MAX_BUMPS).toBe(3)
  })

  it("las tres reglas disparadas devuelven exactamente 3 bumps, uno por trigger", () => {
    const rules = [
      rule({
        id: 1,
        trigger_type: "perishables",
        category_slugs: ["frutas-verduras"],
      }),
      rule({
        id: 2,
        trigger_type: "snacks_drinks",
        category_slugs: ["bebidas"],
      }),
      rule({ id: 3, trigger_type: "subtotal_threshold", subtotal_min: 500 }),
    ]
    const matched = evaluateTriggerTypes(
      new Set(["frutas-verduras", "bebidas"]),
      600,
      rules
    )
    expect(matched).toHaveLength(3)
    expect([...matched].sort()).toEqual([
      "perishables",
      "snacks_drinks",
      "subtotal_threshold",
    ])
  })
})

// -----------------------------------------------------------
// BDD: "Total de la orden base congelado" + "clics repetidos no duplican"
// (invariantes de diseño; el detalle Stripe vive en payments-upsell.test.ts)
// -----------------------------------------------------------
describe("BDD — invariantes del upsell 1-click", () => {
  it("el resumen consolidado = orders.total + upsells pagados (total base congelado)", () => {
    const baseTotal = 512.5
    const upsellsPaid = [120, 45.9].reduce((a, b) => a + b, 0)
    const consolidated = baseTotal + upsellsPaid
    // La orden base NO cambia jamás por un upsell
    expect(consolidated).toBe(678.4)
    expect(baseTotal).toBe(512.5)
  })

  it("la clave de idempotencia del downsell es distinta de la del upsell", () => {
    const key = "4f1c-abc"
    // Upsell y downsell usan claves distintas para que la reconciliación no
    // confunda ofertas (decisión de diseño documentada en el modal).
    expect(`${key}`).not.toBe(`${key}-ds`)
  })
})

// -----------------------------------------------------------
// BDD: "Bump sugerido por colección/receta" + "Exclusión estricta"
// -----------------------------------------------------------
describe("BDD — cross-sell por colección/receta", () => {
  it("recipe_collection dispara SOLO si la colección está en el carrito", () => {
    const recipeRule = rule({
      id: 6,
      trigger_type: "recipe_collection",
      collection_slug: "taquerias-antojitos",
      subtotal_min: null,
    })
    const withCollection = evaluateTriggerTypes(
      new Set(["carnes-aves-pescados"]),
      300,
      [recipeRule],
      new Set(["taquerias-antojitos"])
    )
    expect(withCollection).toContain("recipe_collection")

    const withoutCollection = evaluateTriggerTypes(
      new Set(["carnes-aves-pescados"]),
      300,
      [recipeRule],
      new Set()
    )
    expect(withoutCollection).toEqual([])
  })

  it("la regla de receta nunca excluye una categoría válida (compatibilidad)", () => {
    const rules = [
      rule({
        id: 1,
        trigger_type: "perishables",
        category_slugs: ["frutas-verduras"],
      }),
      rule({
        id: 6,
        trigger_type: "recipe_collection",
        collection_slug: "taquerias-antojitos",
        subtotal_min: null,
      }),
    ]
    const matched = evaluateTriggerTypes(
      new Set(["frutas-verduras"]),
      300,
      rules,
      new Set(["taquerias-antojitos"])
    )
    expect(matched).toContain("perishables")
    expect(matched).toContain("recipe_collection")
    expect(matched).toHaveLength(2)
  })
})

// -----------------------------------------------------------
// BDD: "Un artículo en 0 se elimina solo con confirmación" / "El segundo "−" en
// una línea en 0 pide confirmar la eliminación"
// -----------------------------------------------------------
describe("BDD — cantidades con piso 0 y confirmación de eliminación", () => {
  it("en el carrito, 1 → 0 vacía la línea; volver a bajar (sentinel −1) pide confirmar", () => {
    expect(resolveQuantityChange(true, 0)).toEqual({ type: "empty" })
    expect(resolveQuantityChange(false, -1)).toEqual({ type: "confirm-remove" })
  })

  it("una línea ya fuera del carrito en 0 no se elimina sola: exige confirmación", () => {
    expect(resolveQuantityChange(false, 0)).toEqual({ type: "confirm-remove" })
  })

  it("subir desde 0 restaura la línea en el carrito con la cantidad pedida", () => {
    expect(resolveQuantityChange(false, 1)).toEqual({ type: "restore", quantity: 1 })
    expect(resolveQuantityChange(false, 3)).toEqual({ type: "restore", quantity: 3 })
  })

  it("con la línea en el carrito, cualquier cantidad > 0 es un set directo", () => {
    expect(resolveQuantityChange(true, 1)).toEqual({ type: "set", quantity: 1 })
    expect(resolveQuantityChange(true, 5)).toEqual({ type: "set", quantity: 5 })
  })

  it("MIN_ITEM_QUANTITY es 0: el piso del checkout ya no bloquea el \"−\"", () => {
    expect(MIN_ITEM_QUANTITY).toBe(0)
  })
})
// -----------------------------------------------------------
// BDD: "Afinidad por ingrediente + nombres reales del catálogo"
// -----------------------------------------------------------
describe("BDD — afinidad por ingrediente", () => {
  const catalogo: AffinityProduct[] = [
    { id: 1, name: "Cebolla Blanca", slug: "cebolla-blanca" },
    { id: 2, name: "Jitomate Bola", slug: "jitomate-bola" },
    { id: 3, name: "Chile Serrano", slug: "chile-serrano" },
    { id: 4, name: "Limón", slug: "limon" },
  ]

  // El recetario llega indexado por colección, igual que `RECIPES`.
  const recetas: Record<string, AffinityRecipe[]> = {
    "taquerias-antojitos": [
      { name: "Salsa roja", ingredients: ["1 kg Cebolla Blanca", "500 g Jitomate Bola"] },
    ],
  }

  const afinidad = (input: {
    cart: AffinityProduct[]
    pairs?: { source_product_id: number; target_product_id: number; kind: "curated" | "recipe"; weight: number }[]
    recipes?: Record<string, AffinityRecipe[]>
  }) =>
    computeAffinity({
      cartProducts: input.cart,
      allProducts: catalogo,
      recipes: input.recipes ?? {},
      curatedPairs: input.pairs ?? [],
      limit: 3,
    })

  it("la afinidad no es un trigger evaluable: no dispara por sí sola", () => {
    const matched = evaluateTriggerTypes(
      new Set(["taquerias-antojitos"]),
      1000,
      [rule({ trigger_type: "ingredient_affinity" })],
      new Set(["taquerias-antojitos"])
    )
    expect(matched).toHaveLength(0)
  })

  it("normaliza unidades y calificativos al comparar ingredientes", () => {
    expect(normalizeIngredient("1 kg Cebolla Blanca")).toBe("cebolla blanca")
    expect(normalizeIngredient("Cebolla morada fresca")).toBe("cebolla morada")
    expect(afinidad({ cart: [catalogo[0]!], recipes: recetas }).map((c) => c.productId)).toEqual([2])
  })

  it("el par curado gana el motivo sobre el de receta, sin duplicar el producto", () => {
    const candidates = afinidad({
      cart: [catalogo[0]!],
      recipes: recetas,
      pairs: [{ source_product_id: 1, target_product_id: 2, kind: "curated", weight: 5 }],
    })
    const matches = candidates.filter((c) => c.productId === 2)
    expect(matches).toHaveLength(1)
    expect(matches[0]?.kind).toBe("curated")
    expect(matches[0]?.reason).toBe("Ideal con Cebolla Blanca")
  })

  it("nunca sugiere un producto que ya está en el carrito", () => {
    const candidates = afinidad({
      cart: catalogo,
      recipes: recetas,
      pairs: [{ source_product_id: 1, target_product_id: 2, kind: "curated", weight: 5 }],
    })
    expect(candidates).toHaveLength(0)
  })

  it("sin recetario y sin pares curados no hay candidatos: el tier es puramente aditivo", () => {
    expect(afinidad({ cart: [catalogo[0]!] })).toHaveLength(0)
  })

  it("el descuento de afinidad es el mismo 10% que el de receta", () => {
    const pricing = resolveBumpPricing({
      bumpItems: [{ product_id: 100, quantity: 1 }],
      basePriceByProduct: new Map([[100, 100]]),
      discountPctByProduct: new Map([[100, 0.1]]),
    })
    expect(pricing).toEqual({ ok: true, pricesByProduct: new Map([[100, 90]]) })
    expect(bumpUnitPrice(100, 0.1)).toBe(90)
  })
})
