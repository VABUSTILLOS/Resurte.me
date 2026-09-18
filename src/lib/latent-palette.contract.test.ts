import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  archivosTsx,
  contarToken,
  PALETA,
  PALETA_LATENTE,
  razon,
  rgbDeToken,
  sinComentarios,
  SUPERFICIES_CLARAS,
} from "./contrast"

/**
 * Contrato de la paleta latente.
 *
 * `warm-400` y `cream-600` son tokens propios que no alcanzan AA como texto, pero
 * que sí son legítimos como borde, relleno o icono. El riesgo no es su existencia
 * sino su uso silencioso como color de texto: nadie mide un `placeholder:` al
 * revisar una pantalla. Este contrato convierte ese uso en un fallo de CI.
 *
 * El barrido es todo `src/**` —489 archivos `.tsx`— porque el riesgo no vive en
 * una carpeta: vive en cualquier `className`. No hay `.test.tsx` en el repo, así
 * que no hace falta excluir fixtures.
 */
const RAIZ = process.cwd()

const FUENTES = archivosTsx(join(RAIZ, "src")).map((archivo) => ({
  archivo: archivo.replace(`${RAIZ}/`, ""),
  src: sinComentarios(readFileSync(archivo, "utf8")),
}))

function rgb(util: string): readonly [number, number, number] {
  const medida = rgbDeToken(util)
  if (!medida) throw new Error(`token no medible: ${util}`)
  return medida.rgb
}

/** Archivos y conteo donde aparece `text-<token>` (cualquier variante incluida). */
function usosDe(token: string): string[] {
  const buscado = `text-${token}`
  return FUENTES.filter((f) => contarToken(f.src, buscado) > 0).map(
    (f) => `${f.archivo}: ${contarToken(f.src, buscado)}`,
  )
}

describe("paleta latente", () => {
  it("cada token latente existe en la paleta y es medible", () => {
    for (const { token } of PALETA_LATENTE) {
      expect(PALETA.has(token), `${token} no está en la paleta`).toBe(true)
      expect(rgbDeToken(`text-${token}`), `${token} no es medible`).not.toBeNull()
    }
  })

  it("cada token latente sigue por debajo de AA en todas las superficies claras", () => {
    const alcanzan: string[] = []
    for (const { token } of PALETA_LATENTE) {
      for (const superficie of SUPERFICIES_CLARAS) {
        const r = razon(rgb(`text-${token}`), rgb(`bg-${superficie}`))
        if (r >= 4.5) alcanzan.push(`${token} sobre ${superficie} = ${r.toFixed(2)}:1`)
      }
    }
    expect(alcanzan, "ya alcanza AA; quítalo de PALETA_LATENTE").toEqual([])
  })

  it("cada reemplazo alcanza AA en la superficie donde se aplicó", () => {
    const fallos: string[] = []
    for (const { token, reemplazo, superficie } of PALETA_LATENTE) {
      const r = razon(rgb(`text-${reemplazo}`), rgb(`bg-${superficie}`))
      if (r < 4.5) fallos.push(`${reemplazo} (por ${token}) sobre ${superficie} = ${r.toFixed(2)}:1`)
    }
    expect(fallos).toEqual([])
  })

  it("ningún token latente se usa como texto en las fuentes de producción", () => {
    const fallos = PALETA_LATENTE.flatMap(({ token }) => usosDe(token))
    expect(fallos, "sustituye por el `reemplazo` del registro").toEqual([])
  })

  it("el barrido cubre el árbol de producción", () => {
    expect(FUENTES.length).toBeGreaterThanOrEqual(480)
  })

  it("el detector reconoce un uso plantado y respeta los parecidos", () => {
    const cuenta = (src: string, token: string): number => contarToken(src, token)
    expect(cuenta('className="text-warm-400"', "text-warm-400")).toBe(1)
    expect(cuenta('className="placeholder:text-warm-400"', "text-warm-400")).toBe(1)
    expect(cuenta('className="hover:text-warm-400/50"', "text-warm-400")).toBe(1)
    expect(cuenta('className="md:focus:text-warm-400"', "text-warm-400")).toBe(1)
    expect(cuenta('className="bg-warm-400"', "text-warm-400")).toBe(0)
    expect(cuenta('className="border-warm-400"', "text-warm-400")).toBe(0)
    expect(cuenta('className="text-warm-4000"', "text-warm-400")).toBe(0)
    expect(cuenta('className="text-warm-40"', "text-warm-400")).toBe(0)
    expect(cuenta('className="text-cream-600"', "text-warm-400")).toBe(0)
  })
})
