import { describe, expect, it } from "vitest"

import type { FoodosOrder } from "@/types/foodos"
import {
  channelLabel,
  computeDailyClose,
  computeReport,
  csvCell,
  dailyCloseCsv,
  dayBucketLabel,
  filterReportOrders,
  FOODOS_REPORT_CHANNELS,
  isPaidOrder,
  NO_SHIFT,
  orderShiftKey,
  paymentMethodLabel,
  reportDayKeys,
  shiftOptionLabel,
  shiftOptions,
  type ShiftLike,
} from "./foodos-reportes"

/** Acceso indexado sin `!` (el repo prohíbe las aserciones no nulas). */
function at<T>(list: T[], index: number): T {
  const value = list[index]
  if (value === undefined) throw new Error(`sin elemento ${index}`)
  return value
}

function makeOrder(overrides: Partial<FoodosOrder> = {}): FoodosOrder {
  return {
    id: "order-1",
    restaurant_id: "r1",
    branch_id: null,
    customer_id: null,
    items: [],
    subtotal: 100,
    discount: 0,
    delivery_fee: 0,
    total: 100,
    channel: "web",
    fulfillment: "pickup",
    status: "delivered",
    payment_method: "card",
    payment_status: "paid",
    stripe_payment_intent_id: null,
    slug: "demo",
    customer_name: null,
    customer_phone: null,
    note: null,
    table_number: null,
    tip: 0,
    coupon_code: null,
    loyalty_points_redeemed: 0,
    loyalty_points_earned: 0,
    scheduled_for: null,
    delivery_address: null,
    delivery_lat: null,
    delivery_lng: null,
    delivery_notes: null,
    created_at: "2026-03-10T18:00:00.000Z",
    ...overrides,
  }
}

function makeShift(overrides: Partial<ShiftLike> = {}): ShiftLike {
  return {
    id: "shift-1",
    status: "closed",
    opened_at: "2026-03-10T14:00:00.000Z",
    closed_at: "2026-03-10T23:00:00.000Z",
    branch_id: null,
    opening_float: 500,
    declared_cash: 1000,
    expected_cash: 1000,
    difference: 0,
    ...overrides,
  }
}

/** `now` fijo: 2026-03-10 20:00 en México (UTC-6). */
const NOW = Date.UTC(2026, 2, 11, 2, 0, 0)

describe("foodos-reportes: canales", () => {
  it("el orden canónico cubre los seis canales del POS", () => {
    expect(FOODOS_REPORT_CHANNELS).toEqual([
      "web",
      "qr",
      "whatsapp",
      "marketplace",
      "mostrador",
      "mesero",
    ])
  })

  it("etiqueta los canales conocidos y no esconde los desconocidos", () => {
    expect(channelLabel("marketplace")).toBe("HoyQueComemos")
    expect(channelLabel("mostrador")).toBe("Mostrador")
    expect(channelLabel("mesero")).toBe("Mesa")
    expect(channelLabel("telepatia")).toBe("telepatia")
  })

  it("etiqueta los métodos de pago, incluido el combinado", () => {
    expect(paymentMethodLabel("cash")).toBe("Efectivo")
    expect(paymentMethodLabel("mixed")).toBe("Combinado")
    expect(paymentMethodLabel("otro")).toBe("otro")
  })
})

