import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ reportServerError: vi.fn() }))

vi.mock("@/lib/error-log", () => ({ reportServerError: mocks.reportServerError }))

import {
  fallbackTemplates,
  generateText,
  resolveAdapter,
  type AiDeps,
  type AiRequest,
} from "./llm"
import type { BudgetDecision } from "./budget"

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function okResponse(text: string, tokens: number | null = 42): Response {
  return jsonResponse({
    choices: [{ message: { content: text } }],
    ...(tokens === null ? {} : { usage: { total_tokens: tokens } }),
  })
}

interface Harness {
  deps: AiDeps
  fetchMock: ReturnType<typeof vi.fn>
  reserve: ReturnType<typeof vi.fn>
  settle: ReturnType<typeof vi.fn>
  sleep: ReturnType<typeof vi.fn>
}

function harness(
  options: {
    responses?: Array<Response | Error>
    env?: Record<string, string | undefined>
    budget?: BudgetDecision
  } = {}
): Harness {
  const responses = options.responses ?? [okResponse("hola")]
  let call = 0
  const fetchMock = vi.fn(async () => {
    const next = responses[Math.min(call, responses.length - 1)]
    call += 1
    if (next instanceof Error) throw next
    return next
  })
  const reserve = vi.fn(async (): Promise<BudgetDecision> => options.budget ?? { allowed: true, enforced: true })
  const settle = vi.fn(async () => {})
  const sleep = vi.fn(async () => {})

  return {
    fetchMock,
    reserve,
    settle,
    sleep,
    deps: {
      fetch: fetchMock as unknown as typeof fetch,
      env: { OPENAI_API_KEY: "sk-test", ...options.env },
      reserve,
      settle,
      sleep,
    },
  }
}

/** Cuerpo JSON del n-ésimo intento, sin indexado opcional ruidoso. */
function sentBody(h: Harness, index = 0): Record<string, unknown> {
  const [, init] = h.fetchMock.mock.calls[index] ?? []
  return JSON.parse((init as RequestInit).body as string)
}

function sentUrl(h: Harness, index = 0): string {
  const [url] = h.fetchMock.mock.calls[index] ?? []
  return url as string
}

const baseRequest: AiRequest = {
  feature: "marketing_ia",
  template: "campaign_copy",
  ctx: { restaurant: "Tacos Don Beto", offer: "2x1 los martes", audience: "vecinos", orderLink: "https://resurte.me/comer" },
  system: "Eres el asistente del restaurante.",
  user: "Escribe una campaña.",
  restaurantId: "rest-1",
}

describe("resolveAdapter", () => {
  it("devuelve null sin ninguna credencial", () => {
    expect(resolveAdapter({})).toBeNull()
  })

  it("prefiere OmniRoute sobre OpenAI y Kie.ai", () => {
    const adapter = resolveAdapter({
      OMNIROUTE_API_KEY: "omni",
      OPENAI_API_KEY: "sk-openai",
      KIE_AI_API_KEY: "kie",
    })
    expect(adapter?.name).toBe("omniroute")
    expect(adapter?.url).toBe("http://localhost:20128/v1/chat/completions")
  })

  it("usa OmniRoute con la base configurada y sin duplicar barras", () => {
    const adapter = resolveAdapter({
      OMNIROUTE_API_KEY: "omni",
      OMNIROUTE_BASE_URL: "http://127.0.0.1:9999/v1/",
    })
    expect(adapter?.url).toBe("http://127.0.0.1:9999/v1/chat/completions")
  })

  it("cae a OpenAI cuando no hay OmniRoute", () => {
    const adapter = resolveAdapter({ OPENAI_API_KEY: "sk-openai" })
    expect(adapter?.name).toBe("openai")
    expect(adapter?.url).toBe("https://api.openai.com/v1/chat/completions")
    expect(adapter?.model).toBe("gpt-4o-mini")
  })

  it("respeta OPENAI_BASE_URL y AGENT_MODEL", () => {
    const adapter = resolveAdapter({
      OPENAI_API_KEY: "sk-deepseek",
      OPENAI_BASE_URL: "https://api.deepseek.com/v1",
      AGENT_MODEL: "deepseek-chat",
    })
    expect(adapter?.url).toBe("https://api.deepseek.com/v1/chat/completions")
    expect(adapter?.model).toBe("deepseek-chat")
  })

  it("usa Kie.ai como último recurso con su propia ruta", () => {
    const adapter = resolveAdapter({ KIE_AI_API_KEY: "kie-123" })
    expect(adapter?.name).toBe("kie")
    expect(adapter?.url).toBe("https://api.kie.ai/v1/chat/completions")
  })

  it("permite corregir la ruta de Kie.ai sin tocar código", () => {
    const adapter = resolveAdapter({
      KIE_AI_API_KEY: "kie-123",
      KIE_AI_BASE_URL: "https://proxy.example.com",
      KIE_AI_CHAT_PATH: "v2/chat",
    })
    expect(adapter?.url).toBe("https://proxy.example.com/v2/chat")
  })

  it("ignora credenciales en blanco", () => {
    expect(resolveAdapter({ OPENAI_API_KEY: "   " })).toBeNull()
  })
})

