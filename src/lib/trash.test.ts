import { describe, expect, it } from "vitest"
import {
  TRASH_RETENTION_DAYS,
  daysUntilPurge,
  isPurgeDue,
  purgeAt,
  purgeLabel,
} from "./trash"

const NOW = new Date("2025-03-31T12:00:00.000Z")

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

describe("purgeAt", () => {
  it("suma la retención a la fecha de borrado", () => {
    const at = purgeAt("2025-03-01T00:00:00.000Z")
    expect(at?.toISOString()).toBe(
      new Date(
        Date.parse("2025-03-01T00:00:00.000Z") + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
      ).toISOString()
    )
  })

  it("acepta Date y devuelve null sin fecha", () => {
    expect(purgeAt(new Date("2025-03-01T00:00:00.000Z"))).toBeInstanceOf(Date)
    expect(purgeAt(null)).toBeNull()
    expect(purgeAt(undefined)).toBeNull()
    expect(purgeAt("")).toBeNull()
  })

  it("devuelve null con una fecha inválida", () => {
    expect(purgeAt("no-es-fecha")).toBeNull()
  })
})

describe("daysUntilPurge", () => {
  it("cuenta los días restantes redondeando hacia arriba", () => {
    // Borrado hace 10 días → quedan 20.
    expect(daysUntilPurge(daysAgo(10), NOW)).toBe(20)
  })

  it("da 0 cuando vence hoy y negativo cuando ya venció", () => {
    expect(daysUntilPurge(daysAgo(TRASH_RETENTION_DAYS), NOW)).toBe(0)
    expect(daysUntilPurge(daysAgo(TRASH_RETENTION_DAYS + 5), NOW)).toBe(-5)
  })

  it("devuelve null si el producto no está en la papelera", () => {
    expect(daysUntilPurge(null, NOW)).toBeNull()
  })
})

describe("isPurgeDue", () => {
  it("es false dentro de la retención", () => {
    expect(isPurgeDue(daysAgo(29), NOW)).toBe(false)
  })

  it("es true al cumplir la retención y después", () => {
    expect(isPurgeDue(daysAgo(TRASH_RETENTION_DAYS), NOW)).toBe(true)
    expect(isPurgeDue(daysAgo(60), NOW)).toBe(true)
  })

  it("es false sin fecha de borrado", () => {
    expect(isPurgeDue(null, NOW)).toBe(false)
  })
})

describe("purgeLabel", () => {
  it("anuncia los días que faltan", () => {
    expect(purgeLabel(daysAgo(10), NOW)).toBe("se purga en 20 días")
  })

  it("usa singular con un día", () => {
    expect(purgeLabel(daysAgo(TRASH_RETENTION_DAYS - 1), NOW)).toBe("se purga en 1 día")
  })

  it("avisa cuando vence hoy o ya venció", () => {
    expect(purgeLabel(daysAgo(TRASH_RETENTION_DAYS), NOW)).toBe("se purga hoy")
    expect(purgeLabel(daysAgo(90), NOW)).toBe("se purga hoy")
  })

  it("devuelve null si no está en la papelera", () => {
    expect(purgeLabel(null, NOW)).toBeNull()
  })
})
