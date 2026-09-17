import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * Guardia estática de accesibilidad — la superficie que axe no puede ver.
 *
 * `e2e/a11y.spec.ts` corre axe sobre 8 rutas públicas. `/admin/**` y
 * `/panel/**` exigen sesión y CI no tiene credenciales, así que **ningún gate
 * miraba esa superficie**: el `✅` de axe cubría exactamente las rutas donde el
 * panel no vive. Esta guardia cubre el hueco con lo que sí se puede decidir sin
 * navegador: hechos del JSX y del CSS, leídos del árbol de sintaxis.
 *
 * POR QUÉ EL AST Y NO EXPRESIONES REGULARES
 *
 * La medición que originó esta ronda lo dejó claro. Un `<tag …>` por líneas
 * encontraba **4** de las 251 apariciones de `focus:outline-none` (los listados
 * de atributos multilínea lo rompen); el AST encontró 12. Un `imgSinAlt` por
 * líneas daba **9** porque casaba `<img` dentro de comentarios y cadenas; el AST
 * da 0. Y un detector de diálogos por texto produjo 4 falsos positivos sobre
 * componentes que sí traen `aria-labelledby`. En este repo, cualquier hecho
 * sobre atributos JSX se lee con el compilador de TypeScript o no se lee.
 *
 * QUÉ **NO** ES ESTA GUARDIA
 *
 * No es axe. No calcula contraste, ni orden de tabulación, ni si un nombre
 * accesible es *útil* — solo si existe. Su valor no está en la cobertura sino en
 * que es determinista y corre en cada `npm test`.
 *
 * LOS DETECTORES SE PRUEBAN CONTRA FIXTURES SINTÉTICAS ANTES DE MIRAR EL
 * PERÍMETRO. Es lo que separa una guardia de un `✅` vacuo: un detector roto que
 * no encuentra nada también produce cero hallazgos, y las aserciones de abajo
 * pasarían igual. Por eso cada regla tiene su positivo y su negativo sobre
 * código escrito aquí mismo, y solo después se afirma el perímetro real.
 */

const RAIZ = process.cwd()
const DIRS = [join(RAIZ, "src", "app"), join(RAIZ, "src", "components")]

/**
 * Perímetro del flujo concurrente (foodos / recompensas / auth): no se toca ni
 * se congela desde aquí, para que dos líneas de trabajo no se bloqueen entre sí.
 */
const AJENOS = [
  join("src", "app", "panel", "foodos"),
  join("src", "app", "recompensas"),
  join("src", "components", "auth"),
]

function esAjeno(archivo: string): boolean {
  const rel = relative(RAIZ, archivo)
  return AJENOS.some((a) => rel === a || rel.startsWith(a + "/"))
}

function archivosTsx(dir: string, out: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue
    const p = join(dir, entrada)
    if (statSync(p).isDirectory()) archivosTsx(p, out)
    else if (p.endsWith(".tsx")) out.push(p)
  }
  return out
}

const PERIMETRO = DIRS.flatMap((d) => archivosTsx(d))
  .filter((f) => !esAjeno(f))
  .sort()

/** Ruta relativa: los mensajes de fallo deben ser navegables. */
function rel(archivo: string): string {
  return relative(RAIZ, archivo)
}

// ---------------------------------------------------------------------------
// Lectura de atributos JSX
// ---------------------------------------------------------------------------

/**
 * Texto de un atributo JSX, aplanando lo que puede aportar cadenas: literales,
 * plantillas, `clsx(...)`/`cn(...)` con argumentos condicionales, arrays y
 * concatenaciones. Sin esto, `className={cn("p-2", activo && "bg-green-700")}`
 * se leería como cadena vacía y el detector de foco no vería nada.
 */
function textos(node: ts.Node | undefined, out: string[] = []): string[] {
  if (!node) return out
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text)
  else if (ts.isNumericLiteral(node)) out.push(node.text)
  else if (ts.isTemplateExpression(node)) {
    out.push(node.head.text)
    for (const span of node.templateSpans) textos(span.expression, out)
  } else if (ts.isJsxExpression(node)) textos(node.expression, out)
  else if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node)
  )
    textos(node.expression, out)
  else if (ts.isBinaryExpression(node)) {
    textos(node.left, out)
    textos(node.right, out)
  } else if (ts.isConditionalExpression(node)) {
    textos(node.whenTrue, out)
    textos(node.whenFalse, out)
  } else if (ts.isCallExpression(node)) {
    textos(node.expression, out)
    for (const arg of node.arguments) textos(arg, out)
  } else if (ts.isArrayLiteralExpression(node)) {
    for (const el of node.elements) textos(el, out)
  } else if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) textos(prop.initializer, out)
    }
  } else if (ts.isPropertyAccessExpression(node)) textos(node.expression, out)
  return out
}

