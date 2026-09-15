import { beforeEach, describe, expect, it, vi } from "vitest"

const exchangeCodeForSession = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession },
  })),
}))

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}))

import { GET } from "./route"

function get(query: string, headers: Record<string, string> = {}) {
  return new Request(`https://resurte.me/auth/callback${query}`, { headers })
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    exchangeCodeForSession.mockResolvedValue({ error: null })
  })

  it("vuelve al destino interno indicado en ?next=", async () => {
    const res = await GET(get("?code=abc&next=/admin"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("https://resurte.me/admin")
  })

  it("preserva query en destinos internos", async () => {
    const res = await GET(get("?code=abc&next=/cuenta/pedidos?tab=activos"))
    expect(res.headers.get("location")).toBe(
      "https://resurte.me/cuenta/pedidos?tab=activos"
    )
  })

  it("ignora una URL absoluta externa (open redirect)", async () => {
    const res = await GET(get("?code=abc&next=https://evil.example.com"))
    expect(res.headers.get("location")).toBe("https://resurte.me/")
  })

  it("ignora una URL protocol-relative", async () => {
    const res = await GET(get("?code=abc&next=//evil.example.com"))
    expect(res.headers.get("location")).toBe("https://resurte.me/")
  })

  it("usa la home cuando no hay ?next=", async () => {
    const res = await GET(get("?code=abc"))
    expect(res.headers.get("location")).toBe("https://resurte.me/")
  })

  it("respeta x-forwarded-host en destinos internos", async () => {
    const res = await GET(
      get("?code=abc&next=/admin", { "x-forwarded-host": "preview.resurte.me" })
    )
    expect(res.headers.get("location")).toBe("https://preview.resurte.me/admin")
  })

  it("manda al login cuando el código falla", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid code" } })
    const res = await GET(get("?code=bad&next=/admin"))
    const location = res.headers.get("location") ?? ""
    expect(location).toContain("/auth/login?error=")
  })

  it("manda al login cuando no hay código", async () => {
    const res = await GET(get("?next=/admin"))
    expect(res.headers.get("location")).toBe(
      "https://resurte.me/auth/login?error=auth_callback_error"
    )
  })

  it("usa la cookie de destino cuando OAuth vuelve sin ?next=", async () => {
    const res = await GET(
      get("?code=abc", { cookie: "resurte_auth_next=%2Fadmin" })
    )
    expect(res.headers.get("location")).toBe("https://resurte.me/admin")
  })

  it("prefiere ?next= sobre la cookie", async () => {
    const res = await GET(
      get("?code=abc&next=/cuenta", { cookie: "resurte_auth_next=%2Fadmin" })
    )
    expect(res.headers.get("location")).toBe("https://resurte.me/cuenta")
  })

  it("sanea la cookie igual que el parámetro (open redirect)", async () => {
    const res = await GET(
      get("?code=abc", {
        cookie: "resurte_auth_next=https%3A%2F%2Fevil.example.com",
      })
    )
    expect(res.headers.get("location")).toBe("https://resurte.me/")
  })

  it("borra la cookie de destino tras consumirla", async () => {
    const res = await GET(
      get("?code=abc", { cookie: "resurte_auth_next=%2Fadmin" })
    )
    expect(res.headers.get("set-cookie")).toContain("resurte_auth_next=;")
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0")
  })
})
