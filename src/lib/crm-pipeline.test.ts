import { describe, it, expect } from "vitest"
import {
  nextCrmStatus,
  isCrmStatus,
  groupIntoBoard,
  isFollowUpDue,
  prospectUrgency,
  compareByUrgency,
  filterProspects,
  matchesProspectFilters,
  normalizeForSearch,
  digitsOf,
  phoneKey,
  isLeadStatus,
  isLeadPending,
  isLeadConverted,
  prospectNameFromLead,
  leadToProspectDraft,
  findMatchingProspect,
  LEAD_STATUSES,
  CRM_BOARD_COLUMNS,
  type CrmProspect,
  type CrmStatus,
  type ConvertibleLead,
} from "./crm-pipeline"
import { crmProspect } from "./crm-fixtures"

describe("nextCrmStatus", () => {
  it("avanza por el embudo feliz", () => {
    expect(nextCrmStatus("nuevo")).toBe("contactado")
    expect(nextCrmStatus("contactado")).toBe("en_seguimiento")
    expect(nextCrmStatus("en_seguimiento")).toBe("cliente_activo")
  })

  it("cliente_activo y cerrados no avanzan", () => {
    expect(nextCrmStatus("cliente_activo")).toBeNull()
    expect(nextCrmStatus("inactivo")).toBeNull()
    expect(nextCrmStatus("perdido")).toBeNull()
  })
})

describe("isCrmStatus", () => {
  it("valida contra la lista cerrada", () => {
    expect(isCrmStatus("nuevo")).toBe(true)
    expect(isCrmStatus("borrado")).toBe(false)
  })
})

describe("groupIntoBoard", () => {
  const p = (
    id: number,
    status: CrmStatus,
    created = "2026-09-01T00:00:00Z",
    extra: Partial<CrmProspect> = {},
  ): CrmProspect => crmProspect({ id, status, created_at: created, name: `P${id}`, ...extra })

  it("agrupa por columnas y mete inactivo/perdido en cerrados", () => {
    const board = groupIntoBoard([p(1, "nuevo"), p(2, "perdido"), p(3, "inactivo")])
    expect(board["nuevo"]!.map((x) => x.id)).toEqual([1])
    expect(board["cerrados"]!.map((x) => x.id).sort()).toEqual([2, 3])
  })

  it("ordena más recientes primero dentro de la columna", () => {
    const board = groupIntoBoard([
      p(1, "nuevo", "2026-09-01T00:00:00Z"),
      p(2, "nuevo", "2026-09-10T00:00:00Z"),
    ])
    expect(board["nuevo"]!.map((x) => x.id)).toEqual([2, 1])
  })

  it("sube los seguimientos vencidos al principio de la columna", () => {
    const board = groupIntoBoard([
      p(1, "nuevo", "2026-09-11T00:00:00Z"),
      p(2, "nuevo", "2026-09-10T00:00:00Z", { next_follow_up_at: "2026-09-01T00:00:00Z" }),
    ])
    // Pese a ser más antiguo, el 2 tiene la promesa vencida y va primero.
    expect(board["nuevo"]!.map((x) => x.id)).toEqual([2, 1])
  })

  it("cubre todas las columnas declaradas aunque estén vacías", () => {
    const board = groupIntoBoard([])
    expect(Object.keys(board)).toEqual(CRM_BOARD_COLUMNS.map((c) => c.key))
  })
})

describe("prospectUrgency", () => {
  const now = new Date("2026-09-12T12:00:00Z")
  const base: CrmProspect = crmProspect({ name: "P" })

  it("clasifica vencido, sin agendar y agendado", () => {
    expect(prospectUrgency({ ...base, next_follow_up_at: "2026-09-11T00:00:00Z" }, now)).toBe(0)
    expect(prospectUrgency(base, now)).toBe(1)
    expect(prospectUrgency({ ...base, next_follow_up_at: "2026-09-20T00:00:00Z" }, now)).toBe(2)
  })

  it("entre vencidos, el más atrasado va primero", () => {
    const a = { ...base, id: 1, next_follow_up_at: "2026-09-10T00:00:00Z" }
    const b = { ...base, id: 2, next_follow_up_at: "2026-09-01T00:00:00Z" }
    expect([a, b].sort((x, y) => compareByUrgency(x, y, now)).map((x) => x.id)).toEqual([2, 1])
  })

  it("entre agendados, el más próximo va primero", () => {
    const a = { ...base, id: 1, next_follow_up_at: "2026-09-30T00:00:00Z" }
    const b = { ...base, id: 2, next_follow_up_at: "2026-09-15T00:00:00Z" }
    expect([a, b].sort((x, y) => compareByUrgency(x, y, now)).map((x) => x.id)).toEqual([2, 1])
  })
})

