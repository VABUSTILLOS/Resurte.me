import { describe, it, expect } from "vitest"
import {
  sanitizePhoneNumber,
  buildWhatsappLink,
  weeklyReminderMessage,
  firstContactMessage,
} from "./whatsapp"

describe("sanitizePhoneNumber", () => {
  it("devuelve cadena vacía para null/undefined/vacío", () => {
    expect(sanitizePhoneNumber(null)).toBe("")
    expect(sanitizePhoneNumber(undefined)).toBe("")
    expect(sanitizePhoneNumber("")).toBe("")
  })

  it("normaliza 10 dígitos a formato 52 + 10", () => {
    expect(sanitizePhoneNumber("55 1234 5678")).toBe("525512345678")
    expect(sanitizePhoneNumber("+52 55 1234 5678")).toBe("525512345678")
  })

  it("quita el 1 heredado en números de 11 dígitos", () => {
    expect(sanitizePhoneNumber("1 55 1234 5678")).toBe("525512345678")
  })

  it("acepta números ya en formato 52", () => {
    expect(sanitizePhoneNumber("525512345678")).toBe("525512345678")
  })
})

describe("buildWhatsappLink", () => {
  it("devuelve vacío si no hay teléfono usable", () => {
    expect(buildWhatsappLink(null, "hola")).toBe("")
    expect(buildWhatsappLink("", "hola")).toBe("")
  })

  it("construye un wa.me con el mensaje codificado", () => {
    const link = buildWhatsappLink("55 1234 5678", "Hola, ¿cómo estás?")
    expect(link).toBe(
      `https://wa.me/525512345678?text=${encodeURIComponent("Hola, ¿cómo estás?")}`
    )
  })
})

describe("mensajes prellenados", () => {
  it("weeklyReminderMessage incluye restaurante y vendedor", () => {
    const msg = weeklyReminderMessage("Ana", "Taquería El Sol")
    expect(msg).toContain("Taquería El Sol")
    expect(msg).toContain("Ana")
  })

  it("weeklyReminderMessage funciona sin restaurante", () => {
    const msg = weeklyReminderMessage("Ana", null)
    expect(msg).toContain("¡Hola!")
    expect(msg).toContain("Ana")
  })

  it("firstContactMessage incluye prospecto y restaurante", () => {
    const msg = firstContactMessage("Ana", "Luis", "Taquería El Sol")
    expect(msg).toContain("Luis")
    expect(msg).toContain("Taquería El Sol")
    expect(msg).toContain("Ana")
  })
})