describe("foodos-reportes: ingresos sólo de lo pagado", () => {
  it("isPaidOrder sólo acepta paid", () => {
    expect(isPaidOrder({ payment_status: "paid" })).toBe(true)
    expect(isPaidOrder({ payment_status: "pending" })).toBe(false)
    expect(isPaidOrder({ payment_status: "processing" })).toBe(false)
    expect(isPaidOrder({ payment_status: "failed" })).toBe(false)
    expect(isPaidOrder({ payment_status: "refunded" })).toBe(false)
  })

  it("las comandas de mesa pendientes no suman ingresos", () => {
    const orders = [
      makeOrder({ id: "comanda-1", channel: "mesero", payment_status: "pending", total: 480 }),
      makeOrder({ id: "comanda-2", channel: "mesero", payment_status: "pending", total: 120 }),
      makeOrder({ id: "cuenta", channel: "mesero", payment_status: "paid", total: 600 }),
    ]
    const report = computeReport(orders, { days: 7 }, NOW)
    expect(report.orderCount).toBe(3)
    expect(report.paidCount).toBe(1)
    expect(report.pendingCount).toBe(2)
    expect(report.revenue).toBe(600)
  })

  it("el ticket promedio divide entre pagados, no entre filas", () => {
    const orders = [
      makeOrder({ id: "a", payment_status: "paid", total: 300 }),
      makeOrder({ id: "b", payment_status: "paid", total: 500 }),
      makeOrder({ id: "c", payment_status: "pending", total: 900 }),
      makeOrder({ id: "d", payment_status: "pending", total: 900 }),
    ]
    const report = computeReport(orders, { days: 7 }, NOW)
    expect(report.revenue).toBe(800)
    expect(report.avgTicket).toBe(400)
  })

  it("sin ventas pagadas el ticket promedio es cero, no NaN", () => {
    const report = computeReport([makeOrder({ payment_status: "pending" })], { days: 7 }, NOW)
    expect(report.avgTicket).toBe(0)
    expect(report.revenue).toBe(0)
  })

  it("acumula en centavos: 0.10 tres veces son 0.30", () => {
    const orders = [0, 1, 2].map((i) =>
      makeOrder({ id: `o${i}`, payment_status: "paid", total: 0.1 })
    )
    expect(computeReport(orders, { days: 7 }, NOW).revenue).toBe(0.3)
  })
})

describe("foodos-reportes: filtros", () => {
  const orders = [
    makeOrder({ id: "web-hoy", channel: "web" }),
    makeOrder({ id: "cancelado", status: "cancelled" }),
    makeOrder({ id: "viejo", created_at: "2025-01-01T18:00:00.000Z" }),
    makeOrder({ id: "sucursal-b", branch_id: "b" }),
    makeOrder({ id: "turno-1", branch_id: "a", pos_shift_id: "shift-1" }),
    makeOrder({ id: "turno-2", branch_id: "a", pos_shift_id: "shift-2" }),
  ]

  it("excluye cancelados y lo que cae fuera de la ventana", () => {
    const ids = filterReportOrders(orders, { days: 7 }, NOW).map((o) => o.id)
    expect(ids).not.toContain("cancelado")
    expect(ids).not.toContain("viejo")
    expect(ids).toContain("web-hoy")
  })

  it("filtra por sucursal", () => {
    const ids = filterReportOrders(orders, { days: 7, branchId: "b" }, NOW).map((o) => o.id)
    expect(ids).toEqual(["sucursal-b"])
  })

  it("filtra por turno y distingue el bucket sin turno", () => {
    const ids = filterReportOrders(orders, { days: 7, shiftId: "shift-2" }, NOW).map((o) => o.id)
    expect(ids).toEqual(["turno-2"])

    const noShift = filterReportOrders(orders, { days: 7, shiftId: NO_SHIFT }, NOW).map((o) => o.id)
    expect(noShift).toEqual(["web-hoy", "sucursal-b"])
  })

  it("un pedido sin turno se agrupa en sin_turno", () => {
    expect(orderShiftKey(makeOrder())).toBe(NO_SHIFT)
    expect(orderShiftKey(makeOrder({ pos_shift_id: "shift-9" }))).toBe("shift-9")
  })

  it("una fecha inválida no entra al reporte", () => {
    const bad = [makeOrder({ created_at: "no-es-fecha" })]
    expect(filterReportOrders(bad, { days: 7 }, NOW)).toHaveLength(0)
  })
})

describe("foodos-reportes: desglose por sucursal", () => {
  it("suma conteo y dinero por sucursal, no solo conteo", () => {
    const report = computeReport(
      [
        makeOrder({ id: "a1", branch_id: "a", total: 100 }),
        makeOrder({ id: "a2", branch_id: "a", total: 50 }),
        makeOrder({ id: "b1", branch_id: "b", total: 400 }),
      ],
      { days: 7 },
      NOW
    )
    expect(report.byBranch.map((b) => [b.branchId, b.count, b.revenue])).toEqual([
      ["b", 1, 400],
      ["a", 2, 150],
    ])
  })

  it("los pedidos sin sucursal van al bucket sin_sucursal y al final", () => {
    const report = computeReport(
      [
        makeOrder({ id: "sin", branch_id: null, total: 900 }),
        makeOrder({ id: "con", branch_id: "a", total: 10 }),
      ],
      { days: 7 },
      NOW
    )
    expect(report.byBranch.map((b) => b.branchId)).toEqual(["a", "sin_sucursal"])
  })

  it("una comanda sin cobrar cuenta en el conteo pero no en el dinero", () => {
    const report = computeReport(
      [
        makeOrder({ id: "comanda", branch_id: "a", total: 200, payment_status: "pending" }),
        makeOrder({ id: "venta", branch_id: "a", total: 80 }),
      ],
      { days: 7 },
      NOW
    )
    expect(report.byBranch).toEqual([{ branchId: "a", count: 2, revenue: 80 }])
  })
})

