import { describe, expect, it } from "vitest"
import {
  MAX_TAGS_PER_PROSPECT,
  MAX_TAG_LENGTH,
  addTags,
  normalizeTag,
  normalizeTags,
  parseTagInput,
  readTags,
  removeTags,
  tagLabel,
  tagMatches,
  toggleTag,
} from "./crm-tags"

describe("normalizeTag", () => {
  it("pasa a minúsculas, sin acentos y sin espacios sobrantes", () => {
    expect(normalizeTag("  Cafetería  ")).toBe("cafeteria")
    expect(normalizeTag("ALTA ROTACIÓN")).toBe("alta rotacion")
  })

  it("colapsa espacios internos", () => {
    expect(normalizeTag("cliente    vip")).toBe("cliente vip")
  })

  it("conserva guiones y guiones bajos", () => {
    expect(normalizeTag("post-venta")).toBe("post-venta")
    expect(normalizeTag("lead_caliente")).toBe("lead_caliente")
  })

  it("cambia la puntuación por espacio en vez de pegarla", () => {
    expect(normalizeTag("vip!!")).toBe("vip")
    expect(normalizeTag("a,b")).toBe("a b")
  })

  it("sin contenido utilizable devuelve null", () => {
    expect(normalizeTag("")).toBeNull()
    expect(normalizeTag("   ")).toBeNull()
    expect(normalizeTag(null)).toBeNull()
    expect(normalizeTag(undefined)).toBeNull()
    expect(normalizeTag("!!!")).toBeNull()
  })

  it("recorta al máximo permitido", () => {
    const tag = normalizeTag("x".repeat(MAX_TAG_LENGTH + 10))
    expect(tag).toHaveLength(MAX_TAG_LENGTH)
  })
})

describe("normalizeTags", () => {
  it("deduplica conservando el orden", () => {
    expect(normalizeTags(["Vip", "mayoreo", "VIP ", "mayoréo"])).toEqual(["vip", "mayoreo"])
  })

  it("descarta lo que no normaliza", () => {
    expect(normalizeTags(["", "  ", "vip", "***"])).toEqual(["vip"])
  })

  it("respeta el tope por prospecto", () => {
    const many = Array.from({ length: MAX_TAGS_PER_PROSPECT + 5 }, (_, i) => `t${i}`)
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS_PER_PROSPECT)
  })

  it("sin entradas devuelve arreglo vacío", () => {
    expect(normalizeTags([])).toEqual([])
  })
})

describe("parseTagInput", () => {
  it("separa por coma, punto y coma y salto de línea", () => {
    expect(parseTagInput("vip, mayoreo; nuevo\ninteresado")).toEqual([
      "vip",
      "mayoreo",
      "nuevo",
      "interesado",
    ])
  })

  it("admite etiquetas con espacios internos", () => {
    expect(parseTagInput("alta rotacion, post-venta")).toEqual(["alta rotacion", "post-venta"])
  })

  it("entrada vacía no produce etiquetas", () => {
    expect(parseTagInput("")).toEqual([])
    expect(parseTagInput(null)).toEqual([])
    expect(parseTagInput(" , , ")).toEqual([])
  })
})

describe("addTags / removeTags", () => {
  it("agrega sin duplicar", () => {
    expect(addTags(["vip"], ["Vip", "nuevo"])).toEqual(["vip", "nuevo"])
  })

  it("quita comparando normalizado", () => {
    expect(removeTags(["vip", "nuevo"], ["VIP"])).toEqual(["nuevo"])
  })

  it("quitar algo que no está no cambia nada", () => {
    expect(removeTags(["vip"], ["nuevo"])).toEqual(["vip"])
  })

  it("no muta el arreglo original", () => {
    const original = ["vip"]
    addTags(original, ["nuevo"])
    removeTags(original, ["vip"])
    expect(original).toEqual(["vip"])
  })
})

describe("toggleTag", () => {
  it("agrega si no estaba", () => {
    expect(toggleTag(["vip"], "Nuevo")).toEqual(["vip", "nuevo"])
  })

  it("quita si ya estaba", () => {
    expect(toggleTag(["vip", "nuevo"], "VIP")).toEqual(["nuevo"])
  })

  it("una etiqueta inválida deja el arreglo igual", () => {
    expect(toggleTag(["vip"], "  ")).toEqual(["vip"])
  })
})

describe("tagMatches", () => {
  it("compara normalizado en ambos lados", () => {
    expect(tagMatches("Vip", "vip")).toBe(true)
    expect(tagMatches("mayoréo", "Mayoreo")).toBe(true)
  })

  it("no coincide con otra etiqueta", () => {
    expect(tagMatches("vip", "nuevo")).toBe(false)
  })

  it("un filtro vacío no coincide con nada", () => {
    expect(tagMatches("vip", "")).toBe(false)
    expect(tagMatches("vip", null)).toBe(false)
  })
})

describe("tagLabel", () => {
  it("capitaliza solo la primera letra", () => {
    expect(tagLabel("cliente vip")).toBe("Cliente vip")
  })

  it("etiqueta vacía devuelve vacío", () => {
    expect(tagLabel("")).toBe("")
  })
})

describe("readTags", () => {
  it("lee un arreglo de texto tal cual", () => {
    expect(readTags(["Vip", "nuevo"])).toEqual(["Vip", "nuevo"])
  })

  it("no normaliza ni recorta el tope: lo guardado se muestra igual", () => {
    const many = Array.from({ length: MAX_TAGS_PER_PROSPECT + 3 }, (_, i) => `T${i}`)
    expect(readTags(many)).toHaveLength(MAX_TAGS_PER_PROSPECT + 3)
  })

  it("descarta lo que no sea texto", () => {
    expect(readTags(["vip", 7, null, undefined, {}])).toEqual(["vip"])
  })

  it("valores que no son arreglo devuelven vacío", () => {
    expect(readTags(null)).toEqual([])
    expect(readTags(undefined)).toEqual([])
    expect(readTags("vip")).toEqual([])
    expect(readTags({ 0: "vip" })).toEqual([])
  })

  it("deduplica repeticiones exactas y descarta vacíos", () => {
    expect(readTags(["vip", "vip", "  ", "nuevo"])).toEqual(["vip", "nuevo"])
  })
})
