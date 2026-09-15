import { describe, expect, it } from "vitest"
import { AI_CRAWLERS, CITABLE_AI_CRAWLERS } from "./ai-crawlers"
import { BLOG_CATEGORIES } from "./blog-categories"
import { MEXICO_CITIES } from "./cities"
import { computeGeoInventory } from "./geo-assets"
import { GEO_ENGINES, GEO_QUERIES } from "./geo-queries"
import { PREGUNTAS } from "./preguntas"

const inv = computeGeoInventory()

describe("computeGeoInventory", () => {
  it("cuenta los artículos con respuesta rápida sobre el total real", () => {
    expect(inv.postsTotal).toBeGreaterThan(200)
    expect(inv.postsWithQuickAnswer).toBeGreaterThan(0)
    expect(inv.postsWithQuickAnswer).toBeLessThanOrEqual(inv.postsTotal)
  })

  it("cuenta las preguntas curadas reales", () => {
    const grupo = inv.groups.find((g) => g.id === "preguntas")
    expect(grupo?.count).toBe(PREGUNTAS.length)
    expect(grupo?.count).toBeGreaterThan(0)
  })

  it("cuenta los hubs de categoría reales", () => {
    expect(inv.groups.find((g) => g.id === "categorias-blog")?.count).toBe(
      BLOG_CATEGORIES.length
    )
  })

  it("cuenta las ciudades reales", () => {
    expect(inv.groups.find((g) => g.id === "ciudades")?.count).toBe(MEXICO_CITIES.length)
  })

  it("las combinaciones categoría×ciudad cubren el producto cartesiano", () => {
    expect(inv.groups.find((g) => g.id === "datos-clave")?.count).toBe(
      BLOG_CATEGORIES.length * MEXICO_CITIES.length
    )
  })

  it("las piezas con cifras son un subconjunto no vacío de los artículos", () => {
    const conCifras = inv.groups.find((g) => g.id === "fuentes-metodologia")?.count ?? 0
    expect(conCifras).toBeGreaterThan(0)
    expect(conCifras).toBeLessThan(inv.postsTotal)
  })

  it("refleja el panel mensual configurado", () => {
    expect(inv.panelQueries).toBe(GEO_QUERIES.length)
    expect(inv.panelEngines).toBe(GEO_ENGINES.length)
    expect(inv.panelChecks).toBe(GEO_QUERIES.length * GEO_ENGINES.length)
  })

  it("refleja la lista real de crawlers de IA", () => {
    expect(inv.crawlersAllowed).toBe(AI_CRAWLERS.length)
    expect(inv.crawlersCitable).toBe(CITABLE_AI_CRAWLERS.length)
    expect(inv.crawlersCitable).toBeLessThan(inv.crawlersAllowed)
  })

  it("el total suma los grupos y ningún grupo queda en cero", () => {
    expect(inv.totalAssets).toBe(inv.groups.reduce((s, g) => s + g.count, 0))
    for (const g of inv.groups) {
      expect(g.count, `${g.id} en cero`).toBeGreaterThan(0)
    }
  })

  it("cada grupo explica por qué es citable y dónde vive", () => {
    for (const g of inv.groups) {
      expect(g.why.length, `${g.id} sin justificación`).toBeGreaterThan(20)
      expect(g.where.length, `${g.id} sin ruta`).toBeGreaterThan(0)
      expect(g.unit.length, `${g.id} sin unidad`).toBeGreaterThan(0)
    }
  })

  it("los identificadores de grupo son únicos", () => {
    const ids = inv.groups.map((g) => g.id)
    expect(ids.length).toBe(new Set(ids).size)
  })

  it("es determinista entre llamadas", () => {
    expect(computeGeoInventory()).toEqual(inv)
  })
})
