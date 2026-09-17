import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/ai/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/llm")>()
  return { ...actual, chatCompletionRaw: vi.fn() }
})

import { chatCompletionRaw } from "@/lib/ai/llm"
import {
  generateAboutText,
  generateDishCopy,
  generateFaq,
  MAX_ABOUT_LENGTH,
  MAX_DISH_LENGTH,
} from "@/lib/foodos-ai/seo"
import type { SeoBranchFacts } from "@/lib/foodos-seo"

const raw = vi.mocked(chatCompletionRaw)

function reply(text: string) {
  raw.mockResolvedValue({ text, model: "test-model", adapter: "test", tokensUsed: 42 })
}

const aboutInput = {
  restaurantName: "Tacos Don Beto",
  notes: "Taquería de barrio en el Centro, desde 1998, especialidad pastor.",
  keywords: ["tacos", "pastor"],
  city: "Puebla",
  restaurantId: "r1",
}

const dishInput = {
  restaurantName: "Tacos Don Beto",
  dishName: "Taco al pastor",
  notes: "Con piña, cebolla y cilantro",
  tags: ["picante"],
  restaurantId: "r1",
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("generateAboutText", () => {
  it("usa el modelo cuando el texto respeta las reglas", async () => {
    reply(
      "En Tacos Don Beto atendemos a quien tiene hambre de verdad. " +
        "Nuestra especialidad es el pastor, marinado en casa y cortado al momento. " +
        "El Centro nos vio nacer y ahí seguimos, con la misma receta de siempre. " +
        "Pide en línea y te decimos cuándo estará listo."
    )
    const out = await generateAboutText(aboutInput)
    expect(out.source).toBe("llm")
    expect(out.model).toBe("test-model")
    expect(out.tokensUsed).toBe(42)
    expect(out.text).toContain("pastor")
  })

  it("cae a la plantilla cuando no hay modelo", async () => {
    raw.mockResolvedValue(null)
    const out = await generateAboutText(aboutInput)
    expect(out.source).toBe("template")
    expect(out.model).toBeNull()
    expect(out.text).toContain("Tacos Don Beto")
  })

  it("cae a la plantilla si el proveedor revienta (nunca lanza)", async () => {
    raw.mockRejectedValue(new Error("boom"))
    const out = await generateAboutText(aboutInput)
    expect(out.source).toBe("template")
    expect(out.text).toContain("Tacos Don Beto")
  })

  it("descarta un texto demasiado corto", async () => {
    reply("Somos una taquería.")
    const out = await generateAboutText(aboutInput)
    expect(out.source).toBe("template")
    expect(out.model).toBe("test-model")
  })

  it("descarta un texto más largo que el límite de la página", async () => {
    reply(`Tacos Don Beto. ${"palabra ".repeat(200)}`)
    const out = await generateAboutText(aboutInput)
    expect(out.source).toBe("template")
    expect(out.text.length).toBeLessThanOrEqual(MAX_ABOUT_LENGTH)
  })

  it("descarta cifras que el dueño no declaró", async () => {
    reply(
      "En Tacos Don Beto atendemos desde hace 30 años con la mejor sazón del rumbo. " +
        "Cada taco se prepara al momento y se sirve con salsas de la casa. " +
        "Pide en línea y recógelo o pídelo a domicilio cuando quieras."
    )
    const out = await generateAboutText(aboutInput)
    expect(out.source).toBe("template")
  })

  it("acepta las cifras que sí venían en las notas del dueño", async () => {
    reply(
      "En Tacos Don Beto llevamos desde 1998 en el mismo rincón del Centro. " +
        "El pastor se marina en casa y se corta al momento, con piña, cebolla y cilantro. " +
        "Pide en línea y te decimos cuándo estará listo para recoger o para llevar."
    )
    const out = await generateAboutText(aboutInput)
    expect(out.source).toBe("llm")
  })

  it("quita los enlaces que el modelo se invente", async () => {
    reply(
      "En Tacos Don Beto te esperamos con la mejor sazón del Centro. " +
        "Mira el menú completo en https://ejemplo-falso.mx/menu y pide cuando quieras. " +
        "Recogemos pedidos para llevar y enviamos a domicilio todos los días."
    )
    const out = await generateAboutText(aboutInput)
    expect(out.text).not.toContain("http")
  })

  it("limpia markdown, comillas y fences", async () => {
    reply(
      '```markdown\n## Sobre nosotros\n"En Tacos Don Beto te esperamos con la mejor sazón del Centro. ' +
        "El pastor se marina en casa y se corta al momento. Pide en línea y te decimos cuándo estará listo.\"\n```"
    )
    const out = await generateAboutText(aboutInput)
    expect(out.source).toBe("llm")
    expect(out.text.startsWith("##")).toBe(false)
    expect(out.text.startsWith('"')).toBe(false)
    expect(out.text).not.toContain("```")
  })
})

describe("generateDishCopy", () => {
  it("usa el modelo cuando la frase es válida", async () => {
    reply("Taco al pastor con piña, cebolla y cilantro, servido en tortilla recién hecha.")
    const out = await generateDishCopy(dishInput)
    expect(out.source).toBe("llm")
    expect(out.text).toContain("pastor")
  })

  it("nunca publica el precio: una cifra suelta se descarta", async () => {
    reply("Taco al pastor con piña y cilantro por solo 18 pesos.")
    const out = await generateDishCopy(dishInput)
    expect(out.source).toBe("template")
    expect(out.text).not.toContain("18")
  })

  it("cae a la plantilla cuando no hay modelo", async () => {
    raw.mockResolvedValue(null)
    const out = await generateDishCopy(dishInput)
    expect(out.source).toBe("template")
    expect(out.text).toContain("Taco al pastor")
    expect(out.text).toContain("Tacos Don Beto")
  })

  it("cae a la plantilla si el proveedor revienta", async () => {
    raw.mockRejectedValue(new Error("boom"))
    const out = await generateDishCopy(dishInput)
    expect(out.source).toBe("template")
  })

  it("descarta frases demasiado cortas o largas", async () => {
    reply("Rico.")
    expect((await generateDishCopy(dishInput)).source).toBe("template")

    reply(`Taco al pastor ${"con mucho sabor ".repeat(30)}`)
    const long = await generateDishCopy(dishInput)
    expect(long.source).toBe("template")
    expect(long.text.length).toBeLessThanOrEqual(MAX_DISH_LENGTH)
  })

  it("colapsa saltos de línea: la ficha es una sola línea", async () => {
    reply("Taco al pastor con piña y cilantro.\n\nServido en tortilla recién hecha.")
    const out = await generateDishCopy(dishInput)
    expect(out.text).not.toContain("\n")
  })
})

describe("generateFaq", () => {
  const branches: SeoBranchFacts[] = [
    { name: "Centro", city: "Puebla", pickup_active: true, delivery_active: true },
  ]

  it("no consulta al modelo: las respuestas hablan de dinero y envíos", () => {
    const out = generateFaq({ restaurantName: "Tacos Don Beto", branches, city: "Puebla" })
    expect(raw).not.toHaveBeenCalled()
    expect(out.source).toBe("template")
  })

  it("arma una pregunta por modalidad activa más las de siempre", () => {
    const out = generateFaq({ restaurantName: "Tacos Don Beto", branches, city: "Puebla" })
    const questions = out.items.map((item) => item.q)
    expect(questions[0]).toBe("¿Tacos Don Beto hace envíos a domicilio?")
    expect(questions).toContain("¿Puedo pasar a recoger mi pedido?")
    expect(questions).toContain("¿Cómo puedo pagar?")
    expect(questions).toContain("¿Cómo sé cuándo estará listo mi pedido?")
  })

  it("toma la ciudad de la sucursal cuando no se la pasan", () => {
    const out = generateFaq({ restaurantName: "Tacos Don Beto", branches })
    expect(out.items[0]?.a).toContain("Puebla")
  })

  it("no promete envío si el restaurante lo tiene apagado", () => {
    const out = generateFaq({
      restaurantName: "Tacos Don Beto",
      branches: [{ name: "Centro", city: "Puebla", pickup_active: true }],
    })
    expect(out.items.map((item) => item.q)).not.toContain(
      "¿Tacos Don Beto hace envíos a domicilio?"
    )
  })

  it("pregunta por el local solo si hay servicio en mesa", () => {
    const out = generateFaq({
      restaurantName: "Tacos Don Beto",
      branches: [{ name: "Centro", dine_in_active: true }],
    })
    expect(out.items.map((item) => item.q)).toContain("¿Tienen servicio en el local?")
  })

  it("funciona sin sucursales", () => {
    const out = generateFaq({ restaurantName: "Tacos Don Beto", branches: [] })
    expect(out.items).toHaveLength(2)
    expect(out.items.every((item) => item.a.length > 0)).toBe(true)
  })
})
