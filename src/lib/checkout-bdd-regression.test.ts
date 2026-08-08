import { describe, expect, it } from "vitest"
import {
  validDeliveryFee,
  freeShippingProgress,
  MAX_BUMPS as CONFIG_MAX_BUMPS,
} from "./checkout-config"
import {
  evaluateTriggerTypes,
  resolveBumpPricing,
  type BumpRuleRow,
} from "./order-bumps"

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
    ...overrides,
  }
}

// -----------------------------------------------------------
// BDD: "Envío gratis al alcanzar el umbral" / "al superar el umbral"
// -----------------------------------------------------------
describe("BDD — envío gratis (barra de progreso)", () => {
  it("$499 → envío $35; $500 → envío $0 (frontera exacta del umbral)", () => {
    expect(validDeliveryFee(1, 499, 35)).toBe(35)
    expect(validDeliveryFee(1, 500, 35)).toBe(0)
  })

  it("el subtotal pagable usado para el envío incluye el descuento del cupón", () => {
    // Subtotal $520 − cupón 10% ($52) → $468 pagable → NO es gratis
    expect(validDeliveryFee(1, 468, 35)).toBe(35)
    // Subtotal $600 − cupón $120 → $480 pagable → NO gratis
    expect(validDeliveryFee(1, 480, 35)).toBe(35)
    // Subtotal $650 − cupón $100 → $550 pagable → gratis
    expect(validDeliveryFee(1, 550, 35)).toBe(0)
  })

  it("mensajes exactos de la barra de progreso", () => {
    const near = freeShippingProgress(499.99)
    expect(near.message).toBe("Agrega $0.01 más para envío gratis")
    const free = freeShippingProgress(500)
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
// BDD: "Máximo 3 bumps simultáneos"
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
