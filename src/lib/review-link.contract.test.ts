import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Test de regresión del enlace de calificación que se envía por WhatsApp.
 *
 * Contexto: `rating_link` apunta a `https://resurte.me/calificar`, pero la
 * página `/calificar` no existía en producción (404) y nadie lo detectó porque
 * el literal está duplicado en dos archivos sin ninguna prueba que lo ancle.
 *
 * Este test ata el literal a la realidad del filesystem: si el enlace apunta a
 * una ruta sin `page.tsx`, falla.
 */

const REPO = process.cwd()

/** Los dos (únicos) sitios donde se declara el enlace de calificación. */
const RATING_LINK_SOURCES = [
  "src/app/admin/whatsapp/automations/page.tsx",
  "src/app/api/whatsapp/automations/route.ts",
]

const RATING_LINK_RE = /rating_link\s*:\s*["'`]([^"'`]+)["'`]/g

function readSource(relPath: string): string {
  return readFileSync(join(REPO, relPath), "utf8")
}

function extractRatingLinks(source: string): string[] {
  return [...source.matchAll(RATING_LINK_RE)].map((m) => m[1] ?? "")
}

/** `/calificar` → `src/app/calificar/page.tsx` (App Router). */
function appPagePathFor(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean)
  return join(REPO, "src", "app", ...segments, "page.tsx")
}

describe("contrato del enlace de calificación por WhatsApp", () => {
  const links = RATING_LINK_SOURCES.flatMap((file) =>
    extractRatingLinks(readSource(file)).map((url) => ({ file, url }))
  )

  it("ambos sitios declaran rating_link", () => {
    // Si alguien mueve o renombra el literal, el test debe fallar en vez de
    // quedarse sin nada que comparar y pasar en vacío.
    for (const file of RATING_LINK_SOURCES) {
      const found = links.filter((l) => l.file === file)
      expect(found.length, `no se encontró rating_link en ${file}`).toBeGreaterThan(0)
    }
  })

  it("los dos sitios apuntan exactamente a la misma URL", () => {
    const unique = [...new Set(links.map((l) => l.url))]
    expect(unique).toHaveLength(1)
  })

  it("el enlace usa https y el dominio de producción", () => {
    for (const { file, url } of links) {
      const parsed = new URL(url)
      expect(parsed.protocol, `${file}: debe ser https`).toBe("https:")
      expect(parsed.host, `${file}: dominio inesperado`).toBe("resurte.me")
      // Nada de localhost ni previews de Vercel en un enlace que va al cliente
      expect(parsed.host).not.toMatch(/localhost|vercel\.app/)
    }
  })

  it("el enlace apunta a una página que existe de verdad", () => {
    for (const { file, url } of links) {
      const pagePath = appPagePathFor(new URL(url).pathname)
      expect(existsSync(pagePath), `${file} apunta a una ruta sin page.tsx: ${pagePath}`).toBe(true)
    }
  })

  it("la página de calificación depende de /api/reviews, que también existe", () => {
    for (const { url } of links) {
      const pagePath = appPagePathFor(new URL(url).pathname)
      const page = readFileSync(pagePath, "utf8")
      // La página delega en el cliente, que consulta la API de reseñas.
      expect(page).toMatch(/calificar-client|api\/reviews/)
    }

    expect(existsSync(join(REPO, "src", "app", "api", "reviews", "route.ts"))).toBe(true)
  })

  it("la página no se indexa (URL con token de pedido)", () => {
    const page = readFileSync(appPagePathFor("/calificar"), "utf8")
    // Metadata API de Next: robots: { index: false, follow: false }
    expect(page).toMatch(/robots\s*:/)
    expect(page).toMatch(/index:\s*false/)
  })
})
