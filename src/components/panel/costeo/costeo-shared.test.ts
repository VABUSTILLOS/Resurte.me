import { describe, expect, it } from "vitest"
import {
  CATEGORY_EMOJI,
  DEFAULT_INGREDIENTS,
  DISH_CATEGORIES,
  MOCK_INGREDIENTS,
  PRESET_RECIPES,
} from "./costeo-shared"

const CLAVES_CATEGORIA = new Set(DISH_CATEGORIES.map((c) => c.key))
const SLUGS_INSUMOS = Object.keys(MOCK_INGREDIENTS)
const SLUGS_RECETAS = Object.keys(PRESET_RECIPES)

describe("detectores del contrato de catálogo", () => {
  // Probamos los detectores contra datos sintéticos antes de mirar el catálogo
  // real: si el detector no sabe detectar, el test pasaría en vacío.
  const sinEmoji = (claves: string[], emojis: Record<string, string>) => claves.filter((k) => !emojis[k])
  const soloEnUno = (a: string[], b: string[]) => a.filter((k) => !b.includes(k))

  it("detecta una categoría sin emoji", () => {
    expect(sinEmoji(["a", "b"], { a: "🥗" })).toEqual(["b"])
    expect(sinEmoji(["a"], { a: "🥗" })).toEqual([])
  })

  it("detecta un slug que solo existe en un lado", () => {
    expect(soloEnUno(["x", "y"], ["y"])).toEqual(["x"])
    expect(soloEnUno(["x"], ["x"])).toEqual([])
  })
})

describe("costeo — categorías de platillo", () => {
  it("hay categorías que revisar (canario: no pasar en vacío)", () => {
    expect(DISH_CATEGORIES.length).toBeGreaterThanOrEqual(5)
    expect(SLUGS_RECETAS.length).toBeGreaterThanOrEqual(10)
  })

  it("toda categoría tiene emoji: el fallback 🍽️ nunca debería verse", () => {
    // RecipeCard y MenuDigitalView usan `CATEGORY_EMOJI[x] || "🍽️"`. Un emoji
    // faltante no rompe nada, solo degrada la UI en silencio: por eso se fija.
    expect(Object.keys(CATEGORY_EMOJI).filter((k) => !CLAVES_CATEGORIA.has(k))).toEqual([])
    expect(DISH_CATEGORIES.map((c) => c.key).filter((k) => !CATEGORY_EMOJI[k])).toEqual([])
  })

  it("cada categoría tiene etiqueta y color, sin claves repetidas", () => {
    expect(new Set(DISH_CATEGORIES.map((c) => c.key)).size).toBe(DISH_CATEGORIES.length)
    for (const c of DISH_CATEGORIES) {
      expect(c.label.length, c.key).toBeGreaterThan(0)
      expect(c.color.length, c.key).toBeGreaterThan(0)
    }
  })

  it("'todas' es un filtro, no una categoría asignable: va primero", () => {
    expect(DISH_CATEGORIES[0]?.key).toBe("todas")
    // Ninguna receta del catálogo puede pertenecer al pseudo-filtro.
    for (const recetas of Object.values(PRESET_RECIPES)) {
      for (const r of recetas) expect(r.category).not.toBe("todas")
    }
  })

  it("toda categoría usada en las recetas existe en la lista de categorías", () => {
    const usadas = new Set(Object.values(PRESET_RECIPES).flat().map((r) => r.category))
    const desconocidas = [...usadas].filter((c) => !CLAVES_CATEGORIA.has(c))
    // Una categoría desconocida se filtraría fuera del menú digital y mostraría
    // el slug crudo en la tarjeta de receta.
    expect(desconocidas).toEqual([])
  })
})

describe("costeo — insumos por colección", () => {
  it("cada colección con recetas trae también insumos", () => {
    // Si un slug existe en PRESET_RECIPES pero no en MOCK_INGREDIENTS, la página
    // cae a DEFAULT_INGREDIENTS, cuyos precios son 0: el platillo costearía $0
    // sin avisar. Esta es la invariante que protege el cálculo de dinero.
    expect(SLUGS_INSUMOS.filter((k) => !SLUGS_RECETAS.includes(k))).toEqual([])
    expect(SLUGS_RECETAS.filter((k) => !SLUGS_INSUMOS.includes(k))).toEqual([])
  })

  it("ningún insumo de colección tiene precio cero", () => {
    const sinPrecio: string[] = []
    for (const [slug, opciones] of Object.entries(MOCK_INGREDIENTS)) {
      for (const o of opciones) if (!(o.price > 0)) sinPrecio.push(`${slug}/${o.name}`)
    }
    expect(sinPrecio).toEqual([])
  })

  it("todo insumo tiene nombre y unidad", () => {
    for (const [slug, opciones] of Object.entries(MOCK_INGREDIENTS)) {
      expect(opciones.length, slug).toBeGreaterThan(0)
      for (const o of opciones) {
        expect(o.name.length, slug).toBeGreaterThan(0)
        expect(o.unit.length, `${slug}/${o.name}`).toBeGreaterThan(0)
      }
    }
  })

  it("los insumos por defecto son placeholders a propósito: precio 0", () => {
    // No es un descuido: DEFAULT_INGREDIENTS es lo que se muestra cuando el
    // restaurante aún no eligió colección. El usuario captura el precio.
    expect(DEFAULT_INGREDIENTS.length).toBeGreaterThan(0)
    for (const o of DEFAULT_INGREDIENTS) expect(o.price).toBe(0)
  })
})

describe("costeo — recetas preestablecidas", () => {
  it("toda receta rinde al menos una porción (se divide entre porciones)", () => {
    const malas: string[] = []
    for (const [slug, recetas] of Object.entries(PRESET_RECIPES)) {
      for (const r of recetas) if (!(r.portions > 0)) malas.push(`${slug}/${r.name}`)
    }
    expect(malas).toEqual([])
  })

  it("toda receta tiene ingredientes con cantidad y unidad utilizables", () => {
    const malos: string[] = []
    for (const [slug, recetas] of Object.entries(PRESET_RECIPES)) {
      for (const r of recetas) {
        expect(r.name.length, slug).toBeGreaterThan(0)
        expect(r.id.length, `${slug}/${r.name}`).toBeGreaterThan(0)
        if (r.ingredients.length === 0) malos.push(`${slug}/${r.name}: sin ingredientes`)
        for (const i of r.ingredients) {
          if (!(i.quantity > 0)) malos.push(`${slug}/${r.name}/${i.name}: cantidad ${i.quantity}`)
          if (!i.unit) malos.push(`${slug}/${r.name}/${i.name}: sin unidad`)
        }
      }
    }
    expect(malos).toEqual([])
  })

  it("los ids de receta no se repiten dentro de una colección", () => {
    for (const [slug, recetas] of Object.entries(PRESET_RECIPES)) {
      const ids = recetas.map((r) => r.id)
      expect(new Set(ids).size, slug).toBe(ids.length)
    }
  })

  it("los nombres de receta no se repiten dentro de una colección", () => {
    for (const [slug, recetas] of Object.entries(PRESET_RECIPES)) {
      const nombres = recetas.map((r) => r.name)
      expect(new Set(nombres).size, slug).toBe(nombres.length)
    }
  })
})
