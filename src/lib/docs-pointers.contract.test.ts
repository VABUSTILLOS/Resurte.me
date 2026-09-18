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
 * Este contrato cierra las formas de reintroducirlo:
 *
 *  1. Un puntero a una sección inexistente (`sección de la ronda N` sin su
 *     `### Ronda N`).
 *  2. Un puntero vago (`(ver esa sección)`) que obliga a adivinar el destino.
 *  3. Un puntero a una fila que no existe (`ver la fila X` sin `| X |`).
 *  4. Dos actas con el mismo número, o numeradas hacia atrás.
 *  5. **Una sección que repite un ID de fila**, o un rango que se traga una
 *     fila listada aparte (ronda 17).
 *  6. **Un puntero desnudo a un ID ambiguo desde otra sección** (ronda 17).
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
 *
 * ---
 *
 * **Ronda 17 — el modelo plano mentía por omisión.** Este contrato leía las
 * filas como **una sola lista global**, y el documento **acota los IDs por
 * sección**: `A14` es a la vez una fila de producto de `## 8. Administración` y
 * una fila de deuda de `### Ronda 13`, a propósito. Medido: **46 IDs** se
 * reutilizan entre secciones (convención) y **cero** se repiten dentro de una
 * misma sección (defecto). El modelo plano producía tres cegueras:
 *
 *  1. **No veía 82 filas.** Las filas de rango (`| A1-A8 |`, `| BL1-BL10 |`…)
 *     no casan con la definición de fila suelta, así que un puntero a una de
 *     ellas se reportaba colgante aunque la fila existiera.
 *  2. **Resolvía en cualquier sitio.** Un `ver la fila X` probaba que el ID
 *     existía *en algún lugar*, no *donde el puntero está*: la promesa era más
 *     débil de lo que se lee.
 *  3. **El arreglo obvio era un falso positivo masivo.** Una guardia global de
 *     duplicados marcaría los 46 IDs de la convención como defecto.
 *
 * El modelo ahora es **por sección**: un puntero desnudo resuelve si el ID está
 * en **su propia sección** o si es **único en todo el documento**; si el ID es
 * ambiguo y vive en otra sección, el puntero **tiene que decir cuál**
 * (`de la ronda N` / `de la sección N`). La guardia que faltaba —ninguna
 * sección repite un ID, ningún rango se traga una fila listada aparte— hoy da
 * cero, y su valor se demuestra con prueba negativa, no con un rojo vivo.
 *
 * La prosa usa **tres formas** de citar una fila y el contrato reconoce las
 * tres: desnuda (`ver la fila U14`), con acentos graves (``fila `C12` ``) y en
 * negrita (`fila **C14**`).
 */

const REPO = process.cwd()
const DOC_PATH = join(REPO, "docs", "PLAN-MEJORAS.md")
const LINES = readFileSync(DOC_PATH, "utf8").split("\n")

