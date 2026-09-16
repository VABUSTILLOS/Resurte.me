import { describe, it, expect } from "vitest"

import {
  buildProductIndex,
  computeAffinity,
  matchProduct,
  normalizeIngredient,
  type AffinityPairRow,
  type AffinityProduct,
} from "@/lib/ingredient-affinity"
import { getAllRecipes } from "@/lib/recipes"

const p = (id: number, name: string): AffinityProduct => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
})

/** Índice seguro para las aserciones: `noUncheckedIndexedAccess` está activo. */
const at = <T,>(list: readonly T[], i: number): T => {
  const item = list[i]
  if (item === undefined) throw new Error(`Índice ${i} fuera de rango`)
  return item
}

/** Igual que `Array.find` pero falla el test en vez de devolver `undefined`. */
const need = <T,>(list: readonly T[], predicate: (item: T) => boolean, label: string): T => {
  const found = list.find(predicate)
  if (found === undefined) throw new Error(`No se encontró ${label}`)
  return found
}

describe("normalizeIngredient", () => {
  it("quita la presentación numérica", () => {
    expect(normalizeIngredient("Pimienta Negra Molida 100g")).toBe("pimienta negra")
    expect(normalizeIngredient("Salsa de Soya 500ml")).toBe("salsa de soya")
    expect(normalizeIngredient("Carne Molida 80/20")).toBe("carne 80/20")
  })

  it("quita calificadores de estado o preparación", () => {
    expect(normalizeIngredient("Jitomate fresco")).toBe("jitomate")
    expect(normalizeIngredient("Ajo entero")).toBe("ajo")
    expect(normalizeIngredient("Chile seco")).toBe("chile")
  })

  it("no colapsa productos distintos que solo comparten prefijo", () => {
    expect(normalizeIngredient("Jitomate Bola")).not.toBe(
      normalizeIngredient("Jitomate Saladet")
    )
  })
})

describe("matchProduct", () => {
  const index = buildProductIndex([
    p(1, "Cebolla Blanca"),
    p(2, "Jitomate Bola"),
    p(3, "Jitomate Saladet"),
    p(4, "Pimienta Negra Molida 100g"),
    p(5, "Limón Agrio"),
  ])

  it("matchea exacto tras normalizar mayúsculas y acentos", () => {
    expect(matchProduct("cebolla blanca", index)?.id).toBe(1)
    expect(matchProduct("Limón agrio", index)?.id).toBe(5)
  })

  it("matchea ignorando unidades y calificadores", () => {
    expect(matchProduct("Pimienta negra", index)?.id).toBe(4)
    expect(matchProduct("Cebolla blanca fresca", index)?.id).toBe(1)
  })

  it("matchea por prefijo en ambas direcciones", () => {
    expect(matchProduct("jitomate", index)?.id).toBe(2)
    expect(matchProduct("jitomate bola grande", index)?.id).toBe(2)
  })

  it("devuelve null cuando el ingrediente no está en el catálogo", () => {
    expect(matchProduct("Ajonjolí", index)).toBeNull()
    expect(matchProduct("Fideos de arroz", index)).toBeNull()
    expect(matchProduct("", index)).toBeNull()
  })

  it("es determinista con catálogos permutados", () => {
    const reversed = buildProductIndex([
      p(5, "Limón Agrio"),
      p(4, "Pimienta Negra Molida 100g"),
      p(3, "Jitomate Saladet"),
      p(2, "Jitomate Bola"),
      p(1, "Cebolla Blanca"),
    ])
    expect(matchProduct("jitomate", index)?.id).toBe(
      matchProduct("jitomate", reversed)?.id
    )
  })
})

