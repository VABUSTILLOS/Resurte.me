import { describe, expect, it } from "vitest"

import { GEO_ENGINES, GEO_PANEL_SIZE, GEO_QUERIES } from "@/lib/geo-queries"
import {
  GEO_ACCURACY_VALUES,
  GEO_PANEL_FIELD_BINDINGS,
  GEO_PANEL_LIMITS,
  cellKey,
  comparePanelMonths,
  computePanelMetrics,
  currentMonthKey,
  formatDelta,
  formatRate,
  indexCells,
  isGeoAccuracy,
  monthKeyOf,
  monthLabel,
  monthStartDate,
  normalizeCell,
  normalizeCompetitorHost,
  panelRowsToCsv,
  panelRunMonths,
  panelVerdict,
  previousMonthWithData,
  shiftMonth,
  type GeoPanelRecord,
} from "@/lib/geo-panel"

const FIRST_QUERY = GEO_QUERIES[0]!
const FIRST_ENGINE = GEO_ENGINES[0]!

const record = (over: Partial<GeoPanelRecord> = {}): GeoPanelRecord => ({
  runMonth: "2026-09",
  queryId: FIRST_QUERY.id,
  engineId: FIRST_ENGINE.id,
  cited: false,
  citationPosition: null,
  citedFact: null,
  factAccuracy: null,
  competitorHost: null,
  notes: null,
  ...over,
})

// Corrida completa de 80 celdas, para las métricas con denominador lleno.
const fullRun = (citedCount: number, inaccurate = 0, partial = 0): GeoPanelRecord[] => {
  const rows: GeoPanelRecord[] = []
  let i = 0
  for (const q of GEO_QUERIES) {
    for (const e of GEO_ENGINES) {
      const cited = i < citedCount
      const accuracy =
        cited && i < inaccurate ? "no" : cited && i < inaccurate + partial ? "parcial" : cited ? "si" : null
      rows.push(
        record({
          queryId: q.id,
          engineId: e.id,
          cited,
          citationPosition: cited ? 1 : null,
          factAccuracy: accuracy,
        })
      )
      i++
    }
  }
  return rows
}

describe("meses", () => {
  it("deriva el mes de un día local", () => {
    expect(monthKeyOf("2026-09-18")).toBe("2026-09")
    expect(monthKeyOf("2026-12-01")).toBe("2026-12")
  })

  it("rechaza días y meses inválidos", () => {
    expect(monthKeyOf("2026-13-01")).toBe("")
    expect(monthKeyOf("2026-00-01")).toBe("")
    expect(monthKeyOf("18/09/2026")).toBe("")
    expect(monthKeyOf("")).toBe("")
  })

  it("el mes actual usa el día LOCAL, no UTC", () => {
    // 2026-10-01T02:00Z es 2026-09-30 en México: el mes debe ser septiembre.
    const instant = new Date("2026-10-01T02:00:00Z")
    expect(currentMonthKey("America/Mexico_City", instant)).toBe("2026-09")
    expect(currentMonthKey("UTC", instant)).toBe("2026-10")
  })

  it("monthStartDate devuelve el primer día", () => {
    expect(monthStartDate("2026-09")).toBe("2026-09-01")
    expect(monthStartDate("2026-13")).toBe("")
    expect(monthStartDate("2026-9")).toBe("")
  })

  it("monthLabel es en español y sin Intl", () => {
    expect(monthLabel("2026-09")).toBe("septiembre 2026")
    expect(monthLabel("2027-01")).toBe("enero 2027")
    expect(monthLabel("2027-12")).toBe("diciembre 2027")
    expect(monthLabel("nope")).toBe("")
  })

  it("shiftMonth cruza el año en ambos sentidos", () => {
    expect(shiftMonth("2026-09", 1)).toBe("2026-10")
    expect(shiftMonth("2026-12", 1)).toBe("2027-01")
    expect(shiftMonth("2026-01", -1)).toBe("2025-12")
    expect(shiftMonth("2026-09", -12)).toBe("2025-09")
    expect(shiftMonth("2026-09", 4)).toBe("2027-01")
    expect(shiftMonth("bad", 1)).toBe("")
  })

  it("panelRunMonths ordena de más reciente a más antiguo", () => {
    const rows = [record({ runMonth: "2026-08" }), record({ runMonth: "2026-10" }), record({ runMonth: "2026-09" })]
    expect(panelRunMonths(rows)).toEqual(["2026-10", "2026-09", "2026-08"])
    expect(panelRunMonths([])).toEqual([])
  })

  it("previousMonthWithData NO es el mes anterior calendario", () => {
    // Agosto no se corrió: comparar contra él sería comparar contra nada.
    const months = ["2026-09", "2026-07", "2026-06"]
    expect(previousMonthWithData(months, "2026-09")).toBe("2026-07")
    expect(previousMonthWithData(["2026-09"], "2026-09")).toBeNull()
    expect(previousMonthWithData([], "2026-09")).toBeNull()
  })
})

