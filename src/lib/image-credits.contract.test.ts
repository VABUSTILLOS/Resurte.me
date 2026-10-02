import { describe, expect, it } from "vitest"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { IMAGE_CREDITS, exigeAtribucion } from "@/content/image-credits"

/**
 * Contrato de la atribución de las fotos de producto.
 *
 * CONTEXTO ACTUAL (oct-2026)
 * --------------------------
 * Las 22 fotos Wikimedia de 00194 fueron reemplazadas por imágenes generadas
 * en casa (migraciones 00204, 00206, 00207 y 00210) y **ya no queda ninguna
 * foto que exija atribución**: `IMAGE_CREDITS` está vacío a propósito. La
 * página `/creditos` lo explica y vuelve a listar si algún día entra material
 * con licencia.
 *
 * Lo que el contrato sigue vigilando:
 *
 *   1. **Que no vuelva una foto sin acreditar.** Si reaparece un `-foto.webp`
 *      en `public/images/products/ab-foods/`, tiene que tener entrada.
 *   2. **Que no queden entradas muertas.** El registro no puede acreditar
 *      archivos que no existen.
 *   3. **Atribución completa.** Si hay entradas con licencia que la exige,
 *      traen autor y enlace a la licencia.
 *   4. **Desincronizar el SQL del código.** La migración `00194` es
 *      histórica y no se reescribe; todas sus rutas quedaron excluidas en
 *      `FOTOS_REEMPLAZADAS_POR_IA`. Si alguien agrega una foto a 00194, el
 *      test exige su crédito.
 *
 * Sin base de datos: el contrato lee archivos, igual que
 * `db-function-grants.contract.test.ts`.
 */

const REPO = process.cwd()
const DIR_FOTOS = join(REPO, "public", "images", "products", "ab-foods")
const MIGRACION = join(REPO, "supabase", "migrations", "00194_ab_foods_fotos_reales.sql")

/** Archivos `*-foto.webp` publicados. */
function fotosPublicadas(): string[] {
  return readdirSync(DIR_FOTOS)
    .filter((f) => f.endsWith("-foto.webp"))
    .sort()
}

/**
 * Fotos de ab-foods que la migración 00194 publicó pero que ya no llevan
 * crédito: el archivo del aguacate chunky contenía AJOS (descarga mal
 * rotulada; el crédito a Jon Sullivan era incorrecto) y las migraciones 00204,
 * 00206, 00207 y 00210 reemplazaron las 22 fotos Wikimedia por imágenes
 * generadas en casa en /images/products/ai/, que no requieren atribución.
 * 00194 es histórica y no se reescribe; se excluyen aquí.
 */
const FOTOS_REEMPLAZADAS_POR_IA = new Set([
  "/images/products/ab-foods/aguacate-chunky-caja-7264kg-foto.webp",
  "/images/products/ab-foods/dedos-queso-bolsa-181kg-foto.webp",
  "/images/products/ab-foods/papa-conquest-delivery-teja-65-caja-1361kg-foto.webp",
  "/images/products/ab-foods/papa-curly-savory-caja-1361kg-foto.webp",
  "/images/products/ab-foods/papa-dulce-recta-38-caja-680kg-foto.webp",
  "/images/products/ab-foods/papa-gajo-10-cut-65-caja-1361kg-foto.webp",
  "/images/products/ab-foods/papa-hash-brown-patty-caja-952kg-foto.webp",
  "/images/products/ab-foods/papa-ondulada-38-payette-caja-1361kg-foto.webp",
  "/images/products/ab-foods/papa-rallada-hash-brown-caja-816kg-foto.webp",
  "/images/products/ab-foods/papa-rejilla-savory-caja-1224kg-foto.webp",
  "/images/products/ab-foods/queso-crema-krol-barra-136kg-foto.webp",
  "/images/products/ab-foods/queso-crema-reny-picot-caja-8kg-foto.webp",
  "/images/products/ab-foods/queso-crema-reny-picot-136kg-foto.webp",
  // Lote 3 (00207): hamburguesas, camarones y tender de Pilgrim's.
  "/images/products/ab-foods/camaron-4150-foto.webp",
  "/images/products/ab-foods/camaron-cocido-100200-foto.webp",
  "/images/products/ab-foods/camaron-cocido-4150-foto.webp",
  "/images/products/ab-foods/hamburguesa-bm-arrachera-caja-30pzs-foto.webp",
  "/images/products/ab-foods/hamburguesa-bm-mezquite-caja-30pzs-foto.webp",
  "/images/products/ab-foods/hamburguesa-bm-sirloin-caja-30pzs-foto.webp",
  "/images/products/ab-foods/hamburguesa-empanizada-pilgrims-foto.webp",
  "/images/products/ab-foods/tender-empanizado-pilgrims-foto.webp",
  // Última (00210): cordon bleu mini. Con esta el registro queda vacío.
  "/images/products/ab-foods/cordon-bleu-mini-foto.webp",
])

