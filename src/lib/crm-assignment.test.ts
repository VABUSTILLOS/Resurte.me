import { describe, it, expect } from "vitest"
import {
  ASSIGNMENT_STRATEGIES,
  ASSIGNMENT_STRATEGY_LABEL,
  isAssignmentStrategy,
  isOpenProspect,
  buildSellerLoad,
  distributeProspects,
  assignmentReason,
  buildSlaBoard,
  firstResponseStats,
  percentile,
  formatMinutes,
  type AssignableProspect,
  type SellerRef,
} from "./crm-assignment"
import { buildThreads, type ConversationProspect, type InboxMessage } from "./crm-inbox"
import { crmProspect } from "./crm-fixtures"

const NOW = new Date("2026-03-10T18:00:00.000Z")

function seller(id: string, overrides: Partial<SellerRef> = {}): SellerRef {
  return { id, name: `Vendedor ${id}`, city_id: null, ...overrides }
}

function prospect(overrides: Partial<AssignableProspect> = {}): AssignableProspect {
  return crmProspect({
    name: "Ana",
    restaurant_name: "Taquería Ana",
    phone: "6141234567",
    created_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  })
}

type MsgSpec = { direction: "inbound" | "outbound"; at: string; id?: number }

/** Conversaciones reales, armadas con el mismo constructor que usa la bandeja. */
function threadsFor(
  entries: Array<{ messages: MsgSpec[]; overrides?: Partial<ConversationProspect> }>,
  now: Date = NOW,
) {
  const prospects: ConversationProspect[] = []
  const messages: InboxMessage[] = []

  entries.forEach((entry, i) => {
    const phone = `61400000${i}`
    // `crmProspect()` (y no `prospect()`) porque aquí se necesita el contrato
    // completo: `AssignableProspect` deja `city_id` opcional para el tablero.
    prospects.push(
      Object.assign(crmProspect({ id: i + 1, phone, whatsapp: phone }), entry.overrides),
    )
    entry.messages.forEach((m, j) => {
      messages.push({
        id: (i + 1) * 100 + j,
        direction: m.direction,
        content: "hola",
        created_at: m.at,
        message_type: null,
        from_number: phone,
      })
    })
  })

  return buildThreads(prospects, messages, now)
}

describe("estrategias de reparto", () => {
  it("valida contra la lista cerrada", () => {
    for (const s of ASSIGNMENT_STRATEGIES) {
      expect(isAssignmentStrategy(s)).toBe(true)
      expect(ASSIGNMENT_STRATEGY_LABEL[s].length).toBeGreaterThan(0)
    }
    expect(isAssignmentStrategy("al_azar")).toBe(false)
    expect(isAssignmentStrategy("")).toBe(false)
  })
})

describe("isOpenProspect", () => {
  it("inactivo y perdido están cerrados", () => {
    expect(isOpenProspect({ status: "inactivo" })).toBe(false)
    expect(isOpenProspect({ status: "perdido" })).toBe(false)
  })

  it("el resto del embudo está abierto", () => {
    expect(isOpenProspect({ status: "nuevo" })).toBe(true)
    expect(isOpenProspect({ status: "contactado" })).toBe(true)
    expect(isOpenProspect({ status: "cliente_activo" })).toBe(true)
  })

  it("un estado desconocido se trata como abierto", () => {
    // Preferible repartirlo de más que dejar la ficha huérfana.
    expect(isOpenProspect({ status: "lo_que_sea" })).toBe(true)
  })
})

