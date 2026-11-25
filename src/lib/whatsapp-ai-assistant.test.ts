import { describe, expect, it, vi } from "vitest"
import {
  answerWhatsAppWithAi,
  buildCatalogContext,
  buildOrderContext,
  buildWhatsAppAiSystemPrompt,
  detectHumanHandoff,
  isWhatsAppAiAssistantEnabled,
  sanitizeAiReply,
  WHATSAPP_AI_HANDOFF_MESSAGE,
  type AiCatalogProduct,
} from "./whatsapp-ai-assistant"

/** Cadena de Supabase que resuelve vacío: sin perfiles ni filas. */
function stubSupabase() {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  Object.assign(chain, {
    select: self,
    ilike: self,
    eq: self,
    neq: self,
    in: self,
    not: self,
    order: self,
    limit: self,
    maybeSingle: async () => ({ data: null, error: null }),
    upsert: async () => ({ error: null }),
    insert: async () => ({ error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [], error: null }),
  })
  return { from: () => chain } as never
}

const product = (partial: Partial<AiCatalogProduct>): AiCatalogProduct => ({
  name: "Arroz 1 kg",
  price: 32,
  sale_price: null,
  stock_status: "in_stock",
  has_variants: false,
  variant_min_price: null,
  ...partial,
})

describe("isWhatsAppAiAssistantEnabled", () => {
  it("solo se enciende con el opt-in explícito", () => {
    expect(isWhatsAppAiAssistantEnabled({ WHATSAPP_AI_ASSISTANT_ENABLED: "true" })).toBe(true)
    expect(isWhatsAppAiAssistantEnabled({ WHATSAPP_AI_ASSISTANT_ENABLED: "false" })).toBe(false)
    expect(isWhatsAppAiAssistantEnabled({})).toBe(false)
    expect(isWhatsAppAiAssistantEnabled({ WHATSAPP_AI_ASSISTANT_ENABLED: "1" })).toBe(false)
  })
})

describe("detectHumanHandoff", () => {
  it("deriva reclamos y devoluciones", () => {
    expect(detectHumanHandoff("Quiero una devolución, llegó mal")).toBe("reclamo")
    expect(detectHumanHandoff("tengo una queja")).toBe("reclamo")
    expect(detectHumanHandoff("no llegó mi pedido")).toBe("reclamo")
  })

  it("deriva disputas de pago", () => {
    expect(detectHumanHandoff("me cobraron doble")).toBe("pago_disputado")
    expect(detectHumanHandoff("ya pagué y no me han confirmado")).toBe("pago_disputado")
  })

  it("deriva la petición explícita de humano", () => {
    expect(detectHumanHandoff("quiero hablar con un humano")).toBe("peticion_humano")
    expect(detectHumanHandoff("pásame con un agente")).toBe("peticion_humano")
  })

  it("no deriva preguntas normales", () => {
    expect(detectHumanHandoff("¿cuánto cuesta el arroz?")).toBeNull()
    expect(detectHumanHandoff("¿tienen aceite de 1 litro?")).toBeNull()
    expect(detectHumanHandoff("¿a qué hora entregan?")).toBeNull()
  })
})

describe("buildCatalogContext", () => {
  it("incluye precio vigente, oferta y agotados", () => {
    const ctx = buildCatalogContext([
      product({}),
      product({ name: "Aceite 1 L", price: 55, sale_price: 49.5 }),
      product({ name: "Huevo 30 pzas", price: 92, stock_status: "out_of_stock" }),
    ])
    expect(ctx).toContain("- Arroz 1 kg: $32 MXN")
    expect(ctx).toContain("(oferta, precio regular $55 MXN)")
    expect(ctx).toContain("- Huevo 30 pzas: $92 MXN — AGOTADO")
  })

  it("anota las presentaciones con su desde", () => {
    const ctx = buildCatalogContext([
      product({ name: "Ala de pollo", has_variants: true, variant_min_price: 68 }),
    ])
    expect(ctx).toContain("se vende por presentación, desde $68 MXN")
  })

  it("sin productos devuelve cadena vacía", () => {
    expect(buildCatalogContext([])).toBe("")
  })
})

