import { afterEach, describe, expect, it, vi } from "vitest"
import {
  getIntegrationStatuses,
  getUnconfiguredIntegrations,
  isIntegrationConfigured,
} from "@/lib/integration-status"

const ENV_KEYS = [
  "RESEND_API_KEY",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "STRIPE_CONNECT_ENABLED",
  "STRIPE_SECRET_KEY",
  "UBER_DIRECT_CLIENT_ID",
  "UBER_DIRECT_CLIENT_SECRET",
  "UBER_DIRECT_CUSTOMER_ID",
  "NEXT_PUBLIC_SPEI_CLABE",
  "NEXT_PUBLIC_SPEI_BENEFICIARIO",
  "NEXT_PUBLIC_OXXO_REFERENCIA",
  "OPENAI_API_KEY",
]

function clearAll() {
  for (const key of ENV_KEYS) vi.stubEnv(key, "")
}

function status(id: string) {
  const found = getIntegrationStatuses().find((s) => s.id === id)
  if (!found) throw new Error(`integración desconocida: ${id}`)
  return found
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("getIntegrationStatuses", () => {
  it("reporta todo apagado cuando no hay ninguna variable", () => {
    clearAll()
    const all = getIntegrationStatuses()
    expect(all.length).toBeGreaterThan(0)
    expect(all.every((s) => !s.configured)).toBe(true)
    // Sin nada configurado, `missing` debe listar todas las requeridas.
    for (const s of all) {
      expect(s.missing).toEqual(s.requires)
    }
  })

  it("marca una integración como configurada sólo con TODAS sus variables", () => {
    clearAll()
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token")

    expect(status("whatsapp").configured).toBe(false)
    expect(status("whatsapp").missing).toEqual(["WHATSAPP_PHONE_NUMBER_ID"])

    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123")

    expect(status("whatsapp").configured).toBe(true)
    expect(status("whatsapp").missing).toEqual([])
  })

  it("ignora variables presentes pero vacías o en blanco", () => {
    clearAll()
    vi.stubEnv("RESEND_API_KEY", "   ")
    expect(isIntegrationConfigured("email")).toBe(false)

    vi.stubEnv("RESEND_API_KEY", "re_123")
    expect(isIntegrationConfigured("email")).toBe(true)
  })

  it("exige que STRIPE_CONNECT_ENABLED valga true/1, no sólo que exista", () => {
    clearAll()
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_x")

    // Presente pero apagado: `configured` false y el motivo debe aparecer en
    // `missing` (antes salía vacío y el panel no explicaba nada).
    vi.stubEnv("STRIPE_CONNECT_ENABLED", "false")
    expect(status("stripe_connect").configured).toBe(false)
    expect(status("stripe_connect").missing).toEqual(["STRIPE_CONNECT_ENABLED"])

    vi.stubEnv("STRIPE_CONNECT_ENABLED", "0")
    expect(status("stripe_connect").configured).toBe(false)

    vi.stubEnv("STRIPE_CONNECT_ENABLED", "1")
    expect(status("stripe_connect").configured).toBe(true)

    vi.stubEnv("STRIPE_CONNECT_ENABLED", "true")
    expect(status("stripe_connect").configured).toBe(true)
  })

  it("no declara configurada stripe_connect si falta la llave secreta", () => {
    clearAll()
    vi.stubEnv("STRIPE_CONNECT_ENABLED", "true")
    expect(status("stripe_connect").configured).toBe(false)
    expect(status("stripe_connect").missing).toEqual(["STRIPE_SECRET_KEY"])
  })
})

describe("getUnconfiguredIntegrations", () => {
  it("devuelve justo el complemento de las configuradas", () => {
    clearAll()
    vi.stubEnv("RESEND_API_KEY", "re_123")
    vi.stubEnv("OPENAI_API_KEY", "sk-x")

    const off = getUnconfiguredIntegrations().map((s) => s.id)
    expect(off).not.toContain("email")
    expect(off).not.toContain("ai")
    expect(off).toContain("whatsapp")
    expect(off).toContain("spei")
    expect(off).toContain("oxxo")
  })

  it("cada integración apagada explica el impacto al producto", () => {
    clearAll()
    for (const s of getUnconfiguredIntegrations()) {
      expect(s.impact.trim().length).toBeGreaterThan(0)
    }
  })
})
