import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { GET, POST } from "./route"

function post(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://resurte.me/api/csp-report", {
    method: "POST",
    headers: { "content-type": "application/reports+json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

describe("POST /api/csp-report", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("acepta un reporte válido y responde 204", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const res = await POST(
      post({
        "csp-report": {
          "effective-directive": "script-src",
          "violated-directive": "script-src 'self' 'nonce-abc'",
          "blocked-uri": "https://evil.example/widget.js",
          "document-uri": "https://resurte.me/?utm_source=leak",
          "line-number": 12,
          "column-number": 4,
        },
      })
    )
    expect(res.status).toBe(204)
    expect(spy).toHaveBeenCalled()
  })

  it("registra la violación con directiva y uri saneada", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    await POST(
      post({
        "csp-report": {
          "effective-directive": "script-src",
          "blocked-uri": "https://evil.example/?secret=leak",
        },
      })
    )
    expect(spy).toHaveBeenCalled()
    const logged = String(spy.mock.calls[0]?.[0] ?? "")
    expect(logged).toContain("CSP-VIOLATION")
    expect(logged).toContain('"effective_directive":"script-src"')
    expect(logged).toContain('"blocked_uri":"https://evil.example/"')
    expect(logged).not.toContain("?secret=leak")
  })

  it("respuesta 204 sin loguear cuando no hay csp-report", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const res = await POST(post({ foo: "bar" }))
    expect(res.status).toBe(204)
    expect(spy).not.toHaveBeenCalled()
  })

  it("descarta sin loguear reportes con directiva CSP desconocida", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const res = await POST(
      post({
        "csp-report": {
          "effective-directive": "definitely-not-a-directive",
          "blocked-uri": "https://spam.example/",
        },
      })
    )
    expect(res.status).toBe(204)
    expect(spy).not.toHaveBeenCalled()
  })

  it("rechaza JSON inválido con 400", async () => {
    const res = await POST(post("not json", { "content-type": "application/json" }))
    expect(res.status).toBe(400)
  })

  it("rechaza bodies mayores a 16KB con 413", async () => {
    const big = { "csp-report": { "script-sample": "x".repeat(20_000) } }
    const res = await POST(post(big))
    expect(res.status).toBe(413)
  })

  it("rechaza GET con 405", async () => {
    const res = GET()
    expect(res.status).toBe(405)
  })
})
