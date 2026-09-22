import { afterEach, describe, expect, it, vi } from "vitest"
import robots from "@/app/robots"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("robots", () => {
  it("bloquea todo el sitio fuera de producción", () => {
    // Una copia (preview, sandbox de staging) no debe competir en Google con el
    // sitio real por contenido duplicado.
    for (const value of ["preview", "development", ""]) {
      vi.stubEnv("VERCEL_ENV", value)
      const result = robots()
      expect(result.rules, `VERCEL_ENV=${JSON.stringify(value)}`).toEqual([
        { userAgent: "*", disallow: "/" },
      ])
      expect(result.sitemap).toBeUndefined()
    }
  })

  it("publica el sitio y su sitemap en producción", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    const result = robots()

    expect(result.sitemap).toBe("https://resurte.me/sitemap.xml")
    const serialized = JSON.stringify(result.rules)
    expect(serialized).toContain('"allow":"/"')
    expect(serialized).not.toContain('"disallow":"/"')
  })
})
