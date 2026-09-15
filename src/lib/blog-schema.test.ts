import { describe, expect, it } from "vitest"
import type { BlogPostMeta } from "./blog"
import { getPostBySlug, getAllPosts } from "./blog"
import { extractHeadings } from "./heading-slug"
import { ORGANIZATION_ID, PRIMARY_AUTHOR, SITE_URL } from "./author"
import {
  getBlogIndexSchema,
  getBlogPostingSchema,
  getBlogBreadcrumbSchema,
  getHowToSchema,
  getSpeakableSpec,
  getFAQSchema,
} from "./blog-schema"
import { BLOG_CATEGORIES } from "./blog-categories"

// ============================================================
// Consolidación de entidad en el JSON-LD del blog
// ============================================================
// El objetivo de GEO no es "tener schema", es que el autor, el publisher y
// la organización global apunten al MISMO `@id`. Si cada uno emitiera un
// objeto suelto, los motores de respuesta verían tres entidades homónimas
// y ninguna ganaría autoridad. Estos tests fijan ese contrato.

function makePost(overrides: Partial<BlogPostMeta> = {}): BlogPostMeta {
  return {
    slug: "post-de-prueba",
    title: "Post de prueba",
    description: "Descripción de prueba",
    category: "costos",
    date: "2026-01-01",
    updatedAt: "2026-02-01",
    author: PRIMARY_AUTHOR.name,
    authorRole: PRIMARY_AUTHOR.jobTitle,
    authorSlug: PRIMARY_AUTHOR.slug,
    tags: ["costeo"],
    readingTime: 5,
    ...overrides,
  }
}

describe("getBlogPostingSchema", () => {
  it("firma con una referencia `Person` que apunta a la entidad del autor", () => {
    const schema = getBlogPostingSchema(makePost())
    expect(schema.author["@type"]).toBe("Person")
    expect(schema.author["@id"]).toBe(PRIMARY_AUTHOR.id)
    expect(schema.author.url).toBe(PRIMARY_AUTHOR.url)
  })

  it("publica como la MISMA organización global del layout", () => {
    const schema = getBlogPostingSchema(makePost())
    expect(schema.publisher["@id"]).toBe(ORGANIZATION_ID)
    expect(schema.publisher["@id"]).toBe("https://resurte.me/#organization")
  })

  it("resuelve la firma histórica 'Equipo Resurte.me' al autor real", () => {
    const schema = getBlogPostingSchema(makePost({ author: "Equipo Resurte.me" }))
    expect(schema.author.name).toBe(PRIMARY_AUTHOR.name)
    expect(schema.author["@id"]).toBe(PRIMARY_AUTHOR.id)
  })

  it("marca mainEntityOfPage con la URL canónica del post", () => {
    const schema = getBlogPostingSchema(makePost())
    expect(schema.mainEntityOfPage["@id"]).toBe(`${SITE_URL}/blog/post-de-prueba`)
  })
})

describe("getBlogIndexSchema", () => {
  it("usa el mismo publisher que los posts y publica el artículo en la lista", () => {
    const schema = getBlogIndexSchema([makePost()])
    expect(schema.publisher["@id"]).toBe(ORGANIZATION_ID)
    expect(schema.blogPost[0]).toEqual({
      "@type": "BlogPosting",
      headline: "Post de prueba",
      url: `${SITE_URL}/blog/post-de-prueba`,
      datePublished: "2026-01-01",
      dateModified: "2026-02-01",
    })
  })

  /**
   * El índice del blog publica 226 entradas y Next serializa el JSON-LD dos
   * veces (en el `<script>` y en el payload RSC). Con `description`, `author` e
   * `image` por entrada el bloque llegaba a ~217 KB; el presupuesto evita que
   * vuelva a inflarse.
   */
  it("mantiene las entradas mínimas y dentro de presupuesto", () => {
    const posts = getAllPosts()
    const schema = getBlogIndexSchema(posts)
    expect(schema.blogPost).toHaveLength(posts.length)
    for (const entrada of schema.blogPost) {
      expect(Object.keys(entrada).sort()).toEqual([
        "@type",
        "dateModified",
        "datePublished",
        "headline",
        "url",
      ])
    }
    expect(JSON.stringify(schema).length).toBeLessThan(60_000)
  })
})

