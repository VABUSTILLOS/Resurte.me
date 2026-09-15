import { slugifyHeading } from "./heading-slug"

// ============================================================
// Plugin rehype: agrega `id` a los H2–H4 del contenido MDX
// ============================================================
// Se registra en `rehypePlugins` de compileMDX (src/app/blog/[slug]/page.tsx).
// Los ids que produce son idénticos a los de `extractHeadings()`
// (src/lib/heading-slug.ts), que los usa para los `HowToStep` del JSON-LD:
// si divergieran, el schema apuntaría a anclas que no existen.
//
// No se usa `rehype-slug` para no depender de `github-slugger`: la
// coincidencia exacta entre HTML y JSON-LD es un requisito duro, y con una
// sola función local queda garantizada.

interface HastNode {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function textContent(node: HastNode): string {
  if (node.type === "text") return node.value ?? ""
  if (!node.children) return ""
  return node.children.map(textContent).join("")
}

function visit(node: HastNode, fn: (n: HastNode) => void) {
  fn(node)
  if (!node.children) return
  for (const child of node.children) visit(child, fn)
}

export function rehypeHeadingAnchors() {
  return (tree: HastNode) => {
    const seen = new Map<string, number>()

    visit(tree, (node) => {
      if (node.type !== "element" || !node.tagName) return
      if (!/^h[2-4]$/.test(node.tagName)) return
      // Respeta un id explícito puesto a mano en el MDX.
      if (node.properties?.id) return

      const base = slugifyHeading(textContent(node))
      if (!base) return

      const count = seen.get(base) ?? 0
      seen.set(base, count + 1)
      node.properties = {
        ...node.properties,
        id: count === 0 ? base : `${base}-${count}`,
      }
    })
  }
}
