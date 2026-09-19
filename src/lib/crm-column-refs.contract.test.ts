import { readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"
import { CRM_PROSPECT_COLUMN_SETS } from "@/lib/crm-core"

/**
 * Contrato de las **listas de columnas** de `crm_prospects`: de dónde salen los
 * nombres, y qué no puede inventarse en runtime.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * El hallazgo (`CRM4` de la auditoría)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * El inventario que descubrió `H3` —«`employees`, `instagram`,
 * `weekly_volume_min/max`: ninguna UI las escribía, pero el prompt del agente las
 * declaraba»— se hizo **grepeando identificadores**. Eso funciona mientras los
 * nombres de columna estén escritos: una referencia **construida en runtime** no
 * aparece en el grep, y el inventario la daría por inexistente. La auditoría lo
 * dejó abierto porque un inventario por grep no se puede volver falsable sin más.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Por qué sí se puede, y qué se declara aquí
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La salida no es prometer que nadie construya una lista en runtime: es que los
 * nombres **vivan en un solo lugar**. `CRM_PROSPECT_COLUMN_SETS` es el
 * vocabulario cerrado —la escalera de degradación de `crm-core.ts`— y toda lista
 * que llega a un `.select()` de `crm_prospects` sale de ahí: sea el literal de un
 * `select` puntual, sea `CRM_PROSPECT_COLUMNS`, sea un escalón pasado por
 * `withCityJoin`. Con los nombres en un arreglo, «construido en runtime» deja de
 * ser un agujero y pasa a ser una **propiedad verificable**: lo construido solo
 * puede nombrar lo que está en el arreglo.
 *
 * Queda **un** sitio que sí construye la lista a mano, y es deliberado:
 * `readLeadRow` en `src/app/admin/actions.ts` pega el join de `leads(...)` y,
 * cuando `00140` no está aplicada, reintenta sin `tags`. Este contrato lo
 * declara —no lo prohíbe— y vigila las dos formas de que deje de estar acotado:
 * que aparezca un **tercer** selector dinámico, o que alguno se alimente de algo
 * que no sea el vocabulario.
 *
 * Lo que NO prohíbe: `select("*")` (no nombra columnas) ni los `payload` de
 * `update`/`insert`, cuyas **claves** sí son identificadores y el grep de `H3` sí
 * ve.
 *
 * Cómo romperlo:
 *
 *   1. Añadir un `.select(<identificador>)` sobre `crm_prospects` en otro
 *      archivo: es el tercer selector dinámico que la cuenta de abajo caza.
 *   2. Alimentar `buildQuery` con algo que no sea un escalón (`"id, " + x`, un
 *      literal suelto con una columna inventada).
 *   3. Cambiar el `readLeadRow` por una plantilla que pegue algo que no esté en
 *      el vocabulario.
 *   4. Quitar de este archivo la declaración del sesgo del inventario.
 */

const REPO = process.cwd()
const SRC_DIR = join(REPO, "src")

/** El vocabulario cerrado: la unión de todos los escalones de la migración. */
const VOCAB = new Set<string>(CRM_PROSPECT_COLUMN_SETS.flat())

/** Los joins permitidos dentro de un `select`: nombran **otra** tabla, no ésta. */
const JOINS = new Set(["cities", "leads"])

/** Sitios que construyen la lista a mano, con su razón. */
const DYNAMIC_SELECTORS = ["src/app/admin/actions.ts", "src/lib/crm-prospects.ts"]

/**
 * Las constantes del vocabulario ya hechas cadena.
 *
 * Un `.select(CRM_PROSPECT_COLUMNS)` es un identificador, pero **no** es un
 * selector dinámico: nombra una constante que sale de `CRM_PROSPECT_COLUMN_SETS`.
 * La distinción importa: lo dinámico es lo que puede construirse con nombres que
 * no están en el vocabulario.
 */
const COLUMN_CONSTANTS = new Set(["CRM_PROSPECT_COLUMNS", "CRM_PROSPECT_COLUMNS_WITHOUT_TAGS"])

function productionSources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...productionSources(full))
    else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name) &&
      !/-fixtures\.ts$/.test(entry.name)
    ) {
      out.push(relative(REPO, full).split(sep).join("/"))
    }
  }
  return out
}

