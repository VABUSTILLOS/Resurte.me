import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { ADMIN_SECTIONS } from "@/lib/admin-permissions"

/**
 * Contrato del calentamiento en frío de e2e (`e2e/global-setup.ts`).
 *
 * Contexto: la ronda 15 bisectó la regresión de `e2e` en GitHub Actions hasta
 * este archivo. Entre dos commits verdes y rojos consecutivos, `global-setup.ts`
 * pasó de 21 a 64 rutas (+72/−2). El peor caso teórico del bucle
 * (`rutas × ATTEMPTS × TIMEOUT_MS` = 64 × 3 × 60 s = **3,2 h**) era **ocho veces
 * el presupuesto del job** (`timeout-minutes: 25` = 1500 s), y el paso
 * `E2E smoke tests` moría con `##[error]The operation was canceled.` a los ~67 s
 * **sin imprimir una sola línea** — el reporter `github` no sube el buffer
 * cuando el paso se cancela, así que no quedaba ni rastro de por qué.
 *
 * Este contrato fija las cinco cosas que hacen que eso no vuelva:
 *
 *  1. **El peor caso cabe en el job.** El calentamiento declara un presupuesto y
 *     ese presupuesto es una fracción pequeña del job. Sin esta cota, la lista
 *     crece con el catálogo y el tiempo crece con ella.
 *  2. **Una ruta colgada no puede comerse el presupuesto.** El timeout por ruta
 *     multiplicado por los intentos tiene que ser menor que el presupuesto
 *     entero; si no, un solo fallo deja a las demás sin turno.
 *  3. **Hay deadline y se comprueba.** El corte se hace *antes de cada intento*,
 *     no al final del bucle, y al agotarse **degrada**: deja de calentar, nombra
 *     lo pendiente y devuelve el control a los tests. Nunca aborta.
 *  4. **Imprime progreso.** Es lo único que sobrevive a un paso cancelado.
 *  5. **Cubre lo que los specs visitan.** Se resuelve cada ruta de cada spec
 *     `@ci` contra los patrones reales de `src/app/**` y se exige que todo
 *     patrón visitado tenga una ruta calentada.
 *
 * Límite conocido y aceptado: esto vigila la **forma** del calentamiento, no
 * cuánto tarda de verdad en un runner frío. Eso solo lo dice una corrida de CI.
 */

const REPO = process.cwd()
const E2E_DIR = join(REPO, "e2e")
const SETUP = readFileSync(join(E2E_DIR, "global-setup.ts"), "utf8")
const CI = readFileSync(join(REPO, ".github", "workflows", "ci.yml"), "utf8")

function readNumber(name: string): number {
  const match = SETUP.match(new RegExp(`const ${name}\\s*=\\s*([0-9_]+)`))
  return match ? Number(match[1]?.replace(/_/g, "")) : Number.NaN
}

