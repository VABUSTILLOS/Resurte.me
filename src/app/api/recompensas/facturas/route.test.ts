import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({
  rateLimited: vi.fn(),
  rateLimitResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "Rate limit" }), { status: 429 })
  ),
  clientIp: vi.fn(() => "1.2.3.4"),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { POST } from "./route"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { rateLimited } from "@/lib/rate-limit"

const USER = { id: "u-1", email: "a@b.com" }

function req(body: unknown) {
  return new NextRequest("http://localhost/api/recompensas/facturas", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function setup(insertResult: { data: unknown; error: unknown } = { data: { id: 7, status: "pending" }, error: null }) {
  const builder: Record<string, unknown> = {}
  const single = vi.fn().mockResolvedValue(insertResult)
  for (const m of ["select", "eq", "order"]) builder[m] = vi.fn().mockReturnValue(builder)
  builder.single = single
  builder.insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) })
  builder.limit = vi.fn().mockResolvedValue({ data: [], error: null })
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: USER }, error: null }) },
    from: vi.fn(() => builder),
  } as never)
  vi.mocked(createServiceClient).mockResolvedValue({} as never)
  vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
  return builder
}

describe("POST /api/recompensas/facturas", () => {
  beforeEach(() => vi.clearAllMocks())

  it("401 sin sesión", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never)
    const res = await POST(req({ image_path: "u-1/f.jpg" }))
    expect(res.status).toBe(401)
  })

  it("400 si el path no pertenece al usuario", async () => {
    setup()
    const res = await POST(req({ image_path: "otro-usuario/f.jpg" }))
    expect(res.status).toBe(400)
  })

  it("400 con path malicioso (..)", async () => {
    setup()
    const res = await POST(req({ image_path: "u-1/../otro/f.jpg" }))
    expect(res.status).toBe(400)
  })

  it("201 registra el envío en la carpeta del usuario", async () => {
    setup()
    const res = await POST(req({ image_path: "u-1/123-fac.jpg", total_amount: 5000 }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.submission).toMatchObject({ id: 7, status: "pending" })
  })
})