describe("fallbackTemplates", () => {
  it("interpola las variables del contexto", () => {
    const text = fallbackTemplates.campaign_copy({
      restaurant: "Tacos Don Beto",
      offer: "2x1 los martes",
      audience: "vecinos",
      orderLink: "https://resurte.me/comer",
    })
    expect(text).toContain("Tacos Don Beto: 2x1 los martes")
    expect(text).toContain("Es para ti, vecinos")
    expect(text).toContain("https://resurte.me/comer")
  })

  it("sustituye por vacío las variables ausentes en vez de dejar el placeholder", () => {
    const text = fallbackTemplates.menu_description({ dish: "Tlayuda" })
    expect(text).not.toContain("{restaurant}")
    expect(text).not.toContain("{notes}")
    expect(text).toContain("Tlayuda")
  })

  it("acepta números y nulos sin romperse", () => {
    const text = fallbackTemplates.mesero_reply({
      restaurant: "Café Aurora",
      menuHighlights: 3,
      orderLink: null,
    })
    expect(text).toContain("3")
    expect(text).toContain("Café Aurora")
  })
})

describe("generateText", () => {
  it("devuelve la plantilla cuando no hay proveedor configurado", async () => {
    const h = harness({ env: { OPENAI_API_KEY: undefined } })
    const result = await generateText(baseRequest, h.deps)

    expect(result.source).toBe("template")
    expect(result.reason).toBe("unconfigured")
    expect(result.adapter).toBeNull()
    expect(result.text).toContain("Tacos Don Beto")
    expect(h.fetchMock).not.toHaveBeenCalled()
    expect(h.reserve).not.toHaveBeenCalled()
  })

  it("respeta el kill switch AI_ENABLED=false sin llamar a nadie", async () => {
    const h = harness({ env: { AI_ENABLED: "false" } })
    const result = await generateText(baseRequest, h.deps)

    expect(result.source).toBe("template")
    expect(result.reason).toBe("disabled")
    expect(h.fetchMock).not.toHaveBeenCalled()
    expect(h.reserve).not.toHaveBeenCalled()
  })

  it("devuelve el texto del modelo y liquida el consumo real", async () => {
    const h = harness({ responses: [okResponse("Campaña del modelo", 1234)] })
    const result = await generateText(baseRequest, h.deps)

    expect(result).toMatchObject({
      text: "Campaña del modelo",
      source: "llm",
      adapter: "openai",
      model: "gpt-4o-mini",
      tokensUsed: 1234,
    })
    expect(result.reason).toBeUndefined()
    expect(h.reserve).toHaveBeenCalledWith("rest-1", 1200)
    expect(h.settle).toHaveBeenCalledWith("rest-1", 1234, { estimate: 1200, fallback: false })
  })

  it("usa maxTokens como estimado de reserva", async () => {
    const h = harness()
    await generateText({ ...baseRequest, maxTokens: 300 }, h.deps)
    expect(h.reserve).toHaveBeenCalledWith("rest-1", 300)
  })

  it("no revienta cuando el proveedor no reporta consumo", async () => {
    const h = harness({ responses: [okResponse("Sin usage", null)] })
    const result = await generateText(baseRequest, h.deps)
    expect(result.source).toBe("llm")
    expect(result.tokensUsed).toBeNull()
    expect(h.settle).toHaveBeenCalledWith("rest-1", null, { estimate: 1200, fallback: false })
  })

  it("degrada sin llamar al proveedor cuando el presupuesto está agotado", async () => {
    const h = harness({ budget: { allowed: false, enforced: true } })
    const result = await generateText(baseRequest, h.deps)

    expect(result.source).toBe("template")
    expect(result.reason).toBe("budget")
    expect(h.fetchMock).not.toHaveBeenCalled()
    expect(h.settle).toHaveBeenCalledWith("rest-1", null, { estimate: 1200, fallback: true })
  })

  it("no reintenta un 401 (credencial inválida)", async () => {
    const h = harness({ responses: [new Response("nope", { status: 401 })] })
    const result = await generateText(baseRequest, h.deps)

    expect(result.source).toBe("template")
    expect(result.reason).toBe("error")
    expect(result.model).toBe("gpt-4o-mini")
    expect(h.fetchMock).toHaveBeenCalledTimes(1)
    expect(h.settle).toHaveBeenCalledWith("rest-1", null, { estimate: 1200, fallback: true })
  })

  it("reintenta un 500 y termina usando el modelo", async () => {
    const h = harness({
      responses: [new Response("boom", { status: 500 }), okResponse("A la segunda")],
    })
    const result = await generateText(baseRequest, h.deps)

    expect(result.source).toBe("llm")
    expect(result.text).toBe("A la segunda")
    expect(h.fetchMock).toHaveBeenCalledTimes(2)
    expect(h.sleep).toHaveBeenCalledTimes(1)
  })

  it("reintenta un 429", async () => {
    const h = harness({
      responses: [new Response("slow down", { status: 429 }), okResponse("Listo")],
    })
    const result = await generateText(baseRequest, h.deps)
    expect(result.source).toBe("llm")
    expect(h.fetchMock).toHaveBeenCalledTimes(2)
  })

  it("reintenta un fallo de red", async () => {
    const h = harness({
      responses: [new Error("ECONNRESET"), okResponse("Recuperado")],
    })
    const result = await generateText(baseRequest, h.deps)
    expect(result.source).toBe("llm")
    expect(h.fetchMock).toHaveBeenCalledTimes(2)
  })

  it("se rinde tras agotar los reintentos y nunca lanza", async () => {
    const h = harness({
      responses: [new Response("boom", { status: 503 })],
      env: { OPENAI_API_KEY: "sk-test", AI_MAX_RETRIES: "2" },
    })
    const result = await generateText(baseRequest, h.deps)

    expect(result.source).toBe("template")
    expect(result.reason).toBe("error")
    expect(h.fetchMock).toHaveBeenCalledTimes(3)
    expect(h.sleep).toHaveBeenCalledTimes(2)
  })

  it("trata una respuesta vacía como fallo", async () => {
    const h = harness({ responses: [okResponse("   ")] })
    const result = await generateText(baseRequest, h.deps)
    expect(result.source).toBe("template")
    expect(result.reason).toBe("error")
  })

  it("puede desactivar los reintentos con AI_MAX_RETRIES=0", async () => {
    const h = harness({
      responses: [new Response("boom", { status: 500 })],
      env: { OPENAI_API_KEY: "sk-test", AI_MAX_RETRIES: "0" },
    })
    await generateText(baseRequest, h.deps)
    expect(h.fetchMock).toHaveBeenCalledTimes(1)
  })

  it("no envía temperature salvo que se pida", async () => {
    const h = harness()
    await generateText(baseRequest, h.deps)
    const firstBody = sentBody(h)
    expect(firstBody).not.toHaveProperty("temperature")
    expect(firstBody).not.toHaveProperty("max_tokens")
    expect(firstBody.model).toBe("gpt-4o-mini")
    const messages = firstBody.messages as Array<{ role: string; content: string }>
    expect(messages[0]?.role).toBe("system")
    expect(messages[1]?.content).toBe("Escribe una campaña.")
  })

  it("envía temperature y max_tokens cuando el llamador los fija", async () => {
    const h = harness()
    await generateText({ ...baseRequest, temperature: 0.4, maxTokens: 200 }, h.deps)
    const firstBody = sentBody(h)
    expect(firstBody.temperature).toBe(0.4)
    expect(firstBody.max_tokens).toBe(200)
  })

  it("manda la credencial del adaptador elegido", async () => {
    const h = harness({ env: { OMNIROUTE_API_KEY: "omni-secret", OMNIROUTE_BASE_URL: "http://localhost:20128/v1" } })
    await generateText(baseRequest, h.deps)
    expect(sentBody(h).model).toBe("gpt-4o-mini")
    expect(sentUrl(h)).toBe("http://localhost:20128/v1/chat/completions")
  })

  it("funciona sin restaurante (sin contador de presupuesto)", async () => {
    const h = harness()
    const result = await generateText({ ...baseRequest, restaurantId: null }, h.deps)
    expect(result.source).toBe("llm")
    expect(h.reserve).toHaveBeenCalledWith(null, 1200)
  })

  it("sigue adelante si el contador de presupuesto falla", async () => {
    const h = harness()
    h.deps.reserve = vi.fn(async () => {
      throw new Error("supabase caído")
    })
    const result = await generateText(baseRequest, h.deps)
    expect(result.source).toBe("llm")
    expect(result.text).toBe("hola")
  })

  it("no lanza si la liquidación del consumo falla", async () => {
    const h = harness()
    h.deps.settle = vi.fn(async () => {
      throw new Error("supabase caído")
    })
    const result = await generateText(baseRequest, h.deps)
    expect(result.source).toBe("llm")
  })

  it("deja una traza durable cuando el bucle de reintentos revienta", async () => {
    mocks.reportServerError.mockClear()
    const h = harness({ responses: [new Response("boom", { status: 503 })] })
    h.deps.sleep = vi.fn(async () => {
      throw new Error("sin reloj")
    })

    await generateText(baseRequest, h.deps)

    expect(mocks.reportServerError).toHaveBeenCalledTimes(1)
    expect(mocks.reportServerError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("IA"),
        url: "foodos:ia",
        context: expect.objectContaining({ feature: "marketing_ia", restaurantId: "rest-1" }),
        error: expect.any(Error),
      })
    )
  })

  it("un fallo al reportar no rompe la degradación", async () => {
    mocks.reportServerError.mockClear()
    mocks.reportServerError.mockRejectedValueOnce(new Error("sin base de datos"))
    const h = harness({ responses: [new Response("boom", { status: 503 })] })
    h.deps.sleep = vi.fn(async () => {
      throw new Error("sin reloj")
    })

    const result = await generateText(baseRequest, h.deps)

    expect(result.source).toBe("template")
  })

  it("nunca lanza: un fallo total devuelve plantilla", async () => {
    const h = harness({ responses: [new Error("todo roto")] })
    h.deps.reserve = vi.fn(async () => {
      throw new Error("sin contador")
    })
    h.deps.settle = vi.fn(async () => {
      throw new Error("sin contador")
    })
    h.deps.sleep = vi.fn(async () => {
      throw new Error("sin reloj")
    })
    const result = await generateText(baseRequest, h.deps)
    expect(result.source).toBe("template")
    expect(result.text).toContain("Tacos Don Beto")
  })
})
