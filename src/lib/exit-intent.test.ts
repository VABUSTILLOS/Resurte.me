import { describe, it, expect } from "vitest"
import {
  isExitMouseEvent,
  buildExitLeadPayload,
  EXIT_EMAIL_RE,
} from "./exit-intent"

describe("exit-intent (lógica de abandono de carrito)", () => {
  describe("isExitMouseEvent", () => {
    it("detecta salida real por el borde superior (clientY <= 0, sin relatedTarget)", () => {
      expect(
        isExitMouseEvent({ clientY: -1, relatedTarget: null })
      ).toBe(true)
      expect(isExitMouseEvent({ clientY: 0, relatedTarget: null })).toBe(true)
    })

    it("NO detecta movimiento interno de la página (relatedTarget presente)", () => {
      const button = {} as EventTarget
      expect(
        isExitMouseEvent({ clientY: 0, relatedTarget: button })
      ).toBe(false)
    })

    it("NO detecta salida por lados no superiores", () => {
      expect(
        isExitMouseEvent({ clientY: 40, relatedTarget: null })
      ).toBe(false)
    })
  })

  describe("buildExitLeadPayload", () => {
    it("devuelve payload válido con email, teléfono y cupón", () => {
      const payload = buildExitLeadPayload({
        email: "  User@Example.COM  ",
        phone: "  614-555  ",
        couponCode: "BIENVENIDO10",
      })
      expect(payload).toEqual({
        email: "user@example.com",
        phone: "614-555",
        source: "exit_intent",
        coupon_code: "BIENVENIDO10",
      })
    })

    it("omite phone y coupon si vienen vacíos", () => {
      const payload = buildExitLeadPayload({ email: "a@b.mx" })
      expect(payload).toEqual({ email: "a@b.mx", source: "exit_intent" })
    })

    it("devuelve null para emails inválidos", () => {
      expect(buildExitLeadPayload({ email: "no-es-un-email" })).toBeNull()
      expect(buildExitLeadPayload({ email: "a@b" })).toBeNull()
      expect(buildExitLeadPayload({ email: "" })).toBeNull()
      expect(buildExitLeadPayload({ email: "   " })).toBeNull()
    })

    it("el regex de email coincide con el del endpoint de leads", () => {
      expect(EXIT_EMAIL_RE.test("user@example.com")).toBe(true)
      expect(EXIT_EMAIL_RE.test("x.y+z@sub.example.mx")).toBe(true)
      expect(EXIT_EMAIL_RE.test("no-email")).toBe(false)
    })
  })
})