describe("buildSellerLoad", () => {
  it("cuenta abiertos y total por vendedor", () => {
    const load = buildSellerLoad(
      [seller("a"), seller("b")],
      [
        prospect({ id: 1, seller_id: "a", status: "nuevo" }),
        prospect({ id: 2, seller_id: "a", status: "cliente_activo" }),
        prospect({ id: 3, seller_id: "a", status: "perdido" }),
        prospect({ id: 4, seller_id: "b", status: "en_seguimiento" }),
      ],
      NOW,
    )
    expect(load.find((l) => l.sellerId === "a")).toMatchObject({ total: 3, open: 2 })
    expect(load.find((l) => l.sellerId === "b")).toMatchObject({ total: 1, open: 1 })
  })

  it("cuenta los seguimientos vencidos solo entre los abiertos", () => {
    const load = buildSellerLoad(
      [seller("a")],
      [
        prospect({ id: 1, seller_id: "a", status: "nuevo", next_follow_up_at: "2026-03-01T00:00:00.000Z" }),
        prospect({ id: 2, seller_id: "a", status: "nuevo", next_follow_up_at: "2026-04-01T00:00:00.000Z" }),
        prospect({ id: 3, seller_id: "a", status: "perdido", next_follow_up_at: "2026-01-01T00:00:00.000Z" }),
      ],
      NOW,
    )
    expect(load[0]?.overdue).toBe(1)
  })

  it("incluye a los vendedores sin prospectos con carga cero", () => {
    const load = buildSellerLoad([seller("a"), seller("z")], [], NOW)
    expect(load).toHaveLength(2)
    expect(load.every((l) => l.open === 0 && l.total === 0)).toBe(true)
  })

  it("ignora prospectos de vendedores que no están en la lista", () => {
    const load = buildSellerLoad([seller("a")], [prospect({ id: 1, seller_id: "fantasma" })], NOW)
    expect(load[0]?.total).toBe(0)
  })

  it("ignora los prospectos sin asignar", () => {
    const load = buildSellerLoad([seller("a")], [prospect({ seller_id: null })], NOW)
    expect(load[0]?.total).toBe(0)
  })
})