/** Encabezado de sección: `## …` o `### …`. */
const HEADER_RE = /^(#{2,3})\s+(.*)$/
/** Acta de una ronda: `### Ronda N — …`. */
const SECTION_RE = /^### Ronda (\d+)\b/g
/** Sección numerada del producto: `## N. …`. */
const PRODUCT_SECTION_RE = /^## (\d+)\.\s/
/** Puntero explícito a un acta. */
const SECTION_POINTER_RE = /sección de la ronda (\d+)/gi
/** Puntero que promete una sección sin decir cuál. */
const VAGUE_SECTION_RE = /\(ver esa sección\)/i
/**
 * Puntero a una fila de tabla. Reconoce las tres formas de la prosa y una
 * calificación opcional de la sección de destino (`de la ronda N` /
 * `de la sección N`), que es obligatoria cuando el ID es ambiguo y vive fuera
 * de la sección del puntero.
 */
const ROW_POINTER_RE =
  /\bfila\s+[`*]{0,2}([A-Z]{1,3}\d+)[`*]{0,2}(?:\s+de la (ronda|sección)\s+(\d+))?/gi
/** Definición de fila suelta: `| U14 | …`. */
const ROW_DEF_RE = /^\|\s*([A-Z]{1,3})(\d+)\s*\|/
/** Definición de fila en rango: `| A1-A8 | …`. */
const RANGE_ROW_RE = /^\|\s*([A-Z]{1,3})(\d+)\s*[-–]\s*([A-Z]{1,3})?(\d+)\s*\|/
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

type Section = { line: number; title: string; kind: "round" | "product" | "other"; number: number | null }

const SECTIONS: Section[] = []
LINES.forEach((text, index) => {
  const header = HEADER_RE.exec(text)
  if (!header) return
  const title = (header[2] ?? "").trim()
  const round = /^Ronda (\d+)\b/.exec(title)
  const product = PRODUCT_SECTION_RE.exec(text)
  if (round) {
    SECTIONS.push({ line: index + 1, title, kind: "round", number: Number(round[1]) })
  } else if (product) {
    SECTIONS.push({ line: index + 1, title, kind: "product", number: Number(product[1]) })
  } else {
    SECTIONS.push({ line: index + 1, title, kind: "other", number: null })
  }
})

/** Índice de la sección que envuelve una línea (la última cabecera antes de ella). */
function sectionIndexAt(line: number): number {
  let index = -1
  SECTIONS.forEach((s, i) => {
    if (s.line <= line) index = i
  })
  return index
}

type Row = { line: number; id: string; section: number; fromRange: boolean }

/** Todas las filas, cada una atada a la sección que la envuelve. */
const ROWS: Row[] = []
let currentSection = -1
LINES.forEach((text, index) => {
  const headerIndex = SECTIONS.findIndex((s) => s.line === index + 1)
  if (headerIndex >= 0) {
    currentSection = headerIndex
    return
  }
  const single = ROW_DEF_RE.exec(text)
  if (single) {
    ROWS.push({ line: index + 1, id: `${single[1]}${single[2]}`.toUpperCase(), section: currentSection, fromRange: false })
    return
  }
  const range = RANGE_ROW_RE.exec(text)
  if (range) {
    const letter = range[1] ?? ""
    const from = Number(range[2])
    const to = Number(range[4])
    for (let n = from; n <= to; n++) {
      ROWS.push({ line: index + 1, id: `${letter}${n}`.toUpperCase(), section: currentSection, fromRange: true })
    }
  }
})

/** Cuántas veces aparece cada ID en todo el documento. */
const GLOBAL_COUNTS = new Map<string, number>()
for (const row of ROWS) GLOBAL_COUNTS.set(row.id, (GLOBAL_COUNTS.get(row.id) ?? 0) + 1)

/** IDs que viven en más de una sección: la convención de alcance por sección. */
const AMBIGUOUS = [...GLOBAL_COUNTS.entries()]
  .filter(([, count]) => count > 1)
  .map(([id]) => id)
  .sort()

/** Filas que repiten ID dentro de su propia sección: el defecto real. */
const INTRA_SECTION_DUPLICATES = SECTIONS.flatMap((section, si) => {
  const byId = new Map<string, number[]>()
  for (const row of ROWS) {
    if (row.section !== si) continue
    byId.set(row.id, [...(byId.get(row.id) ?? []), row.line])
  }
  return [...byId.entries()]
    .filter(([, lines]) => lines.length > 1)
    .map(([id, lines]) => `§ "${section.title}" (L${section.line}): ${id} en L${lines.join(", L")}`)
})

/** Filas donde un rango se traga una fila listada aparte, dentro de una sección. */
const INTRA_SECTION_OVERLAPS = SECTIONS.flatMap((section, si) => {
  const byId = new Map<string, Row[]>()
  for (const row of ROWS) {
    if (row.section !== si) continue
    byId.set(row.id, [...(byId.get(row.id) ?? []), row])
  }
  return [...byId.entries()]
    .filter(([, rows]) => rows.length > 1 && rows.some((r) => r.fromRange))
    .map(([id, rows]) => `§ "${section.title}" (L${section.line}): ${id} en L${rows.map((r) => r.line).join(", L")}`)
})

type RowPointer = {
  line: number
  text: string
  id: string
  qualifier: { kind: "ronda" | "sección"; number: number } | null
}

const ROW_POINTERS: RowPointer[] = []
LINES.forEach((text, index) => {
  ROW_POINTER_RE.lastIndex = 0
  for (const match of text.matchAll(ROW_POINTER_RE)) {
    ROW_POINTERS.push({
      line: index + 1,
      text: text.trim(),
      id: (match[1] ?? "").toUpperCase(),
      qualifier: match[2] ? { kind: match[2] as "ronda" | "sección", number: Number(match[3]) } : null,
    })
  }
})

/** Por qué un puntero a fila no se puede seguir, o `null` si sí se puede. */
function pointerProblem(pointer: RowPointer): string | null {
  if (pointer.qualifier) {
    const kind = pointer.qualifier.kind === "ronda" ? "round" : "product"
    const targetIndex = SECTIONS.findIndex((s) => s.kind === kind && s.number === pointer.qualifier?.number)
    if (targetIndex < 0) {
      return `cita "${pointer.qualifier.kind} ${pointer.qualifier.number}", que no existe en el documento`
    }
    const title = SECTIONS[targetIndex]?.title ?? ""
    if (!ROWS.some((r) => r.section === targetIndex && r.id === pointer.id)) {
      return `dice que ${pointer.id} está en "${title}", y ahí no hay ninguna fila ${pointer.id}`
    }
    return null
  }

  const own = sectionIndexAt(pointer.line)
  if (ROWS.some((r) => r.section === own && r.id === pointer.id)) return null
  if ((GLOBAL_COUNTS.get(pointer.id) ?? 0) === 1) return null

  const where = [...new Set(ROWS.filter((r) => r.id === pointer.id).map((r) => SECTIONS[r.section]?.title ?? "(sin sección)"))]
  return (
    `cita ${pointer.id}, que es ambiguo (vive en ${where.map((w) => `"${w}"`).join(" y ")}) ` +
    `y no en esta sección: califícalo con "de la ronda N" o "de la sección N"`
  )
}

const SECTIONS_ACTS = collect(SECTION_RE)
const SECTION_NUMBERS = SECTIONS_ACTS.map((s) => Number(s.value))
const POINTERS = collect(SECTION_POINTER_RE)
const PRODUCT_LABELS = collect(PRODUCT_LABEL_RE)

describe("contrato de punteros de docs/PLAN-MEJORAS.md", () => {
  it("encuentra secciones, filas y punteros en el documento", () => {
    // Canario: si el formato del documento cambia (otro nivel de encabezado,
    // otro nombre de archivo), el resto de aserciones pasaría en vacío.
    expect(SECTIONS.length, "no se encontró ninguna sección `## …` / `### …`").toBeGreaterThanOrEqual(20)
    expect(SECTIONS_ACTS.length, "no se encontró ninguna acta `### Ronda N`").toBeGreaterThanOrEqual(5)
    // Canario de rangos, **antes** del recuento total: si el parser deja de
    // expandir, 82 filas vuelven a ser invisibles y el contrato pasaría en
    // vacío sobre ellas. Va primero para que el diagnóstico sea el correcto y
    // no "no hay filas", que es lo que se leería con el recuento total.
    expect(
      ROWS.filter((r) => r.fromRange).length,
      "no se expandió ninguna fila de rango (`| A1-A8 |`): el modelo volvió a ser ciego a 82 filas"
    ).toBeGreaterThanOrEqual(50)
    expect(ROWS.length, "no se encontraron filas de tabla suficientes").toBeGreaterThanOrEqual(300)
    expect(POINTERS.length, "no se encontró ningún puntero a una sección").toBeGreaterThanOrEqual(1)
    expect(ROW_POINTERS.length, "no se encontró ningún puntero a una fila").toBeGreaterThanOrEqual(1)
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

  it("ninguna sección repite el ID de una fila", () => {
    // El gemelo, por sección, de "ninguna acta repite número". El documento
    // reutiliza IDs **entre** secciones a propósito; lo que no puede es
    // repetirlos **dentro** de una, porque entonces "la fila X" de esa sección
    // es ambigua para el lector.
    expect(
      INTRA_SECTION_DUPLICATES,
      `Una sección tiene dos filas con el mismo ID: dentro de una sección "la fila X" ` +
        `tiene que ser una sola. Si necesitas dos hallazgos distintos, dales IDs distintos.`
    ).toEqual([])
  })

  it("ningún rango de filas se traga una fila listada aparte", () => {
    // `| A1-A8 |` y `| A3 | ...` en la misma sección declaran A3 dos veces: el
    // rango la esconde y el lector no sabe cuál manda.
    expect(
      INTRA_SECTION_OVERLAPS,
      `Un rango de filas solapa con una fila listada aparte en la misma sección. ` +
        `Expande el rango o saca la fila de él: no puede estar en los dos sitios.`
    ).toEqual([])
  })

  it("todo puntero a una fila apunta a una fila existente y sin ambigüedad", () => {
    const dangling = ROW_POINTERS.map((p) => ({ p, problem: pointerProblem(p) })).filter(
      (x): x is { p: RowPointer; problem: string } => x.problem !== null
    )

    expect(
      dangling.map((x) => `L${x.p.line}: ${x.p.text.slice(0, 100)}\n      → ${x.problem}`),
      `Estos punteros citan una fila que no se puede seguir. Un puntero desnudo resuelve ` +
        `solo si la fila está en su propia sección o si su ID es único en el documento; ` +
        `si el ID se reutiliza en varias secciones, di cuál: "de la ronda N" / "de la sección N".`
    ).toEqual([])
  })

  it("la reutilización de IDs entre secciones es convención, no defecto", () => {
    // Canario del modelo por sección: el documento reutiliza muchos IDs entre
    // secciones a propósito (A14 es producto en §8 y deuda en Ronda 13). Si el
    // modelo dejara de verlo, la guardia de arriba pasaría en vacío; si lo
    // tratara como global, daría 46 falsos positivos.
    expect(AMBIGUOUS.length, "desapareció la reutilización de IDs entre secciones").toBeGreaterThanOrEqual(20)
    expect(AMBIGUOUS, "el modelo dejó de ver que C12 vive en §3 y en la Ronda 6").toContain("C12")
    expect(AMBIGUOUS, "el modelo dejó de ver que A14 vive en §8 y en la Ronda 13").toContain("A14")
  })
})
