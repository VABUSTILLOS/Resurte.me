import { describe, expect, it } from "vitest"
import {
  ABANDONED_CART_MIN_AGE_HOURS,
  isAbandonedCartOrder,
} from "@/lib/abandoned-cart"
import { ABANDONED_CART_TOUCHES } from "@/lib/email-workflows"
import {
  buildFunnel,
  buildFunnelComparison,
  buildMethodBreakdown,
  buildMethodComparison,
  buildOutcomeBreakdown,
  buildRecoveryByTouch,
  buildUtmBreakdown,
  buildUtmComparison,
  classifyOrder,
  conversionFunnelToCsv,
  DIRECT_SOURCE,
  isAsyncPaymentMethod,
  OUTCOME_LABEL,
  OUTCOMES,
  parseRpcWindow,
  RECOVERY_TOUCHES,
  type FunnelOrder,
  type RecoveryLogRow,
  type TrendOrder,
  localDayKey,
  buildFunnelTrend,
} from "@/lib/conversion-funnel"

function order(overrides: Partial<FunnelOrder> = {}): FunnelOrder {
  return {
    id: 1,
    status: "pending",
    payment_status: "pending",
    payment_method: "card",
    total: 100,
    utm_source: null,
    ...overrides,
  }
}

describe("classifyOrder", () => {
  it("clasifica un pago cobrado como paid", () => {
    expect(classifyOrder(order({ payment_status: "paid", status: "delivered" }))).toBe("paid")
  })

  it("clasifica un cobro rechazado como failed, no como cancelado", () => {
    // El caso real del panel: tarjeta declinada que quedaba fuera de toda métrica.
    expect(classifyOrder(order({ payment_status: "failed", status: "pending" }))).toBe("failed")
    expect(classifyOrder(order({ payment_status: "failed", status: "cancelled" }))).toBe("failed")
  })

  it("un pago cobrado gana sobre una cancelación posterior", () => {
    expect(classifyOrder(order({ payment_status: "paid", status: "cancelled" }))).toBe("paid")
  })

  it("clasifica como pending lo mismo que contacta el motor de recuperación", () => {
    for (const method of ["card", "oxxo", "spei", "codi", "mercado_pago", "stripe", null]) {
      const candidate = order({ payment_method: method })
      expect(classifyOrder(candidate)).toBe(
        isAbandonedCartOrder(candidate) ? "pending" : "other",
      )
    }
  })

  it("excluye contra entrega del abandono y lo manda a otros", () => {
    expect(classifyOrder(order({ payment_method: "cash_on_delivery" }))).toBe("other")
  })

  it("manda cancelado sin pago a cancelled", () => {
    expect(classifyOrder(order({ status: "cancelled" }))).toBe("cancelled")
  })

  it("manda reembolsos, disputas y montos incorrectos a otros", () => {
    for (const payment_status of ["refunded", "disputed", "amount_mismatch", "expired"]) {
      expect(classifyOrder(order({ payment_status, status: "delivered" }))).toBe("other")
    }
  })
})

