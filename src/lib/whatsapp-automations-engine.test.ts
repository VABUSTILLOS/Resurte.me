import { describe, expect, it } from "vitest"
import {
  AUTOMATION_DEFAULTS,
  automationDedupeKey,
  effectiveAutomationConfig,
  isReminderDue,
  resolveReminderLevels,
  type WaAutomationConfig,
} from "./whatsapp-automations-engine"

const cfg = (partial: Partial<WaAutomationConfig> = {}): WaAutomationConfig => ({
  is_active: true,
  trigger_delay_hours: 1,
  config: {},
  template_id: null,
  ...partial,
})

describe("effectiveAutomationConfig", () => {
  it("usa la persistida si existe", () => {
    const persisted = cfg({ is_active: false })
    expect(effectiveAutomationConfig(persisted, "payment_recovery").is_active).toBe(false)
  })

  it("cae a defaults si no hay fila", () => {
    const eff = effectiveAutomationConfig(null, "payment_recovery")
    expect(eff.is_active).toBe(true)
    expect(eff.config.levels).toEqual([1, 24, 48])
  })

  it("tipo desconocido sin fila queda inactivo", () => {
    expect(effectiveAutomationConfig(null, "nope").is_active).toBe(false)
  })

  it("cubre los 6 tipos con defaults", () => {
    for (const type of ["payment_recovery", "cart_abandonment", "birthday", "reactivation", "post_delivery_rating", "onboarding"]) {
      expect(AUTOMATION_DEFAULTS[type]).toBeDefined()
    }
  })
})

describe("resolveReminderLevels", () => {
  it("usa los niveles de la config, ordenados", () => {
    expect(resolveReminderLevels(cfg({ config: { levels: [24, 1, 48] } }))).toEqual([1, 24, 48])
  })

  it("cae a [1, 24, 48] con niveles inválidos", () => {
    expect(resolveReminderLevels(cfg({ config: { levels: [] } }))).toEqual([1, 24, 48])
    expect(resolveReminderLevels(cfg({ config: { levels: [0, -5] } }))).toEqual([1, 24, 48])
    expect(resolveReminderLevels(cfg())).toEqual([1, 24, 48])
  })
})

describe("isReminderDue", () => {
  it("dispara dentro de la ventana ±0.5 h de algún nivel", () => {
    expect(isReminderDue(1, [1, 24, 48])).toBe(true)
    expect(isReminderDue(24, [1, 24, 48])).toBe(true)
    expect(isReminderDue(5, [1, 24, 48])).toBe(false)
    expect(isReminderDue(5, [5])).toBe(true)
  })
})

describe("automationDedupeKey", () => {
  it("compone tipo + destinatario + día", () => {
    expect(automationDedupeKey("birthday", "5216141234567", "2026-09-15"))
      .toBe("birthday:5216141234567:2026-09-15")
  })
})

import { cdmxDateParts, isBirthdayToday, buildBirthdayText, buildCartAbandonmentText } from "./whatsapp-automations-engine"

describe("cdmxDateParts", () => {
  it("convierte UTC a America/Mexico_City", () => {
    // 2026-09-15 12:00 UTC = 06:00 CDMX (UTC-6 en septiembre)
    const parts = cdmxDateParts(new Date("2026-09-15T12:00:00Z"))
    expect(parts.year).toBe(2026)
    expect(parts.month).toBe(9)
    expect(parts.day).toBe(15)
    expect(parts.hour).toBe(6)
  })
})

describe("isBirthdayToday", () => {
  it("compara mes/día ignorando el año", () => {
    const parts = { year: 2026, month: 9, day: 15, hour: 6 }
    expect(isBirthdayToday("1990-09-15", parts)).toBe(true)
    expect(isBirthdayToday("1990-09-16", parts)).toBe(false)
  })
})

describe("textos de automatización", () => {
  it("birthday incluye cupón y porcentaje", () => {
    const text = buildBirthdayText({ name: "Ana", coupon: "CUMPLE15", percent: 15 })
    expect(text).toContain("Ana")
    expect(text).toContain("CUMPLE15")
    expect(text).toContain("15%")
  })

  it("cart abandonment incluye el total formateado", () => {
    expect(buildCartAbandonmentText({ total: 250 })).toContain("$250.00")
  })
})
