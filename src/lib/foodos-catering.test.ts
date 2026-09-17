import { describe, expect, it } from "vitest"

import {
  CATERING_STATUSES,
  CATERING_STATUS_FLOW,
  CATERING_STATUS_RANK,
  EMPTY_CATERING_KPIS,
  MAX_HEADCOUNT,
  MAX_INCLUDES,
  isCateringStatus,
  isCateringTerminal,
  normalizeIncludes,
  planCateringTransition,
  quoteCatering,
  summarizeCatering,
  validateCateringPackage,
  validateCateringRequest,
} from "./foodos-catering"

describe("vocabulario de estados", () => {
  it("declara seis estados sin repetir", () => {
    expect(CATERING_STATUSES).toHaveLength(6)
    expect(new Set(CATERING_STATUSES).size).toBe(6)
  })

  it("el flujo normal solo incluye estados de avance", () => {
    expect(CATERING_STATUS_FLOW).toEqual(["requested", "quoted", "confirmed", "completed"])
    for (const status of CATERING_STATUS_FLOW) {
      expect(isCateringTerminal(status)).toBe(false)
    }
  })

  it("reconoce solo estados declarados", () => {
    expect(isCateringStatus("quoted")).toBe(true)
    expect(isCateringStatus("pagado")).toBe(false)
    expect(isCateringStatus(null)).toBe(false)
  })

  it("los terminales tienen rango negativo y no participan del avance", () => {
    expect(CATERING_STATUS_RANK.declined).toBeLessThan(0)
    expect(CATERING_STATUS_RANK.cancelled).toBeLessThan(0)
    expect(CATERING_STATUS_RANK.completed).toBeGreaterThan(CATERING_STATUS_RANK.confirmed)
  })
})

