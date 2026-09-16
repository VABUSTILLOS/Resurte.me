import { describe, it, expect } from "vitest"
import {
  mergeShareInput,
  parseShareText,
  pickBestMatch,
  shareSummary,
  totalShareQuantity,
  MAX_SHARE_ITEMS,
  MAX_SHARE_QUANTITY,
} from "./share-list"

describe("parseShareText", () => {
  it("devuelve vacío sin texto", () => {
    expect(parseShareText(null)).toEqual({ entries: [], truncated: 0 })
    expect(parseShareText("")).toEqual({ entries: [], truncated: 0 })
    expect(parseShareText("   \n  \n")).toEqual({ entries: [], truncated: 0 })
  })

  it("trata cada renglón como un producto con cantidad 1", () => {
    const { entries } = parseShareText("tomate\nlechuga\nlimones")
    expect(entries).toEqual([
      { name: "tomate", quantity: 1 },
      { name: "lechuga", quantity: 1 },
      { name: "limones", quantity: 1 },
    ])
  })

  it("quita viñetas y numeración de lista", () => {
    const { entries } = parseShareText("- tomate\n• lechuga\n* limones\n3. cebolla\n4) ajo")
    expect(entries.map((e) => e.name)).toEqual([
      "tomate",
      "lechuga",
      "limones",
      "cebolla",
      "ajo",
    ])
  })

  it("lee la cantidad delante del nombre", () => {
    const { entries } = parseShareText("2 tomates\n3 lechugas")
    expect(entries).toEqual([
      { name: "tomates", quantity: 2 },
      { name: "lechugas", quantity: 3 },
    ])
  })

  it("descarta la unidad y el conector al leer la cantidad", () => {
    const { entries } = parseShareText("2 kg de tomate\n1 l de leche\n3 piezas de pan")
    expect(entries).toEqual([
      { name: "tomate", quantity: 2 },
      { name: "leche", quantity: 1 },
      { name: "pan", quantity: 3 },
    ])
  })

  it("lee la cantidad con x delante o detrás", () => {
    const { entries } = parseShareText("2x tomate\nlechuga x3\n4× limón")
    expect(entries).toEqual([
      { name: "tomate", quantity: 2 },
      { name: "lechuga", quantity: 3 },
      { name: "limón", quantity: 4 },
    ])
  })

  it("lee la cantidad entre paréntesis", () => {
    const { entries } = parseShareText("tomate (2)\nlechuga (3)")
    expect(entries).toEqual([
      { name: "tomate", quantity: 2 },
      { name: "lechuga", quantity: 3 },
    ])
  })

  it("ignora renglones con URL", () => {
    const { entries } = parseShareText("tomate\nhttps://ejemplo.com/lista\nwww.ejemplo.com")
    expect(entries).toEqual([{ name: "tomate", quantity: 1 }])
  })

  it("ignora renglones demasiado cortos para buscar", () => {
    const { entries } = parseShareText("a\n.\n-\n2 x\ntomate")
    expect(entries).toEqual([{ name: "tomate", quantity: 1 }])
  })

  it("suma los repetidos sin distinguir acentos ni mayúsculas", () => {
    const { entries } = parseShareText("Limón\nlimon\nLIMON\n2 limón")
    expect(entries).toEqual([{ name: "Limón", quantity: 5 }])
  })

  it("recorta la puntuación final de cada renglón", () => {
    const { entries } = parseShareText("tomate,\nlechuga;")
    expect(entries.map((e) => e.name)).toEqual(["tomate", "lechuga"])
  })

  it("respeta el tope de cantidad", () => {
    const { entries } = parseShareText("500 tomates")
    expect(entries[0]?.quantity).toBe(MAX_SHARE_QUANTITY)
  })

  it("sumando repetidos tampoco pasa el tope", () => {
    const { entries } = parseShareText("90 tomates\n90 tomates")
    expect(entries[0]?.quantity).toBe(MAX_SHARE_QUANTITY)
  })

  it("limita el número de productos y reporta lo descartado", () => {
    const lines = Array.from({ length: MAX_SHARE_ITEMS + 5 }, (_, i) => `producto${i}`)
    const { entries, truncated } = parseShareText(lines.join("\n"))
    expect(entries).toHaveLength(MAX_SHARE_ITEMS)
    expect(truncated).toBe(5)
  })

  it("no marca truncado cuando cabe completo", () => {
    expect(parseShareText("tomate\nlechuga").truncated).toBe(0)
  })
})

describe("mergeShareInput", () => {
  it("prefiere el texto sobre el título", () => {
    expect(mergeShareInput("tomate\nlechuga", "Lista de la semana")).toBe("tomate\nlechuga")
  })

  it("usa el título si el texto viene vacío", () => {
    expect(mergeShareInput("  ", "2 kg de tomate")).toBe("2 kg de tomate")
    expect(mergeShareInput(null, "lechuga")).toBe("lechuga")
  })

  it("devuelve vacío si no hay nada", () => {
    expect(mergeShareInput(null, null)).toBe("")
  })
})

describe("pickBestMatch", () => {
  const candidates = [
    { id: 1, name: "Tomate saladet", slug: "tomate-saladet" },
    { id: 2, name: "Tomate", slug: "tomate" },
    { id: 3, name: "Jitomate bola", slug: "jitomate-bola" },
  ]

  it("devuelve null sin candidatos", () => {
    expect(pickBestMatch("tomate", [])).toBeNull()
  })

  it("prefiere el nombre idéntico sobre el resto", () => {
    expect(pickBestMatch("tomate", candidates)?.id).toBe(2)
  })

  it("ignora acentos y mayúsculas al comparar", () => {
    expect(pickBestMatch("TOMATE", candidates)?.id).toBe(2)
    expect(pickBestMatch("tomáte", candidates)?.id).toBe(2)
  })

  it("cae al que empieza con el término", () => {
    expect(pickBestMatch("tomate sala", candidates)?.id).toBe(1)
  })

  it("cae al que contiene el término", () => {
    expect(pickBestMatch("bola", candidates)?.id).toBe(3)
  })

  it("usa el primer resultado cuando nada coincide", () => {
    expect(pickBestMatch("cebolla", candidates)?.id).toBe(1)
  })

  it("usa el primer resultado con término vacío", () => {
    expect(pickBestMatch("   ", candidates)?.id).toBe(1)
  })
})

describe("resumen", () => {
  it("suma cantidades", () => {
    expect(totalShareQuantity([{ name: "a", quantity: 2 }, { name: "b", quantity: 3 }])).toBe(5)
    expect(totalShareQuantity([])).toBe(0)
  })

  it("redacta el encabezado con plurales", () => {
    expect(shareSummary([{ name: "a", quantity: 1 }])).toBe("1 producto · 1 pieza")
    expect(shareSummary([{ name: "a", quantity: 2 }, { name: "b", quantity: 3 }])).toBe(
      "2 productos · 5 piezas"
    )
  })
})
