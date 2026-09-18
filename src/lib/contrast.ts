import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"

/**
 * Andamiaje compartido de los contratos de contraste (A16 en `/admin`, A1 en
 * `/panel`).
 *
 * Vivía dentro de `admin-contrast.contract.test.ts`. Al escribir el contrato de
 * `/panel` hacía falta exactamente la misma maquinaria — la matemática de color,
 * el recorrido del AST y la medición por pares — y copiarla habría dejado dos
 * fuentes de verdad de la misma matemática: un cambio en el umbral o en la
 * matriz OKLab tendría que hacerse dos veces, y el día que solo se hiciera en una
 * los dos contratos medirían cosas distintas sin que nada lo dijera.
 *
 * Tres decisiones que se conservan del original:
 *
 * 1. **La paleta no se hardcodea.** Se deriva de `node_modules/tailwindcss/
 *    theme.css` (los tokens de Tailwind v4 son OKLCH, no hex) y de
 *    `src/app/globals.css` (la paleta propia: `brand-*`, `cream-*`, `warm-*`,
 *    `cs-green-*`). Cambiar un color del tema mueve las ratios de los contratos
 *    sin tocar los contratos.
 *
 * 2. **El par se mide, no se adivina.** El color de texto y el de fondo se
 *    emparejan dentro del **mismo `className`** y del **mismo ámbito de
 *    variante** (`hover:` con `hover:`, base con base), no por posición ni
 *    cruzando un token contra todas las superficies del tema. Cruzarlos produce
 *    pares imposibles (`text-gray-300` "sobre" `gray-300` = 1.00:1, cuando ese
 *    texto nunca se pinta ahí) y ahogaría la señal real en ruido.
 *
 * 3. **Las ramas de un ternario son alternativas, no una unión.** Un
 *    `className={a ? "text-white bg-gray-900" : "text-gray-400 bg-white"}` no se
 *    puede medir como un solo conjunto: `text-white` y `bg-white` nunca
 *    coexisten. `alternativas()` enumera las ramas y cada una se mide aparte.
 *
 * Este módulo no es un test: solo expone funciones puras sobre rutas de archivo.
 * Cada contrato decide su perímetro, sus umbrales y sus listas de prohibidos.
 */

const RAIZ = process.cwd()

export type RGB = readonly [number, number, number]

/** OKLCH → sRGB: matriz OKLab de Björn Ottosson, gamma sRGB y recorte a [0,1]. */
export function oklchARgb(L: number, C: number, h: number): RGB {
  const hr = (h * Math.PI) / 180
  const a = C * Math.cos(hr)
  const b = C * Math.sin(hr)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lineal: [number, number, number] = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const gamma = (x: number): number => {
    const c = Math.min(1, Math.max(0, x))
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  }
  const r = Math.round(gamma(lineal[0]) * 255)
  const g = Math.round(gamma(lineal[1]) * 255)
  const bl = Math.round(gamma(lineal[2]) * 255)
  return [r, g, bl]
}

