import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  FAMILIAS,
  PALETA,
  archivosTsx,
  medirPares,
  medirPlaceholders,
  rgbDeToken,
  type Par,
} from "./contrast"

/**
 * Contrato del contraste de neutros.
 *
 * La deuda que este archivo cierra venía descrita como «fuera de política, sin
 * contrato que lo mida»: 654 `text-gray-400` y 775 `text-gray-500` en el repo,
 * contados por token. Contar tokens no dice nada — `text-gray-500` sobre blanco
 * da 4.84:1 y es correcto. Lo que importa es el **par texto/fondo**, y medido así
 * había **159 fallos reales**, no una cifra de estilo.
 *
 * El barrido es todo `src/**` (489 `.tsx`) y su veredicto es binario: **cero
 * pares por debajo de AA sin declarar**. No hay lista de tokens prohibidos
 * porque una lista así prohibiría usos legítimos; la política es la medición.
 *
 * Lo único que se declara son las cuatro razones por las que un par medido no es
 * un defecto vivo. Cada una tiene presupuesto exacto: si una regla empieza a
 * tapar más pares de los que declara, el contrato falla y obliga a revisarla.
 */

const RAIZ = process.cwd()

const PERIMETRO = archivosTsx(join(RAIZ, "src"))
const FUENTES = new Map(PERIMETRO.map((archivo) => [archivo, readFileSync(archivo, "utf8")]))

const BARRIDO = medirPares(PERIMETRO, FUENTES)
const PLACEHOLDERS = medirPlaceholders(PERIMETRO, FUENTES)

interface Exencion {
  id: string
  presupuesto: number
  razon: string
  aplica: (p: Par) => boolean
}

/**
 * Las cuatro razones. El orden importa: cada par se atribuye a la **primera**
 * regla que lo reconoce, así que los presupuestos no se solapan.
 */
const EXENCIONES: Exencion[] = [
  {
    id: "control-inactivo-por-variante",
    presupuesto: 3,
    razon:
      "WCAG 1.4.3 excluye el texto de los componentes de interfaz inactivos, y `disabled:` es la marca explícita de ese estado.",
    aplica: (p) => p.variante.includes("disabled"),
  },
  {
    id: "control-inactivo-por-rama",
    presupuesto: 4,
    razon:
      "Mismo caso, pero escrito con ternario en vez de con la variante `disabled:`. La prueba de que es la rama inactiva es la conjunción de un atributo `disabled` y el token `cursor-not-allowed` en la misma rama.",
    aplica: (p) => p.tieneDisabled && p.tokens.includes("cursor-not-allowed"),
  },
  {
    id: "relleno-translucido",
    presupuesto: 20,
    razon:
      "El fondo real de un `bg-*/NN` es el del padre —una foto, un héroe oscuro, un degradado de marca—, y `medirPares` lo compone sobre blanco. El compuesto no es el color que ve el usuario: medirlo da un falso positivo, no un hallazgo.",
    aplica: (p) => (rgbDeToken(p.fondo)?.alfa ?? 1) < 1,
  },
  {
    id: "color-de-ejecucion",
    presupuesto: 2,
    razon:
      "El `className` interpola un valor que llega por props (`${link.color}`). El literal que queda en el código no es el color que se pinta, así que el par medido no existe en pantalla.",
    aplica: (p) => p.tieneInterpolacion,
  },
]

/** Primera regla que reconoce el par, o `null` si es un defecto vivo. */
function clasificar(p: Par): Exencion | null {
  return EXENCIONES.find((e) => e.aplica(p)) ?? null
}

function par(overrides: Partial<Par> = {}): Par {
  return {
    archivo: "src/fixture.tsx",
    linea: 1,
    texto: "text-gray-400",
    fondo: "bg-white",
    variante: "",
    ratio: 2.6,
    umbral: 4.5,
    tokens: ["text-gray-400", "bg-white"],
    tieneDisabled: false,
    tieneInterpolacion: false,
    ...overrides,
  }
}

