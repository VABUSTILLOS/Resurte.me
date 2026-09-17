import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/**
 * Contrato de los specs e2e: **ningún test puede volver a ser huérfano**.
 *
 * Contexto: `npm run test:e2e` es `playwright test --grep @ci`, de modo que un
 * spec sin la etiqueta `@ci` **existe en el repo pero nunca se ejecuta**. Eso
 * pasó con cuatro archivos completos —`mobile.spec.ts` (68 tests), `keyboard`
 * (7), `auth` (6) y `redeem` (3): 84 tests que nadie corría y que, al
 * inspeccionarlos, resultaron estar obsoletos y en rojo (asertaban UI que ya no
 * existe, o su propio mock). El fallo no fue ningún test concreto: fue que la
 * suite decía "todo verde" mientras un tercio de la evidencia estaba apagada.
 *
 * Este contrato cierra las tres formas de reintroducirlo:
 *
 *  1. Un archivo de spec nuevo sin ningún `@ci`.
 *  2. Un `test.describe` nuevo sin etiqueta dentro de un archivo ya etiquetado
 *     (el caso parcial: el archivo pasa la comprobación de conjunto, pero ese
 *     bloque sigue invisible para CI).
 *  3. Que alguien cambie el filtro de `test:e2e` — la etiqueta solo vale si el
 *     runner sigue filtrando por ella.
 *
 * Convención que asume: en `e2e/` los `test.describe(` y los `test(` de nivel
 * superior van a columna 0, y la etiqueta va en el header del `describe` (los
 * `test` hijos la heredan). Los specs que solo aplican a un project se
 * auto-excluyen con `test.skip(({ isMobile }) => !isMobile)`, no dejándolos sin
 * etiqueta.
 */

const REPO = process.cwd()
const E2E_DIR = join(REPO, "e2e")

/** Declaración de nivel superior: `test.describe(` o `test(` a columna 0. */
const TOP_LEVEL_DESCRIBE_RE = /^test\.describe\(/
const TOP_LEVEL_TEST_RE = /^test\(/

type Spec = { name: string; lines: string[] }

function readSpecs(): Spec[] {
  return readdirSync(E2E_DIR)
    .filter((name) => name.endsWith(".spec.ts"))
    .sort()
    .map((name) => ({
      name,
      lines: readFileSync(join(E2E_DIR, name), "utf8").split("\n"),
    }))
}

const SPECS = readSpecs()

describe("contrato de specs e2e (@ci)", () => {
  it("encuentra los specs del directorio e2e", () => {
    // Si el directorio o el glob cambian, el resto de aserciones pasaría en
    // vacío. Este es el canario.
    expect(SPECS.length).toBeGreaterThanOrEqual(15)
  })

  it("todo archivo de spec tiene al menos un describe etiquetado @ci", () => {
    const orphans = SPECS.filter((spec) => !spec.lines.some((l) => l.includes("@ci"))).map(
      (spec) => spec.name
    )

    expect(
      orphans,
      `Estos specs no tienen ningún @ci: sus tests existen pero \`npm run test:e2e\` ` +
        `nunca los ejecuta. Añade \`{ tag: "@ci" }\` al describe (y repara el spec si está ` +
        `obsoleto antes de etiquetarlo).`
    ).toEqual([])
  })

  it("todo describe y test de nivel superior lleva @ci en su propio header", () => {
    const untagged: string[] = []

    for (const spec of SPECS) {
      spec.lines.forEach((line, index) => {
        const isDescribe = TOP_LEVEL_DESCRIBE_RE.test(line)
        const isTest = TOP_LEVEL_TEST_RE.test(line)
        if (!isDescribe && !isTest) return
        if (line.includes("@ci")) return
        untagged.push(`${spec.name}:${index + 1} ${line.trim().slice(0, 90)}`)
      })
    }

    expect(
      untagged,
      `Estos bloques de nivel superior no llevan @ci en su header, así que sus tests no ` +
        `entran en \`npm run test:e2e\`. La etiqueta va en el describe, no en cada test.`
    ).toEqual([])
  })

  it("test:e2e sigue filtrando por @ci", () => {
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }
    const script = pkg.scripts?.["test:e2e"] ?? ""

    // La etiqueta solo protege si el runner la usa como filtro. Si este script
    // deja de filtrar, todo `@ci` del repo se vuelve decorativo.
    expect(script).toContain("playwright test")
    expect(script).toContain("--grep @ci")
  })
})
