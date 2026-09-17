import { describe, expect, it } from "vitest"
import {
  arqueoLabel,
  arqueoStatus,
  cashPartOfSale,
  cashSalesFromOrders,
  computeArqueo,
  computeExpectedCash,
  formatShiftDate,
  fromCents,
  MXN_DENOMINATIONS,
  salesByMethod,
  shiftHistoryCsv,
  shiftHistoryRows,
  sumDenominations,
  toCents,
  type CashSaleLike,
} from "./foodos-cash"

function sale(overrides: Partial<CashSaleLike> = {}): CashSaleLike {
  return {
    total: 100,
    payment_method: "cash",
    payment_status: "paid",
    payment_breakdown: null,
    ...overrides,
  }
}

describe("toCents / fromCents", () => {
  it("redondea al centavo más cercano", () => {
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(19.999)).toBe(2000)
    expect(fromCents(300)).toBe(3)
  })
})

describe("sumDenominations", () => {
  it("suma billetes y monedas sin error de punto flotante", () => {
    // 3×$500 + 2×$20 + 3×$0.50
    expect(sumDenominations({ 500: 3, 20: 2, 0.5: 3 })).toBe(1541.5)
  })

  it("ignora denominaciones que no están en el conteo", () => {
    expect(sumDenominations({})).toBe(0)
    expect(sumDenominations({ 1000: 0 })).toBe(0)
  })

  it("ignora valores basura en lugar de contaminar el arqueo", () => {
    expect(sumDenominations({ 100: -5 })).toBe(0)
    expect(sumDenominations({ 100: Number.NaN })).toBe(0)
    expect(sumDenominations({ 100: 2.7 })).toBe(200)
  })

  it("cubre las denominaciones vigentes en México", () => {
    expect(MXN_DENOMINATIONS.map((d) => d.value)).toEqual([
      1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5,
    ])
  })

  it("suma el mismo total con distinto desglose", () => {
    expect(sumDenominations({ 1000: 1, 500: 1 })).toBe(sumDenominations({ 200: 7, 100: 1 }))
  })
})

describe("computeExpectedCash", () => {
  it("aplica fondo + ventas + entradas − salidas", () => {
    expect(
      computeExpectedCash({ openingFloat: 500, cashSales: 1250.5, cashIn: 200, cashOut: 300.5 }),
    ).toBe(1650)
  })

  it("no arrastra centavos fantasma", () => {
    expect(
      computeExpectedCash({ openingFloat: 0.1, cashSales: 0.2, cashIn: 0, cashOut: 0 }),
    ).toBe(0.3)
  })

  it("sin movimientos devuelve el fondo", () => {
    expect(
      computeExpectedCash({ openingFloat: 800, cashSales: 0, cashIn: 0, cashOut: 0 }),
    ).toBe(800)
  })
})

describe("arqueoStatus", () => {
  it("cero exacto cuadra", () => {
    expect(arqueoStatus(0)).toBe("ok")
  })

  it("un centavo ya es diferencia real", () => {
    expect(arqueoStatus(-0.01)).toBe("short")
    expect(arqueoStatus(0.01)).toBe("over")
  })
})

describe("computeArqueo", () => {
  it("detecta faltante", () => {
    const arqueo = computeArqueo({
      openingFloat: 500,
      cashSales: 1000,
      cashIn: 0,
      cashOut: 0,
      declaredCash: 1450,
    })
    expect(arqueo.expectedCash).toBe(1500)
    expect(arqueo.difference).toBe(-50)
    expect(arqueo.status).toBe("short")
  })

  it("detecta sobrante", () => {
    const arqueo = computeArqueo({
      openingFloat: 500,
      cashSales: 1000,
      cashIn: 0,
      cashOut: 0,
      declaredCash: 1500.5,
    })
    expect(arqueo.difference).toBe(0.5)
    expect(arqueo.status).toBe("over")
  })

  it("cuadra al centavo", () => {
    const arqueo = computeArqueo({
      openingFloat: 1000,
      cashSales: 333.33,
      cashIn: 0,
      cashOut: 0,
      declaredCash: 1333.33,
    })
    expect(arqueo.difference).toBe(0)
    expect(arqueo.status).toBe("ok")
  })
})

describe("arqueoLabel", () => {
  it("traduce el estado", () => {
    expect(arqueoLabel("ok")).toBe("Cuadró")
    expect(arqueoLabel("short")).toBe("Faltante")
    expect(arqueoLabel("over")).toBe("Sobrante")
  })
})

describe("cashPartOfSale", () => {
  it("cobra en efectivo sin desglose: entra el total", () => {
    expect(cashPartOfSale(sale({ total: 250 }))).toBe(250)
  })

  it("cobra con tarjeta sin desglose: no entra nada", () => {
    expect(cashPartOfSale(sale({ total: 250, payment_method: "card" }))).toBe(0)
  })

  it("pago combinado: sólo entra la parte en efectivo", () => {
    expect(
      cashPartOfSale(
        sale({
          total: 300,
          payment_method: "mixed",
          payment_breakdown: {
            parts: [
              { method: "cash", amount: 100 },
              { method: "card", amount: 200 },
            ],
          },
        }),
      ),
    ).toBe(100)
  })

  it("pago combinado sin efectivo: no entra nada", () => {
    expect(
      cashPartOfSale(
        sale({
          total: 300,
          payment_method: "mixed",
          payment_breakdown: {
            parts: [
              { method: "card", amount: 200 },
              { method: "transfer", amount: 100 },
            ],
          },
        }),
      ),
    ).toBe(0)
  })

  it("desglose vacío cae al método del pedido", () => {
    expect(
      cashPartOfSale(sale({ total: 90, payment_breakdown: { parts: [] } })),
    ).toBe(90)
  })
})

