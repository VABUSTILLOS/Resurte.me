import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * Contrato de contraste del panel de admin (A16).
 *
 * `/admin/**` no entra en `e2e/a11y.spec.ts` (exige sesión, así que axe nunca
 * lo recorre) y `admin-productos-contrast.contract.test.ts` (B36) sólo cubría
 * sus 6 archivos de productos. El resto del panel quedó sin contrato y acumuló
 * deuda AA viva: 140 tokens de color que no aguantan el fondo sobre el que se
 * pintan (`text-red-600` sobre blanco = 4.77:1 pasa, pero el mismo token sobre
 * `red-100` = 3.91:1 no; `bg-amber-500` con texto blanco = 2.13:1).
 *
 * Este contrato es la generalización de B36 sobre los 50 archivos restantes y
 * se apoya en tres decisiones:
 *
 * 1. **La paleta no se hardcodea.** Se deriva de `node_modules/tailwindcss/
 *    theme.css` (los tokens de Tailwind v4 son OKLCH, no hex) y de
 *    `src/app/globals.css` (la paleta propia de la app: `brand-*`, `cream-*`,
 *    `warm-*`, `cs-green-*`). Cambiar un color del tema mueve las ratios de
 *    este test sin tocar el test.
 *
 * 2. **Las prohibiciones se derivan, no se decretan.** Cada token prohibido
 *    tiene que fallar la ratio contra una superficie que exista *de verdad* en
 *    el perímetro (blanco, `gray-50`, `gray-100`, `red-100`, `amber-100`…).
 *    Si alguien "arregla" una superficie, el test de derivación avisa de que
 *    la prohibición ya no se sostiene. La lista de prohibidos no es fiat.
 *
 * 3. **El par se mide, no se adivina.** El color de texto y el de fondo se
 *    emparejan dentro del **mismo `className`** y del **mismo ámbito de
 *    variante** (`hover:` con `hover:`, base con base), no por posición. Eso es
 *    lo que hace medible `className="text-white bg-brand-600"`, donde el texto
 *    va antes que el fondo. El umbral es 4.5:1 si el subárbol del elemento
 *    lleva texto y 3.0:1 si es sólo gráfico (WCAG 1.4.11).
 *
 * 4. **Los neutros se deciden, no se intuyen.** El barrido de la ronda 15 midió
 *    308 sitios `text-gray-400` en el perímetro (sobre `gray-50`, `gray-100`,
 *    `gray-200`, `brand-50` y blanco). El destino es `gray-600`, no `gray-500`,
 *    porque el 500 sólo salva el blanco (4.63:1) y cae sobre `gray-100`
 *    (4.39:1), `gray-200` (3.91:1) y `gray-300` (3.49:1). La única excepción es
 *    `placeholder:`, que siempre se pinta sobre el blanco del propio campo.
 *
 * 5. **Las ramas de un ternario son alternativas, no una unión.** Un
 *    `className={a ? "text-white bg-gray-900" : "text-gray-400 bg-white"}` no
 *    se puede medir como un solo conjunto de tokens: `text-white` y `bg-white`
 *    nunca coexisten en pantalla. El modelo enumera las alternativas del
 *    `className` (literal, plantilla, ternario, concatenación con `+`) y mide
 *    cada una por separado. Antes de esta corrección el contrato inventaba
 *    pares imposibles de 1.00:1 y, peor, medía sólo la primera mitad de cada
 *    plantilla (ver el comentario de `literales`).
 *
 * 6. **`text-gray-500` no se prohíbe, se mide.** Falla sobre `gray-100`
 *    (4.39:1), `emerald-100` (4.26:1) y `amber-100` (4.34:1), pero pasa sobre
 *    blanco (4.84:1) y `gray-50` (4.63:1), que es la superficie del panel. Una
 *    prohibición global obligaría a oscurecer texto secundario legítimo. La
 *    lista de prohibidos es para tokens que fallan sobre *toda* superficie; el
 *    fallo condicional lo caza el test de pares.
 *
 * Quedan fuera, a propósito y por escrito: los 6 archivos de B36 (tienen su
 * propio contrato) y los 5 archivos de la línea de trabajo concurrente
 * (foodos / recompensas / proveedores). De esos 5 se registra la deuda en
 * `DEUDA_AJENA` con un trinquete de una sola dirección: puede bajar libremente,
 * nunca subir.
 *
 * El entorno de vitest es `node` (sin jsdom), así que el contrato se fija sobre
 * el AST del archivo, igual que `a11y-static.contract.test.ts`.
 */

