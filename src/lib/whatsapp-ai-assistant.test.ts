import { describe, expect, it, vi } from "vitest"
import {
  answerWhatsAppWithAi,
  buildAiProductImageCaption,
  buildCatalogContext,
  buildCatalogContextEntries,
  buildOrderContext,
  buildWhatsAppAiSystemPrompt,
  detectHumanHandoff,
  extractMentionTrailer,
  isWhatsAppAiAssistantEnabled,
  resolveAiProductImages,
  sanitizeAiReply,
  WHATSAPP_AI_HANDOFF_MESSAGE,
  WHATSAPP_AI_MAX_PRODUCT_IMAGES,
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
  slug: "arroz-1-kg",
  image_url: "/images/arroz-1-kg.jpg",
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

  it("si se vende por kilo en caja, la línea trae el total de la caja completa", () => {
    const ctx = buildCatalogContext([
      product({
        name: "Pollo entero congelado Pilgrim's (caja 14.5 kg)",
        slug: "pollo-entero-congelado-pilgrims-caja-145kg",
        price: 74,
        unit: "Kilo",
      }),
    ])
    expect(ctx).toContain(
      "- Pollo entero congelado Pilgrim's (caja 14.5 kg): $74 MXN por kilo — la caja completa de 14.5 kg cuesta $1,073 MXN"
    )
  })

  it("con precio por caja (unidad caja) no se inventa un total por kilo", () => {
    const ctx = buildCatalogContext([
      product({ name: "Papa francesa 3/8 (caja 13.61 kg)", price: 685, unit: "caja" }),
    ])
    expect(ctx).toContain("- Papa francesa 3/8 (caja 13.61 kg): $685 MXN [ref:")
    expect(ctx).not.toContain("caja completa")
  })

  it("sin productos devuelve cadena vacía", () => {
    expect(buildCatalogContext([])).toBe("")
  })

  it("cada línea cierra con la referencia estable del producto", () => {
    const ctx = buildCatalogContext([product({})])
    expect(ctx).toContain("- Arroz 1 kg: $32 MXN [ref: arroz-1-kg]")
  })

  it("included trae solo los productos que sobrevivieron al corte", () => {
    const many = Array.from({ length: 100 }, (_, i) =>
      product({ name: `Producto ${i} ${"x".repeat(200)}`, slug: `prod-${i}` })
    )
    const build = buildCatalogContextEntries(many)
    expect(build.included.length).toBeLessThan(many.length)
    expect(build.context).toContain("(El catálogo continúa")
    for (const p of build.included) {
      expect(build.context).toContain(`[ref: ${p.slug}]`)
    }
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
    expect(prompt).toContain("Nunca presentes el precio por kilo como si fuera")
  })

  it("pide cerrar con la línea PRODUCTOS de referencias citadas", () => {
    const prompt = buildWhatsAppAiSystemPrompt()
    expect(prompt).toContain("PRODUCTOS:")
    expect(prompt).toContain("[ref: ...]")
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

describe("extractMentionTrailer", () => {
  it("extrae las referencias en orden y retira la línea del texto", () => {
    const out = extractMentionTrailer(
      "La papa blanca cuesta $49 MXN.\nPRODUCTOS: papa-blanca, papa-francesa-38"
    )
    expect(out.text).toBe("La papa blanca cuesta $49 MXN.")
    expect(out.slugs).toEqual(["papa-blanca", "papa-francesa-38"])
  })

  it("sin línea PRODUCTOS no hay referencias y el texto queda intacto", () => {
    const text = "Entregamos el mismo día en Chihuahua."
    const out = extractMentionTrailer(text)
    expect(out.text).toBe(text)
    expect(out.slugs).toEqual([])
  })

  it("PRODUCTOS: - significa ningún producto", () => {
    const out = extractMentionTrailer("El mínimo es $500 MXN.\nPRODUCTOS: -")
    expect(out.text).toBe("El mínimo es $500 MXN.")
    expect(out.slugs).toEqual([])
  })

  it("tolera corchetes y espacios en las referencias", () => {
    const out = extractMentionTrailer("Tenemos papa.\nPRODUCTOS: [papa-blanca] ,  arroz-1-kg")
    expect(out.slugs).toEqual(["papa-blanca", "arroz-1-kg"])
  })
})

describe("resolveAiProductImages", () => {
  const papa = product({
    name: "Papa Blanca",
    slug: "papa-blanca",
    price: 49,
    image_url: "/images/papa-blanca.jpg",
  })
  const francesa = product({
    name: "Papa francesa 3/8",
    slug: "papa-francesa-38",
    price: 685,
    image_url: "https://resurte.me/images/papa-francesa.jpg",
  })
  const sinFoto = product({ name: "Sin foto", slug: "sin-foto", price: 10, image_url: "" })

  it("resuelve la URL directa absoluta, como la del feed de Meta", () => {
    const images = resolveAiProductImages(["papa-blanca"], [papa])
    expect(images).toEqual([
      {
        slug: "papa-blanca",
        name: "Papa Blanca",
        price: 49,
        imageUrl: "https://resurte.me/images/papa-blanca.jpg",
        url: "https://resurte.me/chihuahua/producto/papa-blanca",
        box: null,
      },
    ])
  })

  it("desenvuelve una URL de /_next/image a la ruta directa", () => {
    const nexty = product({
      slug: "papa-next",
      image_url: "/_next/image?url=%2Fimages%2Fpapa.jpg&w=640&q=75",
    })
    const images = resolveAiProductImages(["papa-next"], [nexty])
    expect(images[0]?.imageUrl).toBe("https://resurte.me/images/papa.jpg")
  })

  it("descarta referencias fuera del contexto inyectado", () => {
    const images = resolveAiProductImages(["papa-blanca", "no-existe", "otro-inventado"], [papa])
    expect(images.map((i) => i.slug)).toEqual(["papa-blanca"])
  })

  it("respeta el orden de mención y no duplica", () => {
    const images = resolveAiProductImages(
      ["papa-francesa-38", "papa-blanca", "papa-francesa-38"],
      [papa, francesa]
    )
    expect(images.map((i) => i.slug)).toEqual(["papa-francesa-38", "papa-blanca"])
  })

  it("salta productos sin imagen sin consumir un lugar del tope", () => {
    const extra1 = product({ name: "Extra 1", slug: "extra-1", price: 1 })
    const extra2 = product({ name: "Extra 2", slug: "extra-2", price: 2 })
    const extra3 = product({ name: "Extra 3", slug: "extra-3", price: 3 })
    const images = resolveAiProductImages(
      ["sin-foto", "papa-blanca", "extra-1", "extra-2", "extra-3"],
      [sinFoto, papa, extra1, extra2, extra3]
    )
    expect(images.map((i) => i.slug)).toEqual(["papa-blanca", "extra-1", "extra-2"])
    expect(images.length).toBe(WHATSAPP_AI_MAX_PRODUCT_IMAGES)
  })

  it("aplica el tope de fotos por respuesta", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      product({ name: `P${i}`, slug: `p-${i}`, price: i + 1 })
    )
    const images = resolveAiProductImages(many.map((p) => p.slug), many)
    expect(images.length).toBe(WHATSAPP_AI_MAX_PRODUCT_IMAGES)
  })

  it("en presentaciones el precio de la foto es el «desde»", () => {
    const ala = product({
      name: "Ala de pollo",
      slug: "ala-pollo",
      price: 90,
      has_variants: true,
      variant_min_price: 68,
    })
    const images = resolveAiProductImages(["ala-pollo"], [ala])
    expect(images[0]?.price).toBe(68)
  })

  it("el pie de foto es «nombre — $precio» y el link de la ficha", () => {
    const images = resolveAiProductImages(["papa-blanca"], [papa])
    expect(buildAiProductImageCaption(images[0]!)).toBe(
      "Papa Blanca — $49 MXN\nhttps://resurte.me/chihuahua/producto/papa-blanca"
    )
  })

  it("en productos por kilo en caja, el pie cotiza el kilo y la caja completa", () => {
    const pollo = product({
      name: "Pollo entero congelado Pilgrim's (caja 14.5 kg)",
      slug: "pollo-entero-congelado-pilgrims-caja-145kg",
      price: 74,
      unit: "Kilo",
    })
    const images = resolveAiProductImages([pollo.slug], [pollo])
    expect(images[0]?.box).toEqual({ kg: 14.5, total: 1073 })
    expect(buildAiProductImageCaption(images[0]!)).toBe(
      "Pollo entero congelado Pilgrim's (caja 14.5 kg) — $74 MXN por kilo · Caja completa (14.5 kg): $1,073 MXN\n" +
        "https://resurte.me/chihuahua/producto/pollo-entero-congelado-pilgrims-caja-145kg"
    )
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
    expect(answer).toEqual({ kind: "ai", text: "El arroz cuesta $32 MXN.", products: [] })
  })

  it("adjunta las fotos de los productos citados y retira la línea PRODUCTOS", async () => {
    const papa = product({
      name: "Papa Blanca",
      slug: "papa-blanca",
      price: 49,
      image_url: "/images/papa-blanca.jpg",
    })
    const chat = vi.fn(async () => ({
      text: "La papa blanca cuesta $49 MXN.\nPRODUCTOS: papa-blanca",
      model: "m",
      adapter: "a",
      tokensUsed: 10,
    }))
    const answer = await answerWhatsAppWithAi(
      stubSupabase(),
      { from: "5216140000000", text: "¿cuánto cuesta la papa?" },
      { env: enabledEnv, chat: chat as never, loadCatalog: async () => [papa] }
    )
    expect(answer.kind).toBe("ai")
    if (answer.kind === "ai") {
      expect(answer.text).toBe("La papa blanca cuesta $49 MXN.")
      expect(answer.text).not.toContain("PRODUCTOS")
      expect(answer.products).toEqual([
        {
          slug: "papa-blanca",
          name: "Papa Blanca",
          price: 49,
          imageUrl: "https://resurte.me/images/papa-blanca.jpg",
          url: "https://resurte.me/chihuahua/producto/papa-blanca",
          box: null,
        },
      ])
    }
  })

  it("descarta referencias inventadas: el texto sale sin fotos", async () => {
    const chat = vi.fn(async () => ({
      text: "La papa blanca cuesta $49 MXN.\nPRODUCTOS: papa-blanca, producto-inventado",
      model: "m",
      adapter: "a",
      tokensUsed: 10,
    }))
    const answer = await answerWhatsAppWithAi(
      stubSupabase(),
      { from: "5216140000000", text: "¿cuánto cuesta la papa?" },
      { env: enabledEnv, chat: chat as never, loadCatalog: noCatalog }
    )
    expect(answer.kind).toBe("ai")
    if (answer.kind === "ai") {
      expect(answer.text).toBe("La papa blanca cuesta $49 MXN.")
      expect(answer.products).toEqual([])
    }
  })

  it("un producto citado sin imagen no adjunta foto ni rompe el texto", async () => {
    const sinFoto = product({ name: "Sin foto", slug: "sin-foto", price: 10, image_url: "" })
    const chat = vi.fn(async () => ({
      text: "Cuesta $10 MXN.\nPRODUCTOS: sin-foto",
      model: "m",
      adapter: "a",
      tokensUsed: 10,
    }))
    const answer = await answerWhatsAppWithAi(
      stubSupabase(),
      { from: "5216140000000", text: "¿precio?" },
      { env: enabledEnv, chat: chat as never, loadCatalog: async () => [sinFoto] }
    )
    expect(answer.kind).toBe("ai")
    if (answer.kind === "ai") {
      expect(answer.text).toBe("Cuesta $10 MXN.")
      expect(answer.products).toEqual([])
    }
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