describe("buildFunnel", () => {
  it("reconcilia: los desenlaces suman el total de pedidos", () => {
    const orders = [
      order({ id: 1, payment_status: "paid", status: "delivered", total: 250 }),
      order({ id: 2, payment_status: "failed", total: 239 }),
      order({ id: 3, payment_status: "failed", total: 239 }),
      order({ id: 4, payment_status: "failed", total: 239 }),
      order({ id: 5, status: "cancelled", total: 4170.5 }),
      order({ id: 6, status: "cancelled", payment_method: "cash_on_delivery", total: 171 }),
    ]

    const funnel = buildFunnel(orders)

    expect(funnel.created).toBe(6)
    expect(funnel.paid).toBe(1)
    expect(funnel.failed).toBe(3)
    expect(funnel.pending).toBe(0)
    // Los dos cancelados caen en `cancelled`, contra entrega incluido: el
    // estado del pedido manda sobre la exclusión de método.
    expect(funnel.cancelled).toBe(2)
    expect(funnel.other).toBe(0)
    expect(funnel.classified).toBe(6)
    expect(funnel.reconciled).toBe(true)
  })

  it("reparte el mismo pedido real del panel sin perder ninguno", () => {
    // Los 6 pedidos de los últimos 30 días en producción: 3 tarjetas
    // rechazadas, 3 cancelados y ningún pago cobrado. El embudo anterior
    // reportaba "abandonados pendientes: 0" y no cuadraba con el total.
    const orders = [
      order({ id: 24, status: "cancelled", payment_method: "card", total: 324.5 }),
      order({ id: 23, payment_status: "failed", payment_method: "card", total: 239 }),
      order({ id: 22, payment_status: "failed", payment_method: "card", total: 239 }),
      order({ id: 21, payment_status: "failed", payment_method: "card", total: 239 }),
      order({ id: 20, status: "cancelled", payment_method: "cash_on_delivery", total: 4170.5 }),
      order({ id: 19, status: "cancelled", payment_method: "card", total: 171 }),
    ]

    const funnel = buildFunnel(orders)

    expect(funnel).toMatchObject({
      created: 6,
      paid: 0,
      failed: 3,
      pending: 0,
      cancelled: 3,
      other: 0,
      classified: 6,
      reconciled: true,
      revenue: 0,
      paidRate: 0,
      avgTicket: null,
    })
  })

  it("un embudo vacío no inventa un 0% de conversión", () => {
    const funnel = buildFunnel([])

    expect(funnel.created).toBe(0)
    expect(funnel.paidRate).toBeNull()
    expect(funnel.avgTicket).toBeNull()
    expect(funnel.revenue).toBe(0)
    expect(funnel.reconciled).toBe(true)
  })

  it("suma ingresos solo de los pedidos cobrados", () => {
    const funnel = buildFunnel([
      order({ id: 1, payment_status: "paid", total: 239 }),
      order({ id: 2, payment_status: "paid", total: 171 }),
      order({ id: 3, payment_status: "failed", total: 999 }),
      order({ id: 4, total: 500 }),
    ])

    expect(funnel.revenue).toBe(410)
    expect(funnel.avgTicket).toBe(205)
  })

  it("redondea los importes a centavos", () => {
    const funnel = buildFunnel([
      order({ id: 1, payment_status: "paid", total: 0.1 }),
      order({ id: 2, payment_status: "paid", total: 0.2 }),
    ])

    expect(funnel.revenue).toBe(0.3)
  })

  it("cada desenlace declarado existe en el agregado", () => {
    const funnel = buildFunnel([order()])
    const keys = Object.keys(funnel).filter((k) =>
      (OUTCOMES as readonly string[]).includes(k),
    )

    expect(keys.sort()).toEqual([...OUTCOMES].sort())
  })
})

describe("buildOutcomeBreakdown", () => {
  it("devuelve una fila por desenlace en el orden de OUTCOMES", () => {
    const rows = buildOutcomeBreakdown([order({ payment_status: "paid" })])

    expect(rows.map((r) => r.key)).toEqual([...OUTCOMES])
    expect(rows.map((r) => r.label)).toEqual(OUTCOMES.map((k) => OUTCOME_LABEL[k]))
  })

  it("calcula la participación sobre el total de pedidos", () => {
    const rows = buildOutcomeBreakdown([
      order({ id: 1, payment_status: "paid" }),
      order({ id: 2, payment_status: "paid" }),
      order({ id: 3, payment_status: "failed" }),
      order({ id: 4, payment_status: "failed" }),
    ])
    const paid = rows.find((r) => r.key === "paid")

    expect(paid?.count).toBe(2)
    expect(paid?.share).toBe(50)
    expect(paid?.amount).toBe(200)
  })

  it("sin pedidos la participación es null, no cero", () => {
    for (const row of buildOutcomeBreakdown([])) {
      expect(row.share).toBeNull()
    }
  })

  it("expone el importe de los pagos fallidos como valor no cobrado", () => {
    const rows = buildOutcomeBreakdown([
      order({ id: 1, payment_status: "failed", total: 239 }),
      order({ id: 2, payment_status: "failed", total: 239 }),
      order({ id: 3, payment_status: "failed", total: 239 }),
    ])

    expect(rows.find((r) => r.key === "failed")?.amount).toBe(717)
  })
})

describe("buildMethodBreakdown", () => {
  it("separa el pago asíncrono del inmediato", () => {
    const rows = buildMethodBreakdown([
      order({ id: 1, payment_method: "oxxo" }),
      order({ id: 2, payment_method: "spei" }),
      order({ id: 3, payment_method: "codi" }),
      order({ id: 4, payment_method: "cash_on_delivery" }),
      order({ id: 5, payment_method: "card" }),
    ])

    expect(rows.find((r) => r.method === "oxxo")?.async).toBe(true)
    expect(rows.find((r) => r.method === "spei")?.async).toBe(true)
    expect(rows.find((r) => r.method === "codi")?.async).toBe(true)
    expect(rows.find((r) => r.method === "cash_on_delivery")?.async).toBe(true)
    expect(rows.find((r) => r.method === "card")?.async).toBe(false)
  })

  it("etiqueta los métodos con el catálogo compartido", () => {
    const rows = buildMethodBreakdown([order({ payment_method: "cash_on_delivery" })])

    expect(rows[0]!.label).toBe("Efectivo")
  })

  it("agrupa el método vacío sin romper", () => {
    const rows = buildMethodBreakdown([order({ payment_method: null })])

    expect(rows[0]!.method).toBe("(sin método)")
    expect(rows[0]!.label).toBe("(sin método)")
    expect(rows[0]!.created).toBe(1)
  })

  it("ordena por volumen descendente", () => {
    const rows = buildMethodBreakdown([
      order({ id: 1, payment_method: "card" }),
      order({ id: 2, payment_method: "oxxo" }),
      order({ id: 3, payment_method: "oxxo" }),
    ])

    expect(rows.map((r) => r.method)).toEqual(["oxxo", "card"])
  })

  it("mide 0% cuando el método sí tiene pedidos y ninguno pagó", () => {
    // Con denominador la tasa es medible: 0% es un dato, no un hueco.
    const rows = buildMethodBreakdown([order({ payment_method: "card", status: "cancelled" })])

    expect(rows[0]!.paidRate).toBe(0)
  })
})