function readRouteArray(name: string): string[] {
  const match = SETUP.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\]`))
  return match ? [...(match[1] ?? "").matchAll(/"(\/[^"]*)"/g)].map((m) => m[1] ?? "") : []
}

const ATTEMPTS = readNumber("ATTEMPTS")
const ROUTE_TIMEOUT_MS = readNumber("ROUTE_TIMEOUT_MS")
const WARM_BUDGET_MS = readNumber("WARM_BUDGET_MS")
const CONCURRENCY = readNumber("CONCURRENCY")
const PROGRESS_EVERY = readNumber("PROGRESS_EVERY")

const ROUTES = readRouteArray("ROUTES")
const API_ROUTES = readRouteArray("API_ROUTES")
const WARMED = [...ROUTES, ...API_ROUTES]

/**
 * Tope de cordura para `PROGRESS_EVERY`. Se expresa contra la lista real para
 * no ser un número suelto, pero sin acoplarlo a su tamaño exacto: si la lista
 * crece, imprimir cada 8 sigue siendo razonable.
 */
const ALL_ROUTES_LENGTH_HINT = Math.max(16, WARMED.length)

/** Presupuesto declarado del job, en milisegundos, leído del workflow. */
function jobTimeoutMs(job: string): number {
  const start = CI.indexOf(`\n  ${job}:`)
  if (start === -1) return Number.NaN
  const rest = CI.slice(start + 1)
  const end = rest.search(/\n  \S/)
  const block = end === -1 ? rest : rest.slice(0, end)
  const match = block.match(/timeout-minutes:\s*(\d+)/)
  return match ? Number(match[1]) * 60_000 : Number.NaN
}

/**
 * Patrones de ruta reales de la app. Un `page.tsx` o un `route.ts` es una ruta;
 * los grupos `(...)`, las rutas paralelas `@x` y las carpetas privadas `_x` no
 * aportan segmento a la URL. Se incluyen `manifest`/`robots`/`sitemap` porque
 * son rutas de nivel 1 sin `page.tsx` y un spec visita `/manifest.json`.
 */
const SKIP_SEGMENT = /^\(.*\)$|^@|^_/

function collectPatterns(dir: string, segments: string[], out: Set<string>): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectPatterns(full, SKIP_SEGMENT.test(entry) ? segments : [...segments, entry], out)
      continue
    }
    if (entry === "page.tsx" || entry === "route.ts") out.add(`/${segments.join("/")}`)
  }
}

const APP_DIR = join(REPO, "src", "app")
const PATTERNS = new Set<string>()
collectPatterns(APP_DIR, [], PATTERNS)
for (const file of readdirSync(APP_DIR)) {
  if (/^(manifest|robots|sitemap)\.tsx?$/.test(file)) {
    PATTERNS.add(`/${file.replace(/\.tsx?$/, "")}`)
  }
}

/**
 * Resuelve una ruta concreta a su patrón. `/chihuahua/checkout` no es un hueco
 * si `/[ciudad]/checkout` ya está calentado: la compilación es del patrón, no
 * del valor. Ante empate gana el patrón más estático.
 */
function resolve(path: string): string | null {
  const parts = path.split("/").filter(Boolean)
  let best: string | null = null
  let bestDynamic = Number.POSITIVE_INFINITY

  for (const pattern of PATTERNS) {
    const segments = pattern.split("/").filter(Boolean)
    if (segments.length !== parts.length) continue
    if (!segments.every((segment, index) => segment.startsWith("[") || segment === parts[index])) {
      continue
    }
    const dynamic = segments.filter((segment) => segment.startsWith("[")).length
    if (dynamic < bestDynamic || (dynamic === bestDynamic && best !== null && pattern < best)) {
      best = pattern
      bestDynamic = dynamic
    }
  }

  return best
}

const CI_SPECS = readdirSync(E2E_DIR)
  .filter((name) => name.endsWith(".spec.ts"))
  .sort()
  .map((name) => ({ name, text: readFileSync(join(E2E_DIR, name), "utf8") }))
  .filter((spec) => spec.text.includes("@ci"))

const PATH_LITERAL_RE = /["'`](\/[A-Za-z0-9_\-./[\]]*)["'`]/g

/** Patrón de ruta → `spec:literal` que lo visita. Los 404 no entran. */
function visitedPatterns(): Map<string, Set<string>> {
  const visited = new Map<string, Set<string>>()

  for (const spec of CI_SPECS) {
    for (const match of spec.text.matchAll(PATH_LITERAL_RE)) {
      const raw = match[1] ?? ""
      if (raw === "" || raw.includes("${")) continue
      const path = (raw.split("?")[0] ?? raw).split("#")[0] ?? raw
      const pattern = resolve(path)
      // Sin patrón no hay página que compilar: es un 404 a propósito.
      if (pattern === null) continue
      if (!visited.has(pattern)) visited.set(pattern, new Set())
      visited.get(pattern)?.add(`${spec.name}:${raw}`)
    }
  }

  return visited
}

const VISITED = visitedPatterns()

/**
 * Patrones que un spec `@ci` visita y que se decidió **no** calentar, con
 * motivo. Hoy está vacío a propósito: si se añade uno, que sea con una razón
 * escrita, no para poner el test verde.
 */
const EXCEPTED_PATTERNS: readonly string[] = []

describe("contrato del calentamiento e2e", () => {
  it("lee el calentamiento, los patrones de ruta y los specs @ci", () => {
    // Canario: si alguno de los parsers de arriba deja de encontrar su fuente,
    // todas las aserciones siguientes pasarían en vacío.
    expect(ROUTES.length).toBeGreaterThanOrEqual(40)
    expect(API_ROUTES.length).toBeGreaterThanOrEqual(10)
    expect(CI_SPECS.length).toBeGreaterThanOrEqual(15)
    expect(PATTERNS.size).toBeGreaterThanOrEqual(150)
    expect(VISITED.size).toBeGreaterThanOrEqual(40)

    for (const [name, value] of Object.entries({
      ATTEMPTS,
      ROUTE_TIMEOUT_MS,
      WARM_BUDGET_MS,
      CONCURRENCY,
      PROGRESS_EVERY,
    })) {
      expect(Number.isFinite(value), `no se pudo leer ${name} de e2e/global-setup.ts`).toBe(true)
    }
  })

  it("el presupuesto del calentamiento es una fracción del job, no un múltiplo", () => {
    const budget = jobTimeoutMs("e2e")
    expect(Number.isFinite(budget), "no se pudo leer timeout-minutes del job e2e").toBe(true)

    // El calentamiento no puede llevarse más de un quinto del job: el resto es
    // `npm ci`, los navegadores, el arranque del server y los tests. La
    // regresión original era 3,2 h de calentamiento dentro de un job de 25 min.
    expect(
      WARM_BUDGET_MS * 5,
      `El calentamiento declara ${WARM_BUDGET_MS / 1000}s y el job e2e tiene ` +
        `${budget / 60000} min. Un calentamiento que puede consumir más de un quinto del job ` +
        `no deja presupuesto para los tests que viene a proteger.`
    ).toBeLessThanOrEqual(budget)
  })

  it("una ruta colgada no puede comerse el presupuesto entero", () => {
    // Regresión original: 3 intentos × 60 s = 180 s para una sola ruta, más que
    // el presupuesto completo. El deadline ya lo acota, pero el timeout por
    // ruta debe seguir siendo una fracción para que un fallo no deje a las
    // demás sin turno.
    expect(
      ROUTE_TIMEOUT_MS * ATTEMPTS,
      `${ATTEMPTS} intentos de ${ROUTE_TIMEOUT_MS / 1000}s son ` +
        `${(ROUTE_TIMEOUT_MS * ATTEMPTS) / 1000}s, y el presupuesto entero es ` +
        `${WARM_BUDGET_MS / 1000}s.`
    ).toBeLessThan(WARM_BUDGET_MS)
  })

  it("el deadline se comprueba antes de cada intento, no al final del bucle", () => {
    const warmBody = SETUP.slice(
      SETUP.indexOf("async function warm("),
      SETUP.indexOf("export default")
    )
    expect(warmBody, "`warm()` ya no recibe el deadline").toMatch(
      /async function warm\([^)]*deadline[^)]*\)/
    )

    const attemptLoop = warmBody.indexOf("for (let attempt")
    const deadlineCheck = warmBody.indexOf("Date.now() >= deadline")
    const fetchCall = warmBody.indexOf("await fetch(")

    expect(attemptLoop).toBeGreaterThanOrEqual(0)
    expect(deadlineCheck, "`warm()` no comprueba el deadline").toBeGreaterThanOrEqual(0)
    expect(deadlineCheck).toBeGreaterThan(attemptLoop)
    expect(
      deadlineCheck,
      "El deadline se comprueba después del fetch: una ruta colgada se lleva sus " +
        `${ROUTE_TIMEOUT_MS / 1000}s de todas formas.`
    ).toBeLessThan(fetchCall)
  })

  it("al agotarse el deadline degrada: para, nombra lo pendiente y no aborta", () => {
    const setupBody = SETUP.slice(SETUP.indexOf("export default"))
    expect(setupBody).toContain("const deadline = started + WARM_BUDGET_MS")
    expect(setupBody).toContain("pending.push(...ALL_ROUTES.slice(index))")
    expect(setupBody).toMatch(/if \(Date\.now\(\) >= deadline\) \{[\s\S]*?break/)
    expect(
      setupBody,
      "Las rutas que quedaron sin calentar no se nombran: el fallo siguiente será un " +
        "timeout anónimo en vez de una ruta concreta."
    ).toMatch(/console\.warn\([\s\S]*?pending\.join/)

    // Degrada, no aborta: los tests corren igual pagando en frío lo que faltó.
    expect(setupBody).not.toContain("process.exit")
    expect(setupBody).not.toContain("throw new Error")
  })

  it("imprime progreso mientras calienta", () => {
    const setupBody = SETUP.slice(SETUP.indexOf("export default"))

    // El reporter `github` no sube el buffer cuando el paso se cancela, así que
    // lo único que sobrevive es lo que se imprima *durante* el calentamiento.
    // La corrida que falló no imprimió nada en 67 s y no dejó ni rastro.
    expect(setupBody).toMatch(/console\.log\(`\[e2e\] calentando \$\{done\}\/\$\{ALL_ROUTES\.length\}/)
    expect(setupBody).toContain("nextReport += PROGRESS_EVERY")
    expect(PROGRESS_EVERY).toBeGreaterThan(0)
    expect(PROGRESS_EVERY).toBeLessThanOrEqual(ALL_ROUTES_LENGTH_HINT)
  })

  it("toda ruta calentada es absoluta, única y se calienta en lotes acotados", () => {
    const malformed = WARMED.filter((route) => !route.startsWith("/"))
    expect(malformed, "Una ruta relativa no resuelve contra `baseURL`.").toEqual([])

    const seen = new Set<string>()
    const duplicated: string[] = []
    for (const route of WARMED) {
      if (seen.has(route)) duplicated.push(route)
      seen.add(route)
    }
    expect(duplicated, "Calentar la misma ruta dos veces gasta presupuesto sin compilar nada.").toEqual(
      []
    )

    expect(CONCURRENCY).toBeGreaterThan(0)
    expect(
      CONCURRENCY,
      "Sin cota, varias compilaciones de Next en dev se pelean por la CPU y el " +
        "calentamiento sale más lento que secuencial."
    ).toBeLessThanOrEqual(8)
    expect(SETUP).toContain("index += CONCURRENCY")
    expect(SETUP).toContain("Promise.all(batch.map((route) => warm(baseURL, route, deadline)))")
  })

  it("todo patrón de ruta que visita un spec @ci está calentado", () => {
    const warmed = new Set(
      WARMED.map((route) => resolve(route)).filter((pattern): pattern is string => pattern !== null)
    )

    const missing = [...VISITED.keys()]
      .filter((pattern) => !warmed.has(pattern) && !EXCEPTED_PATTERNS.includes(pattern))
      .sort()

    expect(
      missing,
      "Estos patrones de ruta los visita un spec @ci y el calentamiento no los cubre: el " +
        "primero que los toque paga la compilación del segmento dentro de su propio timeout. " +
        "Añade una ruta de cada patrón a ROUTES (o a API_ROUTES) en e2e/global-setup.ts."
    ).toEqual([])

    // Y que las excepciones declaradas sigan teniendo motivo.
    const stale = EXCEPTED_PATTERNS.filter((pattern) => warmed.has(pattern) || !VISITED.has(pattern))
    expect(stale, "Estas excepciones ya no hacen falta: bórralas.").toEqual([])
  })

  it("las 19 secciones de /admin están calentadas, aunque el barrido las visite en bucle", () => {
    // `admin-guards.spec.ts` recorre `ADMIN_SECTIONS` con `page.goto(path)`, así
    // que **no contiene ni un literal** de sección y el escáner de arriba no
    // puede verlas. Se comprobó de la peor manera: el contrato las detectó por
    // accidente porque un comentario las nombraba entre backticks — y la regex
    // de literales también acepta backticks. Es decir, el día que alguien
    // reformule ese comentario, once secciones se quedan sin calentar en
    // silencio y el flake vuelve sin que nadie lo relacione.
    //
    // La dependencia se declara aquí en vez de dejar que la descubra un
    // comentario: añadir una sección al mapa obliga a calentarla.
    const warmed = new Set(
      WARMED.map((route) => resolve(route)).filter((pattern): pattern is string => pattern !== null)
    )

    // Canario: si `resolve` no reconociera una sección, se caería del filtro y
    // el test pasaría sin revisarla. Se exige que las 19 resuelvan.
    const secciones = ADMIN_SECTIONS.map((section) => section.path)
    expect(secciones.length).toBeGreaterThanOrEqual(19)
    expect(secciones.filter((path) => resolve(path) === null)).toEqual([])

    const sinCalentar = secciones
      .map((path) => resolve(path) as string)
      .filter((pattern) => !warmed.has(pattern))
      .sort()

    expect(
      sinCalentar,
      "El barrido de guardas visita estas secciones y el calentamiento no las cubre: " +
        "cada una pagaría su compilación en frío dentro del timeout de su prueba. " +
        "Añádelas a ROUTES en e2e/global-setup.ts."
    ).toEqual([])
  })
})
