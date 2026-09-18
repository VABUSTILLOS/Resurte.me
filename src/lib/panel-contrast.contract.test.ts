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
 * Contrato de contraste del panel de negocio (`/panel/**`) — CX1.
 *
 * El contrato de `admin-contrast.contract.test.ts` (A16) cubría `/admin/**` y
 * dejaba fuera, sin decirlo, la superficie que el usuario restaurantero usa a
 * diario. `e2e/a11y.spec.ts` tampoco la salva: axe sólo detecta el par
 * texto/fondo que **existe en el DOM renderizado** de las rutas que recorre, así
 * que un `text-gray-400` sobre `gray-50` en una pestaña que el barrido no abre
 * nunca aparece. El resultado era una deuda AA real e invisible: 60 pares por
 * debajo de 4.5:1 repartidos en 14 archivos.
 *
 * Este contrato reutiliza el andamiaje de `./contrast` (la matemática OKLab, el
 * emparejado por variante, la lectura de la paleta desde el tema) en vez de
 * copiarlo: dos copias de la misma matemática divergen, y la segunda copia es
 * la que nadie revisa. Lo que es propio de `/panel` es sólo el perímetro, las
 * prohibiciones y los reemplazos.
 *
 * Cuatro decisiones que no son obvias:
 *
 * 1. **`text-emerald-600` no se prohíbe, aunque se corrigiera 28 veces en
 *    sitios puntuales.** Sobre blanco da 3.65:1 y sobre `emerald-50` 3.47:1,
 *    así que no es un token sano, pero prohibirlo arrastraría 28 sitios de
 *    texto secundario de marca cuyo destino correcto no es el mismo en todos
 *    (algunos van sobre blanco, otros sobre `emerald-50`). El contrato lo caza
 *    donde de verdad falla —en el test de pares— y no decretado en bloque. Es
 *    la misma decisión que A16 tomó con `text-gray-500`.
 *
 * 2. **Los neutros (`text-gray-400`, `text-gray-500`, `text-stone-400`) no se
 *    prohíben aquí.** Su deuda es de todo el repositorio (654 / 775 mediciones
 *    fuera de `/admin`) y la posee `a4`/CX8-CX9, no este contrato. Se registran
 *    con un trinquete de una sola dirección para que no crezcan mientras tanto.
 *
 * 3. **Los rellenos sí se prohíben de bloque, sin exenciones.** `bg-emerald-500`,
 *    `bg-emerald-600`, `bg-amber-500`, `bg-amber-600` y los dos verdes de
 *    WhatsApp aclarados a mano (`#25D366`, `#1fb857`) fallan todos contra texto
 *    blanco encima. Las barras de gráfico que los usaban sin texto dentro
 *    (`analitica:265,297`, `tablero:283,305,583`) se oscurecieron al -700 en vez
 *    de exentarlas: así la prohibición no necesita ninguna excepción que alguien
 *    pueda copiar mal, y la barra queda además a 5.36:1 sobre blanco.
 *
 * 4. **Los rellenos de gráfico se miden aparte.** `medirPares` sólo construye
 *    pares texto/fondo, así que una barra de progreso —que es un objeto gráfico
 *    regido por WCAG 1.4.11 a 3:1, no por 1.4.3 a 4.5:1— se le escapa por
 *    completo. Ese eje se declara y se comprueba contra las dos superficies
 *    reales sobre las que se pinta una barra en `/panel`: la tarjeta (blanco) y
 *    el carril que la contiene (`gray-100`, `stone-100`).
 *
 * Quedan fuera, a propósito y por escrito: los carriles de las barras
 * (`bg-gray-100`, `bg-stone-100`), que son contenedores decorativos —la
 * información la lleva el relleno—, y el tocón de "sin datos" de
 * `analitica:266` (`bg-gray-100` a 3 % de altura), donde la ausencia de barra
 * ya comunica el cero y oscurecerlo sugeriría datos que no existen.
 */

const RAIZ = process.cwd()
const PANEL = join(RAIZ, "src", "app", "panel")

const PERIMETRO = archivosTsx(PANEL)

const FUENTES = new Map(PERIMETRO.map((f) => [f, sinComentarios(readFileSync(f, "utf8"))]))

/**
 * Superficies claras que existen de verdad en el perímetro. El test de
 * derivación comprueba cada prohibición contra esta lista, así que si alguien
 * "arregla" una superficie la prohibición deja de sostenerse y el test avisa.
 */
