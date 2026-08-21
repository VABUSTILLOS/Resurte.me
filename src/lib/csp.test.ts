import { describe, expect, it } from "vitest"
import { buildStaticCspHeader } from "./csp"

describe("buildStaticCspHeader", () => {
  it("es estática (sin nonce) y permite scripts inline + hosts de terceros", () => {
    const csp = buildStaticCspHeader()
    const scriptSrc = csp.match(/script-src ([^;]+);/)?.[1] ?? ""
    expect(scriptSrc).not.toContain("nonce-")
    expect(scriptSrc).toContain("'self'")
    expect(scriptSrc).toContain("'unsafe-inline'")
    expect(scriptSrc).toContain("googletagmanager.com")
    expect(scriptSrc).toContain("connect.facebook.net")
    expect(scriptSrc).toContain("https://js.stripe.com")
  })

  it("report-uri solo se solicita en modo report-only (ahorra invocaciones)", () => {
    // En enforce los navegadores con extensiones/antivirus enviarían un POST
    // a /api/csp-report por cada página: miles de invocaciones sin valor.
    expect(buildStaticCspHeader()).not.toContain("report-uri")
    expect(buildStaticCspHeader({ reportOnly: true })).toContain(
      "report-uri /api/csp-report"
    )
  })

  it("mantiene directivas de endurecimiento no relacionadas con scripts", () => {
    const csp = buildStaticCspHeader()
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("connect-src")
    expect(csp).toContain("https://storage.googleapis.com")
  })

  it("permite el iframe y API de Stripe (checkout embebido)", () => {
    const csp = buildStaticCspHeader()
    const frameSrc = csp.match(/frame-src ([^;]+);/)?.[1] ?? ""
    expect(frameSrc).toContain("https://js.stripe.com")
    expect(frameSrc).toContain("https://hooks.stripe.com")
    expect(csp).toContain("https://api.stripe.com")
    expect(csp).toContain("https://m.stripe.network")
  })

  it("incluye upgrade-insecure-requests en enforce pero no en report-only", () => {
    expect(buildStaticCspHeader()).toContain("upgrade-insecure-requests")
    expect(buildStaticCspHeader({ reportOnly: true })).not.toContain(
      "upgrade-insecure-requests"
    )
  })
})