describe("isAsyncPaymentMethod", () => {
  it("trata la confirmación inmediata como no asíncrona", () => {
    for (const method of ["card", "stripe", "mercado_pago", null, undefined, ""]) {
      expect(isAsyncPaymentMethod(method)).toBe(false)
    }
  })
})

describe("buildRecoveryByTouch", () => {
  const touches = [
    { type: "abandoned_cart", label: "Recordatorio (2 h)" },
    { type: "abandoned_cart_24h", label: "Recordatorio (24 h)" },
    { type: "abandoned_cart_72h", label: "Último aviso (72 h)" },
  ]

  it("sin envíos la tasa es null, no 0%", () => {
    // Estado real de producción: la secuencia nunca se ha disparado.
    const rows = buildRecoveryByTouch(touches, [], [order()])

    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.sent).toBe(0)
      expect(row.contacted).toBe(0)
      expect(row.rate).toBeNull()
    }
  })

  it("acredita los pedidos contactados que acabaron pagados", () => {
    const orders = [
      order({ id: 10, payment_status: "paid", total: 250 }),
      order({ id: 11, payment_status: "paid", total: 150 }),
      order({ id: 12, payment_status: "failed" }),
    ]
    const logs: RecoveryLogRow[] = [
      { email_type: "abandoned_cart", order_id: 10 },
      { email_type: "abandoned_cart", order_id: 11 },
      { email_type: "abandoned_cart", order_id: 12 },
    ]

    const row = buildRecoveryByTouch(touches, logs, orders)[0]!

    expect(row.sent).toBe(3)
    expect(row.contacted).toBe(3)
    expect(row.recoveredOrders).toBe(2)
    expect(row.revenue).toBe(400)
    expect(row.rate).toBe(67)
  })

  it("cuenta un pedido una sola vez aunque reciba varios correos", () => {
    const orders = [order({ id: 10, payment_status: "paid", total: 250 })]
    const logs: RecoveryLogRow[] = [
      { email_type: "abandoned_cart", order_id: 10 },
      { email_type: "abandoned_cart", order_id: 10 },
    ]

    const row = buildRecoveryByTouch(touches, logs, orders)[0]!

    expect(row.sent).toBe(2)
    expect(row.contacted).toBe(1)
    expect(row.recoveredOrders).toBe(1)
    expect(row.rate).toBe(100)
  })

  it("no acredita correos cuyo pedido cae fuera del período", () => {
    const logs: RecoveryLogRow[] = [{ email_type: "abandoned_cart", order_id: 999 }]

    const row = buildRecoveryByTouch(touches, logs, [order({ id: 10 })])[0]!

    expect(row.contacted).toBe(1)
    expect(row.recoveredOrders).toBe(0)
    expect(row.rate).toBe(0)
  })

  it("ignora los correos sin pedido enlazado al contar contactados", () => {
    const logs: RecoveryLogRow[] = [{ email_type: "abandoned_cart", order_id: null }]

    const row = buildRecoveryByTouch(touches, logs, [])[0]!

    expect(row.sent).toBe(1)
    expect(row.contacted).toBe(0)
    expect(row.rate).toBeNull()
  })

  it("reparte los correos por su tipo de toque", () => {
    const logs: RecoveryLogRow[] = [
      { email_type: "abandoned_cart", order_id: 1 },
      { email_type: "abandoned_cart_72h", order_id: 1 },
      { email_type: "abandoned_cart_72h", order_id: 2 },
    ]

    const rows = buildRecoveryByTouch(touches, logs, [])

    expect(rows.map((r) => r.sent)).toEqual([1, 0, 2])
  })
})

