import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * Contrato del dinero del panel: **un solo productor de totales**.
 *
 * `docs/agents/panel.md` declara el invariante —"`entryTotal` es la fuente única
 * del total de una venta de mostrador; `hubEntryTotal` **delega** en él"— pero
 * hasta ahora **nada lo vigilaba**. Es exactamente el tipo de regla que se
 * rompe sola: basta que alguien necesite un total en una superficie nueva y lo
 * escriba a mano en vez de importarlo.
 *
 * La ruptura ya ocurrió una vez. El docstring de `hubEntryTotal`
 * (`src/components/panel/hub/hub-data.ts`) la registra: el cálculo estaba
 * duplicado y las dos copias **divergían en el descuento porcentual** — la del
 * hub no recortaba en 0, así que un descuento mayor al 100 % daba un total
 * **negativo** y ese número negativo entraba a las estadísticas del día. No hubo
 * error ni pantalla roja: solo dos cifras distintas del mismo día según dónde
 * mirara el restaurantero.
 *
 * Este contrato recorre los ~976 archivos de producción de `src/` y exige tres
 * cosas. Los tres fallos que previene son silenciosos:
 *
 *   1. Que la **aritmética del descuento** viva en un solo archivo. Una segunda
 *      copia puede divergir (ya pasó).
 *   2. Que `hubEntryTotal` **delegue** y no vuelva a calcular. El día que
 *      alguien "optimice" el hub inline, las cifras se separan otra vez.
 *   3. Que quien **filtra por día y suma** pase por `entryTotal` o por
 *      `counterSummary` en vez de sumar el subtotal por su cuenta.
 *
 * Los detectores se prueban contra fixtures sintéticas antes de mirar el
 * perímetro real: un detector roto devolvería cero hallazgos y el contrato
 * pasaría en vacío, que es la única forma de que un contrato sea peor que nada.
 */

const SRC = join(process.cwd(), "src")

const VENTAS_SHARED = join(SRC, "components", "panel", "ventas", "ventas-shared.ts")
const HUB_DATA = join(SRC, "components", "panel", "hub", "hub-data.ts")

/** Aritmética del descuento porcentual: `(total * e.discount.value) / 100`. */
const RE_FORMULA_DESCUENTO = /discount\.value\s*\)?\s*\/\s*100/