const RAIZ = process.cwd()
const ADMIN = join(RAIZ, "src", "app", "admin")

type RGB = readonly [number, number, number]

/** OKLCH → sRGB: matriz OKLab de Björn Ottosson, gamma sRGB y recorte a [0,1]. */
function oklchARgb(L: number, C: number, h: number): RGB {
  const hr = (h * Math.PI) / 180
  const a = C * Math.cos(hr)
  const b = C * Math.sin(hr)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lineal = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const gamma = (x: number): number => {
    const c = Math.min(1, Math.max(0, x))
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  }
  const r = Math.round(gamma(lineal[0]!) * 255)
  const g = Math.round(gamma(lineal[1]!) * 255)
  const bl = Math.round(gamma(lineal[2]!) * 255)
  return [r, g, bl]
}

function desdeHex(hex: string): RGB {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

/** Luminancia relativa WCAG 2.x. */
function luminancia([r, g, b]: RGB): number {
  const canal = (x: number): number => {
    const v = x / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

function razon(a: RGB, b: RGB): number {
  const [alto, bajo] = [luminancia(a), luminancia(b)].sort((p, q) => q - p)
  return (alto! + 0.05) / (bajo! + 0.05)
}

/** Composición alfa sobre un fondo opaco (sRGB, sin espacio lineal). */
function componer(fg: RGB, bg: RGB, alfa: number): RGB {
  return [
    Math.round(fg[0] * alfa + bg[0] * (1 - alfa)),
    Math.round(fg[1] * alfa + bg[1] * (1 - alfa)),
    Math.round(fg[2] * alfa + bg[2] * (1 - alfa)),
  ]
}

const BLANCO: RGB = [255, 255, 255]

/**
 * Paleta medida. Se construye leyendo las dos fuentes de verdad del proyecto en
 * vez de copiar valores: `theme.css` trae los tokens de Tailwind v4 en OKLCH y
 * `globals.css` la paleta propia en hex.
 */
const PALETA = new Map<string, RGB>()

function grupo(m: RegExpMatchArray, i: number): string {
  const v = m[i]
  if (v === undefined) throw new Error(`grupo ${i} ausente en ${m[0]}`)
  return v
}

const themeCss = readFileSync(join(RAIZ, "node_modules", "tailwindcss", "theme.css"), "utf8")
const globalsCss = readFileSync(join(RAIZ, "src", "app", "globals.css"), "utf8")

for (const m of themeCss.matchAll(/--color-([a-z-]+?)-(\d{2,3}):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g)) {
  PALETA.set(`${grupo(m, 1)}-${grupo(m, 2)}`, oklchARgb(Number(grupo(m, 3)) / 100, Number(grupo(m, 4)), Number(grupo(m, 5))))
}
for (const m of globalsCss.matchAll(/--color-([a-z-]+?)-(\d{2,3}):\s*(#[0-9a-fA-F]{6})/g)) {
  PALETA.set(`${grupo(m, 1)}-${grupo(m, 2)}`, desdeHex(grupo(m, 3)))
}
PALETA.set("white", BLANCO)
PALETA.set("black", [0, 0, 0])

const FAMILIAS =
  "cs-green|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone|brand|cream|warm"

const RE_TEXTO = new RegExp(`^text-(${FAMILIAS})-(\\d{2,3})(?:/(\\d+))?$`)
const RE_FONDO = new RegExp(`^bg-(${FAMILIAS})-(\\d{2,3})(?:/(\\d+))?$`)
const RE_FONDO_HEX = /^bg-\[(#[0-9a-fA-F]{3,8})\](?:\/(\d+))?$/
const RE_VARIANTE =
  /^(?:(?:hover|focus|focus-visible|active|disabled|group-hover|group-focus|peer-checked|sm|md|lg|xl|2xl|dark|motion-reduce|motion-safe|aria-[a-z]+|data-\[[^\]]*\]):)+/

/** Sin comentarios, conservando los saltos de línea para no desplazar las líneas. */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
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

function literales(n: ts.Node, out: string[] = []): string[] {
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
function pintaPrimitivo(e: ts.Expression): boolean {
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
function llevaTexto(n: ts.Node): boolean {
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
function valores(n: ts.Node): string[] {
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
function alternativas(init: ts.Node): string[][] {
  const lista = [...new Set(valores(init))]
  const utiles = lista.length ? lista : [""]
  const partir = (v: string) => v.split(/\s+/).filter(Boolean)
  if (utiles.length > 32) {
    // Demasiadas combinaciones: se mide la unión y se asume el peor caso.
    return [[...new Set(utiles.flatMap(partir))]]
  }
  return utiles.map(partir)
}

/** Cuenta un token respetando límites de palabra (no confunde `-600` con `-6000`). */
function contarToken(src: string, token: string): number {
  const escapado = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return (src.match(new RegExp(`(?<![\\w-])${escapado}(?![\\w-])`, "g")) ?? []).length
}

/**
 * Archivos con su propio contrato (B36) o de la línea de trabajo concurrente.
 * Las rutas son relativas a `src/app/admin`.
 */
const CON_CONTRATO_PROPIO = [
  "productos/page.tsx",
  "components/ProductFormModal.tsx",
  "components/ImportProductsModal.tsx",
  "components/ProductsSkeleton.tsx",
  "components/RowActionMenu.tsx",
  "components/RestockPanel.tsx",
]

/**
 * Deuda de contraste de los archivos ajenos, declarada y medida. El trinquete
 * es de una sola dirección: si la otra línea la reduce, estos números siguen
 * valiendo; si la aumenta, este test lo dice.
 */
const DEUDA_AJENA: { archivo: string; tokens: string[]; declarado: number }[] = [
  { archivo: "pedidos/proof-section.tsx", tokens: ["text-red-600"], declarado: 2 },
  { archivo: "proveedores/supplier-forms.tsx", tokens: ["text-red-600"], declarado: 1 },
  { archivo: "recompensas/canjes-tab.tsx", tokens: ["text-red-600"], declarado: 2 },
  { archivo: "foodos/dispersiones/page.tsx", tokens: ["text-red-600", "text-amber-600"], declarado: 5 },
  { archivo: "foodos/dispersiones/payout-forms.tsx", tokens: ["text-red-600", "text-amber-600"], declarado: 2 },
]

const AJENOS = DEUDA_AJENA.map((d) => d.archivo)

const TODOS = archivosTsx(ADMIN)
const PERIMETRO = TODOS.filter((f) => {
  const rel = relative(ADMIN, f)
  return !CON_CONTRATO_PROPIO.includes(rel) && !AJENOS.includes(rel)
})

const FUENTES = new Map(PERIMETRO.map((f) => [f, sinComentarios(readFileSync(f, "utf8"))]))

/**
 * Superficies claras que existen de verdad en el perímetro. Se declaran para
 * que el test de derivación compruebe las prohibiciones contra fondos reales.
 */
const SUPERFICIES_CLARAS = [
  "white",
  "gray-50",
  "gray-100",
  "gray-200",
  "red-50",
  "red-100",
  "amber-50",
  "amber-100",
  "green-50",
  "green-100",
  "emerald-50",
  "emerald-100",
  "orange-50",
  "brand-50",
]

/** Tokens que no aguantan 4.5:1 sobre alguna superficie clara del perímetro. */
const TEXTO_PROHIBIDO = [
  "text-red-500",
  "text-red-600",
  "text-amber-500",
  "text-amber-600",
  "text-green-500",
  "text-green-600",
  "text-emerald-600",
  "text-orange-600",
  "text-gray-400",
  "text-brand-400",
]

/** Rellenos que no aguantan 4.5:1 con texto blanco encima. */
const RELLENO_PROHIBIDO = [
  "bg-amber-400",
  "bg-amber-500",
  "bg-amber-600",
  "bg-green-500",
  "bg-green-600",
  "bg-emerald-500",
]

/** El verde de WhatsApp, aclarado a mano, no llega ni a 3:1 con texto blanco. */
const RELLENO_HEX_PROHIBIDO = ["bg-[#25D366]"]

const PROHIBIDOS = [...TEXTO_PROHIBIDO, ...RELLENO_PROHIBIDO, ...RELLENO_HEX_PROHIBIDO]

/** Lo que se cambió, para exigir que el reemplazo mejore la ratio. */
const REEMPLAZOS: Record<string, string> = {
  "text-red-500": "text-red-700",
  "text-red-600": "text-red-700",
  "text-amber-500": "text-amber-700",
  "text-amber-600": "text-amber-700",
  "text-green-500": "text-green-700",
  "text-green-600": "text-green-700",
  "text-emerald-600": "text-emerald-700",
  "text-orange-600": "text-orange-700",
  "text-gray-400": "text-gray-600",
  "text-brand-400": "text-brand-600",
  "bg-amber-400": "bg-amber-700",
  "bg-amber-500": "bg-amber-700",
  "bg-amber-600": "bg-amber-700",
  "bg-green-500": "bg-green-700",
  "bg-green-600": "bg-green-700",
  "bg-emerald-500": "bg-emerald-700",
  "bg-[#25D366]": "bg-[#0F7A3D]",
}

function rgbDeToken(util: string): { rgb: RGB; alfa: number } | null {
  const neutro = util.match(/^(?:text|bg)-(white|black)(?:\/(\d+))?$/)
  if (neutro) {
    return { rgb: neutro[1] === "white" ? BLANCO : [0, 0, 0], alfa: Number(neutro[2] ?? 100) / 100 }
  }
  const hex = util.match(RE_FONDO_HEX)
  if (hex) {
    const h = hex[1]!
    const completo = h.length === 4 ? `#${h[1]!}${h[1]!}${h[2]!}${h[2]!}${h[3]!}${h[3]!}` : h
    return { rgb: desdeHex(completo.slice(0, 7)), alfa: Number(hex[2] ?? 100) / 100 }
  }
  const m = util.match(RE_TEXTO) ?? util.match(RE_FONDO)
  if (!m) return null
  const clave = `${m[1]}-${m[2]}`
  const rgb = PALETA.get(clave)
  if (!rgb) return null
  return { rgb, alfa: Number(m[3] ?? 100) / 100 }
}

interface Par {
  archivo: string
  linea: number
  texto: string
  fondo: string
  variante: string
  ratio: number
  umbral: number
}

function medirPares(): { pares: number; fallos: Par[]; sinHex: string[]; conTexto: number } {
  const fallos: Par[] = []
  const sinHex: string[] = []
  let pares = 0
  let conTextoTotal = 0

  for (const archivo of PERIMETRO) {
    const src = FUENTES.get(archivo)!
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
                  fallos.push({ archivo: rel, linea, texto: tt, fondo: bt, variante, ratio, umbral })
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

const medicion = medirPares()

/**
 * Variantes de estado. Repetir en ellas el mismo valor que ya tiene la base deja
 * la afordancia muerta: el `text-gray-400 hover:text-gray-600` que se corrigió
 * en la ronda 15 no hacía nada al pasar el ratón.
 */
const VARIANTES_DE_ESTADO = new Set([
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
  "group-hover",
  "group-focus",
])

function afordanciasMuertas(): { revisadas: number; muertas: string[] } {
  const muertas: string[] = []
  let revisadas = 0
  for (const archivo of PERIMETRO) {
    const src = FUENTES.get(archivo)!
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

const afordancias = afordanciasMuertas()

function describir(p: Par): string {
  const r = p.ratio.toFixed(2)
  const v = p.variante ? ` [${p.variante}]` : ""
  return `${p.archivo}:${p.linea}  ${p.texto} sobre ${p.fondo} = ${r}:1 (umbral ${p.umbral})${v}`
}

describe("contraste del panel de admin (A16)", () => {
  it("la matemática de color es la de WCAG", () => {
    // Referencias publicadas: negro/blanco = 21, #767676 = 4.54, #949494 = 3.03.
    expect(razon([0, 0, 0], BLANCO)).toBeCloseTo(21, 2)
    expect(razon([118, 118, 118], BLANCO)).toBeCloseTo(4.54, 2)
    expect(razon([148, 148, 148], BLANCO)).toBeCloseTo(3.03, 2)
  })

  it("convierte OKLCH a los hex publicados de Tailwind v4", () => {
    // Si la matriz OKLab o el gamma se rompen, estos valores dejan de coincidir.
    const esperados: Record<string, string> = {
      "red-500": "#FB2C36",
      "red-600": "#E7000B",
      "red-700": "#C10007",
      "amber-700": "#BB4D00",
      "green-700": "#008236",
      "emerald-700": "#007A55",
      "blue-600": "#155DFC",
      "gray-700": "#364153",
      "gray-900": "#101828",
      "slate-400": "#90A1B9",
      "sky-100": "#DFF2FE",
    }
    for (const [token, hex] of Object.entries(esperados)) {
      const rgb = PALETA.get(token)
      expect(rgb, `${token} no está en la paleta derivada`).toBeDefined()
      const obtenido = `#${rgb!.map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("")}`
      expect(obtenido, `${token} se convirtió mal`).toBe(hex)
    }
  })

  it("la paleta propia se lee de globals.css y no se copia aquí", () => {
    // Si alguien cambia el verde de marca en globals.css, este test lo refleja.
    expect(PALETA.get("brand-500")).toEqual(desdeHex("#0E7A0E"))
    expect(PALETA.get("brand-600")).toEqual(desdeHex("#0D720D"))
    expect(PALETA.get("brand-700")).toEqual(desdeHex("#0A610A"))
    expect(PALETA.has("cs-green-500")).toBe(true)
  })

  it("cada color de texto prohibido falla contra una superficie real del perímetro", () => {
    for (const token of TEXTO_PROHIBIDO) {
      const rgb = rgbDeToken(token)
      expect(rgb, `${token} no está en la paleta`).not.toBeNull()
      const peor = SUPERFICIES_CLARAS.map((s) => {
        const fondo = PALETA.get(s)
        expect(fondo, `la superficie ${s} no está en la paleta`).toBeDefined()
        return { s, ratio: razon(rgb!.rgb, fondo!) }
      }).sort((a, b) => a.ratio - b.ratio)[0]!
      expect(
        peor.ratio,
        `${token} pasa 4.5:1 sobre toda superficie del perímetro: la prohibición ya no se sostiene, quítala de TEXTO_PROHIBIDO`,
      ).toBeLessThan(4.5)
    }
  })

  it("cada relleno prohibido falla con texto blanco encima", () => {
    for (const token of [...RELLENO_PROHIBIDO, ...RELLENO_HEX_PROHIBIDO]) {
      const rgb = rgbDeToken(token)
      expect(rgb, `${token} no está en la paleta`).not.toBeNull()
      expect(
        razon(rgb!.rgb, BLANCO),
        `${token} aguanta texto blanco: la prohibición ya no se sostiene, quítala`,
      ).toBeLessThan(4.5)
    }
  })

  it("cada reemplazo mejora la ratio del token que sustituye", () => {
    for (const [viejo, nuevo] of Object.entries(REEMPLAZOS)) {
      const a = rgbDeToken(viejo)
      const b = rgbDeToken(nuevo)
      expect(a, `${viejo} no está en la paleta`).not.toBeNull()
      expect(b, `${nuevo} no está en la paleta`).not.toBeNull()
      expect(
        razon(b!.rgb, BLANCO),
        `${nuevo} no mejora a ${viejo} sobre blanco`,
      ).toBeGreaterThan(razon(a!.rgb, BLANCO))
    }
  })

  it("no reintroduce ningún token prohibido en el perímetro", () => {
    const reincidentes: string[] = []
    for (const [archivo, src] of FUENTES) {
      for (const token of PROHIBIDOS) {
        const n = contarToken(src, token)
        if (n > 0) reincidentes.push(`${relative(RAIZ, archivo)} usa ${token} ×${n}`)
      }
    }
    expect(
      reincidentes,
      `estos tokens no aguantan el fondo sobre el que se pintan; usa el -700 (o -800) correspondiente`,
    ).toEqual([])
  })

  it("ningún par texto/fondo del perímetro baja de su umbral", () => {
    expect(
      medicion.fallos.map(describir),
      "pares por debajo del umbral: 4.5:1 con texto, 3.0:1 sólo gráfico",
    ).toEqual([])
  })

  it("ninguna variante de estado repite el valor que ya tiene la base", () => {
    // `text-gray-400 hover:text-gray-600` oscurecía al pasar el ratón; si la base
    // ya es `text-gray-600`, el hover no cambia nada y la afordancia muere.
    expect(
      afordancias.muertas,
      "una variante de estado que repite el valor base no cambia nada: sube el destino (p. ej. hover:text-gray-700)",
    ).toEqual([])
  })

  it("todo token de color del perímetro es medible", () => {
    // Un token que no esté en la paleta se saltaría la medición en silencio.
    expect([...new Set(medicion.sinHex)].sort()).toEqual([])
  })

  it("el perímetro y la medición no se vacían", () => {
    // Canario: si un glob o un filtro se rompe, el contrato pasaría por vacío.
    // Valores medidos en la ronda 15: 50 archivos, 377 pares, 1891 elementos con
    // texto y 2514 literales de `className` inspeccionados. El suelo va al ~90 %
    // para tolerar un refactor legítimo sin dejar pasar un glob roto.
    // Ojo: `pares` (178→377) y `revisadas` (2280→2514) subieron al corregir el
    // recorrido del AST, y `conTexto` (1992→1891) bajó al endurecer `llevaTexto`.
    // Un cambio a la baja en estos números es señal de un recorrido roto, no de
    // una mejora: el suelo existe para que ese cambio no pase inadvertido.
    expect(PERIMETRO.length).toBeGreaterThanOrEqual(45)
    expect(medicion.pares).toBeGreaterThanOrEqual(340)
    expect(medicion.conTexto).toBeGreaterThanOrEqual(1700)
    expect(afordancias.revisadas).toBeGreaterThanOrEqual(2260)
  })

  it("deja registrada, sin crecer, la deuda de contraste de los archivos ajenos", () => {
    for (const { archivo, tokens, declarado } of DEUDA_AJENA) {
      const src = sinComentarios(readFileSync(join(ADMIN, archivo), "utf8"))
      const total = tokens.reduce((acc, t) => acc + contarToken(src, t), 0)
      expect(
        total,
        `${archivo} tiene más deuda de contraste ajena que la declarada (${declarado}); avisa a la línea de trabajo que lo posee`,
      ).toBeLessThanOrEqual(declarado)
    }
  })
})
