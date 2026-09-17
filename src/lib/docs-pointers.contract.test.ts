import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Contrato de los punteros de `docs/PLAN-MEJORAS.md`: **una referencia tiene
 * que poder seguirse**.
 *
 * Contexto: el documento acumula actas por ronda y las referencia desde otras
 * partes (`§ Verificación`, filas de tabla, cierres de ronda). Ese mecanismo se
 * rompió en silencio: había tres punteros que prometían una "sección de la
 * ronda 9" que **nunca se escribió** (las actas se interrumpieron después de la
 * ronda 6), y dos `(ver esa sección)` sin decir a cuál. El texto no falla, no
 * avisa y se lee igual de bien: el lector busca, no encuentra, y deja de
 * confiar en las referencias. Es el mismo modo de fallo que el resto de
 * contratos de `src/lib/*.contract.test.ts`, en documentación.
 *
 * Este contrato cierra las cuatro formas de reintroducirlo:
 *
 *  1. Un puntero a una sección inexistente (`sección de la ronda N` sin su
 *     `### Ronda N`).
 *  2. Un puntero vago (`(ver esa sección)`) que obliga a adivinar el destino.
 *  3. Un puntero a una fila que no existe (`ver la fila X` sin `| X |`).
 *  4. Dos actas con el mismo número, o numeradas hacia atrás.
 *
 * **Discriminador crítico**: en este documento "ronda N" es **vocabulario
 * sobrecargado**. Las filas A18–A37 y B1–B32 se llaman "Productos ronda 7" …
 * "Productos ronda 13" — eso es el nombre de una tanda de trabajo del panel de
 * productos, no un acta del programa—, y en `docs/agents/*.md` "Ronda 9" es la
 * fila P14. Por eso el contrato **no** busca "ronda N": busca el patrón
 * explícito de puntero, y comprueba que ningún puntero viva dentro de una fila
 * de tabla.
 *
 * Convención que asume: el acta es un encabezado `### Ronda N` (N decimal, sin
 * ceros a la izquierda), y el puntero nombra el número en prosa ("la sección de
 * la ronda N"). La sección general del programa —`### Ronda de mejoras (FoodOS
 * + backlog)`— no lleva número y queda fuera, a propósito.
 */

const REPO = process.cwd()
const DOC_PATH = join(REPO, "docs", "PLAN-MEJORAS.md")
const LINES = readFileSync(DOC_PATH, "utf8").split("\n")

/** Acta de una ronda: `### Ronda N — ...`. */
const SECTION_RE = /^### Ronda (\d+)\b/g
/** Puntero explícito a un acta. */
const SECTION_POINTER_RE = /sección de la ronda (\d+)/gi
/** Puntero que promete una sección sin decir cuál. */
const VAGUE_SECTION_RE = /\(ver esa sección\)/i
/** Puntero a una fila de tabla. */
const ROW_POINTER_RE = /ver la fila ([A-Z]{1,3}\d+)\b/gi
/** Definición de fila: `| U14 | ...`. */
const ROW_DEF_RE = /^\|\s*([A-Z]{1,3}\d+)\s*\|/
/** Etiqueta de producto que imita el vocabulario de rondas. */
const PRODUCT_LABEL_RE = /Productos ronda (\d+)/gi

type Hit = { line: number; text: string; value: string }

function collect(re: RegExp): Hit[] {
  const hits: Hit[] = []
  LINES.forEach((text, index) => {
    // Un regex con `g` conserva `lastIndex` entre llamadas: se reinicia por
    // línea para que el escaneo sea determinista.
    re.lastIndex = 0
    for (const match of text.matchAll(re)) {
      hits.push({ line: index + 1, text: text.trim(), value: match[1] ?? "" })
    }
  })
  return hits
}

const SECTIONS = collect(SECTION_RE)
const SECTION_NUMBERS = SECTIONS.map((s) => Number(s.value))
const POINTERS = collect(SECTION_POINTER_RE)
const ROW_POINTERS = collect(ROW_POINTER_RE)
const PRODUCT_LABELS = collect(PRODUCT_LABEL_RE)
const ROWS = LINES.map((text) => ROW_DEF_RE.exec(text)?.[1]).filter(
  (id): id is string => Boolean(id)
)