const SUPERFICIES_CLARAS = [
  "white",
  "gray-50",
  "gray-100",
  "gray-200",
  "stone-200",
  "red-50",
  "orange-50",
  "orange-100",
  "emerald-50",
  "emerald-100",
  "slate-100",
]

/**
 * Rellenos que no aguantan 4.5:1 con texto blanco encima. La lista es corta a
 * propósito: son los que de verdad se usaron con texto dentro, no todos los que
 * existen en el tema.
 */
const RELLENO_PROHIBIDO = ["bg-emerald-500", "bg-emerald-600", "bg-amber-500", "bg-amber-600"]

/** El verde de WhatsApp, aclarado a mano, no llega ni a 3:1 con texto blanco. */
const RELLENO_HEX_PROHIBIDO = ["bg-[#25D366]", "bg-[#1fb857]"]

const PROHIBIDOS = [...RELLENO_PROHIBIDO, ...RELLENO_HEX_PROHIBIDO]

/** Lo que se cambió, para exigir que el reemplazo mejore la ratio del original. */
const REEMPLAZOS: Record<string, string> = {
  "bg-emerald-500": "bg-emerald-700",
  "bg-emerald-600": "bg-emerald-700",
  "bg-amber-500": "bg-amber-700",
  "bg-amber-600": "bg-amber-700",
  "bg-[#25D366]": "bg-[#0F7A3D]",
  "bg-[#1fb857]": "bg-[#0B5C2E]",
  "text-red-500": "text-red-700",
  "text-red-600": "text-red-700",
  "text-orange-600": "text-orange-700",
  "text-slate-500": "text-slate-600",
  "text-stone-400": "text-stone-500",
  "text-gray-300": "text-gray-500",
  "text-gray-400": "text-gray-500",
  "text-gray-500": "text-gray-600",
}

/**
 * Trinquete de la deuda de neutros. No se prohíben (decisión 2), pero tampoco
 * pueden crecer. Los valores son los medidos al cerrar CX1; el margen es cero
 * para que un solo `text-gray-400` nuevo se vea.
 */
const DEUDA_NEUTROS: { token: string; declarado: number }[] = [
  { token: "text-gray-300", declarado: 41 },
  { token: "text-gray-400", declarado: 176 },
  { token: "text-stone-400", declarado: 33 },
  { token: "text-stone-500", declarado: 58 },
]

/**
 * Rellenos de objeto gráfico (WCAG 1.4.11, 3:1). Son los rellenos de las barras
 * de `/panel`; `medirPares` no los ve porque no llevan texto dentro. Se
 * comprueban contra la tarjeta y contra los dos carriles reales, y el más
 * ajustado de los tres es el que manda.
 */
const RELLENOS_GRAFICOS = [
  "bg-emerald-700",
  "bg-amber-700",
  "bg-red-500",
  "bg-brand-500",
  "bg-indigo-500",
]

const CARRILES = ["white", "gray-100", "stone-100"]

const medicion = medirPares(PERIMETRO, FUENTES)

const afordancias = afordanciasMuertas(PERIMETRO, FUENTES)

const totalDe = (token: string) =>
  [...FUENTES.values()].reduce((acc, src) => acc + contarToken(src, token), 0)

