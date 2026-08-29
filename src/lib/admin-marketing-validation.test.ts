import { describe, it, expect } from "vitest"
import {
  validateBumpRuleInput,
  validateCouponInput,
} from "./admin-marketing-validation"

describe("validateBumpRuleInput", () => {
  const validBase = {
    trigger_type: "perishables",
    category_slugs: ["frutas-verduras"],
    product_id: 42,
    title: "Empaque térmico",
    description: "Mantén tus perecederos frescos",
    discount_pct: 0.1,
  }

  it("acepta una regla válida con defaults", () => {
    const result = validateBumpRuleInput(validBase)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.is_active).toBe(true)
      expect(result.value.display_order).toBe(0)
      expect(result.value.subtotal_min).toBeNull()
    }
  })

  it("rechaza trigger_type desconocido", () => {
    const result = validateBumpRuleInput({ ...validBase, trigger_type: "magic" })
    expect(result.ok).toBe(false)
  })

  it("exige category_slugs para triggers de categoría", () => {
    const result = validateBumpRuleInput({ ...validBase, category_slugs: [] })
    expect(result.ok).toBe(false)
  })

  it("exige subtotal_min positivo para subtotal_threshold", () => {
    expect(
      validateBumpRuleInput({
        ...validBase,
        trigger_type: "subtotal_threshold",
        category_slugs: [],
      }).ok,
    ).toBe(false)
    expect(
      validateBumpRuleInput({
        ...validBase,
        trigger_type: "subtotal_threshold",
        category_slugs: [],
        subtotal_min: 500,
      }).ok,
    ).toBe(true)
  })

  it("rechaza discount_pct fuera de 0-1", () => {
    expect(validateBumpRuleInput({ ...validBase, discount_pct: 1.5 }).ok).toBe(false)
    expect(validateBumpRuleInput({ ...validBase, discount_pct: -0.1 }).ok).toBe(false)
  })

  it("rechaza product_id no entero", () => {
    expect(validateBumpRuleInput({ ...validBase, product_id: 1.5 }).ok).toBe(false)
  })

  it("recorta espacios del título y rechaza vacíos", () => {
    expect(validateBumpRuleInput({ ...validBase, title: "  " }).ok).toBe(false)
  })
})

describe("validateCouponInput", () => {
  it("acepta un cupón porcentual válido y normaliza el código", () => {
    const result = validateCouponInput({
      code: " resurte10 ",
      discount_type: "percentage",
      discount_value: 10,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.code).toBe("RESURTE10")
      expect(result.value.max_uses).toBe(0)
      expect(result.value.expires_at).toBeNull()
    }
  })

  it("rechaza códigos inválidos", () => {
    expect(validateCouponInput({ code: "ab", discount_type: "fixed_amount", discount_value: 10 }).ok).toBe(false)
    expect(validateCouponInput({ code: "CON ESPACIO", discount_type: "fixed_amount", discount_value: 10 }).ok).toBe(false)
  })

  it("rechaza porcentajes > 100 y valores negativos", () => {
    expect(validateCouponInput({ code: "ABC", discount_type: "percentage", discount_value: 150 }).ok).toBe(false)
    expect(validateCouponInput({ code: "ABC", discount_type: "fixed_amount", discount_value: -5 }).ok).toBe(false)
  })

  it("convierte expires_at a ISO", () => {
    const result = validateCouponInput({
      code: "ABC",
      discount_type: "fixed_amount",
      discount_value: 50,
      expires_at: "2026-01-01",
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.expires_at).toBe(new Date("2026-01-01").toISOString())
  })

  it("rechaza expires_at inválido", () => {
    expect(
      validateCouponInput({
        code: "ABC",
        discount_type: "fixed_amount",
        discount_value: 50,
        expires_at: "no-es-fecha",
      }).ok,
    ).toBe(false)
  })
})