describe("isFollowUpDue", () => {
  const now = new Date("2026-09-12T12:00:00Z")
  it("sin fecha no está vencido", () => {
    expect(isFollowUpDue(null, now)).toBe(false)
  })
  it("fecha pasada vencida, futura no", () => {
    expect(isFollowUpDue("2026-09-11T00:00:00Z", now)).toBe(true)
    expect(isFollowUpDue("2026-09-13T00:00:00Z", now)).toBe(false)
  })
})

describe("bandeja de leads", () => {
  it("valida el estado contra la lista cerrada", () => {
    expect(LEAD_STATUSES).toEqual(["nuevo", "convertido", "descartado"])
    expect(isLeadStatus("convertido")).toBe(true)
    expect(isLeadStatus("archivado")).toBe(false)
  })

  it("un lead sólo está pendiente si sigue en nuevo y sin prospecto", () => {
    expect(isLeadPending({ status: "nuevo", converted_prospect_id: null })).toBe(true)
    expect(isLeadPending({ status: "nuevo", converted_prospect_id: 7 })).toBe(false)
    expect(isLeadPending({ status: "descartado", converted_prospect_id: null })).toBe(false)
  })

  it("convertido exige el vínculo al prospecto", () => {
    expect(isLeadConverted({ status: "convertido", converted_prospect_id: 7 })).toBe(true)
    expect(isLeadConverted({ status: "convertido", converted_prospect_id: null })).toBe(false)
    expect(isLeadConverted({ status: "nuevo", converted_prospect_id: 7 })).toBe(false)
  })
})

describe("conversión lead → prospecto", () => {
  const lead = (extra: Partial<ConvertibleLead> = {}): ConvertibleLead => ({
    id: 42,
    email: "dueno@taqueria.mx",
    phone: "+52 614 123 4567",
    restaurant_name: "Taquería El Sol",
    source: "restaurantes_landing",
    qualification: {
      score: 78,
      segment: "A",
      recommended_tier: "Oro",
      recommended_features: ["marketing_ia"],
      reasons: ["Volumen alto"],
    },
    ...extra,
  })

  it("usa el restaurante como nombre de contacto", () => {
    expect(prospectNameFromLead(lead())).toBe("Taquería El Sol")
  })

  it("sin restaurante cae al local del correo", () => {
    expect(prospectNameFromLead(lead({ restaurant_name: "  " }))).toBe("dueno")
    expect(prospectNameFromLead(lead({ restaurant_name: null, email: "a@b.mx" }))).toBe("a")
  })

  it("el alta queda sin asignar, en nuevo y marcada como lead web", () => {
    const draft = leadToProspectDraft(lead())
    expect(draft).toMatchObject({
      lead_id: 42,
      seller_id: null,
      status: "nuevo",
      source: "lead_web",
      whatsapp: "+52 614 123 4567",
    })
  })

  it("las notas resumen el diagnóstico del calificador", () => {
    const notes = leadToProspectDraft(lead()).notes
    expect(notes).toContain("Lead web (restaurantes_landing)")
    expect(notes).toContain("Segmento A · 78/100 · nivel recomendado Oro")
    expect(notes).toContain("marketing_ia")
    expect(notes).toContain("Volumen alto")
  })

  it("sin diagnóstico lo dice en vez de inventar un puntaje", () => {
    expect(leadToProspectDraft(lead({ qualification: null })).notes).toContain(
      "Sin diagnóstico del calificador.",
    )
  })

  it("no copia el nivel de cashback al tier de Plan Chihuahua", () => {
    // `tier` (1..3) y `recommended_tier` (Verde..Diamante) son ejes distintos.
    expect(leadToProspectDraft(lead())).not.toHaveProperty("tier")
  })
})