describe("normalizeCell", () => {
  it("conserva una celda citada completa", () => {
    const cell = normalizeCell({
      queryId: "q",
      engineId: "e",
      cited: true,
      citationPosition: 3,
      citedFact: "Pedido mínimo $1,500",
      factAccuracy: "si",
    })
    expect(cell).toMatchObject({
      cited: true,
      citationPosition: 3,
      citedFact: "Pedido mínimo $1,500",
      factAccuracy: "si",
    })
  })

  it("una celda no citada pierde posición y veredicto", () => {
    // La contradicción que la tabla también prohíbe con un CHECK.
    const cell = normalizeCell({
      queryId: "q",
      engineId: "e",
      cited: false,
      citationPosition: 3,
      factAccuracy: "si",
    })
    expect(cell.citationPosition).toBeNull()
    expect(cell.factAccuracy).toBeNull()
  })

  it("una celda no citada SÍ conserva competidor y notas", () => {
    const cell = normalizeCell({
      queryId: "q",
      engineId: "e",
      cited: false,
      competitorHost: "competidor.mx",
      notes: "Citó a otro con el mismo dato.",
    })
    expect(cell.competitorHost).toBe("competidor.mx")
    expect(cell.notes).toBe("Citó a otro con el mismo dato.")
  })

  it("descarta una posición fuera de rango o no entera", () => {
    expect(normalizeCell({ queryId: "q", engineId: "e", cited: true, citationPosition: 0 }).citationPosition).toBeNull()
    expect(
      normalizeCell({ queryId: "q", engineId: "e", cited: true, citationPosition: GEO_PANEL_LIMITS.position + 1 })
        .citationPosition
    ).toBeNull()
    expect(
      normalizeCell({ queryId: "q", engineId: "e", cited: true, citationPosition: Number.NaN }).citationPosition
    ).toBeNull()
    expect(normalizeCell({ queryId: "q", engineId: "e", cited: true, citationPosition: 2.9 }).citationPosition).toBe(2)
  })

  it("descarta un veredicto que no está en el enum", () => {
    expect(
      normalizeCell({ queryId: "q", engineId: "e", cited: true, factAccuracy: "quizas" }).factAccuracy
    ).toBeNull()
    expect(normalizeCell({ queryId: "q", engineId: "e", cited: true, factAccuracy: "parcial" }).factAccuracy).toBe(
      "parcial"
    )
  })

  it("recorta los textos al límite de la columna", () => {
    const cell = normalizeCell({
      queryId: "q",
      engineId: "e",
      cited: true,
      citedFact: "x".repeat(GEO_PANEL_LIMITS.fact + 50),
      competitorHost: "y".repeat(GEO_PANEL_LIMITS.competitor + 50),
      notes: "z".repeat(GEO_PANEL_LIMITS.notes + 50),
    })
    expect(cell.citedFact).toHaveLength(GEO_PANEL_LIMITS.fact)
    expect(cell.competitorHost).toHaveLength(GEO_PANEL_LIMITS.competitor)
    expect(cell.notes).toHaveLength(GEO_PANEL_LIMITS.notes)
  })

  it("convierte cadenas vacías en null", () => {
    const cell = normalizeCell({
      queryId: "q",
      engineId: "e",
      cited: true,
      citedFact: "   ",
      competitorHost: "",
      notes: "\n",
    })
    expect(cell.citedFact).toBeNull()
    expect(cell.competitorHost).toBeNull()
    expect(cell.notes).toBeNull()
  })

  it("los límites del módulo son los mismos que los CHECK de la migración", () => {
    // Espejo declarado: si uno cambia, el otro debe cambiar.
    expect(GEO_PANEL_LIMITS).toEqual({ position: 50, fact: 300, competitor: 120, notes: 500 })
  })

  it("isGeoAccuracy sólo acepta el enum", () => {
    for (const v of GEO_ACCURACY_VALUES) expect(isGeoAccuracy(v)).toBe(true)
    expect(isGeoAccuracy("si ")).toBe(false)
    expect(isGeoAccuracy(null)).toBe(false)
    expect(isGeoAccuracy(1)).toBe(false)
  })

  it("las 5 columnas de valor están atadas a un campo documentado", () => {
    expect(GEO_PANEL_FIELD_BINDINGS).toHaveLength(5)
    expect(GEO_PANEL_FIELD_BINDINGS.map((b) => b.docKey)).toEqual([
      "citado",
      "posicion",
      "dato",
      "exacto",
      "competidor",
    ])
  })
})

