import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import robots from "@/app/robots"
import { AI_CRAWLERS, AI_SEARCH_CRAWLERS, CITABLE_AI_CRAWLERS } from "./ai-crawlers"

// Este archivo vigila el robots.txt **de producción**. Fuera de producción
// `robots()` devuelve `disallow: "/"` (para que una copia en un preview no
// compita con el sitio real), y entonces este contrato no aplica; ese caso lo
// cubre `src/app/robots.test.ts`.
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "production")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

type Rule = { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] }

function rules(): Rule[] {
  const result = robots()
  return (Array.isArray(result.rules) ? result.rules : [result.rules]) as Rule[]
}

function toList(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

/** Grupo de robots.txt que declara explícitamente los crawlers de IA. */
function aiGroup(): Rule {
  const found = rules().find((r) => toList(r.userAgent).some((ua) => ua !== "*"))
  if (!found) throw new Error("robots.txt no declara un grupo para crawlers de IA")
  return found
}

describe("catálogo de crawlers de IA", () => {
  it("no repite tokens (un User-Agent duplicado en robots.txt es inválido)", () => {
    const tokens = AI_CRAWLERS.map((c) => c.token)
    expect(new Set(tokens).size).toBe(tokens.length)
  })

  it("declara todos los campos y al menos un crawler citable por familia de respuesta", () => {
    for (const crawler of AI_CRAWLERS) {
      expect(crawler.token.trim()).not.toBe("")
      expect(crawler.owner.trim()).not.toBe("")
      expect(["respuesta", "entrenamiento", "plataforma"]).toContain(crawler.family)
      expect(typeof crawler.citable).toBe("boolean")
    }
    expect(AI_CRAWLERS.some((c) => c.family === "respuesta" && c.citable)).toBe(true)
  })

  it("deriva AI_SEARCH_CRAWLERS en el mismo orden que AI_CRAWLERS", () => {
    expect(AI_SEARCH_CRAWLERS).toEqual(AI_CRAWLERS.map((c) => c.token))
  })

  it("marca como citables solo los que alimentan respuestas en vivo", () => {
    expect(CITABLE_AI_CRAWLERS).toEqual(AI_CRAWLERS.filter((c) => c.citable))
    expect(CITABLE_AI_CRAWLERS.every((c) => c.family === "respuesta")).toBe(true)
  })
})

describe("robots.txt y el catálogo no se desincronizan", () => {
  it("permite exactamente los tokens del catálogo", () => {
    expect(toList(aiGroup().userAgent).sort()).toEqual([...AI_SEARCH_CRAWLERS].sort())
  })

  it("da Allow: / a todo el grupo de IA", () => {
    expect(toList(aiGroup().allow)).toContain("/")
  })

  /**
   * La invariante que sostiene todo el proyecto: si un crawler citable queda
   * bajo un Disallow, Resurte.me desaparece de esa superficie de respuesta.
   */
  it("nunca bloquea a un crawler citable", () => {
    const disallowed = toList(aiGroup().disallow)
    for (const crawler of CITABLE_AI_CRAWLERS) {
      expect(AI_SEARCH_CRAWLERS).toContain(crawler.token)
      expect(disallowed).not.toContain("/")
      for (const path of disallowed) {
        expect(path === "/" || path.startsWith("/*")).toBe(false)
      }
    }
  })

  it("abre los feeds JSON a los agentes pese al Disallow de /api/", () => {
    const group = aiGroup()
    expect(toList(group.disallow)).toContain("/api/")
    // En robots.txt gana la ruta más específica: /api/feed/ (10) > /api/ (5).
    expect(toList(group.allow)).toContain("/api/feed/")
  })

  it("no bloquea /api/ para el grupo genérico sin declarar los feeds", () => {
    const generic = rules().find((r) => toList(r.userAgent).includes("*"))
    expect(generic).toBeDefined()
    expect(toList(generic?.disallow)).toEqual(["/api/"])
  })

  it("publica el sitemap", () => {
    expect(robots().sitemap).toBe("https://resurte.me/sitemap.xml")
  })
})