describe("buildUtmBreakdown", () => {
  it("agrupa los pedidos sin UTM como directo", () => {
    const rows = buildUtmBreakdown([order({ utm_source: null }), order({ utm_source: "  " })])

    expect(rows).toHaveLength(1)
    expect(rows[0]!.source).toBe(DIRECT_SOURCE)
    expect(rows[0]!.created).toBe(2)
  })

  it("ordena por ingresos y no por volumen", () => {
    const rows = buildUtmBreakdown([
      order({ id: 1, utm_source: "volumen", total: 50 }),
      order({ id: 2, utm_source: "volumen", total: 50 }),
      order({ id: 3, utm_source: "volumen", total: 50 }),
      order({ id: 4, utm_source: "rentable", payment_status: "paid", total: 500 }),
    ])

    expect(rows.map((r) => r.source)).toEqual(["rentable", "volumen"])
    expect(rows[0]!.revenue).toBe(500)
    // "volumen" tiene 3 pedidos y ningún pago: 0% medido, no "sin medir".
    expect(rows[1]!.paidRate).toBe(0)
  })

  it("recorta al límite indicado", () => {
    const orders = Array.from({ length: 15 }, (_, i) =>
      order({ id: i + 1, utm_source: `src-${i}` }),
    )

    expect(buildUtmBreakdown(orders, 5)).toHaveLength(5)
  })
})

describe("conversionFunnelToCsv", () => {
  const base = {
    days: 30,
    funnel: buildFunnel([]),
    outcomes: buildOutcomeBreakdown([]),
    methods: buildMethodBreakdown([]),
    recovery: buildRecoveryByTouch([], [], []),
    utm: null,
  }

  it("empieza con BOM y usa punto y coma como separador", () => {
    const csv = conversionFunnelToCsv(base)

    expect(csv.startsWith("\ufeff")).toBe(true)
    expect(csv.slice(1).split("\r\n")[0]).toBe("Métrica;Cantidad;Tasa;Importe")
  })

  it("escribe 'No medido' en vez de 0% sin denominador", () => {
    const csv = conversionFunnelToCsv(base)

    expect(csv).toContain("No medido")
    expect(csv).not.toContain(";0%;")
  })

  it("omite la sección UTM cuando no está disponible", () => {
    const csv = conversionFunnelToCsv(base)

    expect(csv).not.toContain("UTM:")
  })

  it("incluye la sección UTM cuando sí lo está", () => {
    const csv = conversionFunnelToCsv({
      ...base,
      utm: buildUtmBreakdown([order({ utm_source: "meta", payment_status: "paid" })]),
    })

    expect(csv).toContain("UTM: meta")
  })

  it("escapa los valores con punto y coma", () => {
    const csv = conversionFunnelToCsv({
      ...base,
      recovery: [
        {
          type: "abandoned_cart",
          label: 'Recordatorio; "urgente"',
          sent: 1,
          contacted: 0,
          recoveredOrders: 0,
          revenue: 0,
          rate: null,
        },
      ],
    })

    expect(csv).toContain('"Recuperación: Recordatorio; ""urgente"""')
  })

  it("usa el umbral compartido de abandono", () => {
    expect(ABANDONED_CART_MIN_AGE_HOURS).toBe(2)
  })
})

// ── Paridad entre el agregado de Postgres y el motor JS ──────────
//
// `admin_conversion_funnel` (migración 00141) devuelve este mismo fixture ya
// sumado. Si el SQL y el motor derivan, el panel mostraría números distintos
// según cuál camino tomó; estas pruebas fijan que no.

const RPC_ORDERS: FunnelOrder[] = [
  order({ id: 1, status: "delivered", payment_status: "paid", payment_method: "card", total: 500, utm_source: "meta" }),
  order({ id: 2, status: "pending", payment_status: "failed", payment_method: "card", total: 239, utm_source: null }),
  order({ id: 3, status: "pending", payment_status: "failed", payment_method: "card", total: 239, utm_source: null }),
  order({ id: 4, status: "pending", payment_status: "pending", payment_method: "oxxo", total: 300, utm_source: "google" }),
  order({ id: 5, status: "cancelled", payment_status: "pending", payment_method: "cash_on_delivery", total: 4170.5, utm_source: null }),
]

const RPC_WINDOW = {
  created: 5,
  byOutcome: [
    { outcome: "paid", count: 1, amount: 500 },
    { outcome: "failed", count: 2, amount: 478 },
    { outcome: "pending", count: 1, amount: 300 },
    { outcome: "cancelled", count: 1, amount: 4170.5 },
    { outcome: "other", count: 0, amount: 0 },
  ],
  byMethod: [
    { method: "card", created: 3, paid: 1, failed: 2, pending: 0, revenue: 500 },
    { method: "cash_on_delivery", created: 1, paid: 0, failed: 0, pending: 0, revenue: 0 },
    { method: "oxxo", created: 1, paid: 0, failed: 0, pending: 1, revenue: 0 },
  ],
  byUtm: [
    { source: "meta", created: 1, paid: 1, failed: 0, revenue: 500 },
    { source: DIRECT_SOURCE, created: 3, paid: 0, failed: 2, revenue: 0 },
    { source: "google", created: 1, paid: 0, failed: 0, revenue: 0 },
  ],
}