describe("indexCells / cellKey", () => {
  it("indexa por pregunta y motor", () => {
    const rows = [record({ queryId: "a", engineId: "chatgpt" }), record({ queryId: "b", engineId: "gemini" })]
    const map = indexCells(rows)
    expect(map.size).toBe(2)
    expect(map.get(cellKey("a", "chatgpt"))?.queryId).toBe("a")
    expect(map.get(cellKey("a", "gemini"))).toBeUndefined()
  })

  it("una celda repetida cuenta una sola vez", () => {
    const rows = [record({ queryId: "a", engineId: "chatgpt" }), record({ queryId: "a", engineId: "chatgpt" })]
    expect(indexCells(rows).size).toBe(1)
  })
})

describe("computePanelMetrics", () => {
  it("sin filas todas las tasas son null, no 0", () => {
    const m = computePanelMetrics([])
    expect(m.recorded).toBe(0)
    expect(m.total).toBe(GEO_PANEL_SIZE)
    // La cobertura es la excepción: el denominador (80 celdas) existe siempre,
    // así que "0 de 80" es un hecho medido, no una ausencia de medición.
    expect(m.coverageRate).toBe(0)
    expect(m.citedRate).toBeNull()
    expect(m.accuracyRate).toBeNull()
    expect(m.wrongRate).toBeNull()
    expect(m.byEngine.every((e) => e.citedRate === null)).toBe(true)
  })

  it("una corrida completa de 80 celdas sin citas", () => {
    const m = computePanelMetrics(fullRun(0))
    expect(m.recorded).toBe(GEO_PANEL_SIZE)
    expect(m.coverageRate).toBe(1)
    expect(m.cited).toBe(0)
    expect(m.citedRate).toBe(0)
    expect(m.rated).toBe(0)
    expect(m.accuracyRate).toBeNull()
    expect(m.gaps).toHaveLength(GEO_PANEL_SIZE)
  })

  it("calcula la tasa de citas y la cobertura", () => {
    const m = computePanelMetrics(fullRun(20))
    expect(m.recorded).toBe(80)
    expect(m.cited).toBe(20)
    expect(m.citedRate).toBe(0.25)
    expect(m.accuracyRate).toBe(1)
    expect(m.wrongRate).toBe(0)
  })

  it("separa exactas, inexactas y parciales", () => {
    const m = computePanelMetrics(fullRun(10, 3, 2))
    expect(m.cited).toBe(10)
    expect(m.rated).toBe(10)
    expect(m.inaccurate).toBe(3)
    expect(m.partial).toBe(2)
    expect(m.accurate).toBe(5)
    expect(m.accuracyRate).toBe(0.5)
    expect(m.wrongRate).toBeCloseTo(0.3)
  })

  it("una celda a medias no infla la cobertura", () => {
    const m = computePanelMetrics(fullRun(0).slice(0, 40))
    expect(m.recorded).toBe(40)
    expect(m.coverageRate).toBe(0.5)
  })

  it("desglosa por motor", () => {
    const rows: GeoPanelRecord[] = []
    for (const q of GEO_QUERIES) {
      rows.push(record({ queryId: q.id, engineId: "chatgpt", cited: true, factAccuracy: "si" }))
      rows.push(record({ queryId: q.id, engineId: "perplexity", cited: false }))
    }
    const m = computePanelMetrics(rows)
    const chatgpt = m.byEngine.find((e) => e.engineId === "chatgpt")
    const perplexity = m.byEngine.find((e) => e.engineId === "perplexity")
    const gemini = m.byEngine.find((e) => e.engineId === "gemini")
    expect(chatgpt?.citedRate).toBe(1)
    expect(perplexity?.citedRate).toBe(0)
    // Gemini no se corrió: sin datos, no 0%.
    expect(gemini?.recorded).toBe(0)
    expect(gemini?.citedRate).toBeNull()
  })

  it("agrupa los competidores normalizando el dominio", () => {
    const rows = [
      record({ queryId: "a", engineId: "chatgpt", competitorHost: "https://www.Competidor.MX/precios" }),
      record({ queryId: "b", engineId: "chatgpt", competitorHost: "competidor.mx" }),
      record({ queryId: "c", engineId: "chatgpt", competitorHost: "otro.com" }),
      // Una celda citada no cuenta como competidor.
      record({ queryId: "d", engineId: "chatgpt", cited: true, competitorHost: "competidor.mx" }),
    ]
    const m = computePanelMetrics(rows)
    expect(m.topCompetitors).toEqual([
      { host: "competidor.mx", count: 2 },
      { host: "otro.com", count: 1 },
    ])
  })

  it("las brechas traen la ruta que debería haber sido citada", () => {
    const m = computePanelMetrics([record({ queryId: FIRST_QUERY.id, engineId: "chatgpt", cited: false })])
    expect(m.gaps).toHaveLength(1)
    expect(m.gaps[0]!.targetPath).toBe(FIRST_QUERY.targetPath)
    expect(m.gaps[0]!.prompt).toBe(FIRST_QUERY.prompt)
    expect(m.gaps[0]!.engineLabel).toBe("ChatGPT")
  })

  it("ignora una celda de una pregunta desconocida", () => {
    const m = computePanelMetrics([record({ queryId: "no-existe", engineId: "chatgpt", cited: false })])
    expect(m.recorded).toBe(1)
    expect(m.gaps).toHaveLength(0)
  })
})

