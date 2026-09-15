import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkRehype from "remark-rehype"
import { extractHeadings, slugifyHeading } from "./heading-slug"
import { rehypeHeadingAnchors } from "./rehype-heading-anchors"

// ============================================================
// Los ids de encabezado son un contrato entre dos consumidores
// ============================================================
// `rehypeHeadingAnchors` los escribe en el HTML del post y `extractHeadings`
// los usa para armar las URLs de los `HowToStep` del JSON-LD. Si divergen,
// el schema apunta a anclas que no existen y los motores de respuesta
// citan fragmentos rotos. Este test recorre los 226 posts reales y compara
// ambas salidas, así que una regresión se detecta en CI y no en producción.

const POSTS_DIR = path.join(process.cwd(), "src", "content", "blog")

/** Corre el mismo pipeline de remark que usa la página del post. */
function renderHeadingIds(markdown: string): { id: string; text: string; level: number }[] {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeHeadingAnchors)
    .runSync(unified().use(remarkParse).parse(markdown) as never)

  const out: { id: string; text: string; level: number }[] = []
  const visit = (node: {
    type?: string
    tagName?: string
    properties?: Record<string, unknown>
    children?: unknown[]
    value?: string
  }): void => {
    if (node.type === "element" && node.tagName && /^h[2-4]$/.test(node.tagName)) {
      const text = textOf(node as never)
      out.push({ id: String(node.properties?.id ?? ""), text, level: Number(node.tagName[1]) })
    }
    for (const child of (node.children ?? []) as never[]) visit(child)
  }
  const textOf = (node: { type?: string; value?: string; children?: unknown[] }): string => {
    if (node.type === "text") return node.value ?? ""
    return ((node.children ?? []) as never[]).map((c) => textOf(c)).join("")
  }
  visit(tree as never)
  return out
}

function postFiles(): string[] {
  return fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => path.join(POSTS_DIR, f))
}

describe("slugifyHeading", () => {
  it("quita acentos y normaliza a kebab-case", () => {
    expect(slugifyHeading("¿Cuánto cuesta el aguacate?")).toBe("cuanto-cuesta-el-aguacate")
  })

  it("no deja guiones sobrantes en los extremos", () => {
    expect(slugifyHeading("  --Foo bar--  ")).toBe("foo-bar")
  })

  it("devuelve cadena vacía si no queda nada alfanumérico", () => {
    expect(slugifyHeading("¿?¡!")).toBe("")
  })

  it("trunca a 80 caracteres sin dejar guion final", () => {
    const slug = slugifyHeading("a".repeat(79) + " " + "b".repeat(20))
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug.endsWith("-")).toBe(false)
  })
})

describe("extractHeadings", () => {
  it("ignora encabezados dentro de bloques de código", () => {
    const md = ["## Real", "", "```bash", "## No es encabezado", "```", "", "### También real"].join("\n")
    expect(extractHeadings(md).map((h) => h.id)).toEqual(["real", "tambien-real"])
  })

  it("resuelve duplicados con sufijo -1, -2", () => {
    const md = ["## Precio", "## Precio", "## Precio"].join("\n")
    expect(extractHeadings(md).map((h) => h.id)).toEqual(["precio", "precio-1", "precio-2"])
  })

  it("limpia negritas, código y enlaces del texto", () => {
    const md = ["## El **food cost** de `taquería`", "## [Ver guía](/blog/x)"].join("\n")
    expect(extractHeadings(md)).toEqual([
      { text: "El food cost de taquería", id: "el-food-cost-de-taqueria", level: 2 },
      { text: "Ver guía", id: "ver-guia", level: 2 },
    ])
  })

  it("solo considera H2–H4", () => {
    const md = ["# H1", "## H2", "### H3", "#### H4", "##### H5"].join("\n")
    expect(extractHeadings(md).map((h) => h.level)).toEqual([2, 3, 4])
  })
})

describe("paridad HTML ↔ JSON-LD en los posts reales", () => {
  const files = postFiles()

  it("encuentra los posts del blog", () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it("extractHeadings devuelve exactamente los mismos ids que el HTML", () => {
    const mismatches: string[] = []
    let totalHeadings = 0

    for (const file of files) {
      const markdown = fs.readFileSync(file, "utf8")
      // El frontmatter no contiene encabezados markdown, pero se recorta igual
      // para comparar sobre el mismo cuerpo que compila la página.
      const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")

      const fromHtml = renderHeadingIds(body)
      const fromExtract = extractHeadings(body)

      const htmlIds = fromHtml.map((h) => h.id)
      const extractIds = fromExtract.map((h) => h.id)
      totalHeadings += htmlIds.length

      if (JSON.stringify(htmlIds) !== JSON.stringify(extractIds)) {
        mismatches.push(
          `${path.basename(file)}\n  HTML:    ${JSON.stringify(htmlIds)}\n  Extract: ${JSON.stringify(extractIds)}`
        )
      }
    }

    // Sin esto el test pasaría con dos arrays vacíos: si el pipeline dejara de
    // producir encabezados, la paridad sería trivial y no probaría nada.
    expect(totalHeadings).toBeGreaterThan(1000)
    expect(mismatches).toEqual([])
  })

  it("ningún id de ancla queda vacío", () => {
    const empty: string[] = []
    for (const file of files) {
      const body = fs
        .readFileSync(file, "utf8")
        .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
      for (const h of extractHeadings(body)) {
        if (!h.id) empty.push(path.basename(file))
      }
    }
    expect(empty).toEqual([])
  })
})