describe("parseRpcWindow", () => {
  const parsed = parseRpcWindow(RPC_WINDOW)

  it("produce el mismo embudo que el motor en JS", () => {
    expect(parsed?.funnel).toEqual(buildFunnel(RPC_ORDERS))
  })

  it("produce el mismo desglose por desenlace", () => {
    expect(parsed?.outcomes).toEqual(buildOutcomeBreakdown(RPC_ORDERS))
  })

  it("produce el mismo desglose por método, con el mismo orden", () => {
    expect(parsed?.methods).toEqual(buildMethodBreakdown(RPC_ORDERS))
  })

  it("produce el mismo desglose UTM, con el mismo orden", () => {
    expect(parsed?.utm).toEqual(buildUtmBreakdown(RPC_ORDERS))
  })

  it("reordena las listas aunque el SQL las mande en otro orden", () => {
    const reversed = parseRpcWindow({
      ...RPC_WINDOW,
      byMethod: [...RPC_WINDOW.byMethod].reverse(),
      byUtm: [...RPC_WINDOW.byUtm].reverse(),
    })
    expect(reversed?.methods).toEqual(buildMethodBreakdown(RPC_ORDERS))
    expect(reversed?.utm).toEqual(buildUtmBreakdown(RPC_ORDERS))
  })

  it("devuelve null cuando el payload no tiene forma de ventana", () => {
    expect(parseRpcWindow(null)).toBeNull()
    expect(parseRpcWindow("nope")).toBeNull()
    expect(parseRpcWindow({ created: 3 })).toBeNull()
  })

  it("rellena los cinco desenlaces en una ventana vacía", () => {
    const empty = parseRpcWindow({ created: 0, byOutcome: [], byMethod: [], byUtm: [] })
    expect(empty?.funnel.created).toBe(0)
    expect(empty?.funnel.paidRate).toBeNull()
    expect(empty?.funnel.avgTicket).toBeNull()
    expect(empty?.funnel.reconciled).toBe(true)
    expect(empty?.outcomes.map((o) => o.key)).toEqual([...OUTCOMES])
    expect(empty?.outcomes.every((o) => o.count === 0 && o.share === null)).toBe(true)
  })

  it("marca como no reconciliado un desenlace que el panel no conoce", () => {
    // Si el SQL añade un sexto desenlace, `created` deja de cuadrar y la
    // bandera lo delata en vez de mostrar un total silenciosamente mal.
    const drifted = parseRpcWindow({
      created: 3,
      byOutcome: [
        { outcome: "paid", count: 2, amount: 100 },
        { outcome: "refunded", count: 1, amount: 50 },
      ],
    })
    expect(drifted?.funnel.created).toBe(3)
    expect(drifted?.funnel.classified).toBe(2)
    expect(drifted?.funnel.reconciled).toBe(false)
  })

  it("tolera numéricos que llegan como texto desde jsonb", () => {
    const texty = parseRpcWindow({
      created: "2",
      byOutcome: [{ outcome: "paid", count: "2", amount: "120.50" }],
    })
    expect(texty?.funnel.paid).toBe(2)
    expect(texty?.funnel.revenue).toBe(120.5)
    expect(texty?.funnel.paidRate).toBe(100)
  })
})

describe("buildFunnelComparison", () => {
  const current = buildFunnel([
    order({ payment_status: "paid", total: 100 }),
    order({ payment_status: "paid", total: 100 }),
    order({ payment_status: "failed", total: 50 }),
  ])
  const previous = buildFunnel([order({ payment_status: "paid", total: 100 })])

  it("compara los conteos y los ingresos", () => {
    const comparison = buildFunnelComparison(current, previous)
    expect(comparison.paid).toEqual({
      current: 2,
      previous: 1,
      deltaPct: 100,
      direction: "up",
    })
    expect(comparison.revenue.deltaPct).toBe(100)
    expect(comparison.failed).toEqual({
      current: 1,
      previous: 0,
      deltaPct: null,
      direction: "up",
    })
  })

  it("mide la tasa de pago en puntos porcentuales", () => {
    // 67% contra 100% es −33 pp, no −33% de 100%.
    const comparison = buildFunnelComparison(current, previous)
    expect(current.paidRate).toBe(67)
    expect(previous.paidRate).toBe(100)
    expect(comparison.paidRateDeltaPp).toBe(-33)
  })

  it("deja la tasa sin base cuando alguno de los periodos no tiene pedidos", () => {
    const comparison = buildFunnelComparison(buildFunnel([]), previous)
    expect(comparison.paidRateDeltaPp).toBeNull()
    expect(comparison.created.direction).toBe("down")
    expect(comparison.created.deltaPct).toBe(-100)
  })
})

describe("RECOVERY_TOUCHES", () => {
  it("enumera exactamente los toques que envía el motor de recuperación", () => {
    // Guardia de deriva: si el motor añade o renombra un toque, esta prueba
    // falla y obliga a actualizar el reporte del panel.
    expect(RECOVERY_TOUCHES.map((t) => t.type)).toEqual(
      ABANDONED_CART_TOUCHES.map((t) => t.type),
    )
  })

  it("etiqueta cada toque con su ventana real de envío", () => {
    expect(RECOVERY_TOUCHES).toHaveLength(3)
    expect(RECOVERY_TOUCHES[0]!.label).toContain("2–26")
    expect(RECOVERY_TOUCHES[1]!.label).toContain("26–50")
    expect(RECOVERY_TOUCHES[2]!.label).toContain("50–74")
  })
})

