import type { MetadataRoute } from "next"
import { isProductionDeploy } from "@/lib/deploy-env"
import { AI_SEARCH_CRAWLERS } from "@/lib/ai-crawlers"

// Crawlers de búsqueda con IA (ChatGPT, Perplexity, Claude, Copilot, etc.).
// Los permitimos explícitamente: queremos que Resurte.me aparezca citado en
// las respuestas de los asistentes, no solo en los resultados clásicos de
// Google. Antes GPTBot estaba bloqueado, lo que nos hacía invisibles ahí.
//
// La lista vive en `src/lib/ai-crawlers.ts` (fuente única de verdad, compartida
// con el panel /admin/seo-ia) y cubre tres familias: asistentes de respuesta
// (GPTBot, ClaudeBot, PerplexityBot, MistralAI-User, YouBot, DuckAssistBot),
// crawlers de entrenamiento/atribución (CCBot, Google-Extended,
// Applebot-Extended, Meta-ExternalAgent, AI2Bot, cohere-ai, Timpibot,
// Omgilibot, Diffbot, PetalBot, Bytespider) y crawlers de plataforma que
// también alimentan superficies de IA (Applebot, Google-CloudVertexBot,
// Amazonbot, ImagesiftBot).

export default function robots(): MetadataRoute.Robots {
  // Fuera de producción no se indexa nada. Una copia (preview, sandbox de
  // staging) que herede este robots competiría en Google con el sitio real por
  // contenido duplicado. Falla hacia noindex a propósito: solo producción se
  // identifica positivamente, vía `VERCEL_ENV`.
  if (!isProductionDeploy()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] }
  }

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
        // Los feeds JSON de /api/feed/ son superficie para agentes (llms.txt
        // los enlaza). Se permiten explícitamente: en robots.txt gana la regla
        // más específica, así que el Allow supera al Disallow de /api/.
        allow: ["/", "/api/feed/"],
        disallow: ["/api/"],
      },
    ],
    sitemap: "https://resurte.me/sitemap.xml",
  }
}