describe("contrato de créditos de las fotos de AB Foods", () => {
  it("ya no quedan fotos Wikimedia publicadas ni créditos", () => {
    expect(fotosPublicadas(), "reaparecieron fotos -foto.webp en ab-foods").toEqual([])
    expect(IMAGE_CREDITS.length, "el registro debería estar vacío").toBe(0)
  })

  it("cada foto publicada tiene crédito", () => {
    const acreditadas = new Set(IMAGE_CREDITS.map((c) => c.archivo.split("/").pop()))
    const sinCredito = fotosPublicadas().filter((f) => !acreditadas.has(f))
    expect(sinCredito, `fotos sin crédito: ${sinCredito.join(", ")}`).toEqual([])
  })

  it("ninguna entrada es muerta: el archivo acreditado existe", () => {
    const faltan = IMAGE_CREDITS.filter((c) => !existsSync(join(REPO, "public", c.archivo))).map(
      (c) => c.archivo
    )
    expect(faltan, `el registro acredita archivos que no existen: ${faltan.join(", ")}`).toEqual([])
  })

  it("cada crédito apunta a Commons y trae autor", () => {
    const flojos = IMAGE_CREDITS.filter(
      (c) =>
        !c.origenUrl.startsWith("https://commons.wikimedia.org/") ||
        !c.tituloCommons.startsWith("File:") ||
        c.autor.trim().length === 0
    ).map((c) => c.slug)
    expect(flojos, `créditos sin autor o sin origen en Commons: ${flojos.join(", ")}`).toEqual([])
  })

  it("ninguna licencia que exija atribución queda a medias", () => {
    // Una CC BY sin enlace a la licencia no cumple: la licencia obliga a
    // enlazarla para que quien la lea pueda conocer sus términos.
    const aMedias = IMAGE_CREDITS.filter(
      (c) => exigeAtribucion(c.licencia) && (!c.licenciaUrl || c.autor.trim().length === 0)
    ).map((c) => `${c.slug} (${c.licencia})`)
    expect(aMedias, `atribución incompleta: ${aMedias.join(", ")}`).toEqual([])
  })

  it("si algún día vuelven entradas, ninguna licencia que exija atribución queda a medias", () => {
    // Una CC BY sin enlace a la licencia no cumple: la licencia obliga a
    // enlazarla para que quien la lea pueda conocer sus términos. Con el
    // registro vacío la prueba pasa en vacío a propósito.
    const aMedias = IMAGE_CREDITS.filter(
      (c) => exigeAtribucion(c.licencia) && (!c.licenciaUrl || c.autor.trim().length === 0)
    ).map((c) => `${c.slug} (${c.licencia})`)
    expect(aMedias, `atribución incompleta: ${aMedias.join(", ")}`).toEqual([])
  })

  it("la migración 00194 lista exactamente las mismas rutas que el registro", () => {
    const sql = readFileSync(MIGRACION, "utf8")
    const enSql = [...sql.matchAll(/'(\/images\/products\/ab-foods\/[^']+)'/g)]
      .map((m) => m[1])
      .filter((r): r is string => typeof r === "string" && !FOTOS_REEMPLAZADAS_POR_IA.has(r))
      .sort()
    const enRegistro = IMAGE_CREDITS.map((c) => c.archivo).sort()
    expect(enSql).toEqual(enRegistro)
  })

  it("las fotos nuevas no reutilizan el nombre de las fichas de marca", () => {
    // `next.config.ts` sirve `/images/**` con `immutable, max-age=31536000`:
    // reutilizar `<slug>.webp` dejaría a los navegadores mostrando la ficha
    // vieja durante un año. Por eso todas llevan el sufijo `-foto`.
    const sinSufijo = fotosPublicadas().filter((f) => !f.endsWith("-foto.webp"))
    expect(sinSufijo, `estos nombres pisarían una ficha cacheada: ${sinSufijo.join(", ")}`).toEqual(
      []
    )
  })
})
