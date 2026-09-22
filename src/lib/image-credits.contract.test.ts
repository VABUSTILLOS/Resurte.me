import { describe, expect, it } from "vitest"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { IMAGE_CREDITS, exigeAtribucion } from "@/content/image-credits"

/**
 * Contrato de la atribución de las fotos de producto.
 *
 * POR QUÉ ESTO NO ES UN DETALLE DE CORTESÍA
 * -----------------------------------------
 * **17 de las 22 fotos de AB Foods son CC BY o CC BY-SA**, y esas licencias
 * condicionan el uso a atribuir. Una CC BY sin atribuir no es una licencia: es
 * una infracción, y en un catálogo comercial no es un riesgo teórico.
 *
 * La atribución tiene dos mitades y las dos tienen que existir:
 *
 *   1. **Visible** — `/creditos` (`src/app/creditos/page.tsx`) lista autor,
 *      licencia y enlace al archivo original.
 *   2. **Verificable** — este registro. Una página puede quedarse sin una foto
 *      por un `filter` mal puesto y nadie lo nota; un test sí.
 *
 * El contrato vigila cuatro formas de romperlo:
 *
 *   1. **Publicar una foto sin entrada.** Se descubre un `.webp` en
 *      `public/images/products/ab-foods/` que nadie acredita.
 *   2. **Dejar una entrada muerta.** El registro apunta a un archivo que ya no
 *      existe (se renombró, se borró): la página mostraría un crédito falso.
 *   3. **Atribuir a medias.** Licencia que exige atribución con autor vacío o
 *      sin enlace a la licencia.
 *   4. **Desincronizar el SQL del código.** La migración `00194` es la que
 *      reapunta `products.image_url`; si lista archivos distintos de los que el
 *      registro acredita, la tienda sirve una foto que nadie acredita.
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

describe("contrato de créditos de las fotos de AB Foods", () => {
  it("hay 22 fotos publicadas y 22 créditos", () => {
    expect(fotosPublicadas().length, "faltan fotos en public/images/products/ab-foods").toBe(22)
    expect(IMAGE_CREDITS.length, "el registro no cubre las 22 fotos").toBe(22)
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

  it("hay al menos una licencia que exige atribución (el contrato no es vacío)", () => {
    // Si algún día todas las fotos fueran CC0, esta prueba avisa de que el
    // contrato dejó de comprobar lo que dice comprobar.
    const conAtribucion = IMAGE_CREDITS.filter((c) => exigeAtribucion(c.licencia))
    expect(conAtribucion.length).toBeGreaterThan(0)
  })

  it("la migración 00194 lista exactamente las mismas rutas que el registro", () => {
    const sql = readFileSync(MIGRACION, "utf8")
    const enSql = [...sql.matchAll(/'(\/images\/products\/ab-foods\/[^']+)'/g)]
      .map((m) => m[1])
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