describe("distributeProspects", () => {
  it("sin vendedores no asigna nada", () => {
    expect(distributeProspects([prospect()], [], { now: NOW })).toEqual([])
  })

  it("sin prospectos pendientes no asigna nada", () => {
    expect(distributeProspects([], [seller("a")], { now: NOW })).toEqual([])
  })

  it("solo reparte los que no tienen vendedor", () => {
    const out = distributeProspects(
      [prospect({ id: 1, seller_id: "a" }), prospect({ id: 2, seller_id: null })],
      [seller("a"), seller("b")],
      { strategy: "round_robin", now: NOW },
    )
    expect(out.map((a) => a.prospectId)).toEqual([2])
  })

  it("no reparte prospectos cerrados", () => {
    const out = distributeProspects(
      [prospect({ id: 1, status: "perdido" }), prospect({ id: 2, status: "inactivo" })],
      [seller("a")],
      { now: NOW },
    )
    expect(out).toEqual([])
  })

  it("reparto circular: turnos en orden de id, no de llegada", () => {
    const out = distributeProspects(
      [prospect({ id: 1 }), prospect({ id: 2 }), prospect({ id: 3 }), prospect({ id: 4 })],
      [seller("z"), seller("a")],
      { strategy: "round_robin", now: NOW },
    )
    expect(out.map((a) => a.sellerId)).toEqual(["a", "z", "a", "z"])
  })

  it("reparto circular es determinista aunque cambie el orden de entrada", () => {
    const sellers = [seller("z"), seller("a")]
    const a = distributeProspects([prospect({ id: 1 }), prospect({ id: 2 })], sellers, {
      strategy: "round_robin",
      now: NOW,
    })
    const b = distributeProspects([prospect({ id: 1 }), prospect({ id: 2 })], [...sellers].reverse(), {
      strategy: "round_robin",
      now: NOW,
    })
    expect(a.map((x) => x.sellerId)).toEqual(b.map((x) => x.sellerId))
  })

  it("menos cargado: con ambos en cero gana el id ascendente", () => {
    const out = distributeProspects([prospect({ id: 1 })], [seller("a"), seller("b")], {
      strategy: "least_loaded",
      now: NOW,
    })
    expect(out[0]?.sellerId).toBe("a")
  })

  it("menos cargado reparte en ronda sin amontonar", () => {
    const out = distributeProspects(
      [prospect({ id: 1 }), prospect({ id: 2 }), prospect({ id: 3 }), prospect({ id: 4 })],
      [seller("a"), seller("b")],
      { strategy: "least_loaded", now: NOW },
    )
    expect(out.map((a) => a.sellerId)).toEqual(["a", "b", "a", "b"])
  })

  it("menos cargado respeta la carga abierta ya existente", () => {
    const out = distributeProspects([prospect({ id: 9 })], [seller("a"), seller("b")], {
      strategy: "least_loaded",
      now: NOW,
    })
    expect(out[0]?.sellerId).toBe("a")

    const cargado = distributeProspects(
      [
        prospect({ id: 1, seller_id: "a", status: "nuevo" }),
        prospect({ id: 2, seller_id: "a", status: "nuevo" }),
        prospect({ id: 9 }),
      ],
      [seller("a"), seller("b")],
      { strategy: "least_loaded", now: NOW },
    )
    expect(cargado[0]?.sellerId).toBe("b")
  })

  it("menos cargado no castiga al vendedor que ya cerró sus fichas", () => {
    const out = distributeProspects(
      [
        prospect({ id: 1, seller_id: "a", status: "perdido" }),
        prospect({ id: 2, seller_id: "a", status: "inactivo" }),
        prospect({ id: 3, seller_id: "a", status: "perdido" }),
        prospect({ id: 9 }),
      ],
      [seller("a"), seller("b")],
      { strategy: "least_loaded", now: NOW },
    )
    // "a" tiene 0 abiertos y "b" también: gana el id ascendente, no "b" por castigo.
    expect(out[0]?.sellerId).toBe("a")
  })

  it("por ciudad: prefiere al vendedor de la misma ciudad", () => {
    const out = distributeProspects(
      [prospect({ id: 1, city_id: 2 })],
      [seller("a", { city_id: 1 }), seller("b", { city_id: 2 })],
      { strategy: "by_city", now: NOW },
    )
    expect(out[0]?.sellerId).toBe("b")
    expect(out[0]?.reason).toContain("misma ciudad")
  })

  it("por ciudad: entre varios de la misma ciudad gana el menos cargado", () => {
    const out = distributeProspects(
      [
        prospect({ id: 1, seller_id: "b", city_id: 2, status: "nuevo" }),
        prospect({ id: 2, city_id: 2 }),
      ],
      [seller("a", { city_id: 2 }), seller("b", { city_id: 2 })],
      { strategy: "by_city", now: NOW },
    )
    expect(out[0]?.sellerId).toBe("a")
  })

  it("por ciudad: sin vendedor en esa ciudad cae al menos cargado", () => {
    const out = distributeProspects(
      [prospect({ id: 1, city_id: 99 })],
      [seller("a", { city_id: 1 })],
      { strategy: "by_city", now: NOW },
    )
    expect(out[0]?.sellerId).toBe("a")
    expect(out[0]?.reason).toContain("Sin vendedor en esa ciudad")
  })

  it("por ciudad: sin ciudad en el prospecto también cae al menos cargado", () => {
    const out = distributeProspects([prospect({ id: 1, city_id: null })], [seller("a")], {
      strategy: "by_city",
      now: NOW,
    })
    expect(out[0]?.sellerId).toBe("a")
    expect(out[0]?.reason).toContain("Sin ciudad")
  })

  it("la estrategia por defecto es el reparto circular", () => {
    const out = distributeProspects([prospect({ id: 1 })], [seller("a")], { now: NOW })
    expect(out[0]?.strategy).toBe("round_robin")
  })

  it("cada asignación trae nombre y motivo para la interfaz", () => {
    const out = distributeProspects([prospect({ id: 1 })], [seller("a")], { now: NOW })
    expect(out[0]?.sellerName).toBe("Vendedor a")
    expect(out[0]?.reason.length).toBeGreaterThan(0)
  })

  it("no asigna dos veces el mismo prospecto", () => {
    const out = distributeProspects([prospect({ id: 1 }), prospect({ id: 2 })], [seller("a")], {
      now: NOW,
    })
    expect(new Set(out.map((a) => a.prospectId)).size).toBe(out.length)
  })
})