describe("normalizeCompetitorHost", () => {
  it("normaliza esquema, www y ruta", () => {
    expect(normalizeCompetitorHost("https://www.Competidor.MX/precios")).toBe("competidor.mx")
    expect(normalizeCompetitorHost("http://competidor.mx")).toBe("competidor.mx")
    expect(normalizeCompetitorHost("competidor.mx")).toBe("competidor.mx")
  })

  it("devuelve null para vacío", () => {
    expect(normalizeCompetitorHost("")).toBeNull()
    expect(normalizeCompetitorHost("   ")).toBeNull()
    expect(normalizeCompetitorHost(null)).toBeNull()
    expect(normalizeCompetitorHost(undefined)).toBeNull()
  })
})

describe("comparePanelMonths", () => {
  it("sin mes anterior todo delta es null", () => {
    const c = comparePanelMonths(computePanelMetrics(fullRun(20)), null, null)
    expect(c.previousMonth).toBeNull()
    expect(c.citedRateDelta).toBeNull()
    expect(c.coverageDelta).toBeNull()
    expect(c.accuracyRateDelta).toBeNull()
  })

  it("calcula el delta en puntos porcentuales", () => {
    const current = computePanelMetrics(fullRun(24))
    const previous = computePanelMetrics(fullRun(16))
    const c = comparePanelMonths(current, previous, "2026-08")
    expect(c.previousMonth).toBe("2026-08")
    expect(c.citedRateDelta).toBeCloseTo(0.1)
    expect(c.coverageDelta).toBe(0)
  })

  it("no compara una tasa contra un mes sin datos", () => {
    const current = computePanelMetrics(fullRun(20))
    const previous = computePanelMetrics([])
    const c = comparePanelMonths(current, previous, "2026-08")
    expect(c.citedRateDelta).toBeNull()
    expect(c.accuracyRateDelta).toBeNull()
  })
})