function atributo(attrs: ts.JsxAttributes, nombre: string): ts.JsxAttribute | undefined {
  return attrs.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === nombre,
  )
}

function textoAtributo(attrs: ts.JsxAttributes, nombre: string): string | null {
  const a = atributo(attrs, nombre)
  if (!a) return null
  return textos(a.initializer).join(" ")
}

type Elemento = {
  tag: string
  attrs: ts.JsxAttributes
  linea: number
  clase: string
  /** Elementos JSX que lo contienen, del más externo al más cercano. */
  ancestros: Elemento[]
}

/**
 * Todos los elementos JSX abiertos o autocerrados del archivo, con su línea y
 * su cadena de ancestros.
 *
 * Los ancestros se necesitan porque el indicador de foco no siempre vive en el
 * elemento enfocado: en un campo de búsqueda con forma de píldora lo natural es
 * pintar el borde del contenedor (`focus-within:`), y eso también es un
 * indicador visible para WCAG 2.4.7. Sin la cadena, R1 marcaría como defecto un
 * diseño correcto.
 *
 * El recorrido respeta la estructura real del JSX (`JsxElement.children` no
 * incluye las etiquetas de apertura ni de cierre), así que la pila no se
 * desincroniza con elementos anidados dentro de `{llaves}`.
 */
function elementos(sf: ts.SourceFile): Elemento[] {
  const out: Elemento[] = []
  const pila: Elemento[] = []

  const crear = (n: ts.JsxOpeningElement | ts.JsxSelfClosingElement): Elemento => ({
    tag: n.tagName.getText(),
    attrs: n.attributes,
    linea: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
    clase: textoAtributo(n.attributes, "className") ?? "",
    ancestros: [...pila],
  })

  const visitar = (n: ts.Node) => {
    if (ts.isJsxElement(n)) {
      const e = crear(n.openingElement)
      out.push(e)
      pila.push(e)
      for (const hijo of n.children) visitar(hijo)
      pila.pop()
      return
    }
    if (ts.isJsxSelfClosingElement(n)) {
      out.push(crear(n))
      return
    }
    if (ts.isJsxFragment(n)) {
      for (const hijo of n.children) visitar(hijo)
      return
    }
    ts.forEachChild(n, visitar)
  }

  visitar(sf)
  return out
}

// ---------------------------------------------------------------------------
// Reglas R1–R4 y R6: hechos por elemento o por archivo
// ---------------------------------------------------------------------------

/** Un `outline-none` de foco solo es legítimo si algo lo reemplaza. */
const OUTLINE_NONE = /(?:^|\s)focus(?:-visible)?:outline-none(?:\s|$)/
const INDICADOR_FOCO =
  /focus:ring-|focus-visible:ring-|focus-visible:outline-(?!none)|focus:(?:border|bg|text|shadow|underline)-/

/**
 * Un contenedor que reacciona al foco de sus hijos también es un indicador
 * visible. Solo cuentan las señales que se ven: un anillo o un cambio de borde
 * o de contorno. `focus-within:outline-none` no cuenta (quita, no pone).
 */
const INDICADOR_CONTENEDOR = /focus-within:(?:ring-|border-|outline-(?!none))/

/** R1 — `focus:outline-none` sin indicador de reemplazo (WCAG 2.4.7 AA). */
function focoSinIndicador(sf: ts.SourceFile): Elemento[] {
  return elementos(sf).filter(
    (e) =>
      OUTLINE_NONE.test(e.clase) &&
      !INDICADOR_FOCO.test(e.clase) &&
      !e.ancestros.some((a) => INDICADOR_CONTENEDOR.test(a.clase)),
  )
}

/** R2 — `role="dialog"` o `<dialog>` sin nombre accesible. */
function dialogosSinNombre(sf: ts.SourceFile): Elemento[] {
  return elementos(sf).filter((e) => {
    const esDialogo = e.tag === "dialog" || textoAtributo(e.attrs, "role") === "dialog"
    if (!esDialogo) return false
    return (
      textoAtributo(e.attrs, "aria-label") === null &&
      textoAtributo(e.attrs, "aria-labelledby") === null &&
      textoAtributo(e.attrs, "title") === null
    )
  })
}

/** R3 — `<img>` sin `alt` (WCAG 1.1.1 A). */
function imgsSinAlt(sf: ts.SourceFile): Elemento[] {
  return elementos(sf).filter((e) => e.tag === "img" && textoAtributo(e.attrs, "alt") === null)
}

