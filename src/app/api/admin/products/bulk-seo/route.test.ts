import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/ai/kie-ai", () => {
  class KieAiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.name = "KieAiError"
      this.status = status
    }
  }
  return { KieAiError, chatCompletion: vi.fn(), isKieAiConfigured: vi.fn() }
})

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { KieAiError, chatCompletion, isKieAiConfigured } from "@/lib/ai/kie-ai"
import { SEO_DESCRIPTION_MAX, SEO_MAX_IDS, SEO_TITLE_MAX } from "@/lib/seo-batch"

interface FakeResult {
  data?: unknown
  error?: unknown
}

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
}

/** Cliente Supabase falso con un resultado por tabla, en orden de consumo. */
function serviceWith(byTable: Record<string, FakeResult | FakeResult[]>) {
  const cursors = new Map<string, number>()
  const selects: { table: string; columns: string }[] = []
  const filters: { table: string; op: string; args: unknown[] }[] = []

  function thenable(builder: Record<string, unknown>, result: FakeResult) {
    builder.then = (
      onFulfilled: (value: FakeResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(onFulfilled, onRejected)
    return builder
  }

  const from = vi.fn((table: string) => {
    const configured = byTable[table] ?? { data: [], error: null }
    const list = Array.isArray(configured) ? configured : [configured]
    const cursor = cursors.get(table) ?? 0
    cursors.set(table, cursor + 1)
    const result = list[Math.min(cursor, list.length - 1)] ?? { data: [], error: null }

    const builder: Record<string, unknown> = {}
    builder.select = vi.fn((columns?: string) => {
      selects.push({ table, columns: columns ?? "" })
      return builder
    })
    for (const op of ["eq", "neq", "in", "is", "not", "like", "gte", "lte", "order", "limit"]) {
      builder[op] = vi.fn((...args: unknown[]) => {
        filters.push({ table, op, args })
        return builder
      })
    }
    return thenable(builder, result)
  })

  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from, selects, filters }
}

const PRODUCT = {
  id: 7,
  name: "Taco al pastor",
  brand: "Don Taco",
  description: "Tortilla de maíz con cerdo adobado",
  tags: ["taco", "cerdo"],
  seo_title: null,
  seo_description: null,
  category_id: 5,
}

function seoRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/products/bulk-seo", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

describe("/api/admin/products/bulk-seo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isKieAiConfigured).mockReturnValue(true)
  })

  it("devuelve 403 y no toca Supabase si el admin es rechazado", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never)

    const response = await POST(seoRequest({ ids: [7] }))

    expect(response.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(isKieAiConfigured).not.toHaveBeenCalled()
  })

  it("devuelve 500 cuando la IA no está configurada", async () => {
    asAdmin()
    vi.mocked(isKieAiConfigured).mockReturnValue(false)

    const response = await POST(seoRequest({ ids: [7] }))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toContain("KIE_AI_API_KEY")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("devuelve 400 cuando no se envían ids válidos", async () => {
    asAdmin()

    const sinIds = await POST(seoRequest({}))
    const soloBasura = await POST(seoRequest({ ids: ["7", 2.5, null] }))

    expect(sinIds.status).toBe(400)
    expect(soloBasura.status).toBe(400)
    expect((await sinIds.json()).error).toBe("Se requiere ids")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("devuelve 400 cuando se supera SEO_MAX_IDS", async () => {
    asAdmin()

    const ids = Array.from({ length: SEO_MAX_IDS + 1 }, (_, i) => i + 1)
    const response = await POST(seoRequest({ ids }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe(`Máximo ${SEO_MAX_IDS} productos por tanda`)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("deduplica ids, omite los que ya tienen SEO y trunca las propuestas a los máximos", async () => {
    asAdmin()
    const supabase = serviceWith({
      products: {
        data: [PRODUCT, { ...PRODUCT, id: 8, name: "Gordita", seo_title: "Gordita", seo_description: "Rica" }],
        error: null,
      },
      categories: { data: [{ id: 5, name: "Abarrotes" }], error: null },
    })
    vi.mocked(chatCompletion).mockResolvedValue({
      content: `\`\`\`json
{"title":"${"T".repeat(90)}","description":"${"D".repeat(200)}"}
\`\`\``,
      raw: {},
    } as never)

    const response = await POST(seoRequest({ ids: [7, 7, 8] }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.skipped).toEqual([{ id: 8, name: "Gordita", reason: "ya tiene SEO" }])
    expect(json.failed).toEqual([])
    expect(json.proposals).toHaveLength(1)
    expect(json.proposals[0].id).toBe(7)
    expect(json.proposals[0].seo_title).toHaveLength(SEO_TITLE_MAX)
    expect(json.proposals[0].seo_description).toHaveLength(SEO_DESCRIPTION_MAX)
    expect(chatCompletion).toHaveBeenCalledTimes(1)
    expect(supabase.filters).toContainEqual({ table: "products", op: "in", args: ["id", [7, 8]] })
    expect(supabase.filters).toContainEqual({ table: "products", op: "is", args: ["deleted_at", null] })
    const call = vi.mocked(chatCompletion).mock.calls[0]?.[0]
    expect(call?.model).toBe("")
    expect(call?.temperature).toBe(0.4)
    expect(call?.messages[1]?.content).toContain("categoría Abarrotes")
  })

  it("con overwrite: true regenera el SEO de productos que ya lo tenían", async () => {
    asAdmin()
    serviceWith({
      products: {
        data: [{ ...PRODUCT, seo_title: "Viejo", seo_description: "Vieja" }],
        error: null,
      },
      categories: { data: [], error: null },
    })
    vi.mocked(chatCompletion).mockResolvedValue({
      content: '{"title":"Nuevo título","description":"Nueva descripción"}',
      raw: {},
    } as never)

    const response = await POST(seoRequest({ ids: [7], overwrite: true }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.skipped).toEqual([])
    expect(json.proposals).toEqual([
      { id: 7, name: "Taco al pastor", seo_title: "Nuevo título", seo_description: "Nueva descripción" },
    ])
  })

  it("reporta los ids inexistentes como omitidos con nombre #id", async () => {
    asAdmin()
    serviceWith({ products: { data: [PRODUCT], error: null } })
    vi.mocked(chatCompletion).mockResolvedValue({
      content: '{"title":"Título","description":"Descripción"}',
      raw: {},
    } as never)

    const response = await POST(seoRequest({ ids: [7, 99] }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.skipped).toEqual([{ id: 99, name: "#99", reason: "no disponible" }])
  })

  it("marca como fallido el producto cuando la IA no devuelve JSON válido", async () => {
    asAdmin()
    serviceWith({ products: { data: [PRODUCT], error: null } })
    vi.mocked(chatCompletion).mockResolvedValue({ content: "lo siento, no puedo", raw: {} } as never)

    const response = await POST(seoRequest({ ids: [7] }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.proposals).toEqual([])
    expect(json.failed).toEqual([
      { id: 7, name: "Taco al pastor", reason: "respuesta sin JSON válido" },
    ])
  })

  it("registra el mensaje del error de la IA y responde 200 con el fallo por producto", async () => {
    asAdmin()
    serviceWith({ products: { data: [PRODUCT], error: null } })
    vi.mocked(chatCompletion).mockRejectedValue(new KieAiError("límite alcanzado", 429))

    const response = await POST(seoRequest({ ids: [7] }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.failed).toEqual([
      { id: 7, name: "Taco al pastor", reason: "límite alcanzado" },
    ])
  })

  it("propaga el status de KieAiError cuando el fallo ocurre fuera del bucle", async () => {
    asAdmin()
    vi.mocked(createServiceClient).mockRejectedValue(new KieAiError("sin cuota", 429))

    const response = await POST(seoRequest({ ids: [7] }))
    const json = await response.json()

    expect(response.status).toBe(429)
    expect(json.error).toBe("sin cuota")
  })

  it("devuelve 500 cuando falla la lectura de productos", async () => {
    asAdmin()
    serviceWith({ products: { data: null, error: { message: "relation does not exist" } } })

    const response = await POST(seoRequest({ ids: [7] }))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe("relation does not exist")
    expect(chatCompletion).not.toHaveBeenCalled()
  })
})