const SOURCES = productionSources(SRC_DIR).map((rel) => ({
  rel,
  text: readFileSync(join(REPO, rel), "utf8"),
}))

/**
 * Corta por comas de primer nivel, respetando `()`, `[]`, `{}` y comillas.
 *
 * Sirve para dos cosas: separar los argumentos de un `.select("…", { … })` —donde
 * la lista de columnas es **solo el primero**, y el segundo lleva sus propias
 * comas— y partir la lista en nombres de columna.
 */
function splitTopLevel(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote: string | null = null
  let current = ""
  for (const char of list) {
    if (quote) {
      current += char
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char
      current += char
      continue
    }
    if ("([{".includes(char)) depth += 1
    if (")]}".includes(char)) depth -= 1
    if (char === "," && depth === 0) {
      out.push(current.trim())
      current = ""
      continue
    }
    current += char
  }
  if (current.trim()) out.push(current.trim())
  return out.filter(Boolean)
}

/** Un token es legítimo si es `*`, una columna del vocabulario o un join declarado. */
function isDeclaredToken(token: string): boolean {
  if (token === "*") return true
  if (VOCAB.has(token)) return true
  const head = token.slice(0, token.indexOf("(")).trim()
  return token.includes("(") && JOINS.has(head)
}

/** El **primer** argumento de cada `.select(...)` sobre `crm_prospects`. */
function selectArguments(text: string): { line: number; arg: string }[] {
  const re = /\.from\("crm_prospects"\)\s*\.\s*select\s*\(/g
  const out: { line: number; arg: string }[] = []
  for (const match of text.matchAll(re)) {
    const start = (match.index ?? 0) + match[0].length
    let depth = 1
    let end = start
    let quote: string | null = null
    while (end < text.length && depth > 0) {
      const char = text[end]
      if (quote) {
        if (char === quote) quote = null
      } else if (char === '"' || char === "'" || char === "`") quote = char
      else if (char === "(") depth += 1
      else if (char === ")") depth -= 1
      end += 1
    }
    out.push({
      line: text.slice(0, match.index).split("\n").length,
      arg: splitTopLevel(text.slice(start, end - 1))[0] ?? "",
    })
  }
  return out
}

/** El primer argumento de cada llamada a `name`, sin contar su declaración. */
function callArgumentLists(text: string, name: string): string[][] {
  const re = new RegExp(`\\b${name}\\s*\\(`, "g")
  const out: string[][] = []
  for (const match of text.matchAll(re)) {
    const at = match.index ?? 0
    if (/\bfunction\s*$/.test(text.slice(Math.max(0, at - 9), at))) continue
    const start = at + match[0].length
    let depth = 1
    let end = start
    let quote: string | null = null
    while (end < text.length && depth > 0) {
      const char = text[end]
      if (quote) {
        if (char === quote) quote = null
      } else if (char === '"' || char === "'" || char === "`") quote = char
      else if (char === "(") depth += 1
      else if (char === ")") depth -= 1
      end += 1
    }
    out.push(splitTopLevel(text.slice(start, end - 1)))
  }
  return out
}

/**
 * Resuelve una expresión hasta la lista de columnas que produce.
 *
 * Cubre las tres formas que existen hoy: un literal, una plantilla cuyos huecos
 * se resuelven a literales, y un identificador que se busca como `const` en el
 * mismo archivo. `withCityJoin(<escalón>)` se resuelve al escalón más completo,
 * porque todos los escalones son subconjuntos suyos.
 *
 * Devuelve `null` cuando no puede resolver: eso **no** es un fallo del contrato,
 * es un hueco que la prueba de cobertura convierte en rojo.
 */
function resolveList(expr: string, source: string, seen: Set<string> = new Set()): string | null {
  const trimmed = expr.trim()

  if (/^["']/.test(trimmed)) {
    const body = trimmed.slice(1, trimmed.lastIndexOf(trimmed.charAt(0)))
    return body.includes("${") ? null : body
  }

  if (trimmed.startsWith("`")) {
    const body = trimmed.slice(1, trimmed.lastIndexOf("`"))
    let resolved = ""
    let cursor = 0
    for (const hole of body.matchAll(/\$\{([^}]*)\}/g)) {
      resolved += body.slice(cursor, hole.index)
      const inner = resolveList(hole[1] ?? "", source, seen)
      if (inner === null) return null
      resolved += inner
      cursor = (hole.index ?? 0) + hole[0].length
    }
    return resolved + body.slice(cursor)
  }

  const join = /^withCityJoin\(([^)]*)\)$/.exec(trimmed)
  if (join) {
    const argument = (join[1] ?? "").trim()
    if (argument === "set" && !source.includes("for (const set of CRM_PROSPECT_COLUMN_SETS)")) {
      return null
    }
    const widest = CRM_PROSPECT_COLUMN_SETS[0] ?? []
    return `${widest.join(", ")}, cities(name)`
  }

  if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
    if (seen.has(trimmed)) return null
    seen.add(trimmed)
    // `const leadColumns = "…"` o `const columns = withCityJoin(set)`: el lado
    // derecho se resuelve igual, sea literal o llamada.
    const declaration = new RegExp(`const ${trimmed}\\s*=\\s*([^\\n;]+)`).exec(source)
    const fromDeclaration = declaration
      ? resolveList((declaration[1] ?? "").trim(), source, seen)
      : null
    if (fromDeclaration !== null) return fromDeclaration
    // Parámetro de una flecha local (`readLeadRow`): se resuelve por sus llamadas,
    // que es donde vive la lista. La resolución **no** entiende de ámbitos —una
    // `const` con el mismo nombre en otra función ganaría—, y por eso el contrato
    // exige además que el único sitio que la alimente sea el declarado.
    const arrow = new RegExp(
      `const ([\\w$]+)\\s*=\\s*\\(\\s*${trimmed}\\s*:\\s*string\\s*\\)\\s*=>`,
    ).exec(source)
    if (!arrow) return null
    const calls = callArgumentLists(source, arrow[1] ?? "")
    if (calls.length === 0) return null
    const lists = calls.map((args) => resolveList(args[0] ?? "", source, new Set(seen)))
    if (lists.some((list) => list === null)) return null
    return lists.join(", ")
  }

  return null
}

