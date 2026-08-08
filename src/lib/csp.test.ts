import { describe, expect, it } from "vitest"
import { buildCspHeader } from "./csp"

describe("buildCspHeader", () => {
  it("incluye nonce, strict-dynamic y hosts de terceros en modo enforce", () => {
    const csp = buildCspHeader("abc123")
    expect(csp).toContain("'nonce-abc123'")
    expect(csp).toContain("'strict-dynamic'")
    expect(csp).toContain("https://www.googletagmanager.com")
    expect(csp).toContain("https://connect.facebook.net")
    expect(csp).toContain("report-uri /api/csp-report")
  })

  it("quita hosts de terceros de script-src en modo hardened", () => {
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
})