describe("cashSalesFromOrders", () => {
  it("sólo cuenta pedidos pagados", () => {
    const orders = [
      sale({ total: 100 }),
      sale({ total: 500, payment_status: "pending" }),
      sale({ total: 200, payment_status: "paid" }),
    ]
    expect(cashSalesFromOrders(orders)).toBe(300)
  })

  it("suma efectivo de pagos combinados y directos", () => {
    const orders = [
      sale({ total: 120 }),
      sale({
        total: 500,
        payment_method: "mixed",
        payment_breakdown: {
          parts: [
            { method: "cash", amount: 200 },
            { method: "card", amount: 300 },
          ],
        },
      }),
      sale({ total: 80, payment_method: "transfer" }),
    ]
    expect(cashSalesFromOrders(orders)).toBe(320)
  })

  it("lista vacía es cero", () => {
    expect(cashSalesFromOrders([])).toBe(0)
  })
})

describe("salesByMethod", () => {
  it("desglosa por método y omite los que quedaron en cero", () => {
    const orders = [
      sale({ total: 120 }),
      sale({
        total: 500,
        payment_method: "mixed",
        payment_breakdown: {
          parts: [
            { method: "cash", amount: 200 },
            { method: "card", amount: 300 },
          ],
        },
      }),
      sale({ total: 80, payment_method: "card" }),
      sale({ total: 999, payment_status: "pending" }),
      sale({
        total: 50,
        payment_method: "mixed",
        payment_breakdown: { parts: [{ method: "cash", amount: 0 }] },
      }),
    ]
    expect(salesByMethod(orders)).toEqual({ cash: 320, card: 380 })
  })

  it("ignora pedidos sin método de pago", () => {
    expect(salesByMethod([sale({ payment_method: null })])).toEqual({})
  })
})

describe("shiftHistoryRows", () => {
  const base = {
    id: "11111111-2222-3333-4444-555555555555",
    opening_float: 500,
    opened_at: "2026-09-17T15:00:00.000Z",
    closed_at: "2026-09-17T23:00:00.000Z",
    declared_cash: 1450,
    expected_cash: 1500,
    difference: -50,
    notes: null,
    opened_by: "u1",
    closed_by: "u1",
    branch_id: null,
  }

  it("un turno abierto no tiene arqueo todavía", () => {
    const [row] = shiftHistoryRows([{ ...base, status: "open", closed_at: null, declared_cash: null, expected_cash: null, difference: null }])
    expect(row?.arqueo).toBeNull()
    expect(row?.declaredCash).toBeNull()
  })

  it("un turno cerrado reporta faltante", () => {
    const [row] = shiftHistoryRows([{ ...base, status: "closed" }])
    expect(row?.arqueo).toBe("short")
    expect(row?.difference).toBe(-50)
  })

  it("conserva el orden recibido", () => {
    const rows = shiftHistoryRows([
      { ...base, id: "aaaa", status: "closed" },
      { ...base, id: "bbbb", status: "closed" },
    ])
    expect(rows.map((r) => r.id)).toEqual(["aaaa", "bbbb"])
  })
})

describe("shiftHistoryCsv", () => {
  it("exporta encabezados y filas en el mismo orden", () => {
    const rows = shiftHistoryRows([
      {
        id: "11111111-2222-3333-4444-555555555555",
        status: "closed",
        opening_float: 500,
        opened_at: "2026-09-17T15:00:00.000Z",
        closed_at: "2026-09-17T23:00:00.000Z",
        declared_cash: 1450,
        expected_cash: 1500,
        difference: -50,
        notes: "faltó cambio",
        opened_by: "u1",
        closed_by: "u1",
        branch_id: null,
      },
    ])
    const csv = shiftHistoryCsv(rows)
    expect(csv.headers).toHaveLength(10)
    expect(csv.rows[0]).toHaveLength(10)
    expect(csv.rows[0]?.[0]).toBe("11111111")
    expect(csv.rows[0]?.[7]).toBe(-50)
    expect(csv.rows[0]?.[8]).toBe("Faltante")
    expect(csv.rows[0]?.[9]).toBe("faltó cambio")
  })

  it("un turno abierto deja esperado, contado y diferencia vacíos", () => {
    const csv = shiftHistoryCsv(
      shiftHistoryRows([
        {
          id: "11111111-2222-3333-4444-555555555555",
          status: "open",
          opening_float: 500,
          opened_at: "2026-09-17T15:00:00.000Z",
          closed_at: null,
          declared_cash: null,
          expected_cash: null,
          difference: null,
          notes: null,
          opened_by: "u1",
          closed_by: null,
          branch_id: null,
        },
      ]),
    )
    expect(csv.rows[0]?.slice(5)).toEqual(["", "", "", "", ""])
    expect(csv.rows[0]?.[1]).toBe("Abierto")
  })
})

describe("formatShiftDate", () => {
  it("usa hora de Ciudad de México, igual que el folio", () => {
    // 2026-09-18T05:30Z son las 23:30 del día 17 en CDMX (UTC−6).
    expect(formatShiftDate("2026-09-18T05:30:00.000Z")).toContain("17/09/2026")
  })

  it("una fecha inválida no rompe la tabla", () => {
    expect(formatShiftDate("no-es-fecha")).toBe("")
  })
})
