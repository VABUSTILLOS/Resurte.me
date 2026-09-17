import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { ABANDONED_CART_EXCLUDED_METHODS, isAbandonedCartOrder } from "@/lib/abandoned-cart"
import {
  DIRECT_SOURCE,
  OUTCOMES,
  buildFunnelTrend,
  buildMethodBreakdown,
  buildUtmBreakdown,
  classifyOrder,
  localDayKey,
  type FunnelOrder,
  type TrendOrder,
} from "@/lib/conversion-funnel"
import { DEFAULT_TIMEZONE } from "@/lib/local-date"

/**
 * Contrato SQL ↔ motor JS del embudo de conversión.
 *
 * El embudo vive en **dos** implementaciones de la misma regla:
 *
 *   1. `admin_conversion_funnel_window` en `supabase/migrations/*_conversion_funnel.sql`,
 *      que es el camino rápido (agrega en Postgres, sin tope de filas);
 *   2. `classifyOrder` / `buildFunnel` en `src/lib/conversion-funnel.ts`, que es
 *      la referencia y a la que la ruta degrada cuando la migración no está
 *      aplicada.
 *
 * Nada garantizaba que dijeran lo mismo. La cabecera de la migración ya
 * afirmaba que existía una prueba de paridad; no existía. Esta la escribe.
 *
 * Sin base de datos y sin `jsdom` (no hay en `vitest.config.ts`), el contrato se
 * lee como **texto**, igual que `admin-productos-contrast.contract.test.ts`. No
 * es una prueba de la sintaxis SQL —para eso está el motor—: es una prueba de
 * que las dos copias de la regla no se separan sin que alguien lo note.
 *
 * Lo que sí se verifica de verdad, porque se puede, es la **semántica**: la
 * tabla de verdad evalúa las condiciones del `CASE` en el orden en que están
 * escritas en el archivo y exige que el resultado coincida con `classifyOrder`
 * para las 60 combinaciones de estado, pago y método. Reordenar el `CASE` o
 * cambiar una condición cambia el resultado y la prueba falla.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations")
const MIGRATION_SUFFIX = "_conversion_funnel.sql"
const ENGINE_FILE = join(process.cwd(), "src", "lib", "conversion-funnel.ts")
const ROUTE_FILE = join(process.cwd(), "src", "app", "api", "admin", "funnel", "route.ts")

function findMigration(suffix: string): string {
  return readdirSync(MIGRATIONS_DIR).find((name) => name.endsWith(suffix)) ?? ""
}

const MIGRATION_FILE = findMigration(MIGRATION_SUFFIX)

/** Sin comentarios: la prosa de la migración también nombra `'paid'`, `'pending'`… */
const SQL = MIGRATION_FILE
  ? readFileSync(join(MIGRATIONS_DIR, MIGRATION_FILE), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*--.*$/gm, "")
  : ""

const ENGINE_SOURCE = readFileSync(ENGINE_FILE, "utf8")
const ROUTE_SOURCE = readFileSync(ROUTE_FILE, "utf8")

/** Primer grupo de captura de un patrón, o `""`. Nunca lanza: el test reporta. */
function pick(pattern: RegExp, text = SQL): string {
  return pattern.exec(text)?.[1] ?? ""
}

// ── Extracción ───────────────────────────────────────────────────

/** Cuerpo del `CASE` que decide el desenlace, tal como está en el archivo. */
const CASE_BODY = pick(/CASE([\s\S]*?)END AS outcome/)

/** Lista `VALUES ('paid', 1), …` de la CTE `outcomes`. */
const OUTCOME_VALUES = pick(/outcomes\(outcome, sort\) AS \(\s*VALUES([\s\S]*?)\n\s*\),/)

const BRANCHES = [...CASE_BODY.matchAll(/WHEN\s+([\s\S]*?)\s+THEN\s+'(\w+)'/g)].map((match) => ({
  condition: (match[1] ?? "").replace(/\s+/g, " ").trim(),
  outcome: match[2] ?? "",
}))

const ELSE_OUTCOME = pick(/ELSE\s+'(\w+)'/, CASE_BODY)

const OUTCOME_SORTS = [...OUTCOME_VALUES.matchAll(/'(\w+)',\s*(\d+)/g)].map((match) => ({
  outcome: match[1] ?? "",
  sort: Number(match[2] ?? 0),
}))

// ── Traducción de las condiciones SQL a predicados JS ────────────