describe("buildFunnelComparison — ticket promedio", () => {
  it("compara el ticket promedio cuando los dos periodos tienen pagados", () => {
    const current = buildFunnel([
      order({ payment_status: "paid", total: 200 }),
      order({ payment_status: "paid", total: 100 }),
    ])
    const previous = buildFunnel([order({ payment_status: "paid", total: 100 })])
    const comparison = buildFunnelComparison(current, previous)
    expect(comparison.avgTicket).toEqual({
      current: 150,
      previous: 100,
      deltaPct: 50,
      direction: "up",
    })
  })

  it("deja el ticket sin comparación si un periodo no tiene pagados", () => {
    // Un promedio que no se puede calcular no es una caída del 100%.
    const conPagados = buildFunnel([order({ payment_status: "paid", total: 100 })])
    const sinPagados = buildFunnel([order({ payment_status: "failed", total: 100 })])
    expect(sinPagados.avgTicket).toBeNull()
    expect(buildFunnelComparison(conPagados, sinPagados).avgTicket).toBeNull()
    expect(buildFunnelComparison(sinPagados, conPagados).avgTicket).toBeNull()
  })
})

describe("buildMethodComparison", () => {
  const current = buildMethodBreakdown([
    order({ payment_method: "card", payment_status: "paid", total: 100 }),
    order({ payment_method: "card", payment_status: "paid", total: 100 }),
    order({ payment_method: "oxxo", payment_status: "pending", total: 100 }),
  ])
  const previous = buildMethodBreakdown([
    order({ payment_method: "card", payment_status: "paid", total: 100 }),
    order({ payment_method: "oxxo", payment_status: "paid", total: 100 }),
    order({ payment_method: "oxxo", payment_status: "paid", total: 100 }),
  ])

  it("compara cada método por su clave, no por su posición", () => {
    const deltas = buildMethodComparison(current, previous)
    // card: 2 creados / 2 pagados (100%) contra 1 creado / 1 pagado (100%)
    expect(deltas.card!.created).toEqual({
      current: 2,
      previous: 1,
      deltaPct: 100,
      direction: "up",
    })
    expect(deltas.card!.paidRateDeltaPp).toBe(0)
    // oxxo: 0 de 1 (0%) contra 2 de 2 (100%) → 100 puntos menos.
    expect(deltas.oxxo!.paidRateDeltaPp).toBe(-100)
    // Y el volumen se derrumba a la mitad.
    expect(deltas.oxxo!.created.deltaPct).toBe(-50)
  })

  it("mide la tasa de pago en puntos porcentuales, no en relativo", () => {
    const antes = buildMethodBreakdown([
      order({ payment_method: "card", payment_status: "paid", total: 100 }),
      order({ payment_method: "card", payment_status: "failed", total: 100 }),
    ])
    const despues = buildMethodBreakdown([
      order({ payment_method: "card", payment_status: "paid", total: 100 }),
      order({ payment_method: "card", payment_status: "paid", total: 100 }),
      order({ payment_method: "card", payment_status: "paid", total: 100 }),
      order({ payment_method: "card", payment_status: "paid", total: 100 }),
      order({ payment_method: "card", payment_status: "failed", total: 100 }),
    ])
    // 50% → 80% son +30 pp, no +60%.
    expect(buildMethodComparison(despues, antes).card!.paidRateDeltaPp).toBe(30)
  })

  it("marca un método nuevo como 'sin base' en vez de omitirlo", () => {
    const deltas = buildMethodComparison(current, [])
    expect(deltas.oxxo).toBeDefined()
    expect(deltas.oxxo!.created.deltaPct).toBeNull()
    expect(deltas.oxxo!.paidRateDeltaPp).toBeNull()
  })

  it("deja la tasa sin base si el método no tenía denominador antes", () => {
    const sinDenominador = buildMethodBreakdown([
      order({ payment_method: "card", payment_status: "paid", total: 100 }),
    ])
    const deltas = buildMethodComparison(current, sinDenominador)
    expect(deltas.oxxo!.paidRateDeltaPp).toBeNull()
  })
})