describe("contrato de punteros de docs/PLAN-MEJORAS.md", () => {
  it("encuentra actas, filas y punteros en el documento", () => {
    // Canario: si el formato del documento cambia (otro nivel de encabezado,
    // otro nombre de archivo), el resto de aserciones pasaría en vacío.
    expect(SECTIONS.length, "no se encontró ninguna acta `### Ronda N`").toBeGreaterThanOrEqual(5)
    expect(ROWS.length, "no se encontró ninguna fila de tabla").toBeGreaterThanOrEqual(150)
    expect(POINTERS.length, "no se encontró ningún puntero a una sección").toBeGreaterThanOrEqual(1)
    expect(PRODUCT_LABELS.length, "desaparecieron las etiquetas `Productos ronda N`").toBeGreaterThanOrEqual(5)
  })

  it("ninguna acta repite número ni va hacia atrás", () => {
    const repeated = SECTION_NUMBERS.filter((n, i) => SECTION_NUMBERS.indexOf(n) !== i)

    expect(
      repeated,
      `Hay más de un \`### Ronda N\` con el mismo número: el puntero "la sección de la ronda N" ` +
        `se vuelve ambiguo y no se sabe cuál es el acta vigente.`
    ).toEqual([])

    const backwards = SECTION_NUMBERS.filter((n, i) => i > 0 && n <= (SECTION_NUMBERS[i - 1] ?? 0))

    expect(
      backwards,
      `Las actas están fuera de orden. Las rondas se numeran en orden creciente de aparición: ` +
        `una acta insertada en el sitio equivocado rompe la lectura cronológica.`
    ).toEqual([])
  })

  it("todo puntero a una sección apunta a un acta existente", () => {
    const dangling = POINTERS.filter((p) => !SECTION_NUMBERS.includes(Number(p.value)))

    expect(
      dangling.map((p) => `L${p.line}: ${p.text.slice(0, 100)}`),
      `Estos punteros citan una "sección de la ronda N" que no existe en el documento. ` +
        `O bien escribes el acta (\`### Ronda N\`), o bien el puntero deja de prometerla y ` +
        `el dato se cuenta en su sitio. No dejes la referencia colgando.`
    ).toEqual([])
  })

  it("ningún puntero promete una sección sin decir cuál", () => {
    const vague = LINES.map((text, index) => ({ line: index + 1, text: text.trim() })).filter((l) =>
      VAGUE_SECTION_RE.test(l.text)
    )

    expect(
      vague.map((v) => `L${v.line}: ${v.text.slice(0, 100)}`),
      `"(ver esa sección)" obliga al lector a adivinar el destino y, cuando el acta se movió ` +
        `de ronda, la frase quedó mintiendo en silencio. Nombra el número: ` +
        `"(ver la sección de la ronda N)".`
    ).toEqual([])
  })

  it("todo puntero a una fila apunta a una fila existente", () => {
    const dangling = ROW_POINTERS.filter((p) => !ROWS.includes(p.value.toUpperCase()))

    expect(
      dangling.map((p) => `L${p.line}: ${p.text.slice(0, 100)}`),
      `Estos punteros citan una fila que no existe en ninguna tabla del documento. ` +
        `La fila es el acta de esos hallazgos: si se renombra, el puntero tiene que seguirlo.`
    ).toEqual([])
  })

  it("ningún puntero vive dentro de una fila de tabla", () => {
    // Discriminador: "Productos ronda 7" es una fila de tabla, no un acta. Si
    // alguien escribe "sección de la ronda N" dentro de una fila, es señal de
    // que confundió los dos vocabularios y el puntero no es seguible.
    const inRow = POINTERS.filter((p) => p.text.startsWith("|"))

    expect(
      inRow.map((p) => `L${p.line}: ${p.text.slice(0, 100)}`),
      `Una fila de tabla no puede ser el destino de un puntero a sección: en este documento ` +
        `"Productos ronda N" (filas A18–A37, B1–B32) es el nombre de una tanda del panel de ` +
        `productos, no un acta del programa.`
    ).toEqual([])
  })
})
