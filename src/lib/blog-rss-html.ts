import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkRehype from "remark-rehype"
import rehypeStringify from "rehype-stringify"

/**
 * Converts post MDX source to static HTML for the RSS feed.
 *
 * Runs outside the RSC tree (route handler), so it uses a plain unified
 * pipeline instead of react-dom/server (which Next.js 16 forbids in route
 * handlers). Custom JSX components (BlogCTA, BlogCallout, …) pass through as
 * inert custom elements inside the content:encoded CDATA block, which RSS
 * readers ignore gracefully.
 */
export async function mdxToHtml(source: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(source)

  return String(file)
}