describe("buildUtmComparison", () => {
  it("compara por origen y deja 'sin base' el origen ausente antes", () => {
    const current = buildUtmBreakdown([
      order({ utm_source: "meta", payment_status: "paid", total: 100 }),
      order({ utm_source: "google", payment_status: "paid", total: 100 }),
    ])
    const previous = buildUtmBreakdown([
      order({ utm_source: "meta", payment_status: "failed", total: 100 }),
    ])
    const deltas = buildUtmComparison(current, previous)
    // meta pasó de 0 a 1 pagado, pero sin denominador no hay porcentaje que
    // afirmar: "sin base", no "+100%".
    expect(deltas.meta!.paid).toEqual({
      current: 1,
      previous: 0,
      deltaPct: null,
      direction: "up",
    })
    // google no existía antes: misma regla, sin inventar una base cero.
    expect(deltas.google!.created.deltaPct).toBeNull()
    expect(deltas.google!.paidRateDeltaPp).toBeNull()
  })

  it("indexa por la fuente tal cual, incluido el centinela de directo", () => {
    const deltas = buildUtmComparison(
      buildUtmBreakdown([order({ utm_source: "  ", payment_status: "paid" })]),
      buildUtmBreakdown([order({ utm_source: null, payment_status: "paid" })]),
    )
    expect(Object.keys(deltas)).toEqual([DIRECT_SOURCE])
    expect(deltas[DIRECT_SOURCE]!.paidRateDeltaPp).toBe(0)
  })
})

describe("localDayKey", () => {
  it("usa el día local del restaurante, no el día UTC", () => {
    // 02:00 UTC del 4 es todavía la noche del 3 en México (UTC-6): el negocio
    // contó ese pedido el 3, y agrupar por UTC lo movería de día.
    expect(localDayKey("2026-08-04T02:00:00Z")).toBe("2026-08-03")
    expect(localDayKey("2026-08-04T18:00:00Z")).toBe("2026-08-04")
  })

  it("devuelve cadena vacía ante un valor inválido, que nunca es un día de la ventana", () => {
    expect(localDayKey("no es una fecha")).toBe("")
    expect(localDayKey(new Date("invalid"))).toBe("")
  })

  it("acepta Date y una zona explícita", () => {
    const instant = new Date("2026-08-04T02:00:00Z")
    expect(localDayKey(instant, "UTC")).toBe("2026-08-04")
    expect(localDayKey(instant, "America/Mexico_City")).toBe("2026-08-03")
  })
})