describe("panelVerdict", () => {
  it("sin filas", () => {
    expect(panelVerdict(computePanelMetrics([]))).toBe("sin_datos")
  })

  it("cobertura parcial gana sobre sin_citas", () => {
    // 40 celdas sin ninguna cita: no se puede concluir "no nos citan".
    expect(panelVerdict(computePanelMetrics(fullRun(0).slice(0, 40)))).toBe("cobertura_parcial")
  })

  it("corrida completa sin citas", () => {
    expect(panelVerdict(computePanelMetrics(fullRun(0)))).toBe("sin_citas")
  })

  it("más inexactas que exactas es citas_inexactas", () => {
    expect(panelVerdict(computePanelMetrics(fullRun(10, 6)))).toBe("citas_inexactas")
  })

  it("empate no es inexactas", () => {
    expect(panelVerdict(computePanelMetrics(fullRun(10, 5)))).toBe("citas_correctas")
  })

  it("corrida completa con citas correctas", () => {
    expect(panelVerdict(computePanelMetrics(fullRun(80)))).toBe("citas_correctas")
  })

  it("una cita sin veredicto no cuenta como inexacta", () => {
    const m = computePanelMetrics(fullRun(10))
    expect(m.rated).toBe(10)
    expect(panelVerdict(m)).toBe("citas_correctas")
  })
})

describe("formato", () => {
  it("formatRate nunca imprime 0% para null", () => {
    expect(formatRate(null)).toBe("sin datos")
    expect(formatRate(0)).toBe("0%")
    expect(formatRate(0.25)).toBe("25%")
    expect(formatRate(0.1234, 1)).toBe("12.3%")
    expect(formatRate(Number.NaN)).toBe("sin datos")
  })

  it("formatDelta usa puntos porcentuales y firma", () => {
    expect(formatDelta(null)).toBe("—")
    expect(formatDelta(0.1)).toBe("+10 pp")
    expect(formatDelta(-0.05)).toBe("-5 pp")
    expect(formatDelta(0)).toBe("0 pp")
  })
})

describe("panelRowsToCsv", () => {
  it("emite encabezado y una fila por celda", () => {
    const csv = panelRowsToCsv([record({ queryId: FIRST_QUERY.id, engineId: "chatgpt", cited: true, factAccuracy: "si" })])
    const lines = csv.split("\n")
    expect(lines[0]).toBe("mes,pregunta_id,pregunta,motor,citado,posicion,dato_citado,exacto,competidor,notas")
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain("2026-09")
    expect(lines[1]).toContain("ChatGPT")
    expect(lines[1]).toContain(",si,")
  })

  it("escapa comas y comillas", () => {
    const csv = panelRowsToCsv([
      record({ cited: true, citedFact: 'Dijo "1,500" pesos', notes: "linea1\nlinea2" }),
    ])
    expect(csv).toContain('"Dijo ""1,500"" pesos"')
    expect(csv).toContain('"linea1\nlinea2"')
  })

  it("una celda repetida aparece una vez", () => {
    const csv = panelRowsToCsv([record(), record()])
    expect(csv.split("\n")).toHaveLength(2)
  })
})
