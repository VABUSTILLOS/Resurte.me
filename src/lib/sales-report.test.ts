import { describe, expect, it } from "vitest"
import {
  abcClassOf,
  abcSummary,
  buildSalesRows,
  salesReportCsv,
  salesReportInsights,
  type SalesInput,
} from "./sales-report"

/** Acceso indexado seguro para las aserciones (noUncheckedIndexedAccess). */
function at<T>(list: T[], index: number): T {
  const item = list[index]
  if (item === undefined) throw new Error(`falta el elemento ${index}`)
  return item
}

/** Segunda línea del CSV (sin BOM). */
function csvLine(csv: string, index = 1): string {
  return at(csv.replace("\ufeff", "").split("\n"), index)
}

const item = (over: Partial<SalesInput> & { productId: number }): SalesInput => ({
  name: `P${over.productId}`,
  units: 1,
  revenue: 100,
  unitCost: null,
  ...over,
})

describe("abcClassOf", () => {
  it("clasifica A cuando la mayor parte del ingreso cae antes del 80 %", () => {
    expect(abcClassOf(0, 0.2)).toBe("A")
    expect(abcClassOf(0.7, 0.1)).toBe("A")
    expect(abcClassOf(0.79, 0.01)).toBe("A")
  })

  it("clasifica B entre 80 % y 95 %", () => {
    expect(abcClassOf(0.8, 0.1)).toBe("B")
    expect(abcClassOf(0.9, 0.05)).toBe("B")
  })

  it("clasifica C por arriba de 95 %", () => {
    expect(abcClassOf(0.95, 0.05)).toBe("C")
    expect(abcClassOf(0.94, 0.1)).toBe("C")
    expect(abcClassOf(1, 0)).toBe("C")
  })
})

describe("buildSalesRows", () => {
  it("ordena por ingreso descendente y calcula participación acumulada", () => {
    const rows = buildSalesRows([
      item({ productId: 1, revenue: 50 }),
      item({ productId: 2, revenue: 150 }),
    ])
    expect(rows.map((r) => r.productId)).toEqual([2, 1])
    expect(at(rows, 0).share).toBeCloseTo(0.75, 5)
    expect(at(rows, 0).abc).toBe("A")
    // El segundo arranca en 75 % y termina en 100 %: su punto medio cae en B.
    expect(at(rows, 1).abc).toBe("B")
  })

  it("calcula margen $ y % con costo unitario", () => {
    const rows = buildSalesRows([
      item({ productId: 1, units: 10, revenue: 250, unitCost: 15 }),
    ])
    expect(at(rows, 0).margin).toBe(100)
    expect(at(rows, 0).marginPct).toBe(40)
  })

  it("deja el margen en null cuando falta el costo", () => {
    const rows = buildSalesRows([item({ productId: 1, units: 3, revenue: 90 })])
    expect(at(rows, 0).margin).toBeNull()
    expect(at(rows, 0).marginPct).toBeNull()
  })

  it("reporta margen negativo cuando el costo supera el ingreso", () => {
    const rows = buildSalesRows([
      item({ productId: 1, units: 2, revenue: 20, unitCost: 30 }),
    ])
    expect(at(rows, 0).margin).toBe(-40)
    expect(at(rows, 0).marginPct).toBe(-200)
  })

  it("marca como C los productos sin ingreso", () => {
    const rows = buildSalesRows([
      item({ productId: 1, revenue: 100 }),
      item({ productId: 2, revenue: 0, units: 4 }),
    ])
    expect(at(rows, 1).abc).toBe("C")
    expect(at(rows, 1).share).toBe(0)
  })

  it("reparte A/B/C sobre el acumulado real", () => {
    // 10 productos con 10 % cada uno: los primeros 8 cubren el 80 % (A),
    // el 9.º arranca en 80 % (B) y el 10.º en 90 % (C).
    const rows = buildSalesRows(
      Array.from({ length: 10 }, (_, i) => item({ productId: i + 1, revenue: 10 }))
    )
    expect(abcSummary(rows)).toEqual({ A: 8, B: 1, C: 1 })
  })

  it("clasifica como A un producto que concentra todo el ingreso", () => {
    const rows = buildSalesRows([item({ productId: 1, revenue: 500 })])
    expect(at(rows, 0).abc).toBe("A")
  })

  it("no divide por cero sin ingreso", () => {
    const rows = buildSalesRows([item({ productId: 1, revenue: 0 })])
    expect(at(rows, 0).share).toBe(0)
    expect(at(rows, 0).marginPct).toBeNull()
  })
})

