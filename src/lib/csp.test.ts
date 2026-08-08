import { describe, expect, it } from "vitest"
import { buildCspHeader } from "./csp"

describe("buildCspHeader", () => {
  it("enforce (default) es la policy endurecida: sin hosts de terceros en script-src", () => {
    const csp = buildCspHeader("abc123")
    const scriptSrc = csp.match(/script-src ([^;]+);/)?.[1] ?? ""
    expect(csp).toContain("'nonce-abc123'")
    expect(csp).toContain("'strict-dynamic'")
    // GA4/Meta cargan vía strict-dynamic (script con nonce); los hosts ya no
    // se listan en script-src (validado en prod en fase 22).
    expect(scriptSrc).not.toContain("googletagmanager.com")
    expect(scriptSrc).not.toContain("connect.facebook.net")
    expect(csp).toContain("report-uri /api/csp-report")
  })

  it("quita hosts de terceros de script-src en modo hardened (equivalente a enforce)", () => {
    const csp = buildCspHeader("abc123", { hardened: true })
    const scriptSrc = csp.match(/script-src ([^;]+);/)?.[1] ?? ""
    expect(scriptSrc).not.toContain("googletagmanager.com")
    expect(scriptSrc).not.toContain("connect.facebook.net")
    // Se mantiene nonce + strict-dynamic: los scripts de terceros siguen
    // permitidos vía strict-dynamic en navegadores modernos.
    expect(scriptSrc).toContain("'nonce-abc123'")
    expect(scriptSrc).toContain("'strict-dynamic'")
  })

  it("mantiene el resto de directivas en modo hardened", () => {
    const csp = buildCspHeader("abc123", { hardened: true })
    expect(csp).toContain("connect-src")
    expect(csp).toContain("https://storage.googleapis.com")
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it("permite el iframe y API de Stripe (checkout embebido)", () => {
    const csp = buildCspHeader("abc123")
    const frameSrc = csp.match(/frame-src ([^;]+);/)?.[1] ?? ""
    expect(frameSrc).toContain("https://js.stripe.com")
    expect(frameSrc).toContain("https://hooks.stripe.com")
    expect(csp).toContain("https://api.stripe.com")
    expect(csp).toContain("https://m.stripe.network")
    expect(csp).toContain("https://js.stripe.com")
  })

  it("mantiene Stripe en modo hardened (dependencia funcional)", () => {
    const csp = buildCspHeader("abc123", { hardened: true })
    const frameSrc = csp.match(/frame-src ([^;]+);/)?.[1] ?? ""
    expect(frameSrc).toContain("https://js.stripe.com")
    expect(csp).toContain("https://api.stripe.com")
  })

  it("incluye upgrade-insecure-requests en enforce pero no en report-only", () => {
    // Enforce (default): sí lo incluye.
    expect(buildCspHeader("abc123")).toContain("upgrade-insecure-requests")
    // Report-only: lo omite (el navegador lo ignora y emite un aviso benigno).
    expect(buildCspHeader("abc123", { reportOnly: true })).not.toContain(
      "upgrade-insecure-requests"
    )
    expect(buildCspHeader("abc123", { hardened: true, reportOnly: true })).not.toContain(
      "upgrade-insecure-requests"
    )
  })
})