describe("contraste del panel de negocio (CX1)", () => {
  it("la matemática de color es la de WCAG", () => {
    // Referencias publicadas: negro/blanco = 21, #767676 = 4.54, #949494 = 3.03.
    expect(razon([0, 0, 0], BLANCO)).toBeCloseTo(21, 2)
    expect(razon([118, 118, 118], BLANCO)).toBeCloseTo(4.54, 2)
    expect(razon([148, 148, 148], BLANCO)).toBeCloseTo(3.03, 2)
  })

  it("convierte OKLCH a los hex publicados de Tailwind v4", () => {
    // Si la matriz OKLab o el gamma se rompen, estos valores dejan de coincidir.
    const esperados: Record<string, string> = {
      "emerald-600": "#009966",
      "emerald-700": "#007A55",
      "amber-600": "#E17100",
      "amber-700": "#BB4D00",
      "red-500": "#FB2C36",
      "red-700": "#C10007",
      "stone-100": "#F5F5F4",
      "stone-500": "#79716B",
      "gray-400": "#99A1AF",
      "slate-600": "#45556C",
    }
    for (const [token, hex] of Object.entries(esperados)) {
      const rgb = PALETA.get(token)
      expect(rgb, `${token} no está en la paleta derivada`).toBeDefined()
      const obtenido = `#${rgb!.map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("")}`
      expect(obtenido, `${token} se convirtió mal`).toBe(hex)
    }
  })

  it("la paleta propia se lee de globals.css y no se copia aquí", () => {
    // El `#0E7A0E` del degradado de `apertura:391` es el verde de marca, no un
    // hex suelto: si alguien lo mueve en globals.css, este test lo refleja.
    expect(PALETA.get("brand-500")).toEqual(desdeHex("#0E7A0E"))
    expect(PALETA.has("cream-600")).toBe(true)
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

  it("cada relleno prohibido falla también contra una superficie clara real", () => {
    // Un relleno no sólo carga texto encima: también se apoya en una tarjeta.
    for (const token of RELLENO_PROHIBIDO) {
      const rgb = rgbDeToken(token)
      expect(rgb, `${token} no está en la paleta`).not.toBeNull()
      const peor = SUPERFICIES_CLARAS.map((s) => {
        const fondo = PALETA.get(s)
        expect(fondo, `la superficie ${s} no está en la paleta`).toBeDefined()
        return razon(rgb!.rgb, fondo!)
      }).sort((a, b) => a - b)[0]!
      expect(peor, `${token} pasa 3:1 sobre toda superficie del perímetro`).toBeLessThan(3)
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

  it("no reintroduce ningún relleno prohibido en el perímetro", () => {
    const reincidentes: string[] = []
    for (const [archivo, src] of FUENTES) {
      for (const token of PROHIBIDOS) {
        const n = contarToken(src, token)
        if (n > 0) reincidentes.push(`${relative(RAIZ, archivo)} usa ${token} ×${n}`)
      }
    }
    expect(
      reincidentes,
      `estos rellenos no aguantan el texto blanco que llevan encima; usa el -700 (u -800) correspondiente`,
    ).toEqual([])
  })

  it("ningún par texto/fondo del perímetro baja de su umbral", () => {
    expect(
      medicion.fallos.map(describir),
      "pares por debajo del umbral: 4.5:1 con texto, 3.0:1 sólo gráfico",
    ).toEqual([])
  })

  it("ninguna variante de estado repite el valor que ya tiene la base", () => {
    // `bg-emerald-600 hover:bg-emerald-600` no cambia nada al pasar el ratón.
    // Las variantes de inhibición (`disabled:`) están exentas: ahí repetir la
    // base es justamente lo que se pretende.
    expect(
      afordancias.muertas,
      "una variante de estado que repite el valor base no cambia nada: sube el destino (p. ej. hover:bg-emerald-800)",
    ).toEqual([])
  })

  it("todo token de color del perímetro es medible", () => {
    // Un token que no esté en la paleta se saltaría la medición en silencio.
    expect([...new Set(medicion.sinHex)].sort()).toEqual([])
  })

  it("cada relleno de objeto gráfico llega a 3:1 sobre la tarjeta y sobre el carril", () => {
    // WCAG 1.4.11: una barra de progreso es información, no decoración. El
    // carril es lo que tiene al lado, así que el par que manda es relleno/carril.
    for (const token of RELLENOS_GRAFICOS) {
      const rgb = rgbDeToken(token)
      expect(rgb, `${token} no está en la paleta`).not.toBeNull()
      for (const carril of CARRILES) {
        const fondo = carril === "white" ? BLANCO : PALETA.get(carril)
        expect(fondo, `el carril ${carril} no está en la paleta`).toBeDefined()
        expect(
          razon(rgb!.rgb, fondo!),
          `${token} no llega a 3:1 sobre ${carril}: la barra no se distingue de lo que tiene al lado`,
        ).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it("la deuda de neutros no crece", () => {
    for (const { token, declarado } of DEUDA_NEUTROS) {
      const total = totalDe(token)
      expect(
        total,
        `${token} tiene más deuda que la declarada (${declarado}): el destino correcto depende del fondo, usa el test de pares para elegirlo`,
      ).toBeLessThanOrEqual(declarado)
    }
  })

  it("el perímetro y la medición no se vacían", () => {
    // Canario: si un glob o un filtro se rompe, el contrato pasaría por vacío.
    // Valores medidos al cerrar CX1: 48 archivos, 475 pares, 2 258 elementos con
    // texto y 3 321 literales de `className` inspeccionados. El suelo va al ~90 %
    // para tolerar un refactor legítimo sin dejar pasar un glob roto.
    expect(PERIMETRO.length).toBeGreaterThanOrEqual(43)
    expect(medicion.pares).toBeGreaterThanOrEqual(427)
    expect(medicion.conTexto).toBeGreaterThanOrEqual(2032)
    expect(afordancias.revisadas).toBeGreaterThanOrEqual(2989)
  })
})
