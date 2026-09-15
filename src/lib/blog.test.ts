import { describe, expect, it } from "vitest"
import { QUICK_ANSWER_MAX_WORDS } from "./quick-answer"
import { getAllPosts, getPostBySlug, toBlogIndexCard } from "./blog"

/**
 * Guarda de integración del bloque "Respuesta rápida": no basta con que el
 * extractor funcione aislado, la colección completa de posts debe exponer un
 * pasaje citable y dentro de presupuesto. Si alguien agrega un post que arranca
 * con una tabla o una lista, esta prueba lo señala.
 */
describe("respuestaRapida en la colección de blog", () => {
  const posts = getAllPosts()

  it("la colección no está vacía", () => {
    expect(posts.length).toBeGreaterThan(0)
  })

  it("casi todos los posts exponen una respuesta citable", () => {
    const conRespuesta = posts.filter((p) => (p.respuestaRapida ?? "").trim())
    // El umbral deja margen a un post legítimamente no narrativo (una plantilla
    // que abre con un bloque de código) sin dejar pasar una regresión sistémica.
    expect(conRespuesta.length / posts.length).toBeGreaterThanOrEqual(0.95)
  })

  it("ninguna respuesta excede el presupuesto de palabras", () => {
    const excedidas = posts.filter(
      (p) =>
        (p.respuestaRapida ?? "").split(/\s+/).filter(Boolean).length >
        QUICK_ANSWER_MAX_WORDS
    )
    expect(excedidas.map((p) => p.slug)).toEqual([])
  })

  it("la respuesta rápida no repite la descripción del frontmatter", () => {
    const duplicadas = posts.filter(
      (p) => p.respuestaRapida?.trim() === p.description.trim()
    )
    expect(duplicadas.map((p) => p.slug)).toEqual([])
  })

  it("la respuesta es texto plano, sin marcas de Markdown", () => {
    const conMarcas = posts.filter((p) =>
      /[*_`\[\]#]/.test(p.respuestaRapida ?? "")
    )
    expect(conMarcas.map((p) => p.slug)).toEqual([])
  })

  it("getPostBySlug devuelve la misma respuesta que getAllPosts", () => {
    const primero = posts[0]
    expect(primero).toBeDefined()
    const slug = (primero as (typeof posts)[number]).slug
    const individual = getPostBySlug(slug)
    expect(individual?.data.respuestaRapida).toBe(
      (primero as (typeof posts)[number]).respuestaRapida
    )
  })

  /**
   * La sección "Fuentes y metodología" y la tarjeta del índice de precios solo
   * se renderizan en las categorías de costos y proveeduría. Si esas categorías
   * se renombraran, la sección desaparecería de todo el sitio sin que ninguna
   * prueba fallara; esta comprobación ancla la cobertura mínima.
   */
  it("hay piezas de costos y proveeduría donde colgar las fuentes", () => {
    const conCifras = posts.filter((p) =>
      ["costos", "proveeduria"].includes(p.category)
    )
    expect(conCifras.length).toBeGreaterThanOrEqual(40)
  })
})

/**
 * El índice del blog es un componente de cliente: cada prop se serializa en el
 * payload RSC que descarga el navegador. `faq` solo (≈550 KB en 226 posts) era
 * el 70 % de ese payload sin que el índice lo use, así que el índice recibe una
 * proyección. Si alguien vuelve a pasar el post completo —o agrega un campo
 * pesado a `BlogIndexCard`— esta prueba lo detecta antes de que llegue a
 * producción.
 */
describe("proyección del índice del blog", () => {
  const posts = getAllPosts()

  it("conserva los campos que el índice renderiza", () => {
    for (const post of posts) {
      const card = toBlogIndexCard(post)
      expect(card.slug).toBe(post.slug)
      expect(card.title).toBe(post.title)
      expect(card.description).toBe(post.description)
      expect(card.category).toBe(post.category)
      expect(card.contentType).toBe(post.contentType)
      expect(card.date).toBe(post.date)
      expect(card.readingTime).toBe(post.readingTime)
      expect(card.coverImage).toBe(post.coverImage)
      expect(card.coverAlt).toBe(post.coverAlt)
      expect(card.featured).toBe(post.featured)
      // La búsqueda del índice opera sobre los tags.
      expect(card.tags).toEqual(post.tags)
    }
  })

  it("omite los campos pesados que el índice no usa", () => {
    const card = toBlogIndexCard(posts[0] as (typeof posts)[number])
    for (const pesado of ["faq", "respuestaRapida", "cta", "updatedAt", "author", "authorSlug"]) {
      expect(card).not.toHaveProperty(pesado)
    }
  })

  it("el payload proyectado cabe en un presupuesto de 150 KB", () => {
    const serializado = JSON.stringify(posts.map(toBlogIndexCard))
    const completo = JSON.stringify(posts)
    expect(serializado.length).toBeLessThan(150_000)
    // La proyección debe seguir siendo una reducción real, no un espejo.
    expect(serializado.length).toBeLessThan(completo.length / 4)
  })
})
