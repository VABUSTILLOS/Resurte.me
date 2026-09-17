import { describe, expect, it } from "vitest"
import {
  REDEMPTION_BRIEF_LIMITS,
  REDEMPTION_STATUSES,
  REDEMPTION_STATUS_LABEL,
  REDEMPTION_TRANSITIONS,
  briefCompleteness,
  canTransitionRedemption,
  formatRedemptionDueDate,
  isOpenRedemption,
  isRedemptionOverdue,
  isRedemptionStatus,
  nextRedemptionStatuses,
  normalizeRedemptionBrief,
  redemptionAgeDays,
  slaDaysRemaining,
} from "./redemptions"

describe("normalizeRedemptionBrief", () => {
  it("exige el nombre del restaurante: es la razón por la que el canje no se cobra", () => {
    for (const bad of [undefined, null, {}, { restaurant_name: "" }, { restaurant_name: " a " }]) {
      const result = normalizeRedemptionBrief(bad)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe("El nombre de tu restaurante es obligatorio")
      }
    }
  })

  it("recorta y acepta un nombre válido", () => {
    const result = normalizeRedemptionBrief({ restaurant_name: "  El Buen Pastor  " })
    expect(result).toEqual({
      ok: true,
      brief: {
        restaurant_name: "El Buen Pastor",
        maps_url: null,
        social_handle: null,
        notes: null,
      },
    })
  })

  it("convierte los campos vacíos en null en lugar de guardar cadenas vacías", () => {
    const result = normalizeRedemptionBrief({
      restaurant_name: "El Buen Pastor",
      maps_url: "   ",
      social_handle: "",
      notes: "   ",
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.brief.maps_url).toBeNull()
      expect(result.brief.social_handle).toBeNull()
      expect(result.brief.notes).toBeNull()
    }
  })

  it("sólo acepta http(s) como link de Maps", () => {
    for (const bad of [
      "maps.google.com/x",
      "javascript:alert(1)",
      "ftp://maps.google.com",
      "//maps.google.com",
    ]) {
      const result = normalizeRedemptionBrief({ restaurant_name: "Taquería", maps_url: bad })
      expect(result.ok).toBe(false)
    }
    for (const good of ["https://maps.app.goo.gl/x", "http://maps.google.com/y"]) {
      const result = normalizeRedemptionBrief({ restaurant_name: "Taquería", maps_url: good })
      expect(result.ok).toBe(true)
    }
  })

  it("trunca a los límites declarados", () => {
    const result = normalizeRedemptionBrief({
      restaurant_name: "a".repeat(500),
      notes: "b".repeat(5000),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.brief.restaurant_name).toHaveLength(REDEMPTION_BRIEF_LIMITS.restaurantName)
      expect(result.brief.notes).toHaveLength(REDEMPTION_BRIEF_LIMITS.notes)
    }
  })
})

describe("máquina de estados", () => {
  it("delivered y cancelled son terminales", () => {
    expect(REDEMPTION_TRANSITIONS.delivered).toEqual([])
    expect(REDEMPTION_TRANSITIONS.cancelled).toEqual([])
    expect(isOpenRedemption("delivered")).toBe(false)
    expect(isOpenRedemption("cancelled")).toBe(false)
  })

  it("sólo requested e in_progress están abiertas", () => {
    expect(REDEMPTION_STATUSES.filter(isOpenRedemption)).toEqual(["requested", "in_progress"])
  })

  it("no se puede saltar de requested a delivered", () => {
    expect(canTransitionRedemption("requested", "delivered")).toBe(false)
    expect(canTransitionRedemption("requested", "in_progress")).toBe(true)
    expect(nextRedemptionStatuses("requested")).toEqual(["in_progress", "cancelled"])
  })

  it("cada estado tiene etiqueta", () => {
    for (const s of REDEMPTION_STATUSES) {
      expect(REDEMPTION_STATUS_LABEL[s]).toBeTruthy()
    }
  })

  it("isRedemptionStatus rechaza valores de la vida real", () => {
    expect(isRedemptionStatus("pending")).toBe(false)
    expect(isRedemptionStatus("completed")).toBe(false)
    expect(isRedemptionStatus(42)).toBe(false)
    expect(isRedemptionStatus("delivered")).toBe(true)
  })
})

describe("SLA", () => {
  const now = new Date("2026-01-01T12:00:00.000Z")

  it("cuenta días hacia adelante y negativo al vencer", () => {
    expect(slaDaysRemaining("2026-01-15T12:00:00.000Z", now)).toBe(14)
    expect(slaDaysRemaining("2025-12-31T12:00:00.000Z", now)).toBe(-1)
  })

  it("null cuando no hay fecha o es inválida", () => {
    expect(slaDaysRemaining(null, now)).toBeNull()
    expect(slaDaysRemaining("no-es-fecha", now)).toBeNull()
  })

  it("sólo se reporta vencida si sigue abierta", () => {
    const due = "2025-12-01T00:00:00.000Z"
    expect(isRedemptionOverdue({ status: "requested", due_at: due }, now)).toBe(true)
    expect(isRedemptionOverdue({ status: "in_progress", due_at: due }, now)).toBe(true)
    // Entregada a destiempo no es un problema pendiente.
    expect(isRedemptionOverdue({ status: "delivered", due_at: due }, now)).toBe(false)
    expect(isRedemptionOverdue({ status: "cancelled", due_at: due }, now)).toBe(false)
  })

  it("edad de la solicitud nunca es negativa", () => {
    expect(redemptionAgeDays("2025-12-25T12:00:00.000Z", now)).toBe(7)
    expect(redemptionAgeDays("2026-06-01T12:00:00.000Z", now)).toBe(0)
    expect(redemptionAgeDays(null, now)).toBeNull()
  })
})

describe("formatRedemptionDueDate", () => {
  it("formatea en el huso de operación, no en el del navegador", () => {
    // 2026-01-05T02:00Z es el 4 de enero en México (UTC-6): el equipo y el
    // cliente deben ver el mismo día.
    expect(formatRedemptionDueDate("2026-01-05T02:00:00.000Z")).toBe("4 de enero")
  })

  it("null para entrada ausente o inválida", () => {
    expect(formatRedemptionDueDate(null)).toBeNull()
    expect(formatRedemptionDueDate("xx")).toBeNull()
  })
})

describe("briefCompleteness", () => {
  it("0 cuando no hay brief (caso real: escritura fallida)", () => {
    expect(briefCompleteness(null)).toBe(0)
    expect(briefCompleteness({})).toBe(0)
  })

  it("cuenta sólo campos con contenido", () => {
    expect(briefCompleteness({ restaurant_name: "X" })).toBe(0.25)
    expect(
      briefCompleteness({ restaurant_name: "X", maps_url: "https://a.com", notes: "  " })
    ).toBe(0.5)
    expect(
      briefCompleteness({
        restaurant_name: "X",
        maps_url: "https://a.com",
        social_handle: "@x",
        notes: "n",
      })
    ).toBe(1)
  })
})
