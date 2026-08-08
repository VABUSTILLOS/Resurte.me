import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"

function makeSupabase(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as Awaited<ReturnType<typeof import("@/lib/supabase/service").createServiceClient>>
}

describe("rateLimited", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("devuelve allowed=true cuando el RPC lo permite", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: true, remaining: 9, retry_after_seconds: 0 }],
      error: null,
    })
    const result = await rateLimited(makeSupabase(rpc), "test:key", 10, 60)
    expect(result).toEqual({ allowed: true, remaining: 9, retry_after_seconds: 0 })
    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", {
      p_key: "test:key",
      p_limit: 10,
      p_window_seconds: 60,
    })
  })

  it("devuelve allowed=false con retry_after cuando se excede el límite", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ allowed: false, remaining: 0, retry_after_seconds: 42 }],
      error: null,
    })
    const result = await rateLimited(makeSupabase(rpc), "test:key", 10, 60)
    expect(result).toEqual({ allowed: false, remaining: 0, retry_after_seconds: 42 })
  })

  it("fail-open: error de BD no bloquea tráfico legítimo", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("boom") })
    const result = await rateLimited(makeSupabase(rpc), "test:key", 10, 60)
    expect(result).toEqual({ allowed: true, remaining: 10, retry_after_seconds: 0 })
  })

  it("fail-open: data vacía no bloquea", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    const result = await rateLimited(makeSupabase(rpc), "test:key", 10, 60)
    expect(result).toEqual({ allowed: true, remaining: 10, retry_after_seconds: 0 })
  })
})

describe("clientIp", () => {
  it("usa x-forwarded-for y toma el primer valor", () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    })
    expect(clientIp(req)).toBe("203.0.113.7")
  })

  it("cae a x-real-ip", () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: { "x-real-ip": "198.51.100.9" },
    })
    expect(clientIp(req)).toBe("198.51.100.9")
  })

  it("cae a 'unknown' sin headers", () => {
    const req = new NextRequest("http://localhost/api/test")
    expect(clientIp(req)).toBe("unknown")
  })
})

describe("rateLimitResponse", () => {
  it("devuelve 429 con header Retry-After", () => {
    const res = rateLimitResponse({ allowed: false, remaining: 0, retry_after_seconds: 42 })
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBe("42")
  })
})