describe("contraste de neutros", () => {
  it("ningún par por debajo de AA queda sin declarar", () => {
    const vivos = BARRIDO.fallos.filter((p) => clasificar(p) === null)
    const informe = vivos.map(
      (p) =>
        `${p.archivo}:${p.linea} [${p.variante}]${p.texto} sobre ${p.fondo} = ${p.ratio.toFixed(2)}:1 (umbral ${p.umbral})`,
    )
    expect(informe, "sube el escalón de la familia o declara la razón en EXENCIONES").toEqual([])
  })

  it("cada regla de exención se queda dentro de su presupuesto", () => {
    const conteo = new Map(EXENCIONES.map((e) => [e.id, 0]))
    for (const p of BARRIDO.fallos) {
      const e = clasificar(p)
      if (e) conteo.set(e.id, (conteo.get(e.id) ?? 0) + 1)
    }
    const desviaciones: string[] = []
    for (const e of EXENCIONES) {
      const n = conteo.get(e.id) ?? 0
      if (n !== e.presupuesto) {
        desviaciones.push(`${e.id}: ${n} pares exentos, presupuesto ${e.presupuesto}`)
      }
    }
    expect(desviaciones, "ajusta el presupuesto solo tras revisar los pares nuevos").toEqual([])
    expect(BARRIDO.fallos.length).toBe(EXENCIONES.reduce((s, e) => s + e.presupuesto, 0))
  })

  it("ninguna regla de exención queda muerta", () => {
    const sinUsar = EXENCIONES.filter((e) => !BARRIDO.fallos.some((p) => e.aplica(p))).map((e) => e.id)
    expect(sinUsar, "la regla ya no exime nada: bórrala en vez de dejarla como agujero").toEqual([])
  })

  it("el barrido cubre el árbol de producción y resuelve todos los tokens", () => {
    expect(PERIMETRO.length).toBeGreaterThanOrEqual(480)
    expect(BARRIDO.pares).toBeGreaterThanOrEqual(2400)
    expect(BARRIDO.conTexto).toBeGreaterThanOrEqual(10000)
    // Un `text-neutral-500` no resoluble se descartaba en silencio: la familia
    // `neutral` entera quedó fuera de `PALETA` porque Tailwind escribe su tono
    // como `none`, y 13 pares de `wallet-card-view.tsx` no se medían.
    expect(BARRIDO.sinHex, "token no resoluble: falta en PALETA").toEqual([])
  })

  it("toda familia de utilidades tiene al menos una sombra medible", () => {
    const claves = [...PALETA.keys()]
    const sinSombra = FAMILIAS.split("|").filter(
      (familia) => !claves.some((clave) => clave.startsWith(`${familia}-`)),
    )
    expect(sinSombra, "añade la familia a PALETA o quítala de FAMILIAS").toEqual([])
  })

  it("el placeholder se mide como texto y alcanza AA", () => {
    const informe = PLACEHOLDERS.fallos.map(
      (p) => `${p.archivo}:${p.linea} ${p.texto} sobre ${p.fondo} = ${p.ratio.toFixed(2)}:1`,
    )
    expect(informe, "un placeholder es texto: WCAG 1.4.3 le aplica igual").toEqual([])
    // `RE_VARIANTE` no incluye `placeholder`, así que `medirPares` no lo ve.
    expect(PLACEHOLDERS.pares).toBeGreaterThanOrEqual(15)
  })

  it("la clasificación de exenciones reconoce cada caso y respeta los parecidos", () => {
    expect(clasificar(par({ variante: "disabled:" }))?.id).toBe("control-inactivo-por-variante")
    expect(clasificar(par({ variante: "disabled:hover:" }))?.id).toBe("control-inactivo-por-variante")

    const rama = par({ tokens: ["text-[#ccc]", "cursor-not-allowed"], tieneDisabled: true })
    expect(clasificar(rama)?.id).toBe("control-inactivo-por-rama")
    // Sin el atributo `disabled` no hay prueba de que la rama sea inactiva.
    expect(clasificar({ ...rama, tieneDisabled: false })).toBeNull()
    // Con `disabled` pero sin la marca visual, el par es un defecto vivo.
    expect(clasificar({ ...rama, tokens: ["text-[#ccc]"] })).toBeNull()

    expect(clasificar(par({ fondo: "bg-white/10" }))?.id).toBe("relleno-translucido")
    expect(clasificar(par({ fondo: "bg-black/20" }))?.id).toBe("relleno-translucido")
    expect(clasificar(par({ fondo: "bg-white" }))).toBeNull()

    expect(clasificar(par({ tieneInterpolacion: true }))?.id).toBe("color-de-ejecucion")
    expect(clasificar(par())).toBeNull()
  })

  it("el detector de placeholders reconoce un uso plantado y respeta los parecidos", () => {
    const fuentes = new Map([
      [
        "/fake/A.tsx",
        [
          `const a = <input className="placeholder:text-gray-400 bg-white" />`,
          `const b = <input className="placeholder:text-gray-600 bg-white" />`,
          `const c = <input className="placeholder:text-gray-400 bg-[#111]" />`,
          `const d = <input className="placeholder:text-gray-400/50 bg-white" />`,
          `const e = <div className="text-gray-400 bg-white" />`,
          `const f = <input className="sm:placeholder:text-gray-400 bg-white" />`,
        ].join("\n"),
      ],
    ])
    const { pares, fallos } = medirPlaceholders(["/fake/A.tsx"], fuentes)
    const informe = fallos.map((f) => `${f.linea}:${f.texto} sobre ${f.fondo}`)
    // `a` (2.60:1), `d` (el `/50` aclara el gris) y `f` (`sm:` no lo salva)
    // incumplen; `b` (gray-600 sobre blanco) y `c` (sobre fondo oscuro) no.
    expect(informe).toEqual([
      "1:placeholder:text-gray-400 sobre bg-white",
      "4:placeholder:text-gray-400/50 sobre bg-white",
      "6:placeholder:text-gray-400 sobre bg-white",
    ])
    // `e` no es un placeholder: `medirPares` ya lo mide como texto normal.
    expect(pares).toBe(5)
  })
})
