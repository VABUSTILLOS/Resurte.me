import { readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import {
  BLANCO,
  PALETA,
  afordanciasMuertas,
  archivosTsx,
  contarToken,
  describir,
  desdeHex,
  medirPares,
  razon,
  rgbDeToken,
  sinComentarios,
} from "./contrast"

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
 *
 * El andamiaje de medición (matemática de color, recorrido del AST, emparejado
 * de tokens) vive en `src/lib/contrast.ts`, compartido con el contrato de
 * `/panel`: es la misma matemática y no debe haber dos copias que puedan
 * divergir. Aquí queda lo propio de `/admin`: el perímetro, los umbrales y las
 * listas de prohibidos y reemplazos.
 * el AST del archivo, igual que `a11y-static.contract.test.ts`.
 */

const RAIZ = process.cwd()
const ADMIN = join(RAIZ, "src", "app", "admin")
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
const medicion = medirPares(PERIMETRO, FUENTES)

const afordancias = afordanciasMuertas(PERIMETRO, FUENTES)

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