/**
 * Traducción de cada `WHEN` al predicado que dice lo mismo.
 *
 * `o.status = 'pending' AND o.payment_status = 'pending' AND (…)` se traduce a
 * `isAbandonedCartOrder`, que es la definición compartida con el motor de
 * recuperación: si la migración excluyera otro método, la prueba de abajo lo
 * detecta al comparar la lista de exclusiones del texto SQL con la constante.
 */
const WHEN_RULES: { matches: RegExp; when: (order: FunnelOrder) => boolean }[] = [
  { matches: /^o\.payment_status = 'paid'$/, when: (order) => order.payment_status === "paid" },
  { matches: /^o\.payment_status = 'failed'$/, when: (order) => order.payment_status === "failed" },
  { matches: /^o\.status = 'cancelled'$/, when: (order) => order.status === "cancelled" },
  {
    matches: /^o\.status = 'pending' AND o\.payment_status = 'pending' AND \(/,
    when: (order) => isAbandonedCartOrder(order),
  },
]

function predicateFor(condition: string): ((order: FunnelOrder) => boolean) | null {
  return WHEN_RULES.find((rule) => rule.matches.test(condition))?.when ?? null
}

const UNTRANSLATED = BRANCHES.filter((branch) => !predicateFor(branch.condition)).map(
  (branch) => branch.condition,
)

/** Desenlace según el SQL: evalúa los `WHEN` en el orden del archivo. */
function outcomePerSql(order: FunnelOrder): string {
  for (const branch of BRANCHES) {
    if (predicateFor(branch.condition)?.(order)) return branch.outcome
  }
  return ELSE_OUTCOME
}

/** Métodos que la condición excluye, en cualquier forma (`<>` o `NOT IN`). */
function excludedMethodsIn(condition: string): Set<string> {
  const found = new Set<string>()
  for (const match of condition.matchAll(/payment_method\s*<>\s*'([^']+)'/g)) {
    found.add(match[1] ?? "")
  }
  const notIn = /payment_method\s+NOT\s+IN\s*\(([^)]*)\)/i.exec(condition)
  if (notIn) {
    for (const match of (notIn[1] ?? "").matchAll(/'([^']+)'/g)) found.add(match[1] ?? "")
  }
  return found
}

// ── Datos de prueba ──────────────────────────────────────────────

function order(overrides: Partial<FunnelOrder> = {}): FunnelOrder {
  return {
    id: 1,
    status: "confirmed",
    payment_status: "paid",
    payment_method: "card",
    total: 100,
    utm_source: null,
    ...overrides,
  }
}

const TRUTH_TABLE: FunnelOrder[] = []
for (const payment_status of ["paid", "failed", "pending", "refunded", null]) {
  for (const status of ["cancelled", "pending", "confirmed"]) {
    for (const payment_method of ["card", "oxxo", "cash_on_delivery", null]) {
      TRUTH_TABLE.push(order({ payment_status, status, payment_method }))
    }
  }
}

// ── Pruebas ──────────────────────────────────────────────────────