/** Declaración (no importación) de `entryTotal`. */
const RE_DECLARA_ENTRY_TOTAL = /function\s+entryTotal\s*\(|const\s+entryTotal\s*=/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/** Sin comentarios: una mención en un docstring no es una implementación. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

const rel = (file: string) => relative(process.cwd(), file)

/** Cuerpo de una función exportada, por conteo de llaves. */
function cuerpoDe(src: string, nombre: string): string | null {
  const m = new RegExp(`export\\s+function\\s+${nombre}\\s*\\([^)]*\\)\\s*(?::[^{]*)?\\{`).exec(src)
  if (!m) return null
  let i = m.index + m[0].length
  const inicio = i
  let profundidad = 1
  while (i < src.length && profundidad > 0) {
    const c = src[i]
    if (c === "{") profundidad += 1
    else if (c === "}") profundidad -= 1
    i += 1
  }
  return src.slice(inicio, i - 1)
}

/** Archivos que filtran ventas por día y las suman. */
function filtraPorDiaYSuma(src: string): boolean {
  const s = sinComentarios(src)
  return /\.date\.startsWith\(/.test(s) && /\.reduce\(/.test(s)
}

const ARCHIVOS = walk(SRC)

describe("detectores del contrato (probados contra fixtures antes del perímetro)", () => {
  it("reconoce la aritmética del descuento porcentual", () => {
    expect(
      RE_FORMULA_DESCUENTO.test(
        'total -= e.discount.type === "porcentaje" ? (total * e.discount.value) / 100 : e.discount.value'
      )
    ).toBe(true)
    expect(RE_FORMULA_DESCUENTO.test("const d = total * (e.discount.value / 100)")).toBe(true)
    expect(RE_FORMULA_DESCUENTO.test("const d = e.discount.value) / 100")).toBe(true)
  })

  it("no confunde un umbral ni un redondeo ajeno con la fórmula", () => {
    expect(RE_FORMULA_DESCUENTO.test("if (e.discount.value > 30) return true")).toBe(false)
    expect(RE_FORMULA_DESCUENTO.test("const cents = Math.round(precio * 100) / 100")).toBe(false)
    expect(RE_FORMULA_DESCUENTO.test("const pct = e.descuento / 100")).toBe(false)
  })

  it("ignora menciones dentro de comentarios", () => {
    const conComentario = [
      "// antes esto era: total -= (total * e.discount.value) / 100",
      "/* el hub hacía (total * e.discount.value) / 100 y no recortaba */",
      "export const nada = 1",
    ].join("\n")
    expect(RE_FORMULA_DESCUENTO.test(conComentario)).toBe(true)
    expect(RE_FORMULA_DESCUENTO.test(sinComentarios(conComentario))).toBe(false)
  })

  it("extrae el cuerpo de una función exportada", () => {
    const src = "export function hubEntryTotal(e: HubVenta): number {\n  return entryTotal(e)\n}\nexport const otro = 1"
    expect(cuerpoDe(src, "hubEntryTotal")?.trim()).toBe("return entryTotal(e)")
  })

  it("devuelve null si la función no existe, para que la aserción no pase en vacío", () => {
    expect(cuerpoDe("export const otro = 1", "hubEntryTotal")).toBeNull()
  })

  it("reconoce un filtro por día con suma", () => {
    expect(filtraPorDiaYSuma("entries.filter((e) => e.date.startsWith(day)).reduce((s, e) => s + entryTotal(e), 0)")).toBe(true)
    expect(filtraPorDiaYSuma("const total = entries.reduce((s, e) => s + entryTotal(e), 0)")).toBe(false)
    expect(filtraPorDiaYSuma("entries.filter((e) => e.date.startsWith(day))")).toBe(false)
  })
})

describe("contrato del dinero del panel: un solo productor de totales", () => {
  it("recorre el perímetro real de src/", () => {
    // Si esto falla, el resto del archivo pasaría sin revisar nada.
    expect(ARCHIVOS.length).toBeGreaterThanOrEqual(900)
  })

  it("la aritmética del descuento existe en un único archivo de producción", () => {
    const conFormula = ARCHIVOS.filter((f) => RE_FORMULA_DESCUENTO.test(sinComentarios(readFileSync(f, "utf8")))).map(rel)
    expect(conFormula).toEqual(["src/components/panel/ventas/ventas-shared.ts"])
  })

  it("entryTotal se declara una sola vez en todo src/", () => {
    const declarantes = ARCHIVOS.filter((f) => RE_DECLARA_ENTRY_TOTAL.test(readFileSync(f, "utf8"))).map(rel)
    expect(declarantes).toEqual(["src/components/panel/ventas/ventas-shared.ts"])
  })

  it("hubEntryTotal delega en entryTotal y no vuelve a calcular el total", () => {
    const cuerpo = cuerpoDe(readFileSync(HUB_DATA, "utf8"), "hubEntryTotal")
    expect(cuerpo).not.toBeNull()
    const limpio = (cuerpo ?? "").trim()
    expect(limpio).toMatch(/^return\s+entryTotal\(e\)$/)
    // Sin aritmética propia: ni multiplicación ni división en el cuerpo.
    expect(limpio).not.toMatch(/[*/]/)
    expect(limpio).not.toMatch(/discount/)
  })

  it("ventas-shared es la fuente que hub-data importa (no una copia local)", () => {
    const src = readFileSync(HUB_DATA, "utf8")
    expect(src).toMatch(/import\s*\{[^}]*\bentryTotal\b[^}]*\}\s*from\s*"@\/components\/panel\/ventas\/ventas-shared"/)
  })

  it("quien filtra por día y suma pasa por entryTotal o counterSummary", () => {
    const infractores = ARCHIVOS.filter((f) => {
      const src = sinComentarios(readFileSync(f, "utf8"))
      if (!filtraPorDiaYSuma(src)) return false
      return !/entryTotal\(|counterSummary\(/.test(src)
    }).map(rel)
    expect(infractores).toEqual([])
  })

  it("encuentra al menos un consumidor del filtro por día (el contrato no pasa en vacío)", () => {
    const filtradores = ARCHIVOS.filter((f) => filtraPorDiaYSuma(sinComentarios(readFileSync(f, "utf8")))).map(rel)
    expect(filtradores.length).toBeGreaterThanOrEqual(1)
  })

  it("counterSummary vive en ventas-shared, junto a la fuente del total", () => {
    expect(RE_DECLARA_ENTRY_TOTAL.test(readFileSync(VENTAS_SHARED, "utf8"))).toBe(true)
    expect(readFileSync(VENTAS_SHARED, "utf8")).toMatch(/export\s+function\s+counterSummary\s*\(/)
  })
})
