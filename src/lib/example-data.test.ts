import { describe, expect, it } from "vitest"
import {
  EXAMPLE_BADGE_HELP,
  EXAMPLE_BADGE_LABEL,
  exampleIngredientsNotice,
  exampleRowsNotice,
  hasExampleRows,
  splitByOrigin,
} from "@/lib/example-data"

describe("splitByOrigin", () => {
  it("separa por origen preservando el orden de cada grupo", () => {
    const rows = [
      { name: "a", example: true },
      { name: "b" },
      { name: "c", example: false },
      { name: "d", example: true },
    ]
    const { real, example } = splitByOrigin(rows)
    expect(real.map((r) => r.name)).toEqual(["b", "c"])
    expect(example.map((r) => r.name)).toEqual(["a", "d"])
  })

  it("el silencio cuenta como propio, no como ejemplo", () => {
    // Marcar como falso un dato que el usuario sí capturó sería peor que el bug
    // que este módulo arregla.
    const { real, example } = splitByOrigin([{}])
    expect(real).toHaveLength(1)
    expect(example).toHaveLength(0)
  })

  it("lista vacía devuelve dos listas vacías", () => {
    expect(splitByOrigin([])).toEqual({ real: [], example: [] })
  })

  it("todo de ejemplo", () => {
    const rows = [{ example: true }, { example: true }]
    expect(splitByOrigin(rows).example).toHaveLength(2)
    expect(splitByOrigin(rows).real).toHaveLength(0)
  })
})

describe("hasExampleRows", () => {
  it("detecta al menos una fila de ejemplo", () => {
    expect(hasExampleRows([{ example: false }, { example: true }])).toBe(true)
  })

  it("falso si ninguna lo declara", () => {
    expect(hasExampleRows([{}, { example: false }])).toBe(false)
  })

  it("falso en lista vacía", () => {
    expect(hasExampleRows([])).toBe(false)
  })
})

describe("exampleRowsNotice", () => {
  it("sin ejemplos no hay aviso (un aviso permanente se vuelve invisible)", () => {
    expect(exampleRowsNotice(0, 5, "platillos")).toBeNull()
    expect(exampleRowsNotice(0, 0, "platillos")).toBeNull()
  })

  it("solo ejemplos dice que nada es del negocio", () => {
    const notice = exampleRowsNotice(7, 0, "platillos")
    expect(notice).toContain("Los 7 platillos")
    expect(notice).toContain("inventados")
  })

  it("mezcla cuenta ambos lados", () => {
    const notice = exampleRowsNotice(7, 3, "platillos")
    expect(notice).toContain("7 de los 10")
    expect(notice).toContain("los otros 3")
  })

  it("ignora conteos negativos y no produce 'de los 0'", () => {
    expect(exampleRowsNotice(-3, 4, "platillos")).toBeNull()
  })

  it("trunca decimales en lugar de imprimir 2.5 platillos", () => {
    expect(exampleRowsNotice(2.9, 1.2, "platillos")).toContain("2 de los 3")
  })
})

describe("exampleIngredientsNotice", () => {
  it("sin ejemplos no hay aviso", () => {
    expect(exampleIngredientsNotice(0, 30)).toBeNull()
  })

  it("lista vacía no hay aviso", () => {
    expect(exampleIngredientsNotice(0, 0)).toBeNull()
  })

  it("todos de ejemplo dice que el catálogo no aportó nada", () => {
    const notice = exampleIngredientsNotice(12, 12)
    expect(notice).toContain("Ninguno de los 12")
    expect(notice).toContain("no es real")
  })

  it("mezcla nombra la etiqueta que verá en los platillos", () => {
    const notice = exampleIngredientsNotice(4, 30)
    expect(notice).toContain("4 de 30")
    expect(notice).toContain(EXAMPLE_BADGE_LABEL)
  })
})

describe("etiquetas", () => {
  it("la etiqueta es corta y el motivo explica que son inventados", () => {
    expect(EXAMPLE_BADGE_LABEL).toBe("ejemplo")
    expect(EXAMPLE_BADGE_HELP).toContain("inventados")
  })
})
