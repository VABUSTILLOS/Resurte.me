import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/ai/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/llm")>()
  return { ...actual, chatCompletionRaw: vi.fn() }
})

import { chatCompletionRaw } from "@/lib/ai/llm"
import { MAX_TEMPLATE_LENGTH, generateCampaignCopy } from "@/lib/foodos-ai/copy"

const raw = vi.mocked(chatCompletionRaw)

function reply(text: string) {
  raw.mockResolvedValue({
    text,
    model: "test-model",
    adapter: "test",
    tokensUsed: 42,
  })
}

const base = {
  restaurantName: "Taquería El Fuego",
  brief: "Queremos llenar el martes, hay tacos de pastor",
  offer: "10% de descuento",
  audienceLabel: "clientes de siempre",
  restaurantId: "r1",
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("generateCampaignCopy", () => {
  it("usa el modelo cuando el texto es válido", async () => {
    reply("Hola {nombre}, el martes hay tacos de pastor con 10% de descuento. Pide en {link}")
    const out = await generateCampaignCopy(base)
    expect(out.source).toBe("llm")
    expect(out.text).toContain("{link}")
    expect(out.model).toBe("test-model")
    expect(out.tokensUsed).toBe(42)
  })

  it("no llama al modelo si no hay instrucción", async () => {
    const out = await generateCampaignCopy({ ...base, brief: "   " })
    expect(out.source).toBe("template")
    expect(raw).not.toHaveBeenCalled()
  })

  it("cae a la plantilla si el modelo no está disponible", async () => {
    raw.mockResolvedValue(null)
    const out = await generateCampaignCopy(base)
    expect(out.source).toBe("template")
    expect(out.text).toContain("{link}")
  })

  it("rechaza cifras que el dueño no autorizó", async () => {
    reply("Hola {nombre}, hoy tenemos 30% de descuento. Pide en {link}")
    const out = await generateCampaignCopy(base)
    expect(out.source).toBe("template")
  })

  it("acepta cifras que sí venían en la instrucción", async () => {
    reply("Hola {nombre}, hoy hay 2x1 en pastor. Pide en {link}")
    const out = await generateCampaignCopy({
      ...base,
      brief: "Hoy hacemos 2x1 en pastor",
      offer: null,
    })
    expect(out.source).toBe("llm")
    expect(out.text).toContain("2x1")
  })

  it("rechaza textos demasiado largos para WhatsApp", async () => {
    reply(`Hola {nombre}, ${"promo ".repeat(120)}pide en {link}`)
    const out = await generateCampaignCopy(base)
    expect(out.source).toBe("template")
    expect(out.text.length).toBeLessThanOrEqual(MAX_TEMPLATE_LENGTH)
  })

  it("rechaza una respuesta vacía", async () => {
    reply("   ")
    const out = await generateCampaignCopy(base)
    expect(out.source).toBe("template")
  })

  it("añade el enlace si el modelo lo omitió", async () => {
    reply("Hola {nombre}, el martes hay tacos de pastor.")
    const out = await generateCampaignCopy(base)
    expect(out.source).toBe("llm")
    expect(out.text).toContain("{link}")
  })

  it("borra enlaces inventados y conserva {link}", async () => {
    reply("Hola {nombre}, mira https://otro-sitio.com/promo y pide en {link}")
    const out = await generateCampaignCopy(base)
    expect(out.text).not.toContain("otro-sitio.com")
    expect(out.text).toContain("{link}")
  })

  it("limpia bloques de código y comillas", async () => {
    reply('```\n"Hola {nombre}, pide en {link}"\n```')
    const out = await generateCampaignCopy(base)
    expect(out.source).toBe("llm")
    expect(out.text).not.toContain("```")
    expect(out.text.startsWith('"')).toBe(false)
  })

  it("pasa el tono y la audiencia al modelo", async () => {
    reply("Hola {nombre}, pide en {link}")
    await generateCampaignCopy({ ...base, tone: "festivo" })
    const [, user] = raw.mock.calls[0] ?? []
    expect(String(user)).toContain("clientes de siempre")
    expect(String(user)).toContain("10% de descuento")
  })

  it("siempre devuelve una plantilla usable cuando falla todo", async () => {
    raw.mockRejectedValue(new Error("boom"))
    const out = await generateCampaignCopy(base)
    expect(out.source).toBe("template")
    expect(out.text).toContain("{link}")
  })
})