describe("el vocabulario de columnas es cerrado", () => {
  it("la unión de los escalones no está vacía y no nombra basura", () => {
    expect(VOCAB.size).toBeGreaterThan(20)
    for (const name of VOCAB) expect(name).toMatch(/^[a-z_][a-z0-9_]*$/)
  })

  it("los joins declarados son de otra tabla, no de crm_prospects", () => {
    for (const join of JOINS) expect(VOCAB.has(join)).toBe(false)
  })
})

describe("toda lista de columnas sale del vocabulario", () => {
  const literals = SOURCES.flatMap(({ rel, text }) =>
    selectArguments(text)
      .filter(({ arg }) => /^["']/.test(arg))
      .map(({ line, arg }) => ({ rel, line, arg: arg.slice(1, arg.lastIndexOf(arg.charAt(0))) })),
  )

  it("hay listas literales que revisar (el contrato no está vacío)", () => {
    expect(literals.length).toBeGreaterThan(5)
  })

  it("cada token de cada lista literal está en el vocabulario o es un join declarado", () => {
    const offenders = literals.flatMap(({ rel, line, arg }) =>
      splitTopLevel(arg)
        .filter((token) => !isDeclaredToken(token))
        .map((token) => `${rel}:${line} nombra "${token}"`),
    )
    expect(offenders, "una lista de columnas nombra algo fuera del vocabulario").toEqual([])
  })
})

describe("los selectores dinámicos son dos, y están declarados", () => {
  const dynamic = SOURCES.flatMap(({ rel, text }) =>
    selectArguments(text)
      .filter(
        ({ arg }) => /^[A-Za-z_$][\w$]*$/.test(arg) && !COLUMN_CONSTANTS.has(arg),
      )
      .map(({ line, arg }) => ({ rel, line, arg })),
  )

  it("son exactamente dos, ambos con el parámetro `columns`", () => {
    expect(dynamic.map(({ rel, arg }) => `${rel} → ${arg}`).sort()).toEqual([
      "src/app/admin/actions.ts → columns",
      "src/lib/crm-prospects.ts → columns",
    ])
  })

  it("viven en los archivos declarados", () => {
    expect([...new Set(dynamic.map(({ rel }) => rel))].sort()).toEqual(DYNAMIC_SELECTORS)
  })

  it("el escalón que alimenta buildQuery es un miembro del vocabulario", () => {
    const source = SOURCES.find(({ rel }) => rel === "src/lib/crm-prospects.ts")?.text ?? ""
    const calls = callArgumentLists(source, "buildQuery")
    expect(calls.length, "buildQuery debe tener una sola llamada").toBe(1)
    // `buildQuery(supabase, columns, raw)`: el segundo argumento es la lista.
    expect(calls[0]?.[1]).toBe("columns")
    // …y esa `columns` es un escalón de la escalera, no algo construido a mano.
    expect(source).toContain("const columns = withCityJoin(set)")
    expect(source).toContain("for (const set of CRM_PROSPECT_COLUMN_SETS)")
    expect(resolveList("columns", source)).not.toBeNull()
  })

  it("el readLeadRow construye con el join declarado y el sufijo de tags", () => {
    const source = SOURCES.find(({ rel }) => rel === "src/app/admin/actions.ts")?.text ?? ""
    const base = /const leadColumns\s*=\s*"([^"]+)"/.exec(source)
    expect(base, "readLeadRow perdió su base literal").not.toBeNull()
    for (const token of splitTopLevel(base?.[1] ?? "")) {
      // `leads(...)` es de otra tabla; el resto son columnas de crm_prospects.
      if (!token.includes("(")) expect(VOCAB.has(token)).toBe(true)
    }
    expect(source).toContain("`${leadColumns}, tags`")
  })

  it("cada selector dinámico se resuelve a una lista del vocabulario", () => {
    for (const { rel, arg } of dynamic) {
      const source = SOURCES.find(({ rel: r }) => r === rel)?.text ?? ""
      const list = resolveList(arg, source)
      expect(list, `${rel}: no se pudo resolver .select(${arg})`).not.toBeNull()
      const offenders = splitTopLevel(list ?? "").filter((token) => !isDeclaredToken(token))
      expect(offenders, `${rel}: .select(${arg}) nombra algo fuera del vocabulario`).toEqual([])
    }
  })
})

describe("el sesgo del inventario está declarado", () => {
  it("este contrato declara que el inventario de H3 salió de grep", () => {
    const self = readFileSync(
      join(REPO, "src/lib/crm-column-refs.contract.test.ts"),
      "utf8",
    )
    // Solo cuenta el bloque de comentario de cabecera: si la declaración viviera
    // únicamente en la aserción, la aserción se estaría validando a sí misma.
    const start = self.indexOf("/**")
    const header = self
      .slice(start, self.indexOf("*/", start))
      .split("\n")
      .map((line) => line.replace(/^\s*\*+\s?/, ""))
      .join(" ")
      .replace(/\s+/g, " ")
    expect(header).toContain("se hizo **grepeando identificadores**")
    expect(header).toContain("una referencia **construida en runtime** no")
    expect(header).toContain("los nombres **vivan en un solo lugar**")
  })
})
