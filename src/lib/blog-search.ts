import type { BlogPostMeta } from "./blog"

/**
 * Búsqueda por texto sobre un arreglo de posts.
 *
 * Función pura y client-safe (sin `fs`): opera sobre los posts que recibe.
 * `lib/blog.ts` la usa como filtro server-side sobre `getAllPosts()`, y los
 * componentes client (blog-index-client) la usan sobre los posts que reciben
 * por props — evita arrastrar `node:fs` al bundle del navegador.
 */
export function searchPosts(
  posts: BlogPostMeta[],
  query: string
): BlogPostMeta[] {
  const q = query.trim().toLowerCase()
  if (!q) return posts
  return posts.filter((p) => {
    const haystack = [p.title, p.description, p.category, ...p.tags]
      .join(" ")
      .toLowerCase()
    return haystack.includes(q)
  })
}