describe("assignmentReason", () => {
  it("resume la estrategia y la carga", () => {
    const load = { sellerId: "a", name: "A", cityId: null, open: 3, total: 5, overdue: 1 }
    expect(assignmentReason("least_loaded", load)).toBe(
      "Menos cargado: 3 abiertos, 1 con seguimiento vencido",
    )
  })

  it("sin carga conocida devuelve solo la etiqueta", () => {
    expect(assignmentReason("by_city", null)).toBe("Por ciudad")
  })
})

describe("buildSlaBoard", () => {
  it("cuenta cada bandeja y separa las que esperan respuesta", () => {
    const board = buildSlaBoard(
      threadsFor([
        { messages: [{ direction: "inbound", at: "2026-03-10T17:00:00.000Z" }] },
        { messages: [{ direction: "inbound", at: "2026-03-10T16:00:00.000Z" }] },
        {
          messages: [
            { direction: "inbound", at: "2026-03-10T10:00:00.000Z" },
            { direction: "outbound", at: "2026-03-10T11:00:00.000Z" },
          ],
        },
      ]),
    )
    expect(board.buckets.map((b) => b.key)).toEqual(["sin_responder", "esperando", "ventana_cerrada"])
    expect(board.buckets.map((b) => b.count)).toEqual([2, 1, 0])
    expect(board.sinConversacion).toBe(0)
    expect(board.pendientes).toBe(2)
  })

  it("una ventana vencida va a su propia banda", () => {
    const board = buildSlaBoard(
      threadsFor([
        {
          messages: [
            { direction: "inbound", at: "2026-03-08T10:00:00.000Z" },
            { direction: "outbound", at: "2026-03-08T11:00:00.000Z" },
          ],
        },
      ]),
    )
    expect(board.buckets.find((b) => b.key === "ventana_cerrada")?.count).toBe(1)
    expect(board.pendientes).toBe(0)
  })

  it("los prospectos sin conversación no entran en ninguna bandeja", () => {
    const board = buildSlaBoard(threadsFor([{ messages: [] }, { messages: [] }]))
    expect(board.sinConversacion).toBe(2)
    expect(board.buckets.every((b) => b.count === 0)).toBe(true)
    expect(board.pendientes).toBe(0)
  })

  it("un tablero vacío no revienta", () => {
    const board = buildSlaBoard([])
    expect(board.sinConversacion).toBe(0)
    expect(board.buckets).toHaveLength(3)
  })

  it("cada banda trae etiqueta en español", () => {
    for (const bucket of buildSlaBoard([]).buckets) {
      expect(bucket.label.length).toBeGreaterThan(0)
    }
  })
})

describe("percentile", () => {
  it("sin datos devuelve null, no 0", () => {
    expect(percentile([], 50)).toBeNull()
    expect(percentile([], 90)).toBeNull()
  })

  it("un solo valor es su propio percentil", () => {
    expect(percentile([7], 50)).toBe(7)
    expect(percentile([7], 90)).toBe(7)
  })

  it("interpola linealmente", () => {
    const sorted = [10, 20, 30, 40]
    expect(percentile(sorted, 0)).toBe(10)
    expect(percentile(sorted, 50)).toBe(25)
    expect(percentile(sorted, 100)).toBe(40)
  })

  it("recorta percentiles fuera de rango", () => {
    expect(percentile([1, 2, 3], -10)).toBe(1)
    expect(percentile([1, 2, 3], 500)).toBe(3)
  })

  it("no confunde un 0 real con ausencia de datos", () => {
    // 0 minutos es la mejor respuesta posible, no un hueco.
    expect(percentile([0, 0, 10], 50)).toBe(0)
  })
})

