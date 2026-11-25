import { describe, expect, it } from "vitest"
import {
  AUTOMATION_DEFAULTS,
  conditionalFlowNeedsThreshold,
  evaluateFlowCondition,
  parseConditionalFlowRules,
  renderFlowText,
  type ConditionalFlowFacts,
} from "./whatsapp-automations-engine"

const facts = (partial: Partial<ConditionalFlowFacts> = {}): ConditionalFlowFacts => ({
  orderCount: 1,
  orderTotal: 650,
  hasActiveRecurrence: false,
  ...partial,
})

describe("AUTOMATION_DEFAULTS.conditional_flows", () => {
  it("nace apagado y sin reglas", () => {
    const defaults = AUTOMATION_DEFAULTS.conditional_flows
    expect(defaults).toBeDefined()
    expect(defaults?.is_active).toBe(false)
    expect(defaults?.config.rules).toEqual([])
  })
})

describe("parseConditionalFlowRules", () => {
  it("parsea reglas válidas y descarta las que no tienen nada que enviar", () => {
    const rules = parseConditionalFlowRules({
      rules: [
        {
          id: "bienvenida",
          name: "Bienvenida",
          condition: "first_order",
          template_name: "promocion_semanal_resurte",
          text: "Hola {nombre}",
          is_active: true,
        },
        { id: "vacia", name: "Vacía", condition: "first_order", template_name: "", text: "" },
        { id: "rara", name: "Rara", condition: "cumpleanos", template_name: "x", text: "hola" },
        "no-es-objeto",
      ],
    })
    expect(rules).toHaveLength(1)
    expect(rules[0]?.id).toBe("bienvenida")
    expect(rules[0]?.condition).toBe("first_order")
    expect(rules[0]?.threshold).toBeNull()
  })

  it("conserva el umbral solo en las condiciones que lo usan", () => {
    const rules = parseConditionalFlowRules({
      rules: [
        { condition: "order_total_gte", threshold: 1500, text: "gracias", template_name: "" },
        { condition: "first_order", threshold: 999, text: "hola", template_name: "" },
      ],
    })
    expect(rules[0]?.threshold).toBe(1500)
    expect(rules[1]?.threshold).toBeNull()
  })

  it("sin arreglo de reglas devuelve vacío", () => {
    expect(parseConditionalFlowRules({})).toEqual([])
    expect(parseConditionalFlowRules(null)).toEqual([])
    expect(parseConditionalFlowRules({ rules: "no" })).toEqual([])
  })

  it("una regla sin is_active explícito queda activa", () => {
    const rules = parseConditionalFlowRules({
      rules: [{ condition: "active_recurrence", text: "hola", template_name: "" }],
    })
    expect(rules[0]?.is_active).toBe(true)
  })
})

describe("conditionalFlowNeedsThreshold", () => {
  it("solo las condiciones de umbral lo piden", () => {
    expect(conditionalFlowNeedsThreshold("order_count_gte")).toBe(true)
    expect(conditionalFlowNeedsThreshold("order_total_gte")).toBe(true)
    expect(conditionalFlowNeedsThreshold("first_order")).toBe(false)
    expect(conditionalFlowNeedsThreshold("active_recurrence")).toBe(false)
  })
})

describe("evaluateFlowCondition", () => {
  it("first_order solo con exactamente un pedido", () => {
    const rule = { condition: "first_order" as const, threshold: null }
    expect(evaluateFlowCondition(rule, facts({ orderCount: 1 }))).toBe(true)
    expect(evaluateFlowCondition(rule, facts({ orderCount: 2 }))).toBe(false)
  })

  it("order_count_gte compara contra el umbral y sin umbral no dispara", () => {
    const rule = { condition: "order_count_gte" as const, threshold: 5 }
    expect(evaluateFlowCondition(rule, facts({ orderCount: 5 }))).toBe(true)
    expect(evaluateFlowCondition(rule, facts({ orderCount: 4 }))).toBe(false)
    expect(
      evaluateFlowCondition({ condition: "order_count_gte", threshold: null }, facts({ orderCount: 99 }))
    ).toBe(false)
  })

  it("order_total_gte compara el total de este pedido", () => {
    const rule = { condition: "order_total_gte" as const, threshold: 1000 }
    expect(evaluateFlowCondition(rule, facts({ orderTotal: 1000 }))).toBe(true)
    expect(evaluateFlowCondition(rule, facts({ orderTotal: 999.99 }))).toBe(false)
  })

  it("active_recurrence sigue el hecho", () => {
    const rule = { condition: "active_recurrence" as const, threshold: null }
    expect(evaluateFlowCondition(rule, facts({ hasActiveRecurrence: true }))).toBe(true)
    expect(evaluateFlowCondition(rule, facts({ hasActiveRecurrence: false }))).toBe(false)
  })
})

describe("renderFlowText", () => {
  it("sustituye nombre, pedido y total", () => {
    const out = renderFlowText("Hola {nombre}, tu pedido {pedido} de {total} va en camino", {
      customerName: "María López",
      orderId: 84,
      orderTotal: 612,
    })
    expect(out).toBe("Hola María, tu pedido #84 de $612.00 MXN va en camino")
  })

  it("sin nombre no deja espacios dobles", () => {
    const out = renderFlowText("Hola {nombre}, gracias por tu pedido {pedido}", {
      customerName: null,
      orderId: 7,
      orderTotal: 500,
    })
    expect(out).toBe("Hola , gracias por tu pedido #7")
  })
})