describe("contrato del embudo de conversión: SQL ↔ motor JS", () => {
  it("encuentra la migración y extrae el CASE de desenlaces", () => {
    expect(MIGRATION_FILE, `no hay ${MIGRATION_SUFFIX} en supabase/migrations`).not.toBe("")
    expect(BRANCHES.length, "el CASE del desenlace ya no tiene ramas WHEN").toBeGreaterThan(0)
    expect(ELSE_OUTCOME, "el CASE del desenlace ya no tiene ELSE").not.toBe("")
  })

  it("traduce todas las condiciones del CASE al motor JS", () => {
    expect(UNTRANSLATED).toEqual([])
  })

  it("clasifica las 60 combinaciones igual que classifyOrder", () => {
    for (const candidate of TRUTH_TABLE) {
      expect(outcomePerSql(candidate), JSON.stringify(candidate)).toBe(classifyOrder(candidate))
    }
  })

  it("la tabla de verdad cubre los cinco desenlaces", () => {
    const reached = new Set(TRUTH_TABLE.map((candidate) => classifyOrder(candidate)))
    expect([...reached].sort()).toEqual([...OUTCOMES].sort())
  })

  it("el CASE devuelve exactamente los cinco desenlaces", () => {
    const returned = [...BRANCHES.map((branch) => branch.outcome), ELSE_OUTCOME]
    expect([...new Set(returned)].sort()).toEqual([...OUTCOMES].sort())
  })

  it("la prioridad del CASE es pagado → fallido → cancelado → abandonado", () => {
    // Distinta a propósito del orden de presentación de `OUTCOMES`
    // (pagado, fallido, **abandonado, cancelado**, otro): un pedido cancelado y
    // sin pagar es "cancelado", no "abandonado". Un pago rechazado gana sobre
    // la cancelación para que la tarjeta declinada no se esconda.
    expect(BRANCHES.map((branch) => branch.outcome)).toEqual([
      "paid",
      "failed",
      "cancelled",
      "pending",
    ])
    expect(OUTCOMES.slice(0, 4)).not.toEqual(BRANCHES.map((branch) => branch.outcome))
  })

  it("la CTE outcomes presenta los desenlaces en el orden de OUTCOMES", () => {
    expect(OUTCOME_SORTS.map((row) => row.outcome)).toEqual([...OUTCOMES])
    expect(OUTCOME_SORTS.map((row) => row.sort)).toEqual([1, 2, 3, 4, 5])
  })

  it("el abandono del SQL excluye exactamente ABANDONED_CART_EXCLUDED_METHODS", () => {
    const pending = BRANCHES.find((branch) => branch.outcome === "pending")
    expect(pending, "el CASE ya no tiene rama 'pending'").toBeDefined()

    const condition = pending?.condition ?? ""
    expect(condition).toContain("o.status = 'pending'")
    expect(condition).toContain("o.payment_status = 'pending'")
    // `payment_method IS NULL` cuenta como abandonado: es el abandono más literal.
    expect(condition).toMatch(/o\.payment_method IS NULL/)

    const excluded = [...excludedMethodsIn(condition)].sort()
    expect(excluded).toEqual([...ABANDONED_CART_EXCLUDED_METHODS].sort())
  })

  it("la ventana es semiabierta [since, until) en los dos caminos", () => {
    expect(SQL).toMatch(/WHERE\s+o\.created_at >= p_since AND o\.created_at < p_until/)
    expect(ROUTE_SOURCE).toContain('.gte("created_at", detailFrom)')
    expect(ROUTE_SOURCE).toContain('.lt("created_at", untilIso)')
  })

  it("el centinela de UTM directo coincide con DIRECT_SOURCE", () => {
    const literal = pick(/'([^']*directo[^']*)'/)
    expect(literal).toBe(DIRECT_SOURCE)
    // Vacío y solo-espacios caen en el mismo centinela en los dos caminos.
    expect(SQL).toMatch(/NULLIF\(\s*btrim\(o\.utm_source\)\s*,\s*''\s*\)/)
    const rows = buildUtmBreakdown([order({ utm_source: "   " })])
    expect(rows[0]?.source).toBe(DIRECT_SOURCE)
  })

  it("el centinela de método vacío coincide con el del motor", () => {
    const literal = pick(/'([^']*sin método[^']*)'/)
    expect(literal).not.toBe("")
    const rows = buildMethodBreakdown([order({ payment_method: null })])
    expect(rows[0]?.method).toBe(literal)
  })

  it("el tope de fuentes UTM del SQL es el que aplica buildUtmBreakdown", () => {
    const limit = Number(pick(/\bLIMIT (\d+)/))
    expect(limit).toBeGreaterThan(0)
    const many = Array.from({ length: limit + 2 }, (_, index) =>
      order({ id: index + 1, utm_source: `canal-${index}` }),
    )
    expect(buildUtmBreakdown(many)).toHaveLength(limit)
  })

  it("declara el mismo orden de desgloses que el motor", () => {
    expect(SQL).toMatch(/ORDER BY n DESC, method ASC/)
    expect(SQL).toMatch(/ORDER BY revenue DESC, n DESC, source ASC/)
    // El orden del SQL es intención; el que manda es el reordenamiento en JS,
    // porque `localeCompare(…, "es")` no coincide con el cotejo de la base.
    expect(ENGINE_SOURCE).toContain(".sort(compareMethodRows)")
    expect(ENGINE_SOURCE).toContain(".sort(compareUtmRows)")
  })

  it("mantiene las funciones cerradas a PUBLIC, anon y authenticated", () => {
    const windowSignature = "public.admin_conversion_funnel_window\\(timestamptz, timestamptz\\)"
    const funnelSignature =
      "public.admin_conversion_funnel\\(timestamptz, timestamptz, timestamptz, timestamptz\\)"

    for (const signature of [windowSignature, funnelSignature]) {
      expect(SQL).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`))
      expect(SQL).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${signature} FROM anon`))
      expect(SQL).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${signature} FROM authenticated`))
      expect(SQL).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`))
    }
  })

  it("el índice de periodo cubre las columnas que selecciona la ruta", () => {
    const base = pick(/const ORDER_DETAIL_COLUMNS = "([^"]+)"/, ROUTE_SOURCE)
    const withUtm = pick(/const ORDER_DETAIL_COLUMNS_WITH_UTM = `([^`]+)`/, ROUTE_SOURCE)
    expect(base, "la ruta ya no declara ORDER_DETAIL_COLUMNS").not.toBe("")
    expect(withUtm, "la ruta ya no declara ORDER_DETAIL_COLUMNS_WITH_UTM").not.toBe("")

    const selected = new Set(
      withUtm
        .replace("${ORDER_DETAIL_COLUMNS}", base)
        .split(",")
        .map((column) => column.trim())
        .filter(Boolean),
    )

    const key = pick(/CREATE INDEX IF NOT EXISTS idx_orders_created_at[\s\S]*?\(([^)]*)\)/)
    const included = pick(/idx_orders_created_at[\s\S]*?INCLUDE\s*\(([^)]*)\)/)
    const covered = new Set([
      key.replace(/\s+DESC$/i, "").trim(),
      ...included.split(",").map((column) => column.trim()),
    ])

    expect(covered.has("created_at"), "el índice ya no ordena por created_at").toBe(true)
    for (const column of selected) {
      expect(covered, `el índice no cubre ${column}: el index-only scan se pierde`).toContain(column)
    }
  })
})

/**
 * Contrato de la tendencia diaria.
 *
 * La serie no tiene implementación SQL (se arma en JS con el detalle que la
 * ruta ya leyó), pero comparte dos reglas con el agregado y esas sí se pueden
 * verificar: la ventana semiabierta y el día local. Si alguna se separa, la
 * serie deja de cuadrar con el embudo sin que nadie lo note.
 */
describe("contrato de la tendencia diaria", () => {
  const TIMEZONE = "America/Mexico_City"

  function trendOrder(overrides: Partial<TrendOrder> = {}): TrendOrder {
    return {
      id: 1,
      status: "pending",
      payment_status: "paid",
      payment_method: "card",
      total: 100,
      utm_source: null,
      created_at: "2026-08-04T12:00:00Z",
      ...overrides,
    }
  }

  it("usa la misma ventana semiabierta [since, until) que el SQL", () => {
    expect(SQL).toMatch(/WHERE\s+o\.created_at >= p_since AND o\.created_at < p_until/)

    const since = "2026-08-03T00:00:00Z"
    const until = "2026-08-05T00:00:00Z"
    const points = buildFunnelTrend(
      [
        // Exactamente en el borde inferior: dentro.
        trendOrder({ id: 1, created_at: since }),
        // Exactamente en el borde superior: fuera, como en `o.created_at < p_until`.
        trendOrder({ id: 2, created_at: until }),
      ],
      since,
      until,
    )
    expect(points.reduce((sum, p) => sum + p.created, 0)).toBe(1)
  })

  it("toma la zona del restaurante de DEFAULT_TIMEZONE, sin literales sueltos", () => {
    // Una zona escrita a mano en el motor se separaría de la que usan el resto
    // de las automatizaciones, y el corte de día se correría sin aviso.
    expect(ENGINE_SOURCE).toContain('import { DEFAULT_TIMEZONE } from "@/lib/local-date"')
    expect(ENGINE_SOURCE).not.toMatch(/["']America\/\w/)
    expect(DEFAULT_TIMEZONE).toBe(TIMEZONE)
    // Y el motor agrupa por ese día local, no por el día UTC.
    expect(localDayKey("2026-08-04T02:00:00Z")).toBe("2026-08-03")
    expect(localDayKey("2026-08-04T02:00:00Z", "UTC")).toBe("2026-08-04")
  })

  it("la ruta apaga la serie cuando el detalle se recorta o falla", () => {
    // Un corte deja completos los días recientes y vacíos los primeros: dibujar
    // eso publicaría un crecimiento inventado.
    expect(ROUTE_SOURCE).toMatch(/const trendUnavailable: TrendUnavailable = detail\.error/)
    expect(ROUTE_SOURCE).toMatch(/trendUnavailable === null\s*\?\s*buildFunnelTrend\(/)
    expect(ROUTE_SOURCE).toContain(": null")
  })

  it("la serie se arma con la ventana del periodo, no con la de comparación", () => {
    // `detailFrom` es la ventana previa en el respaldo: pasar esa haría que la
    // serie abarcara dos periodos.
    expect(ROUTE_SOURCE).toContain(
      "buildFunnelTrend(currentRows.map(toTrendOrder), sinceIso, untilIso)",
    )
  })
})
