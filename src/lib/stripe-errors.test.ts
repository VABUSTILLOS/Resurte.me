import { describe, it, expect } from "vitest"
import { stripeErrorMessage } from "./stripe-errors"

describe("stripeErrorMessage", () => {
  it("mapea card_declined a mensaje accionable en español", () => {
    expect(
      stripeErrorMessage({ type: "card_error", code: "card_declined", message: "Your card was declined." }),
    ).toBe("Tu banco rechazó la tarjeta. Usa otra tarjeta o contacta a tu banco para más información.")
  })

  it("mapea insufficient_funds", () => {
    expect(
      stripeErrorMessage({ type: "card_error", code: "insufficient_funds" }),
    ).toContain("Fondos insuficientes")
  })

  it("mapea expired_card", () => {
    expect(stripeErrorMessage({ type: "card_error", code: "expired_card" })).toContain("vencida")
  })

  it("mapea incorrect_number", () => {
    expect(stripeErrorMessage({ type: "card_error", code: "incorrect_number" })).toContain("número")
  })

  it("mapea processing_error", () => {
    expect(stripeErrorMessage({ type: "card_error", code: "processing_error" })).toContain("no pudo procesar")
  })

  it("mapea authentication_required (3D Secure)", () => {
    expect(stripeErrorMessage({ type: "card_error", code: "authentication_required" })).toContain("3D Secure")
  })

  it("mapea por tipo genérico cuando no hay código específico", () => {
    expect(stripeErrorMessage({ type: "rate_limit_error" })).toContain("demasiados intentos")
    expect(stripeErrorMessage({ type: "api_connection_error" })).toContain("conexión")
    expect(stripeErrorMessage({ type: "api_error" })).toContain("interno")
    expect(stripeErrorMessage({ type: "authentication_error" })).toContain("autenticar")
    expect(stripeErrorMessage({ type: "invalid_request_error" })).toContain("no es válida")
  })

  it("cae al message crudo cuando no hay code ni type conocido", () => {
    expect(stripeErrorMessage({ message: "Some raw stripe error." })).toBe("Some raw stripe error.")
  })

  it("usa fallback en español para null/undefined", () => {
    expect(stripeErrorMessage(null)).toContain("Intenta de nuevo")
    expect(stripeErrorMessage(undefined)).toContain("Intenta de nuevo")
  })
})
