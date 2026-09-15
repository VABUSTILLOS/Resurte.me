import { describe, expect, it } from "vitest"
import { getAllPosts } from "./blog"
import { BLOG_CATEGORIES } from "./blog-categories"
import { MEXICO_CITIES } from "./cities"
import { GEO_ENGINES, GEO_PANEL_SIZE, GEO_QUERIES, getGeoQuery, getGeoTargetPaths } from "./geo-queries"
import { getPregunta } from "./preguntas"

const STATIC_ROUTES = new Set(["/", "/preguntas", "/precios"])

/**
 * Resuelve una ruta objetivo del panel a "existe / no existe" usando las
 * mismas fuentes que el App Router. Un panel que apunta a URLs inexistentes
 * mide fantasmas, así que esto se verifica y no se asume.
 */
function routeExists(path: string): boolean {
  if (STATIC_ROUTES.has(path)) return true

  const blogPost = path.match(/^\/blog\/([^/]+)$/)
  if (blogPost) {
    const slug = blogPost[1]
    if (slug) return getAllPosts().some((p) => p.slug === slug)
    return false
  }

  const blogCategory = path.match(/^\/blog\/categoria\/([^/]+)$/)
  if (blogCategory) {
    const slug = blogCategory[1]
    if (slug) return BLOG_CATEGORIES.some((c) => c.slug === slug)
    return false
  }

  const pregunta = path.match(/^\/preguntas\/([^/]+)$/)
  if (pregunta) {
    const slug = pregunta[1]
    if (slug) return getPregunta(slug) !== undefined
    return false
  }

  const city = path.match(/^\/([^/]+)$/)
  if (city) {
    const slug = city[1]
    if (slug) return MEXICO_CITIES.some((c) => c.slug === slug)
    return false
  }

  return false
}

describe("geo-queries — panel de prompts", () => {
  it("todas las rutas objetivo existen de verdad", () => {
    const rotas = GEO_QUERIES.filter((q) => !routeExists(q.targetPath)).map(
      (q) => `${q.id} → ${q.targetPath}`
    )
    expect(rotas).toEqual([])
  })

  it("cada ruta objetivo apunta a contenido citable, no a un noindex", () => {
    const prohibidas = ["/admin", "/carrito", "/checkout", "/cuenta", "/api"]
    for (const path of getGeoTargetPaths()) {
      for (const p of prohibidas) {
        expect(path.startsWith(p), `${path} no debería ser objetivo del panel`).toBe(false)
      }
    }
  })

  it("los identificadores son únicos", () => {
    const ids = GEO_QUERIES.map((q) => q.id)
    expect(ids.length).toBe(new Set(ids).size)
  })

  it("cada pregunta se lee como pregunta, no como keyword", () => {
    for (const q of GEO_QUERIES) {
      expect(q.prompt.endsWith("?"), q.id).toBe(true)
      expect(q.prompt.length, `${q.id} demasiado corta`).toBeGreaterThan(20)
    }
  })

  it("ningún prompt queda vacío en su intención ni en su ruta", () => {
    for (const q of GEO_QUERIES) {
      expect(q.intent.trim().length, q.id).toBeGreaterThan(0)
      expect(q.targetPath.startsWith("/"), q.id).toBe(true)
    }
  })

  it("cubre al menos 20 preguntas objetivo", () => {
    expect(GEO_QUERIES.length).toBeGreaterThanOrEqual(20)
  })

  it("cubre los cuatro motores del panel", () => {
    expect(GEO_ENGINES.map((e) => e.id)).toEqual(["chatgpt", "perplexity", "gemini", "copilot"])
  })

  it("reparte las preguntas entre varias secciones del sitio", () => {
    const grupos = new Set(
      getGeoTargetPaths().map((p) => p.split("/").filter(Boolean)[0] ?? "home")
    )
    expect(grupos.size).toBeGreaterThanOrEqual(3)
  })

  it("incluye cobertura geográfica y de precios, que son el diferenciador", () => {
    const paths = getGeoTargetPaths()
    expect(paths.some((p) => MEXICO_CITIES.some((c) => p === `/${c.slug}`))).toBe(true)
    expect(paths).toContain("/precios")
  })

  it("el tamaño del panel es preguntas × motores", () => {
    expect(GEO_PANEL_SIZE).toBe(GEO_QUERIES.length * GEO_ENGINES.length)
    expect(GEO_PANEL_SIZE).toBeGreaterThanOrEqual(80)
  })

  it("getGeoQuery encuentra por id y devuelve undefined si no existe", () => {
    expect(getGeoQuery("precio-huevo-mayoreo")?.prompt).toContain("huevo")
    expect(getGeoQuery("no-existe")).toBeUndefined()
  })
})