describe("firstResponseStats", () => {
  it("sin conversaciones medibles todo es null", () => {
    const stats = firstResponseStats([])
    expect(stats.measured).toBe(0)
    expect(stats.medianMinutes).toBeNull()
    expect(stats.p90Minutes).toBeNull()
    expect(stats.bestMinutes).toBeNull()
    expect(stats.worstMinutes).toBeNull()
  })

  it("mide el tiempo entre el primer entrante y la primera saliente", () => {
    const stats = firstResponseStats(
      threadsFor([
        {
          messages: [
            { direction: "inbound", at: "2026-03-10T10:00:00.000Z" },
            { direction: "outbound", at: "2026-03-10T10:10:00.000Z" },
          ],
        },
        {
          messages: [
            { direction: "inbound", at: "2026-03-10T10:00:00.000Z" },
            { direction: "outbound", at: "2026-03-10T10:30:00.000Z" },
          ],
        },
      ]),
    )
    expect(stats.measured).toBe(2)
    expect(stats.medianMinutes).toBe(20)
    expect(stats.bestMinutes).toBe(10)
    expect(stats.worstMinutes).toBe(30)
  })

  it("cuenta como pendientes las que esperan respuesta, no como 0 min", () => {
    const stats = firstResponseStats(
      threadsFor([{ messages: [{ direction: "inbound", at: "2026-03-10T17:00:00.000Z" }] }]),
    )
    expect(stats.pending).toBe(1)
    expect(stats.measured).toBe(0)
    expect(stats.medianMinutes).toBeNull()
  })

  it("una respuesta inmediata es 0 min medido, no un hueco", () => {
    const stats = firstResponseStats(
      threadsFor([
        {
          messages: [
            { direction: "inbound", at: "2026-03-10T10:00:00.000Z" },
            { direction: "outbound", at: "2026-03-10T10:00:00.000Z" },
          ],
        },
      ]),
    )
    expect(stats.measured).toBe(1)
    expect(stats.medianMinutes).toBe(0)
    expect(stats.bestMinutes).toBe(0)
  })

  it("no cuenta como pendientes las que solo tienen salientes", () => {
    const stats = firstResponseStats(
      threadsFor([{ messages: [{ direction: "outbound", at: "2026-03-10T10:00:00.000Z" }] }]),
    )
    expect(stats.pending).toBe(0)
    expect(stats.unmeasured).toBe(1)
  })

  it("cuenta las conversaciones vacías como no medidas", () => {
    const stats = firstResponseStats(threadsFor([{ messages: [] }, { messages: [] }]))
    expect(stats.unmeasured).toBe(2)
    expect(stats.measured).toBe(0)
    expect(stats.pending).toBe(0)
  })

  it("p90 no baja de la mediana", () => {
    const stats = firstResponseStats(
      threadsFor([
        {
          messages: [
            { direction: "inbound", at: "2026-03-10T10:00:00.000Z" },
            { direction: "outbound", at: "2026-03-10T10:05:00.000Z" },
          ],
        },
        {
          messages: [
            { direction: "inbound", at: "2026-03-10T10:00:00.000Z" },
            { direction: "outbound", at: "2026-03-10T11:00:00.000Z" },
          ],
        },
        {
          messages: [
            { direction: "inbound", at: "2026-03-10T10:00:00.000Z" },
            { direction: "outbound", at: "2026-03-10T12:00:00.000Z" },
          ],
        },
      ]),
    )
    expect(stats.p90Minutes).not.toBeNull()
    expect(stats.p90Minutes!).toBeGreaterThanOrEqual(stats.medianMinutes!)
  })
})

describe("formatMinutes", () => {
  it("null, undefined y NaN se pintan como raya, nunca como 0", () => {
    expect(formatMinutes(null)).toBe("—")
    expect(formatMinutes(undefined)).toBe("—")
    expect(formatMinutes(Number.NaN)).toBe("—")
    expect(formatMinutes(0)).toBe("0 min")
  })

  it("minutos, horas y días", () => {
    expect(formatMinutes(45)).toBe("45 min")
    expect(formatMinutes(60)).toBe("1 h")
    expect(formatMinutes(200)).toBe("3 h 20 min")
    expect(formatMinutes(1440)).toBe("1 d")
    expect(formatMinutes(3120)).toBe("2 d 4 h")
  })

  it("redondea y nunca es negativo", () => {
    expect(formatMinutes(59.6)).toBe("1 h")
    expect(formatMinutes(-30)).toBe("0 min")
  })
})
