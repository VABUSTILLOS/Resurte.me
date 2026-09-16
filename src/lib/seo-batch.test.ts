import { describe, expect, it } from "vitest"
import {
  SEO_BATCH_SIZE,
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  buildSeoMessages,
  buildSeoUserPrompt,
  chunkIds,
  cleanSeoText,
  needsSeo,
  parseSeoProposal,
  seoBatchSummary,
} from "./seo-batch"

describe("buildSeoUserPrompt", () => {
  it("incluye nombre, marca, categoría, etiquetas y descripción", () => {
    const out = buildSeoUserPrompt({
      id: 1,
      name: "  Café molido  ",
      brand: "Nescafé",
      categoryName: "Desayuno",
      tags: ["arranque", "café"],
      description: "Molido fino",
    })
    expect(out).toContain("Producto: Café molido")
    expect(out).toContain("marca Nescafé")
    expect(out).toContain("categoría Desayuno")
    expect(out).toContain("etiquetas arranque, café")
    expect(out).toContain("Descripción: Molido fino")
  })

  it("omite los campos vacíos y recorta la descripción a 200", () => {
    const out = buildSeoUserPrompt({
      id: 2,
      name: "Sal",
      brand: "   ",
      description: "x".repeat(500),
    })
    expect(out).toBe(`Producto: Sal, Descripción: ${"x".repeat(200)}`)
  })

  it("limita las etiquetas a 6", () => {
    const out = buildSeoUserPrompt({
      id: 3,
      name: "Aceite",
      tags: ["a", "b", "c", "d", "e", "f", "g"],
    })
    expect(out).toContain("etiquetas a, b, c, d, e, f")
    expect(out).not.toContain(", g")
  })
})

describe("buildSeoMessages", () => {
  it("arma el par system/user", () => {
    const messages = buildSeoMessages({ id: 1, name: "Arroz" })
    expect(messages).toHaveLength(2)
    expect(messages[0]?.role).toBe("system")
    expect(messages[0]?.content).toContain("JSON válido")
    expect(messages[1]?.role).toBe("user")
  })
})

describe("cleanSeoText", () => {
  it("colapsa espacios y quita comillas envolventes", () => {
    expect(cleanSeoText('  "Arroz   blanco"  ', 60)).toBe("Arroz blanco")
    expect(cleanSeoText("'Arroz blanco'", 60)).toBe("Arroz blanco")
  })

  it("recorta al máximo indicado", () => {
    expect(cleanSeoText("a".repeat(100), 60)).toHaveLength(60)
  })

  it("no rompe con una comilla suelta", () => {
    expect(cleanSeoText('"', 60)).toBe('"')
  })
})

describe("parseSeoProposal", () => {
  it("parsea JSON limpio", () => {
    const out = parseSeoProposal('{"title":"Arroz blanco 1 kg","description":"Compra arroz"}')
    expect(out).toEqual({ title: "Arroz blanco 1 kg", description: "Compra arroz" })
  })

  it("tolera bloques markdown y texto alrededor", () => {
    const out = parseSeoProposal('Claro:\n```json\n{"title":"Sal","description":"Sal de mesa"}\n```')
    expect(out).toEqual({ title: "Sal", description: "Sal de mesa" })
  })

  it("recorta al máximo del SEO", () => {
    const out = parseSeoProposal(
      JSON.stringify({ title: "t".repeat(120), description: "d".repeat(400) })
    )
    expect(out?.title).toHaveLength(SEO_TITLE_MAX)
    expect(out?.description).toHaveLength(SEO_DESCRIPTION_MAX)
  })

  it("devuelve null sin JSON o con JSON inválido", () => {
    expect(parseSeoProposal("")).toBeNull()
    expect(parseSeoProposal("no hay json aquí")).toBeNull()
    expect(parseSeoProposal("{roto")).toBeNull()
    expect(parseSeoProposal('["array"]')).toBeNull()
  })

  it("devuelve null si no hay ningún campo utilizable", () => {
    expect(parseSeoProposal('{"title":"","description":""}')).toBeNull()
    expect(parseSeoProposal('{"otro":1}')).toBeNull()
  })

  it("acepta solo uno de los dos campos", () => {
    expect(parseSeoProposal('{"title":"Solo título"}')).toEqual({
      title: "Solo título",
      description: "",
    })
  })
})

describe("needsSeo", () => {
  it("es true si falta cualquiera de los dos", () => {
    expect(needsSeo({})).toBe(true)
    expect(needsSeo({ seo_title: "T", seo_description: null })).toBe(true)
    expect(needsSeo({ seo_title: "  ", seo_description: "D" })).toBe(true)
  })

  it("es false con ambos presentes", () => {
    expect(needsSeo({ seo_title: "T", seo_description: "D" })).toBe(false)
  })
})

describe("chunkIds", () => {
  it("parte en tandas del tamaño indicado", () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it("usa el tamaño por defecto", () => {
    const ids = Array.from({ length: 25 }, (_, i) => i + 1)
    const batches = chunkIds(ids)
    expect(batches).toHaveLength(3)
    expect(batches[0]).toHaveLength(SEO_BATCH_SIZE)
    expect(batches[2]).toHaveLength(5)
  })

  it("devuelve vacío sin ids", () => {
    expect(chunkIds([])).toEqual([])
  })

  it("con tamaño inválido devuelve una sola tanda", () => {
    expect(chunkIds([1, 2], 0)).toEqual([[1, 2]])
  })
})

describe("seoBatchSummary", () => {
  it("resume aplicados, omitidos y fallidos", () => {
    expect(seoBatchSummary({ applied: 3, skipped: 1, failed: 2 })).toBe(
      "3 con SEO aplicado · 1 ya tenían SEO · 2 sin respuesta de la IA"
    )
  })

  it("omite los contadores en cero", () => {
    expect(seoBatchSummary({ applied: 5, skipped: 0, failed: 0 })).toBe("5 con SEO aplicado")
  })
})
