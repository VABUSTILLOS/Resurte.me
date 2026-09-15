/**
 * Crawlers de búsqueda con IA.
 *
 * Fuente única de verdad: la usan `src/app/robots.ts` (para permitirlos
 * explícitamente) y el panel interno `/admin/seo-ia` (para mostrar qué
 * superficies de IA pueden leer el sitio).
 *
 * Por qué permitirlos: Resurte.me quiere aparecer *citado dentro* de las
 * respuestas de ChatGPT, Perplexity, Claude o Copilot, no solo en los
 * resultados clásicos. Bloquear al crawler equivale a desaparecer de esa
 * superficie, aunque el contenido sea bueno.
 */

type AiCrawlerFamily =
  /** Alimentan respuestas en vivo y pueden citar la fuente. */
  | "respuesta"
  /** Indexan para entrenamiento o atribución. */
  | "entrenamiento"
  /** Crawlers de plataforma que también nutren superficies de IA. */
  | "plataforma"

export interface AiCrawler {
  /** Token exacto de User-Agent tal como se declara en robots.txt. */
  token: string
  /** Motor o plataforma que lo opera. */
  owner: string
  family: AiCrawlerFamily
  /** Si al permitirlo se puede obtener una cita visible. */
  citable: boolean
}

export const AI_CRAWLERS: AiCrawler[] = [
  { token: "GPTBot", owner: "OpenAI", family: "entrenamiento", citable: false },
  { token: "OAI-SearchBot", owner: "ChatGPT Search", family: "respuesta", citable: true },
  { token: "ChatGPT-User", owner: "ChatGPT", family: "respuesta", citable: true },
  { token: "ClaudeBot", owner: "Anthropic", family: "entrenamiento", citable: false },
  { token: "Claude-User", owner: "Claude", family: "respuesta", citable: true },
  { token: "PerplexityBot", owner: "Perplexity", family: "respuesta", citable: true },
  { token: "Perplexity-User", owner: "Perplexity", family: "respuesta", citable: true },
  { token: "MistralAI-User", owner: "Le Chat", family: "respuesta", citable: true },
  { token: "DuckAssistBot", owner: "DuckDuckGo AI", family: "respuesta", citable: true },
  { token: "YouBot", owner: "You.com", family: "respuesta", citable: true },
  { token: "cohere-ai", owner: "Cohere", family: "entrenamiento", citable: false },
  { token: "Google-Extended", owner: "Google (Gemini)", family: "entrenamiento", citable: false },
  {
    token: "Google-CloudVertexBot",
    owner: "Google Cloud Vertex AI",
    family: "plataforma",
    citable: false,
  },
  { token: "Applebot", owner: "Apple", family: "plataforma", citable: false },
  { token: "Applebot-Extended", owner: "Apple Intelligence", family: "entrenamiento", citable: false },
  { token: "Meta-ExternalAgent", owner: "Meta AI", family: "entrenamiento", citable: false },
  { token: "Amazonbot", owner: "Amazon", family: "plataforma", citable: false },
  { token: "AI2Bot", owner: "Allen Institute for AI", family: "entrenamiento", citable: false },
  { token: "Timpibot", owner: "Timpi", family: "entrenamiento", citable: false },
  { token: "Diffbot", owner: "Diffbot", family: "entrenamiento", citable: false },
  { token: "Omgilibot", owner: "Webz.io", family: "entrenamiento", citable: false },
  { token: "PetalBot", owner: "Huawei", family: "plataforma", citable: false },
  { token: "Bytespider", owner: "ByteDance", family: "entrenamiento", citable: false },
  { token: "ImagesiftBot", owner: "Imagesift", family: "plataforma", citable: false },
  { token: "CCBot", owner: "Common Crawl", family: "entrenamiento", citable: false },
]

/** Tokens en el orden exacto que consume `robots.ts`. */
export const AI_SEARCH_CRAWLERS: string[] = AI_CRAWLERS.map((c) => c.token)

/** Los que pueden producir una cita visible: son los que se vigilan de cerca. */
export const CITABLE_AI_CRAWLERS: AiCrawler[] = AI_CRAWLERS.filter((c) => c.citable)
