import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import {
  PREGUNTAS,
  PREGUNTA_THEMES,
  getPregunta,
  getPreguntaGroups,
  getPreguntasByTheme,
  getPreguntaUrl,
} from "./preguntas"
import { slugifyHeading } from "./heading-slug"

const BLOG_DIR = path.join(process.cwd(), "src", "content", "blog")
const APP_DIR = path.join(process.cwd(), "src", "app")

const blogSlugs = new Set(
  fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""))
)
const appRoutes = new Set(
  fs.readdirSync(APP_DIR).filter((entry) => !entry.includes("."))
)

describe("PREGUNTAS — contrato de anclas", () => {
  it("el slug de cada pregunta es un ancla estable y bien formada", () => {
    // Los slugs son deliberadamente editoriales (coinciden con la forma en que
    // la gente busca) en lugar de derivarse palabra por palabra de la pregunta.
    // El contrato es que sean anclas válidas y no cambien: la página usa el
    // mismo `p.slug` para el `id` del DOM y para el fragmento del ItemList, así
    // que el ancla HTML y la declarada en JSON-LD no pueden divergir.
    const malformed = PREGUNTAS.filter(
      (p) =>
        slugifyHeading(p.slug) !== p.slug ||
        p.slug.length < 8 ||
        p.slug.length > 80
    ).map((p) => `${p.slug} (${p.slug.length})`)
    expect(malformed).toEqual([])
  })

  it("no hay slugs repetidos", () => {
    const slugs = PREGUNTAS.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it("no hay preguntas repetidas", () => {
    const questions = PREGUNTAS.map((p) => p.question)
    expect(new Set(questions).size).toBe(questions.length)
  })
})

describe("PREGUNTAS — calidad de las respuestas", () => {
  it("cada respuesta es autocontenida (40–80 palabras)", () => {
    const offenders = PREGUNTAS.filter((p) => {
      const words = p.answer.trim().split(/\s+/).length
      return words < 40 || words > 80
    }).map((p) => `${p.slug}: ${p.answer.trim().split(/\s+/).length} palabras`)
    expect(offenders).toEqual([])
  })

  it("ninguna respuesta empieza con una referencia al resto de la página", () => {
    const offenders = PREGUNTAS.filter((p) =>
      /^(como vimos|como se mencion|ver arriba|en el art[íi]culo anterior)/i.test(
        p.answer
      )
    ).map((p) => p.slug)
    expect(offenders).toEqual([])
  })

  it("ninguna respuesta usa la marca corta 'Resurte' sola", () => {
    const offenders = PREGUNTAS.filter((p) =>
      /\bResurte\b(?!\.me)/.test(p.answer)
    ).map((p) => p.slug)
    expect(offenders).toEqual([])
  })

  it("cada pregunta pertenece a un tema declarado", () => {
    const valid = new Set(PREGUNTA_THEMES.map((t) => t.slug))
    const offenders = PREGUNTAS.filter((p) => !valid.has(p.theme)).map((p) => p.slug)
    expect(offenders).toEqual([])
  })

  it("cada pregunta tiene al menos un enlace de profundización", () => {
    const offenders = PREGUNTAS.filter((p) => p.links.length === 0).map((p) => p.slug)
    expect(offenders).toEqual([])
  })
})

describe("PREGUNTAS — enlaces", () => {
  it("todos los enlaces resuelven a un post, una ruta o un ancla existente", () => {
    const broken: string[] = []
    const knownSlugs = new Set(PREGUNTAS.map((p) => p.slug))
    for (const pregunta of PREGUNTAS) {
      for (const { href } of pregunta.links) {
        if (href.startsWith("/preguntas#")) {
          if (!knownSlugs.has(href.slice("/preguntas#".length))) {
            broken.push(`${pregunta.slug} -> ${href}`)
          }
          continue
        }
        const segments = href.split("/").filter(Boolean)
        const head = segments[0]
        if (head === "blog" && segments[1] !== "categoria") {
          if (!blogSlugs.has(segments[1] ?? "")) broken.push(`${pregunta.slug} -> ${href}`)
          continue
        }
        if (!appRoutes.has(head ?? "")) broken.push(`${pregunta.slug} -> ${href}`)
      }
    }
    expect(broken).toEqual([])
  })
})

describe("PREGUNTAS — agrupación", () => {
  it("getPreguntaGroups cubre todas las preguntas y respeta el orden de temas", () => {
    const groups = getPreguntaGroups()
    const total = groups.reduce((sum, g) => sum + g.preguntas.length, 0)
    expect(total).toBe(PREGUNTAS.length)
    const order = groups.map((g) => g.theme.slug)
    const declared = PREGUNTA_THEMES.map((t) => t.slug).filter((s) => order.includes(s))
    expect(order).toEqual(declared)
  })

  it("getPreguntasByTheme filtra solo por ese tema", () => {
    for (const theme of PREGUNTA_THEMES) {
      const preguntas = getPreguntasByTheme(theme.slug)
      expect(preguntas.every((p) => p.theme === theme.slug)).toBe(true)
    }
  })

  it("getPregunta encuentra por slug y devuelve undefined si no existe", () => {
    expect(getPregunta(PREGUNTAS[0]?.slug ?? "")).toBe(PREGUNTAS[0])
    expect(getPregunta("no-existe-esta-pregunta")).toBeUndefined()
  })

  it("getPreguntaUrl usa el formato de ancla citable", () => {
    expect(getPreguntaUrl(PREGUNTAS[0]!)).toBe(`/preguntas#${PREGUNTAS[0]!.slug}`)
  })
})
