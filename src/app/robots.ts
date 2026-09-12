import type { MetadataRoute } from "next"

// Crawlers de búsqueda con IA (ChatGPT, Perplexity, Claude, Copilot, etc.).
// Los permitimos explícitamente: queremos que Resurte.me aparezca citado en
// las respuestas de los asistentes, no solo en los resultados clásicos de
// Google. Antes GPTBot estaba bloqueado, lo que nos hacía invisibles ahí.
const AI_SEARCH_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "Amazonbot",
  "CCBot",
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Solo /api/ se bloquea: el resto (admin, auth, carrito, checkout…)
        // se deja rastreable porque lleva meta robots noindex — si se bloquea
        // por robots.txt, Google nunca ve el noindex y puede indexar la URL
        // "a ciegas" sin contenido.
        disallow: ["/api/"],
      },
      {
        userAgent: AI_SEARCH_CRAWLERS,
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: "https://resurte.me/sitemap.xml",
  }
}
