import { describe, expect, it } from "vitest"
import {
  buildFunnelBySegment,
  buildFunnelBySource,
  buildLeadFunnel,
  buildPendingAging,
  daysPending,
  filterLeads,
  formatRate,
  isPending,
  leadSources,
  rate,
  type FunnelLead,
} from "./crm-funnel"

function lead(overrides: Partial<FunnelLead> = {}): FunnelLead {
  return {
    id: 1,
    email: "a@b.com",
    phone: null,
    source: "checkout_drawer",
    created_at: "2025-01-10T12:00:00.000Z",
    restaurant_name: null,
    qualification: null,
    status: "nuevo",
    converted_at: null,
    converted_prospect_id: null,
    ...overrides,
  }
}

const NOW = new Date("2025-01-15T12:00:00.000Z")

describe("rate", () => {
  it("devuelve null cuando no hay denominador", () => {
    expect(rate(0, 0)).toBeNull()
    expect(rate(5, 0)).toBeNull()
  })

  it("redondea al entero más cercano", () => {
    expect(rate(1, 3)).toBe(33)
    expect(rate(2, 3)).toBe(67)
    expect(rate(3, 3)).toBe(100)
  })
})

describe("formatRate", () => {
  it("dice 'No medido' en vez de inventar un 0%", () => {
    expect(formatRate(null)).toBe("No medido")
    expect(formatRate(0)).toBe("0%")
    expect(formatRate(42)).toBe("42%")
  })
})

describe("isPending", () => {
  it("un lead nuevo sin prospecto sigue en la bandeja", () => {
    expect(isPending(lead())).toBe(true)
  })

  it("convertido o descartado ya no está pendiente", () => {
    expect(isPending(lead({ status: "convertido", converted_prospect_id: 9 }))).toBe(false)
    expect(isPending(lead({ status: "descartado" }))).toBe(false)
  })

  it("un convertido sin prospecto vinculado no cuenta como pendiente", () => {
    expect(isPending(lead({ status: "convertido" }))).toBe(false)
  })
})

describe("filterLeads", () => {
  const rows = [
    lead({ id: 1, email: "uno@taqueria.mx", restaurant_name: "Taquería El Pastor", phone: "+52 614 123 4567" }),
    lead({ id: 2, email: "dos@cafe.mx", source: "exit_intent", qualification: null }),
    lead({
      id: 3,
      email: "tres@sushi.mx",
      source: "restaurantes_landing",
      restaurant_name: "Sushi Nori",
      qualification: { score: 80, segment: "A" },
      status: "convertido",
      converted_prospect_id: 7,
    }),
    lead({ id: 4, email: "cuatro@bar.mx", status: "descartado" }),
  ]

  it("sin filtros devuelve todo", () => {
    expect(filterLeads(rows)).toHaveLength(4)
  })

  it("pendingOnly deja solo los pendientes", () => {
    expect(filterLeads(rows, { pendingOnly: true }).map((l) => l.id)).toEqual([1, 2])
  })

  it("filtra por fuente", () => {
    expect(filterLeads(rows, { source: "exit_intent" }).map((l) => l.id)).toEqual([2])
  })

  it("filtra por segmento y excluye los que no tienen diagnóstico", () => {
    expect(filterLeads(rows, { segment: "A" }).map((l) => l.id)).toEqual([3])
  })

  it("el texto ignora acentos y mayúsculas", () => {
    expect(filterLeads(rows, { q: "taqueria" }).map((l) => l.id)).toEqual([1])
    expect(filterLeads(rows, { q: "TAQUERÍA" }).map((l) => l.id)).toEqual([1])
  })

  it("el texto busca también en teléfono", () => {
    expect(filterLeads(rows, { q: "6141234567" }).map((l) => l.id)).toEqual([1])
  })

  it("combina filtros", () => {
    expect(filterLeads(rows, { q: "mx", pendingOnly: true, source: "checkout_drawer" }).map((l) => l.id)).toEqual([1])
  })

  it("un texto sin coincidencias devuelve vacío", () => {
    expect(filterLeads(rows, { q: "zzz" })).toEqual([])
  })
})

describe("leadSources", () => {
  it("lista fuentes únicas y ordenadas", () => {
    const rows = [lead({ source: "b" }), lead({ source: "a" }), lead({ source: "b" })]
    expect(leadSources(rows)).toEqual(["a", "b"])
  })

  it("sin leads devuelve vacío", () => {
    expect(leadSources([])).toEqual([])
  })
})