export function desdeHex(hex: string): RGB {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

/** Luminancia relativa WCAG 2.x. */
export function luminancia([r, g, b]: RGB): number {
  const canal = (x: number): number => {
    const v = x / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

export function razon(a: RGB, b: RGB): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Composición alfa sobre un fondo opaco (sRGB, sin espacio lineal). */
export function componer(fg: RGB, bg: RGB, alfa: number): RGB {
  return [
    Math.round(fg[0] * alfa + bg[0] * (1 - alfa)),
    Math.round(fg[1] * alfa + bg[1] * (1 - alfa)),
    Math.round(fg[2] * alfa + bg[2] * (1 - alfa)),
  ]
}

export const BLANCO: RGB = [255, 255, 255]

/**
 * Paleta medida. Se construye leyendo las dos fuentes de verdad del proyecto en
 * vez de copiar valores: `theme.css` trae los tokens de Tailwind v4 en OKLCH y
 * `globals.css` la paleta propia en hex.
 */
export const PALETA = new Map<string, RGB>()

function grupo(m: RegExpMatchArray, i: number): string {
  const v = m[i]
  if (v === undefined) throw new Error(`grupo ${i} ausente en ${m[0]}`)
  return v
}

const themeCss = readFileSync(join(RAIZ, "node_modules", "tailwindcss", "theme.css"), "utf8")
const globalsCss = readFileSync(join(RAIZ, "src", "app", "globals.css"), "utf8")

/**
 * Tailwind escribe la croma y el tono de las familias acromáticas como `none`
 * (`--color-neutral-400: oklch(70.8% 0 none)`), no como número. El patrón exigía
 * dígitos, así que **la familia `neutral` entera quedaba fuera de `PALETA`** y
 * `rgbDeToken` devolvía `null`: 13 pares de `wallet-card-view.tsx` se descartaban
 * en silencio. `none` es croma 0 / tono indiferente.
 */
const numeroOklch = (v: string): number => (v === "none" ? 0 : Number(v))

for (const m of themeCss.matchAll(
  /--color-([a-z-]+?)-(\d{2,3}):\s*oklch\(([\d.]+)%\s+([\d.]+|none)\s+([\d.]+|none)\)/g,
)) {
  PALETA.set(
    `${grupo(m, 1)}-${grupo(m, 2)}`,
    oklchARgb(Number(grupo(m, 3)) / 100, numeroOklch(grupo(m, 4)), numeroOklch(grupo(m, 5))),
  )
}
for (const m of globalsCss.matchAll(/--color-([a-z-]+?)-(\d{2,3}):\s*(#[0-9a-fA-F]{6})/g)) {
  PALETA.set(`${grupo(m, 1)}-${grupo(m, 2)}`, desdeHex(grupo(m, 3)))
}
PALETA.set("white", BLANCO)
PALETA.set("black", [0, 0, 0])

export const FAMILIAS =
  "cs-green|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone|brand|cream|warm"

export const RE_TEXTO = new RegExp(`^text-(${FAMILIAS})-(\\d{2,3})(?:/(\\d+))?$`)
export const RE_FONDO = new RegExp(`^bg-(${FAMILIAS})-(\\d{2,3})(?:/(\\d+))?$`)
export const RE_FONDO_HEX = /^bg-\[(#[0-9a-fA-F]{3,8})\](?:\/(\d+))?$/
/**
 * `text-[#hex]`. Faltaba: `rgbDeToken` sólo reconocía el hex en `bg-[#hex]`, así
 * que los **1,278 `text-[#hex]`** del repo (127 archivos; 90 sólo en
 * `admin/whatsapp/page.tsx`) quedaban sin medir y `medirPares` los descartaba en
 * silencio por devolver `null`. Un `text-[#F5A623]` sobre blanco da 2.03:1 y no
 * aparecía en ningún informe.
 */
export const RE_TEXTO_HEX = /^text-\[(#[0-9a-fA-F]{3,8})\](?:\/(\d+))?$/
export const RE_VARIANTE =
  /^(?:(?:hover|focus|focus-visible|active|disabled|group-hover|group-focus|peer-checked|sm|md|lg|xl|2xl|dark|motion-reduce|motion-safe|aria-[a-z]+|data-\[[^\]]*\]):)+/

/** Sin comentarios, conservando los saltos de línea para no desplazar las líneas. */
export function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
}

export function archivosTsx(dir: string, out: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue
    const p = join(dir, entrada)
    if (statSync(p).isDirectory()) archivosTsx(p, out)
    else if (p.endsWith(".tsx")) out.push(p)
  }
  return out
}

export function literales(n: ts.Node, out: string[] = []): string[] {
  if (
    ts.isStringLiteral(n) ||
    ts.isNoSubstitutionTemplateLiteral(n) ||
    ts.isTemplateHead(n) ||
    ts.isTemplateMiddle(n) ||
    ts.isTemplateTail(n)
  ) {
    out.push(n.text)
  }
  // El callback NO debe devolver nada: `ts.forEachChild` interpreta un retorno
  // truthy como «deja de recorrer». Devolver el acumulador aquí truncaba el
  // recorrido en el primer literal, así que de un `className={`... ${...}`}`
  // sólo se leía la cabecera y las ramas del ternario quedaban sin medir.
  ts.forEachChild(n, (c) => {
    literales(c, out)
  })
  return out
}

/** ¿La expresión puede pintar un valor primitivo (texto o número)? */
export function pintaPrimitivo(e: ts.Expression): boolean {
  if (
    ts.isStringLiteral(e) ||
    ts.isNumericLiteral(e) ||
    ts.isNoSubstitutionTemplateLiteral(e) ||
    ts.isTemplateExpression(e) ||
    ts.isIdentifier(e) ||
    ts.isPropertyAccessExpression(e) ||
    ts.isElementAccessExpression(e) ||
    ts.isCallExpression(e)
  ) {
    return true
  }
  if (ts.isParenthesizedExpression(e)) return pintaPrimitivo(e.expression)
  if (ts.isConditionalExpression(e)) return pintaPrimitivo(e.whenTrue) || pintaPrimitivo(e.whenFalse)
  if (ts.isBinaryExpression(e)) {
    const k = e.operatorToken.kind
    // `a && <Icono/>` / `a || b` / `a ?? b`: sólo el lado derecho llega a pintarse.
    if (k === ts.SyntaxKind.AmpersandAmpersandToken || k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) {
      return pintaPrimitivo(e.right)
    }
    if (k === ts.SyntaxKind.PlusToken) return pintaPrimitivo(e.left) || pintaPrimitivo(e.right)
  }
  return false
}

/** ¿El elemento pinta texto visible? Decide el umbral (4.5:1 con texto, 3.0:1 gráfico). */
export function llevaTexto(n: ts.Node): boolean {
  // Un atributo no pinta texto: `className={`...`}` no puede subir el umbral.
  if (ts.isJsxAttribute(n)) return false
  if (ts.isJsxText(n)) return n.text.trim().length > 0
  if (ts.isJsxExpression(n)) {
    if (n.expression && pintaPrimitivo(n.expression)) return true
    // `{cond && <span>hola</span>}` no pinta una primitiva, pero el `<span>` sí
    // lleva texto: se sigue bajando por los hijos en vez de cortar aquí.
  }
  let encontrado = false
  n.forEachChild((c) => {
    if (llevaTexto(c)) {
      encontrado = true
      return c
    }
  })
  return encontrado
}

/**
 * Valores posibles de una expresión de `className`. Un ternario tiene ramas
 * mutuamente excluyentes: unirlas inventa pares que nunca se pintan juntos
 * (`text-white` sobre `bg-white` = 1.00:1). Cada valor es una alternativa real.
 */
export function valores(n: ts.Node): string[] {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return [n.text]
  if (ts.isTemplateExpression(n)) {
    let acumulado = [n.head.text]
    for (const span of n.templateSpans) {
      const trozos = valores(span.expression)
      const lit = span.literal.text
      const siguiente: string[] = []
      for (const a of acumulado) for (const t of trozos) siguiente.push(a + t + lit)
      if (siguiente.length) acumulado = siguiente
    }
    return acumulado
  }
  if (ts.isJsxExpression(n)) return n.expression ? valores(n.expression) : [""]
  if (ts.isParenthesizedExpression(n)) return valores(n.expression)
  if (ts.isConditionalExpression(n)) {
    const ramas = [...valores(n.whenTrue), ...valores(n.whenFalse)].filter((v) => v.trim().length > 0)
    return ramas.length ? ramas : [""]
  }
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const izq = valores(n.left)
    const der = valores(n.right)
    const out: string[] = []
    for (const a of izq) for (const b of der) out.push(a + b)
    return out
  }
  // Identificadores, llamadas y condicionales no estáticos: valor desconocido.
  return [""]
}

/** Alternativas de render de un `className`: cada una es su propia lista de tokens. */
export function alternativas(init: ts.Node): string[][] {
  const lista = [...new Set(valores(init))]
  const utiles = lista.length ? lista : [""]
  const partir = (v: string) => v.split(/\s+/).filter(Boolean)
  if (utiles.length > 32) {
    // Demasiadas combinaciones: se mide la unión y se asume el peor caso.
    return [[...new Set(utiles.flatMap(partir))]]
  }
  return utiles.map(partir)
}

/**
 * ¿El `className` interpola un valor de ejecución? `valores()` descarta las
 * interpolaciones no estáticas (devuelve `""`), así que un
 * `` `... bg-[#F7F5F0] ${link.color}` `` se mide **como si** el fondo fuera el
 * literal — y el color real, que llega por props, es otro. Sin esta marca el
 * par es un falso positivo que ningún reemplazo puede arreglar.
 */
export function interpolacionIrresoluble(init: ts.Node): boolean {
  let encontrada = false
  const visitar = (n: ts.Node): void => {
    if (ts.isTemplateExpression(n)) {
      for (const span of n.templateSpans) {
        if (valores(span.expression).every((v) => v.trim() === "")) {
          encontrada = true
          return
        }
      }
    }
    ts.forEachChild(n, visitar)
  }
  visitar(init)
  return encontrada
}

/** Cuenta un token respetando límites de palabra (no confunde `-600` con `-6000`). */export function contarToken(src: string, token: string): number {
  const escapado = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return (src.match(new RegExp(`(?<![\\w-])${escapado}(?![\\w-])`, "g")) ?? []).length
}

export function rgbDeToken(util: string): { rgb: RGB; alfa: number } | null {
  const neutro = util.match(/^(?:text|bg)-(white|black)(?:\/(\d+))?$/)
  if (neutro) {
    return { rgb: neutro[1] === "white" ? BLANCO : [0, 0, 0], alfa: Number(neutro[2] ?? 100) / 100 }
  }
  const hex = util.match(RE_FONDO_HEX) ?? util.match(RE_TEXTO_HEX)
  if (hex) {
    const h = hex[1] ?? ""
    const c = (i: number): string => h.charAt(i)
    const completo = h.length === 4 ? `#${c(1)}${c(1)}${c(2)}${c(2)}${c(3)}${c(3)}` : h
    return { rgb: desdeHex(completo.slice(0, 7)), alfa: Number(hex[2] ?? 100) / 100 }
  }
  const m = util.match(RE_TEXTO) ?? util.match(RE_FONDO)
  if (!m) return null
  const clave = `${m[1]}-${m[2]}`
  const rgb = PALETA.get(clave)
  if (!rgb) return null
  return { rgb, alfa: Number(m[3] ?? 100) / 100 }
}

export interface Par {
  archivo: string
  linea: number
  texto: string
  fondo: string
  variante: string
  ratio: number
  umbral: number
  /** Utilidades del `className` que producen este par (para clasificarlo). */
  tokens: string[]
  /** El elemento JSX declara `disabled`: su rama inactiva está exenta por WCAG 1.4.3. */
  tieneDisabled: boolean
  /** El `className` interpola un valor de ejecución: el color real no es estático. */
  tieneInterpolacion: boolean
}

export function medirPares(
  perimetro: string[],
  fuentes: Map<string, string>,
): { pares: number; fallos: Par[]; sinHex: string[]; conTexto: number } {
  const fallos: Par[] = []
  const sinHex: string[] = []
  let pares = 0
  let conTextoTotal = 0

  for (const archivo of perimetro) {
    const src = fuentes.get(archivo)
    if (src === undefined) continue
    const sf = ts.createSourceFile(archivo, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const rel = relative(RAIZ, archivo)

    const visitar = (n: ts.Node): void => {
      const etiqueta = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null
      if (etiqueta) {
        const attr = etiqueta.attributes.properties.find(
          (a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "className",
        )
        if (attr && ts.isJsxAttribute(attr) && attr.initializer) {
          const conTexto = llevaTexto(n)
          if (conTexto) conTextoTotal++
          const umbral = conTexto ? 4.5 : 3.0
          const linea = sf.getLineAndCharacterOfPosition(etiqueta.getStart(sf)).line + 1
          const tieneDisabled = etiqueta.attributes.properties.some(
            (a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "disabled",
          )
          const tieneInterpolacion = interpolacionIrresoluble(attr.initializer)

          for (const toks of alternativas(attr.initializer)) {
            const grupos = new Map<string, string[]>()
            for (const t of toks) {
              const variante = t.match(RE_VARIANTE)?.[0] ?? ""
              const util = t.slice(variante.length)
              const lista = grupos.get(variante)
              if (lista) lista.push(util)
              else grupos.set(variante, [util])
            }

            const base = grupos.get("") ?? []
            const textosBase = base.filter((u) => u.startsWith("text-"))
            const fondosBase = base.filter((u) => u.startsWith("bg-"))

            for (const [variante, utils] of grupos) {
              const textosPropios = utils.filter((u) => u.startsWith("text-"))
              const fondosPropios = utils.filter((u) => u.startsWith("bg-"))
              // Herencia de estado: un `hover:bg-*` sin `hover:text-*` deja el color
              // de texto de la base sobre el fondo nuevo, y esa mezcla es la que ve
              // el usuario al pasar el ratón. Medir sólo dentro del mismo ámbito de
              // variante dejaba fuera `text-gray-500 hover:bg-gray-100` (4.39:1).
              if (variante !== "" && textosPropios.length === 0 && fondosPropios.length === 0) continue
              const textos = variante === "" || textosPropios.length > 0 ? textosPropios : textosBase
              const fondos = variante === "" || fondosPropios.length > 0 ? fondosPropios : fondosBase
              for (const tt of textos) {
                const t = rgbDeToken(tt)
                if (!t) {
                  if (RE_TEXTO.test(tt) || tt.startsWith("text-white")) sinHex.push(`${rel}:${linea} ${tt}`)
                  continue
                }
                for (const bt of fondos) {
                  const b = rgbDeToken(bt)
                  if (!b) {
                    if (RE_FONDO.test(bt) || RE_FONDO_HEX.test(bt)) sinHex.push(`${rel}:${linea} ${bt}`)
                    continue
                  }
                  const fondo = b.alfa < 1 ? componer(b.rgb, BLANCO, b.alfa) : b.rgb
                  const texto = t.alfa < 1 ? componer(t.rgb, fondo, t.alfa) : t.rgb
                  pares++
                  const ratio = razon(texto, fondo)
                  if (ratio < umbral) {
                    fallos.push({
                      archivo: rel,
                      linea,
                      texto: tt,
                      fondo: bt,
                      variante,
                      ratio,
                      umbral,
                      tokens: toks,
                      tieneDisabled,
                      tieneInterpolacion,
                    })
                  }
                }
              }
            }
          }
        }
      }
      ts.forEachChild(n, visitar)
    }
    visitar(sf)
  }
  return { pares, fallos, sinHex, conTexto: conTextoTotal }
}

/**
 * `placeholder:text-<token>`, en cualquier variante. `RE_VARIANTE` no incluye
 * `placeholder` —es un pseudo-elemento, no una variante de estado—, así que
 * `medirPares` descarta el token entero: no empieza por `text-`. El hueco era
 * real: 7 `placeholder:text-gray-400`/`gray-300` sobre entradas claras daban
 * 2.54:1 y 1.92:1, y ningún contrato los veía.
 */
export const RE_PLACEHOLDER = /^((?:[\w-]+:)*)placeholder:text-(.+)$/

/** Fila del informe de `medirPlaceholders`. */
export interface ParPlaceholder {
  archivo: string
  linea: number
  texto: string
  fondo: string
  ratio: number
}

/**
 * Mide el color del placeholder contra la superficie donde se pinta.
 *
 * El placeholder es texto (WCAG 1.4.3 le aplica igual que al `<input>`: no es
 * decorativo ni un control deshabilitado) y por eso su umbral es 4.5:1. La
 * superficie se toma del propio `bg-*` base del elemento; si el elemento es
 * transparente, del primer `bg-*` del contenedor JSX más cercano; y si tampoco
 * hay, de `blanco` — la superficie más clara, que es el peor caso para un
 * placeholder oscuro y el caso real de todas las entradas del repo.
 */
export function medirPlaceholders(
  perimetro: string[],
  fuentes: Map<string, string>,
): { pares: number; fallos: ParPlaceholder[] } {
  const fallos: ParPlaceholder[] = []
  let pares = 0

  const rgbFondo = (tokens: string[]): { util: string; rgb: RGB } | null => {
    for (const t of tokens) {
      if (!t.startsWith("bg-")) continue
      const medida = rgbDeToken(t)
      if (!medida) continue
      return { util: t, rgb: medida.alfa < 1 ? componer(medida.rgb, BLANCO, medida.alfa) : medida.rgb }
    }
    return null
  }

  for (const archivo of perimetro) {
    const src = fuentes.get(archivo)
    if (src === undefined) continue
    const sf = ts.createSourceFile(archivo, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const rel = relative(RAIZ, archivo)

    const visitar = (n: ts.Node, heredado: string[]): void => {
      const etiqueta = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null
      let propio: string[] = []
      if (etiqueta) {
        const attr = etiqueta.attributes.properties.find(
          (a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "className",
        )
        if (attr && ts.isJsxAttribute(attr) && attr.initializer) {
          const linea = sf.getLineAndCharacterOfPosition(etiqueta.getStart(sf)).line + 1
          const toks = alternativas(attr.initializer).flat()
          propio = toks
          const base = rgbFondo(toks)
          const superficie = base ?? rgbFondo(heredado) ?? { util: "white", rgb: BLANCO }
          for (const t of toks) {
            const m = t.match(RE_PLACEHOLDER)
            if (!m) continue
            const medida = rgbDeToken(`text-${m[2]}`)
            if (!medida) continue
            const texto = medida.alfa < 1 ? componer(medida.rgb, superficie.rgb, medida.alfa) : medida.rgb
            pares++
            const ratio = razon(texto, superficie.rgb)
            if (ratio < 4.5) {
              fallos.push({ archivo: rel, linea, texto: `placeholder:text-${m[2]}`, fondo: superficie.util, ratio })
            }
          }
        }
      }
      const siguiente = propio.length > 0 ? propio : heredado
      ts.forEachChild(n, (hijo) => visitar(hijo, siguiente))
    }
    visitar(sf, [])
  }
  return { pares, fallos }
}

/**
 * Variantes de estado. Repetir en ellas el mismo valor que ya tiene la base deja
 * la afordancia muerta: el `text-gray-400 hover:text-gray-600` que se corrigió
 * en la ronda 15 no hacía nada al pasar el ratón.
 */
export const VARIANTES_DE_ESTADO = new Set([
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
  "group-hover",
  "group-focus",
])

/**
 * Variantes de inhibición. Repetir la base dentro de un `disabled:` no es una
 * afordancia muerta: es lo contrario, la anula. `bg-emerald-700 hover:bg-emerald-800
 * disabled:hover:bg-emerald-700` fija el color mientras el botón está deshabilitado,
 * que es exactamente lo que se pretende, y sin la variante el `hover:` seguiría
 * ganando. Por eso se eximen y no se reportan.
 */
export const VARIANTES_DE_INHIBICION = new Set([
  "disabled",
  "aria-disabled",
  "group-disabled",
  "peer-disabled",
])

export function afordanciasMuertas(
  perimetro: string[],
  fuentes: Map<string, string>,
): { revisadas: number; muertas: string[] } {
  const muertas: string[] = []
  let revisadas = 0
  for (const archivo of perimetro) {
    const src = fuentes.get(archivo)
    if (src === undefined) continue
    const sf = ts.createSourceFile(archivo, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const rel = relative(RAIZ, archivo)
    const visitar = (n: ts.Node): void => {
      const etiqueta = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null
      if (etiqueta) {
        const attr = etiqueta.attributes.properties.find(
          (a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "className",
        )
        if (attr && ts.isJsxAttribute(attr) && attr.initializer) {
          const linea = sf.getLineAndCharacterOfPosition(etiqueta.getStart(sf)).line + 1
          // Por literal y no por unión de ramas: un ternario que pone la base en
          // una rama y el hover en otra no es una afordancia muerta.
          for (const literal of literales(attr.initializer)) {
            const utils = literal.split(/\s+/).filter(Boolean)
            if (utils.length === 0) continue
            revisadas++
            for (const util of utils) {
              const prefijo = util.match(RE_VARIANTE)?.[0]
              if (!prefijo) continue
              const variantes = prefijo.split(":").slice(0, -1)
              if (!variantes.some((v) => VARIANTES_DE_ESTADO.has(v))) continue
              if (variantes.some((v) => VARIANTES_DE_INHIBICION.has(v))) continue
              const base = util.slice(prefijo.length)
              if (utils.includes(base)) muertas.push(`${rel}:${linea}  ${util} repite ${base}`)
            }
          }
        }
      }
      ts.forEachChild(n, visitar)
    }
    visitar(sf)
  }
  return { revisadas, muertas }
}

export function describir(p: Par): string {
  const r = p.ratio.toFixed(2)
  const v = p.variante ? ` [${p.variante}]` : ""
  return `${p.archivo}:${p.linea}  ${p.texto} sobre ${p.fondo} = ${r}:1 (umbral ${p.umbral})${v}`
}

/** Superficies claras del sistema sobre las que se mide el texto. */
export const SUPERFICIES_CLARAS = ["white", "cream-50", "cream-100", "gray-50", "gray-100"] as const

/**
 * Tokens de la paleta propia que NO alcanzan AA (4.5:1) como texto sobre ninguna
 * superficie clara. Medido contra cada entrada de `SUPERFICIES_CLARAS`:
 *
 *   warm-400  (#8F939B)  3.08 / 2.91 / 2.63 / 2.95 / 2.80
 *   cream-600 (#999893)  2.89 / 2.73 / 2.47 / 2.77 / 2.63
 *
 * Ninguno es un defecto vivo: ambos son legítimos como borde, relleno de gráfico
 * o icono —lo que WCAG 1.4.11 mide a 3:1— y por eso la prohibición recae sobre la
 * familia `text-`, no sobre el token. El contrato mide además que siguen por
 * debajo de AA: el día que la paleta cambie, la lista debe vaciarse sola.
 *
 * `reemplazo` es la guía de sustitución, verificada contra `superficie` (la
 * superficie clara donde vive el uso). `warm-500` solo alcanza AA sobre blanco
 * (4.56); sobre `cream-50` cae a 4.30, así que en superficies de crema el
 * reemplazo correcto es `warm-600` (6.01 en la peor).
 */
export interface TokenLatente {
  token: string
  reemplazo: string
  superficie: string
}

export const PALETA_LATENTE: TokenLatente[] = [
  { token: "warm-400", reemplazo: "warm-500", superficie: "white" },
  { token: "cream-600", reemplazo: "cream-700", superficie: "white" },
]