/** R4 — `tabIndex` positivo: rompe el orden de tabulación del documento. */
function tabIndexPositivo(sf: ts.SourceFile): Elemento[] {
  return elementos(sf).filter((e) => {
    const t = textoAtributo(e.attrs, "tabIndex")
    return t !== null && /^[1-9]/.test(t.trim())
  })
}

/**
 * R6 — un archivo que anima con framer-motion respeta la preferencia del
 * sistema. `reducedMotion="user"` no apaga las animaciones: desactiva las de
 * transformación y layout, que son las que producen mareo. Es la forma que ya
 * usa `recompensas/page.tsx`, y framer-motion no la hereda por defecto.
 */
function motionSinPreferencia(sf: ts.SourceFile): boolean {
  const importa = sf.statements.some(
    (s) =>
      ts.isImportDeclaration(s) &&
      ts.isStringLiteral(s.moduleSpecifier) &&
      s.moduleSpecifier.text === "framer-motion",
  )
  if (!importa) return false
  return !elementos(sf).some(
    (e) =>
      e.tag === "MotionConfig" &&
      (textoAtributo(e.attrs, "reducedMotion") ?? "").replace(/["']/g, "") === "user",
  )
}

// ---------------------------------------------------------------------------
// Regla R5: el contrato de movimiento reducido de globals.css
// ---------------------------------------------------------------------------

const GLOBALS = join(RAIZ, "src", "app", "globals.css")
const CSS = readFileSync(GLOBALS, "utf8")

/**
 * Extrae el bloque `@media (prefers-reduced-motion: reduce)` por conteo de
 * llaves. El contrato es una lista escrita a mano, así que lo que importa es su
 * contenido real, no que exista la cabecera.
 */
function bloqueReducido(css: string): string {
  const marca = "@media (prefers-reduced-motion: reduce)"
  const inicio = css.indexOf(marca)
  if (inicio === -1) return ""
  const desde = css.indexOf("{", inicio)
  if (desde === -1) return ""
  let prof = 0
  for (let i = desde; i < css.length; i++) {
    const c = css[i]
    if (c === "{") prof++
    else if (c === "}") {
      prof--
      if (prof === 0) return css.slice(desde, i + 1)
    }
  }
  return css.slice(desde)
}

const BLOQUE = bloqueReducido(CSS)

/**
 * `animate-none` es la utilidad que *quita* animación: no necesita cobertura.
 * Las utilidades con nombre (`animate-pulse`) sí: Tailwind las declara con
 * `animation: … infinite`, y sin entrada en el bloque siguen latiendo con
 * `prefers-reduced-motion: reduce`. Los valores arbitrarios
 * (`animate-[fadeUp_0.15s_ease-out]`) no tienen clase previsible, así que los
 * cubre el selector de atributo, no una entrada por nombre.
 */
const CATCH_ALL_ARBITRARIO = '[class*="animate-["]'

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function claseCubierta(token: string): boolean {
  if (token === "animate-none") return true
  if (token.includes("[")) return BLOQUE.includes(CATCH_ALL_ARBITRARIO)
  return new RegExp(`\\.${escapeRe(token)}(?![\\w-])`).test(BLOQUE)
}

/**
 * Tokens `animate-*` realmente aplicados en el perímetro.
 *
 * Se leen **solo** de atributos `className`, y se verificó que en el perímetro
 * actual no existe ninguna aparición de `animate-` fuera de uno: la única forma
 * de perder una sería construir el nombre en una constante aparte y pasarla por
 * identificador, cosa que hoy no ocurre.
 */
function tokensAnimate(): Map<string, string[]> {
  const usos = new Map<string, string[]>()
  for (const archivo of PERIMETRO) {
    const sf = ts.createSourceFile(
      archivo,
      readFileSync(archivo, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    for (const e of elementos(sf)) {
      for (const m of e.clase.matchAll(/(?:^|\s)(animate-[^\s"']+)/g)) {
        const token = m[1]
        if (!token) continue
        const previos = usos.get(token) ?? []
        previos.push(`${rel(archivo)}:${e.linea}`)
        usos.set(token, previos)
      }
    }
  }
  return usos
}

// ---------------------------------------------------------------------------
// Autopruebas de los detectores
// ---------------------------------------------------------------------------

function analizar(fuente: string) {
  const sf = ts.createSourceFile(
    "fixture.tsx",
    fuente,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  return {
    foco: focoSinIndicador(sf).map((e) => e.linea),
    dialogos: dialogosSinNombre(sf).map((e) => e.linea),
    imgs: imgsSinAlt(sf).map((e) => e.linea),
    tabindex: tabIndexPositivo(sf).map((e) => e.linea),
    motion: motionSinPreferencia(sf),
  }
}

describe("detectores — se prueban antes de mirar el perímetro", () => {
  it("R1 encuentra el outline eliminado sin reemplazo", () => {
    expect(analizar(`<button className="focus:outline-none">x</button>`).foco).toEqual([1])
    // Multilínea: es justo lo que rompía la lectura por líneas.
    const multilinea = `<button\n  className="px-2\n    focus:outline-none\n    rounded"\n>\nx\n</button>`
    expect(analizar(multilinea).foco).toEqual([1])
  })

  it("R1 no marca lo que sí reemplaza el indicador", () => {
    expect(
      analizar(`<button className="focus:outline-none focus-visible:ring-2">x</button>`).foco,
    ).toEqual([])
    expect(
      analizar(`<input className="focus:outline-none focus:border-blue-500" />`).foco,
    ).toEqual([])
    expect(
      analizar(`<a className="focus-visible:outline-none focus-visible:outline-2" />`).foco,
    ).toEqual([])
  })

  it("R1 ve la clase cuando vive dentro de un cn(...) condicional", () => {
    expect(
      analizar(`<div className={cn("p-2", activo && "focus:outline-none")} />`).foco,
    ).toEqual([1])
  })

  it("R1 no confunde una clase distinta que contiene la subcadena", () => {
    expect(analizar(`<div className="focus:outline-hidden" />`).foco).toEqual([])
  })

  it("R1 acepta el indicador que pinta el contenedor con focus-within", () => {
    expect(
      analizar(
        `<div className="focus-within:ring-2 focus-within:ring-brand-500">\n<input className="focus:outline-none" />\n</div>`,
      ).foco,
    ).toEqual([])
    expect(
      analizar(
        `<div className="focus-within:border-[#0E7A0E]">\n<input className="focus:outline-none" />\n</div>`,
      ).foco,
    ).toEqual([])
  })

  it("R1 no acepta un contenedor que solo quita el contorno", () => {
    // Un `focus-within:outline-none` no pinta nada: el campo sigue sin indicador.
    expect(
      analizar(
        `<div className="focus-within:outline-none">\n<input className="focus:outline-none" />\n</div>`,
      ).foco,
    ).toEqual([2])
  })

  it("R1 no hereda el indicador de un contenedor hermano ya cerrado", () => {
    // Si la pila no se vaciara, este segundo campo quedaría exento por error.
    const fuente = `<div className="focus-within:ring-2">\n<input className="focus:outline-none" />\n</div>\n<input className="focus:outline-none" />`
    expect(analizar(fuente).foco).toEqual([4])
  })

  it("R1 sí ve el contenedor cuando el campo está dentro de una expresión", () => {
    const fuente = `<div className="focus-within:ring-2">\n{activo && <input className="focus:outline-none" />}\n</div>`
    expect(analizar(fuente).foco).toEqual([])
  })

  it("R2 encuentra el diálogo sin nombre y respeta las tres formas de nombrarlo", () => {
    expect(analizar(`<div role="dialog" />`).dialogos).toEqual([1])
    expect(analizar(`<dialog open />`).dialogos).toEqual([1])
    expect(analizar(`<div role="dialog" aria-label="Ajustes" />`).dialogos).toEqual([])
    expect(analizar(`<div role="dialog" aria-labelledby="titulo" />`).dialogos).toEqual([])
    expect(analizar(`<dialog title="Ajustes" />`).dialogos).toEqual([])
    // `role` no literal (condicional) no debe declararse diálogo por accidente.
    expect(analizar(`<div role={rol} />`).dialogos).toEqual([])
  })

  it("R3 encuentra el img sin alt y acepta alt vacío decorativo", () => {
    const src = "https://cdn.resurte.mx/zapato.png"
    expect(analizar(`<img src="${src}" />`).imgs).toEqual([1])
    expect(analizar(`<img src="${src}" alt="Zapato" />`).imgs).toEqual([])
    expect(analizar(`<img src="${src}" alt="" />`).imgs).toEqual([])
  })

  it("R4 encuentra el tabIndex positivo y acepta 0 y -1", () => {
    expect(analizar(`<div tabIndex={2} />`).tabindex).toEqual([1])
    expect(analizar(`<div tabIndex="3" />`).tabindex).toEqual([1])
    expect(analizar(`<div tabIndex={0} />`).tabindex).toEqual([])
    expect(analizar(`<div tabIndex={-1} />`).tabindex).toEqual([])
  })

  it("R6 exige reducedMotion=user solo a quien anima con framer-motion", () => {
    const sin = `import { motion } from "framer-motion"\nexport const A = () => <motion.div />`
    expect(analizar(sin).motion).toBe(true)

    const con = `import { motion, MotionConfig } from "framer-motion"\nexport const A = () => <MotionConfig reducedMotion="user"><motion.div /></MotionConfig>`
    expect(analizar(con).motion).toBe(false)

    const ajeno = `import { useState } from "react"\nexport const A = () => <div />`
    expect(analizar(ajeno).motion).toBe(false)

    // El nombre en un comentario no cuenta: la regla lee el atributo, no el texto.
    const comentado = `import { motion } from "framer-motion"\n// reducedMotion="user"\nexport const A = () => <motion.div />`
    expect(analizar(comentado).motion).toBe(true)
  })

  it("R5 reconoce cobertura por nombre y por selector arbitrario", () => {
    // El bloque real de globals.css debe seguir cubriendo lo que ya cubría:
    // si el extractor se rompiera, todo pasaría y la guardia sería decorativa.
    expect(BLOQUE).not.toBe("")
    expect(BLOQUE).toContain(".animate-spin")
    expect(BLOQUE).toContain(".animate-fade-up")
    expect(claseCubierta("animate-spin")).toBe(true)
    expect(claseCubierta("animate-none")).toBe(true)
    expect(claseCubierta("animate-[fadeUp_0.15s_ease-out]")).toBe(BLOQUE.includes(CATCH_ALL_ARBITRARIO))
    // Un token que no está en el bloque no puede darse por cubierto.
    expect(claseCubierta("animate-inventado-xyz")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Perímetro real — tolerancia cero
// ---------------------------------------------------------------------------

function leerConAst(archivo: string): ts.SourceFile {
  return ts.createSourceFile(
    archivo,
    readFileSync(archivo, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
}

function hallazgos(fn: (sf: ts.SourceFile) => Elemento[]): string[] {
  const out: string[] = []
  for (const archivo of PERIMETRO) {
    for (const e of fn(leerConAst(archivo))) out.push(`${rel(archivo)}:${e.linea} <${e.tag}>`)
  }
  return out
}

describe("perímetro — accesibilidad estática", () => {
  it("R1: ningún control pierde su indicador de foco", () => {
    expect(hallazgos(focoSinIndicador)).toEqual([])
  })

  it("R2: todo diálogo tiene nombre accesible", () => {
    expect(hallazgos(dialogosSinNombre)).toEqual([])
  })

  it("R3: ningún img sin alt", () => {
    expect(hallazgos(imgsSinAlt)).toEqual([])
  })

  it("R4: ningún tabIndex positivo", () => {
    expect(hallazgos(tabIndexPositivo)).toEqual([])
  })

  it("R5: toda animación usada está en el bloque de movimiento reducido", () => {
    const sinCubrir: string[] = []
    for (const [token, usos] of tokensAnimate()) {
      if (!claseCubierta(token)) sinCubrir.push(`${token} (${usos.length} usos, p.ej. ${usos[0]})`)
    }
    expect(sinCubrir).toEqual([])
  })

  it("R6: quien anima con framer-motion respeta la preferencia del sistema", () => {
    const sinPreferencia = PERIMETRO.filter((f) => motionSinPreferencia(leerConAst(f)))
    expect(sinPreferencia.map(rel)).toEqual([])
  })

  it("el perímetro es el esperado (si esto cambia, las reglas de arriba cambian de significado)", () => {
    // Falla si el recorrido deja de encontrar archivos: sin esto, un `readdir`
    // roto haría pasar las cinco reglas anteriores con cero archivos leídos.
    expect(PERIMETRO.length).toBeGreaterThan(380)
    expect(PERIMETRO.some((f) => rel(f).startsWith("src/app/admin/"))).toBe(true)
    expect(PERIMETRO.some((f) => rel(f).startsWith("src/components/"))).toBe(true)
    // Los tres perímetros ajenos se comprueban igual que `esAjeno`, con
    // prefijo y no con subcadena: `src/components/panel/foodos/*` sí entra.
    expect(PERIMETRO.some((f) => rel(f).startsWith("src/app/panel/foodos"))).toBe(false)
    expect(PERIMETRO.some((f) => rel(f).startsWith("src/app/recompensas"))).toBe(false)
    expect(PERIMETRO.some((f) => rel(f).startsWith("src/components/auth"))).toBe(false)
    expect(PERIMETRO.some((f) => rel(f).startsWith("src/components/panel/foodos"))).toBe(true)
  })
})