describe("buildLeadFunnel", () => {
  it("cuenta capturados, calificados y convertidos", () => {
    const rows = [
      lead({ id: 1, qualification: { score: 50, segment: "B" } }),
      lead({ id: 2 }),
      lead({ id: 3, qualification: { score: 90, segment: "A" }, converted_prospect_id: 1, status: "convertido" }),
      lead({ id: 4 }),
    ]
    const steps = buildLeadFunnel(rows)
    expect(steps.map((s) => [s.key, s.count])).toEqual([
      ["captured", 4],
      ["qualified", 2],
      ["converted", 1],
    ])
    expect(steps[0]!.rateFromPrevious).toBeNull()
    expect(steps[1]!.rateFromPrevious).toBe(50)
    expect(steps[2]!.rateFromPrevious).toBe(25)
  })

  it("sin leads reporta 'no medido' en vez de 0%", () => {
    const steps = buildLeadFunnel([])
    expect(steps.every((s) => s.count === 0)).toBe(true)
    expect(steps[1]!.rateFromPrevious).toBeNull()
    expect(steps[2]!.rateFromPrevious).toBeNull()
  })
})

describe("buildFunnelBySource", () => {
  it("agrupa por fuente y ordena por volumen", () => {
    const rows = [
      lead({ source: "a" }),
      lead({ source: "a", converted_prospect_id: 1, status: "convertido" }),
      lead({ source: "b" }),
      lead({ source: "b" }),
      lead({ source: "b" }),
    ]
    const table = buildFunnelBySource(rows)
    expect(table.map((r) => r.source)).toEqual(["b", "a"])
    expect(table[0]).toMatchObject({ source: "b", total: 3, converted: 0, conversionRate: 0 })
    expect(table[1]).toMatchObject({ source: "a", total: 2, converted: 1, conversionRate: 50 })

  })

  it("sin leads devuelve tabla vacía", () => {
    expect(buildFunnelBySource([])).toEqual([])
  })
})

describe("buildFunnelBySegment", () => {
  it("agrupa los sin diagnóstico aparte", () => {
    const rows = [
      lead({ qualification: { score: 10, segment: "A" } }),
      lead({ qualification: { score: 20, segment: "A" } }),
      lead(),
      lead({ qualification: { score: 30, segment: "C" } }),
    ]
    const table = buildFunnelBySegment(rows)
    expect(table.map((r) => r.segment)).toEqual(["A", "C", "sin_diagnostico"])
    expect(table[0]).toMatchObject({ total: 2, converted: 0, conversionRate: 0 })
    expect(table[2]).toMatchObject({ segment: "sin_diagnostico", total: 1 })
  })
})

describe("buildPendingAging", () => {
  it("reparte los pendientes en tramos", () => {
    const rows = [
      lead({ id: 1, created_at: "2025-01-15T08:00:00.000Z" }),
      lead({ id: 2, created_at: "2025-01-13T12:00:00.000Z" }),
      lead({ id: 3, created_at: "2025-01-10T12:00:00.000Z" }),
      lead({ id: 4, created_at: "2025-01-01T12:00:00.000Z" }),
      lead({ id: 5, created_at: "2024-11-01T12:00:00.000Z" }),
    ]
    const buckets = buildPendingAging(rows, NOW)
    expect(buckets.map((b) => b.count)).toEqual([1, 1, 1, 1, 1])
  })

  it("ignora los ya resueltos", () => {
    const rows = [
      lead({ id: 1, created_at: "2025-01-15T08:00:00.000Z" }),
      lead({ id: 2, status: "descartado", created_at: "2024-01-01T12:00:00.000Z" }),
      lead({ id: 3, status: "convertido", converted_prospect_id: 3, created_at: "2024-01-01T12:00:00.000Z" }),
    ]
    const buckets = buildPendingAging(rows, NOW)
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(1)
    expect(buckets[0]!.count).toBe(1)
  })

  it("ignora fechas inválidas", () => {
    const rows = [lead({ created_at: "no-es-fecha" })]
    const buckets = buildPendingAging(rows, NOW)
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(0)
  })

  it("sin pendientes todos los tramos quedan en cero", () => {
    const buckets = buildPendingAging([], NOW)
    expect(buckets).toHaveLength(5)
    expect(buckets.every((b) => b.count === 0)).toBe(true)
  })
})

describe("daysPending", () => {
  it("cuenta días completos", () => {
    expect(daysPending({ created_at: "2025-01-10T12:00:00.000Z" }, NOW)).toBe(5)
  })

  it("nunca es negativo si la fecha está en el futuro", () => {
    expect(daysPending({ created_at: "2025-02-01T12:00:00.000Z" }, NOW)).toBe(0)
  })

  it("devuelve null con fecha inválida", () => {
    expect(daysPending({ created_at: "x" }, NOW)).toBeNull()
  })
})