describe("salesReportInsights", () => {
  const rows = buildSalesRows([
    item({ productId: 1, name: "Arroz", units: 20, revenue: 800, unitCost: 10 }),
    item({ productId: 2, name: "Frijol", units: 5, revenue: 150, unitCost: 5 }),
    item({ productId: 3, name: "Sin costo", units: 2, revenue: 50 }),
  ])

  it("suma ingresos, unidades y margen", () => {
    const i = salesReportInsights(rows)
    expect(i.products).toBe(3)
    expect(i.units).toBe(27)
    expect(i.revenue).toBe(1000)
    // Arroz: 800 − 200 = 600; Frijol: 150 − 25 = 125; total 725.
    expect(i.margin).toBe(725)
  })

  it("calcula el margen % solo sobre el ingreso con costo capturado", () => {
    const i = salesReportInsights(rows)
    // 725 / (800 + 150) = 76.32 %
    expect(i.marginPct).toBeCloseTo(76.32, 1)
  })

  it("cuenta los productos sin costo capturado", () => {
    expect(salesReportInsights(rows).missingCost).toBe(1)
  })

  it("identifica top por ingreso, top por unidades y extremos de margen", () => {
    const i = salesReportInsights(rows)
    expect(i.topRevenue).toEqual({ name: "Arroz", revenue: 800 })
    expect(i.topUnits).toEqual({ name: "Arroz", units: 20 })
    // Frijol margina 83.3 %; Arroz 75 %.
    expect(i.bestMargin?.name).toBe("Frijol")
    expect(i.worstMargin?.name).toBe("Arroz")
  })

  it("devuelve totales vacíos sin filas", () => {
    const i = salesReportInsights([])
    expect(i).toMatchObject({ products: 0, units: 0, revenue: 0, margin: null, marginPct: null })
    expect(i.topRevenue).toBeNull()
    expect(i.bestMargin).toBeNull()
  })

  it("expone la concentración de la clase A", () => {
    const i = salesReportInsights(rows)
    expect(i.aShare).toBeGreaterThan(0)
    expect(i.aShare).toBeLessThanOrEqual(1)
  })
})

describe("salesReportCsv", () => {
  it("escribe encabezado, margen y clase ABC", () => {
    const rows = buildSalesRows([
      item({ productId: 1, name: "Arroz", units: 2, revenue: 100, unitCost: 30 }),
    ])
    const csv = salesReportCsv(rows)
    const [header, line] = csv.replace("\ufeff", "").split("\n")
    if (header === undefined || line === undefined) throw new Error("CSV incompleto")
    expect(header).toBe(
      "producto,unidades,monto,costo,margen,margen_pct,clase_abc,participacion_pct"
    )
    expect(line).toBe("Arroz,2,100.00,60.00,40.00,40.0,A,100.00")
  })

  it("deja celdas vacías cuando falta el costo", () => {
    const rows = buildSalesRows([item({ productId: 1, name: "Sin costo", revenue: 50 })])
    const line = csvLine(salesReportCsv(rows))
    expect(line).toBe("Sin costo,1,50.00,,,,A,100.00")
  })

  it("escapa nombres con comas y comillas", () => {
    const rows = buildSalesRows([item({ productId: 1, name: 'Arroz "Premium", 1kg' })])
    const line = csvLine(salesReportCsv(rows))
    expect(line.startsWith('"Arroz ""Premium"", 1kg",1,')).toBe(true)
  })

  it("empieza con BOM para que Excel respete los acentos", () => {
    expect(salesReportCsv([]).startsWith("\ufeff")).toBe(true)
  })
})