describe("foodos-reportes: desglose por canal y día", () => {
  it("siempre lista los seis canales, aunque estén en cero", () => {
    const report = computeReport([makeOrder({ channel: "marketplace" })], { days: 7 }, NOW)
    expect(report.byChannel.map((c) => c.channel)).toEqual(FOODOS_REPORT_CHANNELS)
    const marketplace = report.byChannel.find((c) => c.channel === "marketplace")
    expect(marketplace?.count).toBe(1)
    expect(marketplace?.share).toBe(100)
    expect(report.byChannel.find((c) => c.channel === "mostrador")?.count).toBe(0)
  })

  it("un canal desconocido se agrega al final en vez de perderse", () => {
    const report = computeReport(
      [makeOrder({ channel: "telepatia" as FoodosOrder["channel"] })],
      { days: 7 },
      NOW
    )
    expect(at(report.byChannel, report.byChannel.length - 1).channel).toBe("telepatia")
  })

  it("agrupa por día del restaurante, no del navegador", () => {
    // 2026-03-11 02:00 UTC = 2026-03-10 20:00 en México.
    const orders = [
      makeOrder({ id: "a", created_at: "2026-03-11T02:00:00.000Z", total: 100 }),
      makeOrder({ id: "b", created_at: "2026-03-11T07:00:00.000Z", total: 50 }), // 01:00 del 11
    ]
    const report = computeReport(orders, { days: 2 }, NOW)
    expect(report.byDay.map((d) => d.key)).toEqual(["2026-03-09", "2026-03-10"])
    expect(at(report.byDay, 1).count).toBe(1)
    expect(at(report.byDay, 1).revenue).toBe(100)
  })

  it("reportDayKeys termina en hoy y respeta el número de días", () => {
    const keys = reportDayKeys(3, NOW)
    expect(keys).toEqual(["2026-03-08", "2026-03-09", "2026-03-10"])
  })

  it("dayBucketLabel rotula el día correcto y tolera basura", () => {
    expect(dayBucketLabel("2026-03-10")).toBe("mar")
    expect(dayBucketLabel("basura")).toBe("basura")
  })
})

