import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/app/admin/actions", () => ({
  getAdminCityPerformance: vi.fn(),
  getAdminCityTip: vi.fn(),
}))
vi.mock("@/lib/ai/kie-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/kie-ai")>()
  return { ...actual, isKieAiConfigured: vi.fn() }
})

import { GET } from "./route"
import { POST } from "./tip/route"
import { requireAdmin } from "@/lib/admin-auth"
import { getAdminCityPerformance, getAdminCityTip } from "@/app/admin/actions"
import { isKieAiConfigured, KieAiError } from "@/lib/ai/kie-ai"

const EMPTY_PERFORMANCE = {
  days: 30,
  truncated: false,
  cities: [],
  withoutOrders: [],
  needsAttention: [],
  medianAov: 0,
  maxCatalogCoverage: null,
  totals: { withOrders: 0, withoutOrders: 0, revenue: 0 },
}

function getRequest(query = "") {
  return new NextRequest(`http://localhost/api/admin/city-performance${query}`)
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/city-performance/tip", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: "admin-1" },
    response: null,
  } as never)
  vi.mocked(isKieAiConfigured).mockReturnValue(true)
  vi.mocked(getAdminCityPerformance).mockResolvedValue(EMPTY_PERFORMANCE as never)
})

describe("GET /api/admin/city-performance", () => {
  it("devuelve el desempeño sin caché", async () => {
    const res = await GET(getRequest("?days=7"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(getAdminCityPerformance).toHaveBeenCalledWith(7)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    expect(body.days).toBe(30)
  })

  it("usa 30 días por defecto cuando no se manda el parámetro", async () => {
    await GET(getRequest())

    expect(getAdminCityPerformance).toHaveBeenCalledWith(30)
  })

  it("acepta 90 días", async () => {
    await GET(getRequest("?days=90"))

    expect(getAdminCityPerformance).toHaveBeenCalledWith(90)
  })

  it("cae al default con un periodo fuera del allowlist, sin 5xx", async () => {
    const res = await GET(getRequest("?days=999"))

    expect(res.status).toBe(200)
    expect(getAdminCityPerformance).toHaveBeenCalledWith(30)
  })

  it("respeta la denegación de requireAdmin y no consulta datos", async () => {
    const denied = NextResponse.json({ error: "no" }, { status: 403 })
    vi.mocked(requireAdmin).mockResolvedValue({ user: null, response: denied } as never)

    const res = await GET(getRequest())

    expect(res.status).toBe(403)
    expect(getAdminCityPerformance).not.toHaveBeenCalled()
  })

  it("responde 500 si la carga falla", async () => {
    vi.mocked(getAdminCityPerformance).mockRejectedValue(new Error("boom"))

    const res = await GET(getRequest())

    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe("Error interno")
  })
})

describe("POST /api/admin/city-performance/tip", () => {
  it("responde 503 cuando Kie.ai no está configurada", async () => {
    vi.mocked(isKieAiConfigured).mockReturnValue(false)

    const res = await POST(postRequest({ cityId: 1, days: 30 }))

    expect(res.status).toBe(503)
    expect(getAdminCityTip).not.toHaveBeenCalled()
  })

  it("la denegación de admin gana sobre la falta de configuración", async () => {
    vi.mocked(isKieAiConfigured).mockReturnValue(false)
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: NextResponse.json({ error: "no" }, { status: 403 }),
    } as never)

    const res = await POST(postRequest({ cityId: 1 }))

    expect(res.status).toBe(403)
  })

  it("valida cityId antes de llamar a la IA", async () => {
    for (const body of [{}, { cityId: "abc" }, { cityId: 0 }, { cityId: -2 }, { cityId: 1.5 }]) {
      const res = await POST(postRequest(body))
      expect(res.status).toBe(400)
    }
    expect(getAdminCityTip).not.toHaveBeenCalled()
  })

  it("normaliza days fuera del allowlist a 30", async () => {
    vi.mocked(getAdminCityTip).mockResolvedValue({ tip: "ok" } as never)

    await POST(postRequest({ cityId: 3, days: 999 }))

    expect(getAdminCityTip).toHaveBeenCalledWith({ cityId: 3, days: 30 })
  })

  it("devuelve el tip sin caché", async () => {
    const tip = { cityId: 3, cityName: "Puebla", tip: "1. Refuerza el catálogo." }
    vi.mocked(getAdminCityTip).mockResolvedValue(tip as never)

    const res = await POST(postRequest({ cityId: 3, days: 7 }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(tip)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
  })

  it("mapea una ciudad inexistente a 404", async () => {
    vi.mocked(getAdminCityTip).mockRejectedValue(new Error("Ciudad no encontrada"))

    const res = await POST(postRequest({ cityId: 999 }))

    expect(res.status).toBe(404)
  })

  it("propaga el status de KieAiError", async () => {
    vi.mocked(getAdminCityTip).mockRejectedValue(new KieAiError("rate limit", 429))

    const res = await POST(postRequest({ cityId: 1 }))

    expect(res.status).toBe(429)
  })
})
