import { describe, expect, it } from "vitest"
import { searchPosts } from "@/lib/blog-search"
import type { BlogPostMeta } from "@/lib/blog"

function makePost(overrides: Partial<BlogPostMeta>): BlogPostMeta {
  return {
    slug: "post",
    title: "Título",
    description: "Descripción",
    category: "general",
    date: "2026-01-01",
    updatedAt: "2026-01-01",
    author: "Resurte",
    tags: [],
    readingTime: 5,
    ...overrides,
  }
}

const posts: BlogPostMeta[] = [
  makePost({
    slug: "food-cost",
    title: "Food Cost para Restaurantes",
    description: "Cómo calcular el costo de tu menú",
    category: "finanzas",
    tags: ["costeo", "menú"],
  }),
  makePost({
    slug: "mermas",
    title: "Mermas en Cocina",
    description: "Reduce el desperdicio de alimentos",
    category: "operaciones",
    tags: ["mermas"],
  }),
  makePost({
    slug: "marketing-taqueria",
    title: "Marketing para Taquerías",
    description: "Atrae más clientes a tu local",
    category: "marketing",
    tags: ["redes", "promociones"],
  }),
]

describe("searchPosts", () => {
  it("query vacía devuelve todos los posts", () => {
    expect(searchPosts(posts, "")).toHaveLength(posts.length)
    expect(searchPosts(posts, "   ")).toHaveLength(posts.length)
  })

  it("busca en el título (case-insensitive)", () => {
    const result = searchPosts(posts, "FOOD COST")
    expect(result).toHaveLength(1)
    expect(result[0]!.slug).toBe("food-cost")
  })

  it("busca en la descripción", () => {
    const result = searchPosts(posts, "desperdicio")
    expect(result).toHaveLength(1)
    expect(result[0]!.slug).toBe("mermas")
  })

  it("busca en la categoría", () => {
    const result = searchPosts(posts, "marketing")
    expect(result).toHaveLength(1)
    expect(result[0]!.slug).toBe("marketing-taqueria")
  })

  it("busca en los tags", () => {
    const result = searchPosts(posts, "promociones")
    expect(result).toHaveLength(1)
    expect(result[0]!.slug).toBe("marketing-taqueria")
  })

  it("hace trim de la query", () => {
    const result = searchPosts(posts, "  mermas  ")
    expect(result).toHaveLength(1)
  })

  it("sin coincidencias devuelve []", () => {
    expect(searchPosts(posts, "no-existe")).toEqual([])
  })
})