describe("foodos-reportes: turnos y top platillos", () => {
  it("deja sin_turno al final del desglose", () => {
    const orders = [
      makeOrder({ id: "web", total: 999 }),
      makeOrder({ id: "t1", pos_shift_id: "shift-1", payment_method: "cash", total: 100 }),
    ]
    const report = computeReport(orders, { days: 7 }, NOW)
    expect(report.byShift.map((s) => s.shiftId)).toEqual(["shift-1", NO_SHIFT])
    expect(at(report.byShift, 0).cash).toBe(100)
    expect(at(report.byShift, 1).cash).toBe(0)
  })

  it("el efectivo del turno respeta el pago combinado", () => {
    const order = makeOrder({
      pos_shift_id: "shift-1",
      payment_method: "mixed",
      total: 500,
      payment_breakdown: {
        parts: [
          { method: "cash", amount: 200 },
          { method: "card", amount: 300 },
        ],
      },
    })
    const report = computeReport([order], { days: 7 }, NOW)
    expect(at(report.byShift, 0).cash).toBe(200)
    expect(at(report.byShift, 0).revenue).toBe(500)
  })

  it("los más vendidos salen sólo de pedidos pagados", () => {
    const orders = [
      makeOrder({
        id: "pagado",
        items: [{ item_id: "taco", name: "Taco", price: 20, qty: 3 }],
      }),
      makeOrder({
        id: "comanda",
        payment_status: "pending",
        items: [{ item_id: "taco", name: "Taco", price: 20, qty: 50 }],
      }),
    ]
    const report = computeReport(orders, { days: 7 }, NOW)
    expect(report.topItems).toHaveLength(1)
    expect(at(report.topItems, 0).qty).toBe(3)
    expect(at(report.topItems, 0).revenue).toBe(60)
  })

  it("una línea sin item_id se agrupa por nombre en vez de colapsarse en ''", () => {
    const orders = [
      makeOrder({
        items: [
          { item_id: "", name: "Especial", price: 90, qty: 1 },
          { item_id: "", name: "Otro especial", price: 10, qty: 1 },
        ],
      }),
    ]
    const report = computeReport(orders, { days: 7 }, NOW)
    expect(report.topItems).toHaveLength(2)
  })

  it("el porcentaje de combos se mide contra los ingresos pagados", () => {
    const orders = [
      makeOrder({
        total: 200,
        items: [
          { item_id: "c", name: "Combo", price: 150, qty: 1, combo_id: "combo-1" },
          { item_id: "x", name: "Extra", price: 50, qty: 1 },
        ],
      }),
    ]
    const report = computeReport(orders, { days: 7 }, NOW)
    expect(report.comboRevenue).toBe(150)
    expect(report.comboShare).toBe(75)
  })

  it("sin ingresos el porcentaje de combos es cero, no NaN", () => {
    expect(computeReport([], { days: 7 }, NOW).comboShare).toBe(0)
  })
})

describe("foodos-reportes: cierre diario", () => {
  it("separa lo pagado de lo que falta por cobrar", () => {
    const orders = [
      makeOrder({ id: "a", total: 100, tip: 10, discount: 5 }),
      makeOrder({ id: "b", total: 250, payment_status: "pending" }),
    ]
    const close = computeDailyClose(orders, [], { now: NOW })
    expect(close.orderCount).toBe(2)
    expect(close.paidCount).toBe(1)
    expect(close.revenue).toBe(100)
    expect(close.pending).toBe(250)
    expect(close.tips).toBe(10)
    expect(close.discounts).toBe(5)
  })

  it("sólo incluye el día del restaurante", () => {
    const orders = [
      makeOrder({ id: "hoy", created_at: "2026-03-11T02:00:00.000Z" }),
      makeOrder({ id: "ayer", created_at: "2026-03-10T02:00:00.000Z" }),
      makeOrder({ id: "cancelado", status: "cancelled" }),
    ]
    const close = computeDailyClose(orders, [], { now: NOW })
    expect(close.dayKey).toBe("2026-03-10")
    expect(close.orders.map((o) => o.id)).toEqual(["hoy"])
  })

  it("desglosa el pago combinado por partes", () => {
    const orders = [
      makeOrder({
        payment_method: "mixed",
        total: 500,
        payment_breakdown: {
          parts: [
            { method: "cash", amount: 200 },
            { method: "card", amount: 300 },
          ],
        },
      }),
    ]
    const close = computeDailyClose(orders, [], { now: NOW })
    expect(close.byPayment.map((p) => p.method)).toEqual(["card", "cash"])
    expect(close.byPayment.find((p) => p.method === "cash")?.total).toBe(200)
  })

  it("un pendiente sin método cae en sucursal y no suma total", () => {
    const orders = [makeOrder({ payment_method: null, payment_status: "pending", total: 80 })]
    const close = computeDailyClose(orders, [], { now: NOW })
    expect(at(close.byPayment, 0).method).toBe("branch")
    expect(at(close.byPayment, 0).total).toBe(0)
  })

  it("sólo lista canales con movimiento", () => {
    const close = computeDailyClose(
      [makeOrder({ channel: "mostrador", payment_method: "cash" })],
      [],
      { now: NOW }
    )
    expect(close.byChannel).toHaveLength(1)
    expect(at(close.byChannel, 0).label).toBe("Mostrador")
  })

  it("un turno abierto no declara arqueo", () => {
    const shift = makeShift({ status: "open", closed_at: null, declared_cash: null, difference: null })
    const close = computeDailyClose([], [shift], { now: NOW })
    expect(at(close.shifts, 0).arqueo).toBeNull()
  })

  it("clasifica el arqueo cerrado en cuadró/faltó/sobró", () => {
    const shifts = [
      makeShift({ id: "ok", difference: 0 }),
      makeShift({ id: "short", difference: -50 }),
      makeShift({ id: "over", difference: 20 }),
    ]
    const close = computeDailyClose([], shifts, { now: NOW })
    expect(close.shifts.map((s) => s.arqueo)).toEqual(["ok", "short", "over"])
  })

  it("cada turno lleva sus propias ventas y su efectivo", () => {
    const orders = [
      makeOrder({ id: "a", pos_shift_id: "s1", payment_method: "cash", total: 300 }),
      makeOrder({ id: "b", pos_shift_id: "s2", payment_method: "card", total: 700 }),
    ]
    const close = computeDailyClose(orders, [makeShift({ id: "s1" }), makeShift({ id: "s2" })], {
      now: NOW,
    })
    expect(at(close.shifts, 0).cashSales).toBe(300)
    expect(at(close.shifts, 1).cashSales).toBe(0)
    expect(at(close.shifts, 1).revenue).toBe(700)
  })

  it("el filtro por turno acota pedidos y cortes", () => {
    const orders = [
      makeOrder({ id: "a", pos_shift_id: "s1", total: 300 }),
      makeOrder({ id: "b", pos_shift_id: "s2", total: 700 }),
    ]
    const close = computeDailyClose(
      orders,
      [makeShift({ id: "s1" }), makeShift({ id: "s2" })],
      { now: NOW, shiftId: "s2" }
    )
    expect(close.orders.map((o) => o.id)).toEqual(["b"])
    expect(close.revenue).toBe(700)
    expect(close.shifts.map((s) => s.id)).toEqual(["s2"])
  })
})

