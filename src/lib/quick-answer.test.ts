import { describe, expect, it } from "vitest"
import {
  QUICK_ANSWER_MAX_WORDS,
  deriveQuickAnswer,
} from "./quick-answer"

const words = (n: number, prefix = "palabra") =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ")

describe("deriveQuickAnswer", () => {
  it("toma el primer párrafo de prosa", () => {
    const body = `# Título\n\nSurtir un restaurante cuesta entre 40 y 80 mil pesos al mes según el tamaño del menú.\n\nOtro párrafo.`
    expect(deriveQuickAnswer(body)).toBe(
      "Surtir un restaurante cuesta entre 40 y 80 mil pesos al mes según el tamaño del menú."
    )
  })

  it("ignora encabezados, listas, tablas, citas y JSX hasta hallar prosa", () => {
    const body = [
      "## Sección",
      "",
      "- punto uno",
      "- punto dos",
      "",
      "| a | b |",
      "| - | - |",
      "",
      "> una cita que no es la respuesta",
      "",
      "<Componente prop=\"x\" />",
      "",
      "Esta es la primera prosa de verdad y tiene suficientes palabras para servir como respuesta citable.",
    ].join("\n")
    expect(deriveQuickAnswer(body)).toBe(
      "Esta es la primera prosa de verdad y tiene suficientes palabras para servir como respuesta citable."
    )
  })

  it("ignora import/export y bloques de código", () => {
    const body = [
      "import { X } from \"y\"",
      "",
      "```ts",
      "const esto = 'no es prosa ni de lejos y debería ignorarse por completo'",
      "```",
      "",
      "El precio de referencia del jitomate saladette se publica por kilo y por ciudad cada semana.",
    ].join("\n")
    expect(deriveQuickAnswer(body)).toBe(
      "El precio de referencia del jitomate saladette se publica por kilo y por ciudad cada semana."
    )
  })

  it("convierte enlaces y negritas a texto plano", () => {
    const body =
      "Compra al **mayoreo** en [Resurte.me](https://resurte.me) y ahorra hasta un 30% frente al menudeo tradicional."
    expect(deriveQuickAnswer(body)).toBe(
      "Compra al mayoreo en Resurte.me y ahorra hasta un 30% frente al menudeo tradicional."
    )
  })

  it("no usa una oración con decimales como corte falso", () => {
    const body =
      "El precio ronda los 28.5 pesos por kilo y el rango observado va de 24 a 33 pesos entre tiendas de la ciudad."
    expect(deriveQuickAnswer(body)).toBe(body)
  })

  it("respeta el límite de 50 palabras cortando en fin de oración", () => {
    const primera = `${words(30)}.`
    const segunda = `${words(10)}.`
    const tercera = `${words(40)}.`
    const body = `${primera} ${segunda} ${tercera}`

    const out = deriveQuickAnswer(body)
    expect(out).not.toBeNull()
    const result = out as string
    expect(result).toBe(`${primera} ${segunda}`)
    expect(result.split(/\s+/).length).toBeLessThanOrEqual(
      QUICK_ANSWER_MAX_WORDS
    )
  })

  it("corta en duro cuando una sola oración excede el presupuesto", () => {
    const body = `${words(90)}.`
    const out = deriveQuickAnswer(body) as string
    expect(out.endsWith("…")).toBe(true)
    expect(out.split(/\s+/).length).toBe(QUICK_ANSWER_MAX_WORDS)
  })

  it("devuelve null sin párrafo aprovechable", () => {
    expect(deriveQuickAnswer("")).toBeNull()
    expect(deriveQuickAnswer("# Solo un encabezado\n\n## Y otro")).toBeNull()
    expect(deriveQuickAnswer("- uno\n- dos\n- tres")).toBeNull()
  })

  it("descarta párrafos demasiado cortos para ser respuesta", () => {
    expect(deriveQuickAnswer("Muy corto.")).toBeNull()
  })

  it("normaliza espacios y saltos internos de línea", () => {
    const body =
      "El costo   del\nfrijol negro sube cada temporada y conviene fijar precio por kilo con el proveedor."
    const out = deriveQuickAnswer(body) as string
    expect(out).not.toContain("\n")
    expect(out).not.toContain("  ")
  })

  it("acepta un presupuesto de palabras a medida", () => {
    const body = `${words(20)}.`
    expect(deriveQuickAnswer(body, 5)?.endsWith("…")).toBe(true)
    expect(deriveQuickAnswer(body, 200)).toBe(`${words(20)}.`)
  })
})