describe("getHowToSchema", () => {
  it("devuelve null con menos de dos pasos (un HowTo de un paso no es HowTo)", () => {
    expect(getHowToSchema(makePost(), "## Único paso\n\ntexto")).toBeNull()
    expect(getHowToSchema(makePost(), "sin encabezados")).toBeNull()
  })

  it("convierte los H2 en pasos numerados con ancla", () => {
    const md = ["## Primer paso", "texto", "### Subpaso", "## Segundo paso"].join("\n")
    const schema = getHowToSchema(makePost(), md)
    expect(schema?.step).toEqual([
      {
        "@type": "HowToStep",
        position: 1,
        name: "Primer paso",
        url: `${SITE_URL}/blog/post-de-prueba#primer-paso`,
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Segundo paso",
        url: `${SITE_URL}/blog/post-de-prueba#segundo-paso`,
      },
    ])
  })

  it("los pasos son exactamente los H2 del markdown", () => {
    const md = ["## A", "## B", "### C", "## D"].join("\n")
    const steps = getHowToSchema(makePost(), md)?.step ?? []
    const expected = extractHeadings(md).filter((h) => h.level === 2)
    expect(steps.map((s) => s.name)).toEqual(expected.map((h) => h.text))
  })

  it("en los tutoriales reales cada ancla del schema existe en el contenido", () => {
    // heading-slug.test.ts ya prueba que los ids del HTML y de extractHeadings
    // coinciden en los 226 posts; aquí se comprueba que el schema generado
    // para el contenido real solo apunte a anclas que existen de verdad.
    const tutorials = getAllPosts().filter((p) => p.contentType === "tutorial")
    expect(tutorials.length).toBeGreaterThan(0)

    for (const meta of tutorials) {
      const post = getPostBySlug(meta.slug)
      expect(post).not.toBeNull()
      if (!post) continue

      const schema = getHowToSchema(post.data, post.content)
      expect(schema).not.toBeNull()
      if (!schema) continue

      const anchors = new Set(
        extractHeadings(post.content)
          .filter((h) => h.level === 2)
          .map((h) => `${SITE_URL}/blog/${meta.slug}#${h.id}`)
      )

      expect(schema.step.length).toBeGreaterThanOrEqual(2)
      for (const step of schema.step) {
        expect(anchors.has(step.url)).toBe(true)
      }
    }
  })
})

describe("getSpeakableSpec", () => {
  it("devuelve solo la especificación, sin url suelta", () => {
    const spec = getSpeakableSpec(["#resumen-articulo"])
    expect(spec).toEqual({
      "@type": "SpeakableSpecification",
      cssSelector: ["#resumen-articulo"],
    })
    expect("url" in spec).toBe(false)
  })
})

describe("getFAQSchema", () => {
  it("devuelve null sin preguntas", () => {
    expect(getFAQSchema([])).toBeNull()
  })

  it("mapea pregunta/respuesta a Question/Answer", () => {
    const schema = getFAQSchema([{ question: "¿P?", answer: "R" }])
    expect(schema?.mainEntity[0]).toEqual({
      "@type": "Question",
      name: "¿P?",
      acceptedAnswer: { "@type": "Answer", text: "R" },
    })
  })
})

// ============================================================
// Migas de pan: /blog, /blog/[slug] y /blog/categoria/[slug]
// ============================================================
// Las categorías del blog se filtran en el cliente (`/blog?categoria=`), así
// que `/blog/categoria/[slug]` es una ruta real creada para dar a cada
// categoría una URL citable y prerenderizada. Estos tests fijan que la rama
// nueva NO alteró las dos migas que ya estaban publicadas.
describe("getBlogBreadcrumbSchema", () => {
  it("mantiene la miga de dos niveles del índice", () => {
    expect(getBlogBreadcrumbSchema("blog")).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      ],
    })
  })

  it("mantiene la miga de tres niveles del post (sin `item` en el último)", () => {
    const schema = getBlogBreadcrumbSchema("post", "Mi artículo")
    expect(schema.itemListElement).toHaveLength(3)
    expect(schema.itemListElement[2]).toEqual({
      "@type": "ListItem",
      position: 3,
      name: "Mi artículo",
    })
  })

  it("emite una URL navegable para la categoría", () => {
    const schema = getBlogBreadcrumbSchema("category", "Costos y rentabilidad", "costos")
    expect(schema.itemListElement[2]).toEqual({
      "@type": "ListItem",
      position: 3,
      name: "Costos y rentabilidad",
      item: `${SITE_URL}/blog/categoria/costos`,
    })
  })

  it("cubre cada categoría publicada con una URL única", () => {
    const urls = BLOG_CATEGORIES.map((c) => {
      const element = getBlogBreadcrumbSchema("category", c.label, c.slug)
        .itemListElement[2]
      return element && "item" in element ? element.item : ""
    })
    expect(urls).toHaveLength(BLOG_CATEGORIES.length)
    expect(new Set(urls).size).toBe(BLOG_CATEGORIES.length)
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\/resurte\.me\/blog\/categoria\/[a-z0-9-]+$/)
    }
  })
})
