import { afterEach, describe, expect, it, vi } from "vitest"
import { allowsLiveStripeKey, isProductionDeploy } from "./deploy-env"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("isProductionDeploy", () => {
  it("solo es verdadero con VERCEL_ENV=production", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    expect(isProductionDeploy()).toBe(true)
  })

  it("es falso en preview, en development y sin la variable", () => {
    // El valor por defecto importa: los consumidores fallan hacia el lado
    // seguro (noindex, no aceptar llaves live), así que un entorno que no se
    // identifica debe quedar del lado conservador.
    for (const value of ["preview", "development", "", "PRODUCTION"]) {
      vi.stubEnv("VERCEL_ENV", value)
      expect(isProductionDeploy(), `VERCEL_ENV=${JSON.stringify(value)}`).toBe(false)
    }
  })
})

describe("allowsLiveStripeKey", () => {
  it("permite la llave live en producción", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    expect(allowsLiveStripeKey()).toBe(true)
  })

  it("la bloquea fuera de producción", () => {
    // El escenario real: el sandbox de staging hereda la llave live y una
    // prueba cobra de verdad.
    vi.stubEnv("VERCEL_ENV", "preview")
    expect(allowsLiveStripeKey()).toBe(false)

    vi.stubEnv("VERCEL_ENV", "")
    expect(allowsLiveStripeKey()).toBe(false)
  })

  it("la permite con la válvula explícita desde la máquina del desarrollador", () => {
    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("ALLOW_LIVE_STRIPE", "1")
    expect(allowsLiveStripeKey()).toBe(true)

    vi.stubEnv("ALLOW_LIVE_STRIPE", "true")
    expect(allowsLiveStripeKey()).toBe(true)
  })

  it("no acepta cualquier valor como válvula", () => {
    vi.stubEnv("VERCEL_ENV", "")
    for (const value of ["0", "yes", "sí", "false", ""]) {
      vi.stubEnv("ALLOW_LIVE_STRIPE", value)
      expect(allowsLiveStripeKey(), `ALLOW_LIVE_STRIPE=${JSON.stringify(value)}`).toBe(false)
    }
  })
})