describe("buildFunnelTrend", () => {
  // Ventana de dos días locales completos: 00:00 del 3 al 00:00 del 5 en México.
  const SINCE = "2026-08-03T06:00:00Z"
  const UNTIL = "2026-08-05T06:00:00Z"

  function trendOrder(overrides: Partial<TrendOrder> = {}): TrendOrder {
    return { ...order(), created_at: "2026-08-04T18:00:00Z", ...overrides }
  }

  it("emite un punto por día de la ventana, incluidos los días sin pedidos", () => {
    const points = buildFunnelTrend([], SINCE, UNTIL)
    // Un hueco se dibuja igual que un cero, así que los días vacíos existen.
    expect(points.map((p) => p.date)).toEqual(["2026-08-03", "2026-08-04"])
    expect(points.every((p) => p.created === 0 && p.revenue === 0)).toBe(true)
    // La ventana arranca y termina en el minuto cero de un día local, así que
    // aquí no hay días cortados.
    expect(points.every((p) => p.partial === false)).toBe(true)
  })

  it("marca como incompletos los días que corta el borde de la ventana móvil", () => {
    // Ventana móvil de 30×24 h desde las 14:30 locales: toca 31 días locales y
    // el primero y el último están a medias. Sin la marca, esa caída de borde
    // se lee como una caída del negocio.
    const points = buildFunnelTrend([], "2026-08-03T20:30:00Z", "2026-09-02T20:30:00Z")
    expect(points).toHaveLength(31)
    expect(points[0]).toMatchObject({ date: "2026-08-03", partial: true })
    expect(points.at(-1)).toMatchObject({ date: "2026-09-02", partial: true })
    expect(points.slice(1, -1).every((p) => p.partial === false)).toBe(true)
  })

  it("acumula cada pedido en su día local, con los desenlaces ya clasificados", () => {
    const points = buildFunnelTrend(
      [
        // 20:00 del 3 en México (ya es el 4 en UTC): cuenta el 3.
        trendOrder({ id: 1, created_at: "2026-08-04T02:00:00Z", payment_status: "paid", total: 250 }),
        trendOrder({ id: 2, created_at: "2026-08-04T18:00:00Z", payment_status: "failed", total: 90 }),
        trendOrder({
          id: 3,
          created_at: "2026-08-04T19:00:00Z",
          payment_status: "pending",
          payment_method: "cash_on_delivery",
          total: 90,
        }),
        trendOrder({ id: 4, created_at: "2026-08-05T01:00:00Z", status: "cancelled", total: 60 }),
      ],
      SINCE,
      UNTIL,
    )

    expect(points[0]).toMatchObject({
      date: "2026-08-03",
      created: 1,
      paid: 1,
      revenue: 250,
    })
    expect(points[1]).toMatchObject({
      date: "2026-08-04",
      created: 3,
      failed: 1,
      // Contra entrega no es abandono: cae en "otros".
      pending: 0,
      other: 1,
      cancelled: 1,
      revenue: 0,
    })
  })

  it("suma exactamente lo mismo que el embudo del periodo", () => {
    const orders = [
      trendOrder({ id: 1, payment_status: "paid", total: 100 }),
      trendOrder({ id: 2, payment_status: "failed", total: 200 }),
      trendOrder({ id: 3, created_at: "2026-08-04T19:00:00Z", total: 300 }),
    ]
    const points = buildFunnelTrend(orders, SINCE, UNTIL)
    const total = buildFunnel(orders)

    const sum = (key: "created" | "paid" | "failed" | "pending" | "cancelled" | "other") =>
      points.reduce((acc, p) => acc + p[key], 0)

    expect(sum("created")).toBe(total.created)
    expect(sum("paid")).toBe(total.paid)
    expect(sum("failed")).toBe(total.failed)
    expect(sum("pending")).toBe(total.pending)
    expect(sum("cancelled")).toBe(total.cancelled)
    expect(sum("other")).toBe(total.other)
    expect(points.reduce((acc, p) => acc + p.revenue, 0)).toBe(total.revenue)
  })

  it("ignora los pedidos fuera de la ventana en vez de sumarlos al borde", () => {
    const points = buildFunnelTrend(
      [
        trendOrder({ id: 1, payment_status: "paid", total: 100 }),
        // Antes del inicio y después del fin: el llamador ya filtró, y colarlos
        // haría que la serie no cuadrara con el embudo.
        trendOrder({ id: 2, created_at: "2026-08-03T05:00:00Z", total: 500 }),
        trendOrder({ id: 3, created_at: "2026-08-05T07:00:00Z", total: 700 }),
      ],
      SINCE,
      UNTIL,
    )

    expect(points.reduce((acc, p) => acc + p.created, 0)).toBe(1)
    expect(points.reduce((acc, p) => acc + p.revenue, 0)).toBe(100)
  })

  it("corta por instante, no por día, en los bordes de la ventana", () => {
    // Ventana móvil que no arranca a medianoche: el primer y el último día
    // quedan cortados, y agrupar solo por día local colaba los pedidos de esas
    // mismas horas pero fuera de la ventana (el de la madrugada del primer día,
    // y el que cae justo en `until`, que el SQL excluye con `< p_until`).
    const since = "2026-08-03T20:30:00Z"
    const until = "2026-08-04T20:30:00Z"
    const points = buildFunnelTrend(
      [
        trendOrder({ id: 1, created_at: since, payment_status: "paid", total: 100 }),
        trendOrder({ id: 2, created_at: "2026-08-03T10:00:00Z", total: 500 }),
        trendOrder({ id: 3, created_at: until, total: 700 }),
      ],
      since,
      until,
    )

    expect(points.map((p) => p.date)).toEqual(["2026-08-03", "2026-08-04"])
    expect(points.reduce((acc, p) => acc + p.created, 0)).toBe(1)
    expect(points.reduce((acc, p) => acc + p.revenue, 0)).toBe(100)
    expect(points[0]).toMatchObject({ date: "2026-08-03", created: 1, paid: 1, partial: true })
  })

  it("ignora las fechas ilegibles en vez de contarlas", () => {
    const points = buildFunnelTrend(
      [
        trendOrder({ id: 1, created_at: "no es una fecha", total: 999 }),
        trendOrder({ id: 2, payment_status: "paid", total: 100 }),
      ],
      SINCE,
      UNTIL,
    )

    expect(points.reduce((acc, p) => acc + p.created, 0)).toBe(1)
    expect(points.reduce((acc, p) => acc + p.revenue, 0)).toBe(100)
  })

  it("cierra el último día aunque la ventana no sea múltiplo de 24 h", () => {
    // 36 h desde el inicio: el recorrido de 24 h no toca el día final, así que
    // se añade explícitamente en vez de perderlo.
    const points = buildFunnelTrend([], SINCE, "2026-08-04T18:00:00Z")
    expect(points.map((p) => p.date)).toEqual(["2026-08-03", "2026-08-04"])
  })

  it("no inventa días cuando la ventana es inválida o está vacía", () => {
    expect(buildFunnelTrend([], UNTIL, SINCE)).toEqual([])
    expect(buildFunnelTrend([], SINCE, SINCE)).toEqual([])
    expect(buildFunnelTrend([], "no es una fecha", UNTIL)).toEqual([])
  })

  it("redondea los ingresos a centavos como el resto del motor", () => {
    const points = buildFunnelTrend(
      [
        trendOrder({ id: 1, payment_status: "paid", total: 0.1 }),
        trendOrder({ id: 2, payment_status: "paid", total: 0.2 }),
      ],
      SINCE,
      UNTIL,
    )
    expect(points[1]!.revenue).toBe(0.3)
  })
})