describe("computeAffinity", () => {
  const catalog = [
    p(1, "Bistec de Res"),
    p(2, "Cebolla Blanca"),
    p(3, "Chile Serrano"),
    p(4, "Jitomate Bola"),
    p(5, "Limón Agrio"),
    p(6, "Cilantro"),
  ]

  const recipes = {
    tacos: [
      {
        name: "Tacos al Pastor",
        ingredients: ["Bistec de Res", "Cebolla Blanca", "Chile Serrano", "Cilantro"],
      },
      {
        name: "Salsa Verde",
        ingredients: ["Chile Serrano", "Jitomate Bola", "Cebolla Blanca", "Cilantro"],
      },
    ],
  }

  const base = {
    allProducts: catalog,
    recipes,
    curatedPairs: [] as AffinityPairRow[],
    limit: 10,
  }

  it("devuelve vacío sin carrito", () => {
    expect(computeAffinity({ ...base, cartProducts: [] })).toEqual([])
    expect(
      computeAffinity({ ...base, cartProducts: [at(catalog, 0)], limit: 0 })
    ).toEqual([])
  })

  it("sugiere los otros ingredientes de la receta", () => {
    const result = computeAffinity({
      ...base,
      cartProducts: [at(catalog, 0), at(catalog, 1)], // Bistec + Cebolla
    })
    const ids = result.map((c) => c.productId)
    expect(ids).toContain(3) // Chile Serrano
    expect(ids).toContain(6) // Cilantro
    const chile = need(result, (c) => c.productId === 3, "producto 3")
    expect(chile.reason).toBe("Para tu receta de Tacos al Pastor")
    expect(chile.kind).toBe("recipe")
  })

  it("nunca sugiere un producto que ya está en el carrito", () => {
    const result = computeAffinity({
      ...base,
      cartProducts: [at(catalog, 0), at(catalog, 1)],
    })
    expect(result.map((c) => c.productId)).not.toContain(1)
    expect(result.map((c) => c.productId)).not.toContain(2)
  })

  it("ordena por número de productos del carrito que completa", () => {
    // Carrito = Bistec (1) + Cebolla (2).
    //   Tacos al Pastor → Chile y Cilantro reciben 2 fuentes (1 y 2)
    //   Salsa Verde     → Chile y Cilantro reciben 2 fuentes (2 + ya contaba 1)
    //                     Jitomate solo recibe 1 fuente (2)
    const result = computeAffinity({
      ...base,
      cartProducts: [at(catalog, 0), at(catalog, 1)], // Bistec + Cebolla
    })
    const chile = need(result, (c) => c.productId === 3, "producto 3")
    const cilantro = need(result, (c) => c.productId === 6, "producto 6")
    const jitomate = need(result, (c) => c.productId === 4, "producto 4")

    expect(chile.score).toBe(2)
    expect(cilantro.score).toBe(2)
    expect(jitomate.score).toBe(1)
    // El que solo completa un ingrediente queda al final.
    expect(at(result, result.length - 1).productId).toBe(4)
    expect(at(result, 0).score).toBe(2)
  })

  it("aplica los pares curados y su peso como desempate", () => {
    const curatedPairs: AffinityPairRow[] = [
      { source_product_id: 1, target_product_id: 5, kind: "curated", weight: 5 },
    ]
    const result = computeAffinity({
      ...base,
      curatedPairs,
      cartProducts: [at(catalog, 0)], // Bistec de Res
    })
    const limon = need(result, (c) => c.productId === 5, "producto 5")
    expect(limon.kind).toBe("curated")
    expect(limon.weight).toBe(5)
    expect(limon.reason).toBe("Ideal con Bistec de Res")
  })

  it("cubre con un par curado un ingrediente ausente del catálogo", () => {
    // "Ajonjolí" no existe en el catálogo (uno de los 11 residuos medidos):
    // el recetario no puede sugerirlo, el par curado sí.
    const curatedPairs: AffinityPairRow[] = [
      { source_product_id: 1, target_product_id: 5, kind: "curated", weight: 1 },
    ]
    const withRecipe = computeAffinity({
      ...base,
      cartProducts: [at(catalog, 0)],
    })
    expect(withRecipe.map((c) => c.productId)).not.toContain(5)

    const withCurated = computeAffinity({
      ...base,
      curatedPairs,
      cartProducts: [at(catalog, 0)],
    })
    expect(withCurated.map((c) => c.productId)).toContain(5)
  })

  it("el par curado gana la razón sobre el recetario", () => {
    const curatedPairs: AffinityPairRow[] = [
      { source_product_id: 2, target_product_id: 6, kind: "curated", weight: 1 },
    ]
    const result = computeAffinity({
      ...base,
      curatedPairs,
      cartProducts: [at(catalog, 1)], // Cebolla Blanca
    })
    const cilantro = need(result, (c) => c.productId === 6, "producto 6")
    expect(cilantro.kind).toBe("curated")
    expect(cilantro.reason).toBe("Ideal con Cebolla Blanca")
  })

  it("respeta el límite y el orden es estable", () => {
    const cart = [at(catalog, 0), at(catalog, 1)]
    const first = computeAffinity({ ...base, cartProducts: cart, limit: 2 })
    const second = computeAffinity({ ...base, cartProducts: cart, limit: 2 })
    expect(first).toHaveLength(2)
    expect(first).toEqual(second)
  })
})

describe("computeAffinity contra el recetario real", () => {
  it("sugiere el resto de una receta real usando solo el catálogo derivado de ella", () => {
    const recipes = getAllRecipes()
    const collectionSlug = at(Object.keys(recipes), 0)
    const recipe = at(recipes[collectionSlug ?? ""] ?? [], 0)
    expect(recipe.ingredients.length).toBeGreaterThan(2)

    // Catálogo sintético: un producto por ingrediente único del recetario.
    const byKey = new Map<string, AffinityProduct>()
    for (const list of Object.values(recipes)) {
      for (const r of list) {
        for (const ingredient of r.ingredients) {
          const key = normalizeIngredient(ingredient)
          if (key && !byKey.has(key)) {
            byKey.set(key, p(byKey.size + 1, ingredient))
          }
        }
      }
    }

    const cartProducts = recipe.ingredients
      .slice(0, 2)
      .map((i) => byKey.get(normalizeIngredient(i))!)
      .filter(Boolean)

    const result = computeAffinity({
      cartProducts,
      allProducts: Array.from(byKey.values()),
      recipes,
      curatedPairs: [],
      limit: 50,
    })

    const expected = recipe.ingredients
      .slice(2)
      .map((i) => byKey.get(normalizeIngredient(i))?.id)
      .filter((id): id is number => typeof id === "number")

    expect(expected.length).toBeGreaterThan(0)
    for (const id of expected) {
      expect(result.map((c) => c.productId)).toContain(id)
    }
  })
})