describe("foodos-reportes: selector de turno", () => {
  it("rotula fecha, sucursal y estado abierto", () => {
    const shift = makeShift({ id: "s1", status: "open", branch_id: "b1" })
    expect(shiftOptionLabel(shift, "Centro")).toBe("10/03, 08:00 · Centro (abierto)")
  })

  it("no inventa sucursal cuando el turno no tiene", () => {
    const shift = makeShift({ id: "s1", branch_id: null })
    expect(shiftOptionLabel(shift, "Centro")).toBe("10/03, 08:00")
  })

  it("tolera una fecha inválida sin romper el selector", () => {
    const shift = makeShift({ id: "s1", opened_at: "nope" })
    expect(shiftOptionLabel(shift)).toBe("—")
  })

  it("shiftOptions resuelve el nombre de sucursal", () => {
    const options = shiftOptions(
      [makeShift({ id: "s1", branch_id: "b1" }), makeShift({ id: "s2" })],
      new Map([["b1", "Centro"]])
    )
    expect(options.map((o) => o.id)).toEqual(["s1", "s2"])
    expect(at(options, 0).label).toContain("Centro")
    expect(at(options, 1).label).not.toContain("Centro")
  })
})

describe("foodos-reportes: CSV del cierre", () => {
  it("entrecomilla y duplica comillas internas", () => {
    expect(csvCell('Taco "especial", grande')).toBe('"Taco ""especial"", grande"')
    expect(csvCell(null)).toBe("")
    expect(csvCell(12.5)).toBe('"12.5"')
  })

  it("lleva folio y turno para amarrar el renglón con el corte", () => {
    const order = makeOrder({ folio: "260310-0001", pos_shift_id: "s1", payment_method: "cash" })
    const close = computeDailyClose([order], [makeShift({ id: "s1" })], { now: NOW })
    const csv = dailyCloseCsv(close, new Map([["s1", "Turno mañana"]]))
    const lines = csv.split("\n")
    expect(at(lines, 0)).toContain('"folio"')
    expect(at(lines, 1)).toContain('"260310-0001"')
    expect(at(lines, 1)).toContain('"Turno mañana"')
    expect(at(lines, 1)).toContain('"cash"')
  })

  it("un pedido sin folio usa el id corto en vez de una celda vacía", () => {
    const close = computeDailyClose([makeOrder({ id: "abcdefgh-1234" })], [], { now: NOW })
    const csv = dailyCloseCsv(close, new Map())
    expect(at(csv.split("\n"), 1)).toContain('"abcdefgh"')
  })
})