describe("normalizeForSearch y digitsOf", () => {
  it("quita acentos y mayúsculas", () => {
    expect(normalizeForSearch("  Taquería EL Sol ")).toBe("taqueria el sol")
  })
  it("sólo dígitos, o null", () => {
    expect(digitsOf("+52 614-123-4567")).toBe("526141234567")
    expect(digitsOf("---")).toBeNull()
    expect(digitsOf(null)).toBeNull()
  })
  it("phoneKey ignora la lada del país", () => {
    expect(phoneKey("+52 614 123 4567")).toBe("6141234567")
    expect(phoneKey("614 123 4567")).toBe("6141234567")
    expect(phoneKey("52 1 614 123 4567")).toBe("6141234567")
    expect(phoneKey("6141234")).toBe("6141234")
    expect(phoneKey(null)).toBeNull()
  })
})

describe("findMatchingProspect", () => {
  const draft = leadToProspectDraft({
    id: 42,
    email: "dueno@taqueria.mx",
    phone: "+52 614 123 4567",
    restaurant_name: "Taquería El Sol",
    source: "restaurantes_landing",
    qualification: null,
  })

  const existing = (extra: Partial<CrmProspect> = {}): CrmProspect =>
    crmProspect({ name: "Otro", ...extra })

  it("sin coincidencias devuelve null", () => {
    expect(findMatchingProspect(draft, [existing({ email: "otro@x.mx" })])).toBeNull()
  })

  it("gana el vínculo explícito por lead_id", () => {
    const linked = existing({ id: 9, lead_id: 42, email: "otro@x.mx" })
    const samePhone = existing({ id: 8, phone: "526141234567" })
    expect(findMatchingProspect(draft, [samePhone, linked])?.id).toBe(9)
  })

  it("empata por teléfono aunque el formato cambie", () => {
    expect(findMatchingProspect(draft, [existing({ id: 5, whatsapp: "6141234567" })])?.id).toBe(5)
  })

  it("empata por correo sin distinguir mayúsculas", () => {
    const match = findMatchingProspect(draft, [existing({ id: 6, email: "DUENO@Taqueria.MX" })])
    expect(match?.id).toBe(6)
  })
})

describe("filterProspects", () => {
  const now = new Date("2026-09-12T12:00:00Z")
  const row = (extra: Partial<CrmProspect> = {}): CrmProspect =>
    crmProspect({
      seller_id: "seller-1",
      name: "Taquería El Sol",
      restaurant_name: "El Sol",
      phone: "6141234567",
      email: "hola@elsol.mx",
      ...extra,
    })

  it("sin filtros deja pasar todo", () => {
    expect(filterProspects([row()], {})).toHaveLength(1)
  })

  it("busca sin acentos ni mayúsculas en nombre y correo", () => {
    expect(matchesProspectFilters(row(), { q: "taqueria el sol" }, now)).toBe(true)
    expect(matchesProspectFilters(row(), { q: "ELSOL.MX" }, now)).toBe(true)
    expect(matchesProspectFilters(row(), { q: "pizzeria" }, now)).toBe(false)
  })

  it("filtra por estado", () => {
    expect(matchesProspectFilters(row(), { status: "nuevo" }, now)).toBe(true)
    expect(matchesProspectFilters(row(), { status: "perdido" }, now)).toBe(false)
    expect(matchesProspectFilters(row(), { status: "todos" }, now)).toBe(true)
  })

  it("due exige una fecha ya pasada", () => {
    expect(matchesProspectFilters(row(), { due: true }, now)).toBe(false)
    expect(
      matchesProspectFilters(row({ next_follow_up_at: "2026-09-11T00:00:00Z" }), { due: true }, now),
    ).toBe(true)
    expect(
      matchesProspectFilters(row({ next_follow_up_at: "2026-09-20T00:00:00Z" }), { due: true }, now),
    ).toBe(false)
  })

  it("unassigned sólo deja los que no tienen vendedor", () => {
    expect(matchesProspectFilters(row(), { unassigned: true }, now)).toBe(false)
    expect(matchesProspectFilters(row({ seller_id: null }), { unassigned: true }, now)).toBe(true)
  })
})