describe("normalizeIncludes", () => {
  it("acepta un arreglo y recorta cada entrada", () => {
    expect(normalizeIncludes(["  Mesa dulce  ", "Café"])).toEqual(["Mesa dulce", "Café"])
  })

  it("acepta texto separado por saltos de línea", () => {
    expect(normalizeIncludes("Mesa dulce\nCafé\n\n  Música  ")).toEqual([
      "Mesa dulce",
      "Café",
      "Música",
    ])
  })

  it("deduplica sin distinguir mayúsculas", () => {
    expect(normalizeIncludes(["Café", "café", "CAFÉ"])).toEqual(["Café"])
  })

  it("corta en el máximo de entradas", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Incluye ${i}`)
    expect(normalizeIncludes(many)).toHaveLength(MAX_INCLUDES)
  })

  it("devuelve vacío para entradas inservibles", () => {
    expect(normalizeIncludes(null)).toEqual([])
    expect(normalizeIncludes(42)).toEqual([])
    expect(normalizeIncludes(["", "   "])).toEqual([])
  })
})

describe("validateCateringPackage", () => {
  const valid = { name: "Paquete Fiesta", pricePerPerson: 250, minPeople: 20 }

  it("acepta un paquete mínimo", () => {
    const result = validateCateringPackage(valid)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("no debería pasar")
    expect(result.value.name).toBe("Paquete Fiesta")
    expect(result.value.pricePerPerson).toBe(250)
    expect(result.value.minPeople).toBe(20)
    expect(result.value.maxPeople).toBeNull()
    expect(result.value.leadTimeHours).toBe(48)
    expect(result.value.isActive).toBe(true)
  })

  it("exige nombre", () => {
    expect(validateCateringPackage({ ...valid, name: "   " }).ok).toBe(false)
  })

  it("exige un precio válido y no negativo", () => {
    expect(validateCateringPackage({ ...valid, pricePerPerson: -1 }).ok).toBe(false)
    expect(validateCateringPackage({ ...valid, pricePerPerson: "abc" as never }).ok).toBe(false)
    expect(validateCateringPackage({ ...valid, pricePerPerson: null }).ok).toBe(false)
  })

  it("acepta precio cero (paquete por cotizar)", () => {
    const result = validateCateringPackage({ ...valid, pricePerPerson: 0 })
    expect(result.ok).toBe(true)
  })

  it("exige un mínimo mayor que cero", () => {
    expect(validateCateringPackage({ ...valid, minPeople: 0 }).ok).toBe(false)
    expect(validateCateringPackage({ ...valid, minPeople: -5 }).ok).toBe(false)
    expect(validateCateringPackage({ ...valid, minPeople: null }).ok).toBe(false)
  })

  it("rechaza un máximo menor que el mínimo", () => {
    expect(validateCateringPackage({ ...valid, maxPeople: 10 }).ok).toBe(false)
  })

  it("acepta un máximo igual al mínimo", () => {
    const result = validateCateringPackage({ ...valid, maxPeople: 20 })
    expect(result.ok).toBe(true)
  })

  it("rechaza anticipación negativa", () => {
    expect(validateCateringPackage({ ...valid, leadTimeHours: -1 }).ok).toBe(false)
  })

  it("acepta anticipación cero", () => {
    const result = validateCateringPackage({ ...valid, leadTimeHours: 0 })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("no debería pasar")
    expect(result.value.leadTimeHours).toBe(0)
  })

  it("acota el mínimo y el máximo a MAX_HEADCOUNT", () => {
    expect(validateCateringPackage({ ...valid, minPeople: MAX_HEADCOUNT + 1 }).ok).toBe(false)
    expect(validateCateringPackage({ ...valid, maxPeople: MAX_HEADCOUNT + 1 }).ok).toBe(false)
  })

  it("recorta nombre y descripción", () => {
    const result = validateCateringPackage({
      ...valid,
      name: "n".repeat(300),
      description: "d".repeat(3000),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("no debería pasar")
    expect(result.value.name).toHaveLength(120)
    expect(result.value.description).toHaveLength(1000)
  })

  it("normaliza una descripción vacía a null", () => {
    const result = validateCateringPackage({ ...valid, description: "   " })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("no debería pasar")
    expect(result.value.description).toBeNull()
  })

  it("respeta isActive false", () => {
    const result = validateCateringPackage({ ...valid, isActive: false })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("no debería pasar")
    expect(result.value.isActive).toBe(false)
  })
})

describe("quoteCatering", () => {
  const pkg = { name: "Paquete Fiesta", pricePerPerson: 250, minPeople: 20, maxPeople: 200 }

  it("multiplica por persona cuando supera el mínimo", () => {
    const result = quoteCatering({ package: pkg, headcount: 50 })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("no debería pasar")
    expect(result.quote.total).toBe(12500)
    expect(result.quote.chargedMinimum).toBe(false)
    expect(result.quote.warnings).toEqual([])
  })

  it("cobra el mínimo cuando piden menos personas", () => {
    const result = quoteCatering({ package: pkg, headcount: 10 })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("no debería pasar")
    expect(result.quote.total).toBe(5000)
    expect(result.quote.chargedMinimum).toBe(true)
    expect(result.quote.warnings[0]).toContain("20 personas")
  })

  it("cotiza el mínimo exacto sin avisar de mínimo", () => {
    const result = quoteCatering({ package: pkg, headcount: 20 })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("no debería pasar")
    expect(result.quote.total).toBe(5000)
    expect(result.quote.chargedMinimum).toBe(false)
  })

  it("avisa cuando se pasa del máximo", () => {
    const result = quoteCatering({ package: pkg, headcount: 250 })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("no debería pasar")
    expect(result.quote.warnings.some((w) => w.includes("200"))).toBe(true)
  })

  it("no avisa de máximo si el paquete no tiene tope", () => {
    const result = quoteCatering({ package: { ...pkg, maxPeople: null }, headcount: 900 })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("no debería pasar")
    expect(result.quote.warnings).toEqual([])
  })

  it("aplica el ajuste por persona", () => {
    const result = quoteCatering({ package: pkg, headcount: 50, discountPerPerson: 50 })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("no debería pasar")
    expect(result.quote.pricePerPerson).toBe(200)
    expect(result.quote.total).toBe(10000)
  })

  it("nunca deja el precio por persona en negativo", () => {
    const result = quoteCatering({ package: pkg, headcount: 50, discountPerPerson: 900 })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("no debería pasar")
    expect(result.quote.pricePerPerson).toBe(0)
    expect(result.quote.total).toBe(0)
    expect(result.quote.warnings.some((w) => w.includes("cero"))).toBe(true)
  })

  it("redondea a dos decimales", () => {
    const result = quoteCatering({
      package: { ...pkg, pricePerPerson: 33.333 },
      headcount: 30,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("no debería pasar")
    expect(result.quote.total).toBe(999.9)
  })

  it("rechaza un headcount inválido", () => {
    expect(quoteCatering({ package: pkg, headcount: 0 }).ok).toBe(false)
    expect(quoteCatering({ package: pkg, headcount: -3 }).ok).toBe(false)
    expect(quoteCatering({ package: pkg, headcount: "abc" as never }).ok).toBe(false)
  })

  it("rechaza más de MAX_HEADCOUNT", () => {
    expect(quoteCatering({ package: pkg, headcount: MAX_HEADCOUNT + 1 }).ok).toBe(false)
  })

  it("rechaza un paquete sin precio válido", () => {
    expect(quoteCatering({ package: { ...pkg, pricePerPerson: -1 }, headcount: 30 }).ok).toBe(false)
  })

  it("entrega el total formateado para no repetir el formateo", () => {
    const result = quoteCatering({ package: pkg, headcount: 50 })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("no debería pasar")
    expect(result.quote.totalLabel).toContain("12,500")
  })
})

describe("validateCateringRequest", () => {
  const pkg = { minPeople: 20, maxPeople: 200, leadTimeHours: 48 }
  const now = new Date("2026-03-01T12:00:00.000Z")
  const valid = {
    customerName: "Ana Ruiz",
    customerPhone: "5512345678",
    customerEmail: "ana@ejemplo.mx",
    eventDate: "2026-04-15T18:00:00.000Z",
    headcount: 40,
    notes: "Sin gluten en dos mesas",
  }

  it("acepta una solicitud completa", () => {
    const result = validateCateringRequest(valid, pkg, now)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.value.customerName).toBe("Ana Ruiz")
    expect(result.value.notes).toBe("Sin gluten en dos mesas")
  })

  it("exige nombre", () => {
    const result = validateCateringRequest({ ...valid, customerName: "  " }, pkg, now)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain("Necesitamos tu nombre")
  })

  it("exige un teléfono de al menos diez dígitos", () => {
    expect(validateCateringRequest({ ...valid, customerPhone: "123" }, pkg, now).ok).toBe(false)
  })

  it("tolera espacios dentro del teléfono", () => {
    const result = validateCateringRequest(
      { ...valid, customerPhone: "55 1234 5678" },
      pkg,
      now
    )
    expect(result.ok).toBe(true)
    expect(result.value.customerPhone).toBe("5512345678")
  })

  it("rechaza un correo mal formado y lo descarta", () => {
    const result = validateCateringRequest({ ...valid, customerEmail: "ana@" }, pkg, now)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain("El correo no parece válido")
    expect(result.value.customerEmail).toBeNull()
  })

  it("acepta la solicitud sin correo", () => {
    const result = validateCateringRequest({ ...valid, customerEmail: "" }, pkg, now)
    expect(result.ok).toBe(true)
    expect(result.value.customerEmail).toBeNull()
  })

  it("exige un mínimo de comensales", () => {
    const result = validateCateringRequest({ ...valid, headcount: 5 }, pkg, now)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("20"))).toBe(true)
  })

  it("exige respetar el máximo de comensales", () => {
    const result = validateCateringRequest({ ...valid, headcount: 300 }, pkg, now)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("200"))).toBe(true)
  })

  it("sin máximo declarado no hay tope superior", () => {
    const result = validateCateringRequest(
      { ...valid, headcount: 900 },
      { ...pkg, maxPeople: null },
      now
    )
    expect(result.ok).toBe(true)
  })

  it("rechaza una fecha ya pasada", () => {
    const result = validateCateringRequest(
      { ...valid, eventDate: "2026-01-01T18:00:00.000Z" },
      pkg,
      now
    )
    expect(result.ok).toBe(false)
    expect(result.errors).toContain("La fecha del evento ya pasó")
  })

  it("exige la anticipación del paquete", () => {
    const result = validateCateringRequest(
      { ...valid, eventDate: "2026-03-02T12:00:00.000Z" },
      pkg,
      now
    )
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes("48 horas"))).toBe(true)
  })

  it("acepta exactamente la anticipación mínima", () => {
    const result = validateCateringRequest(
      { ...valid, eventDate: "2026-03-03T12:00:00.000Z" },
      pkg,
      now
    )
    expect(result.ok).toBe(true)
  })

  it("rechaza una fecha inválida", () => {
    const result = validateCateringRequest({ ...valid, eventDate: "el viernes" }, pkg, now)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain("Indica la fecha del evento")
  })

  it("acumula varios errores en vez de fallar en el primero", () => {
    const result = validateCateringRequest(
      { ...valid, customerName: "", customerPhone: "1", headcount: 2, eventDate: "malo" },
      pkg,
      now
    )
    expect(result.errors.length).toBeGreaterThanOrEqual(4)
  })

  it("recorta las notas larguísimas", () => {
    const result = validateCateringRequest({ ...valid, notes: "n".repeat(5000) }, pkg, now)
    expect(result.ok).toBe(true)
    expect(result.value.notes).toHaveLength(1000)
  })

  it("normaliza notas vacías a null", () => {
    const result = validateCateringRequest({ ...valid, notes: "   " }, pkg, now)
    expect(result.value.notes).toBeNull()
  })

  it("devuelve headcount 0 cuando es inválido", () => {
    const result = validateCateringRequest({ ...valid, headcount: "x" as never }, pkg, now)
    expect(result.value.headcount).toBe(0)
  })
})

describe("planCateringTransition", () => {
  it("avanza por el embudo", () => {
    expect(planCateringTransition("requested", "quoted")).toEqual({
      action: "advance",
      next: "quoted",
      reason: "Pasó a quoted",
    })
    expect(planCateringTransition("quoted", "confirmed").action).toBe("advance")
    expect(planCateringTransition("confirmed", "completed").action).toBe("advance")
  })

  it("ignora el mismo estado", () => {
    expect(planCateringTransition("quoted", "quoted").action).toBe("ignore")
  })

  it("no retrocede", () => {
    const plan = planCateringTransition("confirmed", "quoted")
    expect(plan.action).toBe("ignore")
    expect(plan.next).toBeUndefined()
  })

  it("declina solo desde solicitado o cotizado", () => {
    expect(planCateringTransition("requested", "declined").action).toBe("decline")
    expect(planCateringTransition("quoted", "declined").action).toBe("decline")
    const plan = planCateringTransition("confirmed", "declined")
    expect(plan.action).toBe("ignore")
    expect(plan.reason).toContain("cancelar")
  })

  it("cancela solo un evento confirmado", () => {
    expect(planCateringTransition("confirmed", "cancelled").action).toBe("cancel")
    expect(planCateringTransition("requested", "cancelled").action).toBe("ignore")
    expect(planCateringTransition("quoted", "cancelled").action).toBe("ignore")
  })

  it("reactiva una solicitud declinada", () => {
    const plan = planCateringTransition("declined", "requested")
    expect(plan.action).toBe("reopen")
    expect(plan.next).toBe("requested")
  })

  it("no reactiva una solicitud declinada hacia otro estado", () => {
    expect(planCateringTransition("declined", "confirmed").action).toBe("ignore")
  })

  it("no reabre un evento terminado", () => {
    for (const next of CATERING_STATUSES) {
      if (next === "completed") continue
      expect(planCateringTransition("completed", next).action).toBe("ignore")
    }
  })

  it("no reabre una solicitud cancelada", () => {
    for (const next of CATERING_STATUSES) {
      if (next === "cancelled") continue
      expect(planCateringTransition("cancelled", next).action).toBe("ignore")
    }
  })

  it("es total: cualquier par produce un plan con motivo", () => {
    for (const current of CATERING_STATUSES) {
      for (const next of CATERING_STATUSES) {
        const plan = planCateringTransition(current, next)
        expect(["advance", "decline", "cancel", "reopen", "ignore"]).toContain(plan.action)
        expect(plan.reason.length).toBeGreaterThan(0)
      }
    }
  })
})

describe("summarizeCatering", () => {
  const now = new Date("2026-03-01T12:00:00.000Z")

  it("devuelve ceros sin solicitudes", () => {
    expect(summarizeCatering([], now)).toEqual(EMPTY_CATERING_KPIS)
  })

  it("cuenta por estado", () => {
    const kpis = summarizeCatering(
      [
        { status: "requested", headcount: 30, total: null, eventDate: "2026-04-01T12:00:00.000Z" },
        { status: "quoted", headcount: 40, total: 10000, eventDate: "2026-04-02T12:00:00.000Z" },
        { status: "confirmed", headcount: 50, total: 12500, eventDate: "2026-04-03T12:00:00.000Z" },
      ],
      now
    )
    expect(kpis.total).toBe(3)
    expect(kpis.requested).toBe(1)
    expect(kpis.quoted).toBe(1)
    expect(kpis.confirmed).toBe(1)
  })

  it("suma solo las personas e ingresos de eventos confirmados", () => {
    const kpis = summarizeCatering(
      [
        { status: "quoted", headcount: 100, total: 25000, eventDate: "2026-04-01T12:00:00.000Z" },
        { status: "confirmed", headcount: 50, total: 12500, eventDate: "2026-04-03T12:00:00.000Z" },
        { status: "confirmed", headcount: 30, total: 7500, eventDate: "2026-04-04T12:00:00.000Z" },
      ],
      now
    )
    expect(kpis.confirmedHeadcount).toBe(80)
    expect(kpis.confirmedRevenue).toBe(20000)
  })

  it("ignora un total nulo en el ingreso comprometido", () => {
    const kpis = summarizeCatering(
      [{ status: "confirmed", headcount: 50, total: null, eventDate: "2026-04-03T12:00:00.000Z" }],
      now
    )
    expect(kpis.confirmedRevenue).toBe(0)
  })

  it("cuenta los eventos confirmados de los próximos siete días", () => {
    const kpis = summarizeCatering(
      [
        { status: "confirmed", headcount: 20, total: 5000, eventDate: "2026-03-05T12:00:00.000Z" },
        { status: "confirmed", headcount: 20, total: 5000, eventDate: "2026-03-20T12:00:00.000Z" },
        { status: "quoted", headcount: 20, total: 5000, eventDate: "2026-03-04T12:00:00.000Z" },
      ],
      now
    )
    expect(kpis.upcoming7d).toBe(1)
  })

  it("no cuenta como próximo un evento ya pasado", () => {
    const kpis = summarizeCatering(
      [{ status: "confirmed", headcount: 20, total: 5000, eventDate: "2026-02-01T12:00:00.000Z" }],
      now
    )
    expect(kpis.upcoming7d).toBe(0)
    expect(kpis.nextEventDate).toBeNull()
  })

  it("elige el evento futuro más cercano", () => {
    const kpis = summarizeCatering(
      [
        { status: "confirmed", headcount: 20, total: 5000, eventDate: "2026-05-01T12:00:00.000Z" },
        { status: "confirmed", headcount: 20, total: 5000, eventDate: "2026-03-15T12:00:00.000Z" },
      ],
      now
    )
    expect(kpis.nextEventDate).toBe("2026-03-15T12:00:00.000Z")
  })

  it("no propaga un headcount negativo", () => {
    const kpis = summarizeCatering(
      [{ status: "confirmed", headcount: -10, total: -100, eventDate: "2026-04-03T12:00:00.000Z" }],
      now
    )
    expect(kpis.confirmedHeadcount).toBe(0)
    expect(kpis.confirmedRevenue).toBe(0)
  })
})
