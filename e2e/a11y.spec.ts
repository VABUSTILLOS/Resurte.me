import { test, expect, type Page } from "@playwright/test"
import path from "node:path"

// Inyecta axe-core y ejecuta el scan de la página actual.
async function runAxe(page: Page): Promise<AxeResults> {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") })
  return page.evaluate(async () => {
    // @ts-expect-error — axe inyectado globalmente
    return window.axe.run(document, {
      rules: {
        // Etiquetas de región (main/header/footer) ya presentes; reportamos landmarks igualmente.
        region: { enabled: true },
      },
    })
  })
}

interface AxeNode {
  html: string
  target: string[]
  failureSummary?: string
}
interface AxeViolation {
  id: string
  impact: "minor" | "moderate" | "serious" | "critical"
  description: string
  help: string
  helpUrl: string
  nodes: AxeNode[]
}
interface AxeResults {
  violations: AxeViolation[]
}

function summarize(violations: AxeViolation[]): string {
  return violations
    .map((v) => {
      const nodes = v.nodes.map((n) => `${n.target.join(" ")}: ${n.failureSummary ?? ""}`).join(" | ")
      return `  [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} nodos) ${nodes}`.trim()
    })
    .join("\n")
}

test.describe("accesibilidad WCAG (axe-core)", () => {
  const pages: Array<[string, string]> = [
    ["home", "/"],
    ["marketplace", "/comer"],
    ["blog", "/blog"],
    ["ciudad", "/cdmx"],
  ]

  for (const [label, url] of pages) {
    test(`sin violaciones críticas/serias en ${label}`, async ({ page }) => {
      await page.goto(url, { waitUntil: "networkidle" })
      await page.waitForSelector("main#main-content")
      const results = await runAxe(page)
      const critical = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      )
      if (critical.length > 0) {
        console.log(`VIOLACIONES ${label} (${url}):\n${summarize(critical)}`)
      }
      expect(critical, `violaciones serias/críticas en ${label}:\n${summarize(critical)}`).toEqual([])
    })
  }

  test("categoría y producto no tienen violaciones serias", async ({ page }) => {
    await page.goto("/cdmx", { waitUntil: "domcontentloaded" })
    // Descubre enlaces reales de categoría y producto desde la ciudad.
    const categoryHref = await page.getByRole("link").evaluateAll((links) => {
      const l = links.map((a) => (a as HTMLAnchorElement).href)
      return l.find((h) => h.includes("/categoria/")) ?? null
    })
    const productHref = await page.getByRole("link").evaluateAll((links) => {
      const l = links.map((a) => (a as HTMLAnchorElement).href)
      return l.find((h) => h.includes("/producto/")) ?? null
    })

    for (const [label, href] of [
      ["categoria", categoryHref],
      ["producto", productHref],
    ] as Array<[string, string | null]>) {
      if (!href) {
        console.log(`SKIP ${label}: no se encontró enlace en /cdmx`)
        continue
      }
      await page.goto(href, { waitUntil: "networkidle" })
      await page.waitForSelector("main#main-content")
      const results = await runAxe(page)
      const critical = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      )
      if (critical.length > 0) {
        console.log(`VIOLACIONES ${label} (${href}):\n${summarize(critical)}`)
      }
      expect(critical, `violaciones serias/críticas en ${label}:\n${summarize(critical)}`).toEqual([])
    }
  })
})