describe("buildOrderContext", () => {
  it("sin pedido no hay contexto", () => {
    expect(buildOrderContext(null)).toBeNull()
  })

  it("resume el último pedido", () => {
    const ctx = buildOrderContext({
      id: 84,
      status: "pending",
      payment_status: "pending",
      total: 612,
    })
    expect(ctx).toContain("#84")
    expect(ctx).toContain("pendiente de confirmación")
    expect(ctx).toContain("pendiente de pago")
    expect(ctx).toContain("$612 MXN")
  })
})

describe("buildWhatsAppAiSystemPrompt", () => {
  it("trae las reglas duras y los datos reales de la tienda", () => {
    const prompt = buildWhatsAppAiSystemPrompt()
    expect(prompt).toContain("Solo afirma precios")
    expect(prompt).toContain("Nunca inventes un precio")
    expect(prompt).toContain("$500 MXN")
    expect(prompt).toContain("DERIVAR_A_HUMANO")
    expect(prompt).toContain("No prometas descuentos")
  })
})

describe("sanitizeAiReply", () => {
  it("recorta y descarta vacíos", () => {
    expect(sanitizeAiReply("  Hola 👋  ")).toBe("Hola 👋")
    expect(sanitizeAiReply("   ")).toBeNull()
    expect(sanitizeAiReply("")).toBeNull()
  })

  it("acota respuestas largas", () => {
    const long = "Frase completa. ".repeat(200)
    const out = sanitizeAiReply(long)
    expect(out).not.toBeNull()
    expect((out as string).length).toBeLessThanOrEqual(1000)
  })
})

describe("answerWhatsAppWithAi", () => {
  const enabledEnv = { WHATSAPP_AI_ASSISTANT_ENABLED: "true" }
  const noCatalog = async () => []

  it("apagado por default: no llama al modelo", async () => {
    const chat = vi.fn(async () => ({ text: "hola", model: "m", adapter: "a", tokensUsed: 1 }))
    const answer = await answerWhatsAppWithAi(
      stubSupabase(),
      { from: "5216140000000", text: "¿cuánto cuesta el arroz?" },
      { env: {}, chat: chat as never, loadCatalog: noCatalog }
    )
    expect(answer.kind).toBe("none")
    expect(chat).not.toHaveBeenCalled()
  })

  it("responde con el texto del modelo saneado", async () => {
    const chat = vi.fn(async () => ({
      text: "  El arroz cuesta $32 MXN.  ",
      model: "m",
      adapter: "a",
      tokensUsed: 10,
    }))
    const answer = await answerWhatsAppWithAi(
      stubSupabase(),
      { from: "5216140000000", text: "¿cuánto cuesta el arroz?" },
      { env: enabledEnv, chat: chat as never, loadCatalog: noCatalog }
    )
    expect(answer).toEqual({ kind: "ai", text: "El arroz cuesta $32 MXN." })
  })

  it("sin proveedor o con fallo del modelo cae a none (el menú)", async () => {
    const chat = vi.fn(async () => null)
    const answer = await answerWhatsAppWithAi(
      stubSupabase(),
      { from: "5216140000000", text: "¿tienen aceite?" },
      { env: enabledEnv, chat: chat as never, loadCatalog: noCatalog }
    )
    expect(answer.kind).toBe("none")
  })

  it("un reclamo deriva a humano sin gastar la llamada", async () => {
    const chat = vi.fn(async () => ({ text: "x", model: "m", adapter: "a", tokensUsed: 1 }))
    const answer = await answerWhatsAppWithAi(
      stubSupabase(),
      { from: "5216140000000", text: "quiero una devolución" },
      { env: enabledEnv, chat: chat as never, loadCatalog: noCatalog }
    )
    expect(answer.kind).toBe("handoff")
    if (answer.kind === "handoff") {
      expect(answer.text).toBe(WHATSAPP_AI_HANDOFF_MESSAGE)
      expect(answer.reason).toBe("reclamo")
    }
    expect(chat).not.toHaveBeenCalled()
  })

  it("si el modelo pide derivar, se deriva", async () => {
    const chat = vi.fn(async () => ({
      text: "DERIVAR_A_HUMANO",
      model: "m",
      adapter: "a",
      tokensUsed: 3,
    }))
    const answer = await answerWhatsAppWithAi(
      stubSupabase(),
      { from: "5216140000000", text: "esto está mal, arréglenlo" },
      { env: enabledEnv, chat: chat as never, loadCatalog: noCatalog }
    )
    expect(answer.kind).toBe("handoff")
    if (answer.kind === "handoff") expect(answer.reason).toBe("modelo")
  })
})
