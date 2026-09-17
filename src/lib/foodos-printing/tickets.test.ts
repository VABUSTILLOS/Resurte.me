import { describe, expect, it } from "vitest"
import {
  buildCustomerTicket,
  buildKitchenTicket,
  buildTicket,
  buildTicketLines,
  formatTicketDate,
  printPathFor,
  resolveFolio,
  resolvePayment,
} from "./tickets"
import type { TicketPayment } from "./types"
import { CTX, item, order } from "./test-helpers"

describe("resolveFolio", () => {
  it("usa el folio consecutivo cuando existe", () => {
    expect(resolveFolio({ id: "3f9a2b1c-4d5e", folio: "260214-0007" })).toBe("260214-0007")
  })

  it("ignora un folio en blanco", () => {
    expect(resolveFolio({ id: "3f9a2b1c-4d5e", folio: "   " })).toBe("3F9A2B1C")
  })

  it("cae al id corto en mayúsculas para pedidos previos al POS", () => {
    expect(resolveFolio({ id: "abcdef12-3456" })).toBe("ABCDEF12")
  })
})

describe("buildTicketLines", () => {
  it("toma el precio final de la línea sin recalcular nada", () => {
    const lines = buildTicketLines([item({ price: 32.5, qty: 3 })])
    expect(lines).toEqual([
      {
        qty: 3,
        name: "Taco al pastor",
        unitPrice: 32.5,
        amount: 97.5,
        modifiers: [],
      },
    ])
  })

  it("aplan los modificadores con su delta", () => {
    const lines = buildTicketLines([
      item({
        modifiers: [
          {
            group_id: "g1",
            group_name: "Salsa",
            value_id: "v1",
            value_name: "Sin cebolla",
            price_delta: 0,
          },
          {
            group_id: "g2",
            group_name: "Extras",
            value_id: "v2",
            value_name: "Queso extra",
            price_delta: 12,
          },
        ],
      }),
    ])
    expect(lines[0]?.modifiers).toEqual([
      { name: "Sin cebolla", priceDelta: 0 },
      { name: "Queso extra", priceDelta: 12 },
    ])
  })

  it("trata items ausentes como lista vacía", () => {
    expect(buildTicketLines([])).toEqual([])
  })
})

describe("resolvePayment", () => {
  it("arma una sola parte a partir de payment_method", () => {
    const payment = resolvePayment(order({ payment_method: "card", payment_status: "pending" }))
    expect(payment.label).toBe("Tarjeta")
    expect(payment.status).toBe("Pendiente de pago")
    expect(payment.parts).toEqual([{ method: "card", label: "Tarjeta", amount: 0 }])
  })

  it("marca combinado y conserva el importe de cada forma de pago", () => {
    const payment = resolvePayment(
      order({
        payment_method: "mixed",
        payment_breakdown: {
          parts: [
            { method: "cash", amount: 100 },
            { method: "card", amount: 150 },
          ],
          received: 200,
          change: 100,
        },
      }),
    )
    expect(payment.label).toBe("Combinado")
    expect(payment.parts).toEqual([
      { method: "cash", label: "Efectivo", amount: 100 },
      { method: "card", label: "Tarjeta", amount: 150 },
    ])
    expect(payment.received).toBe(200)
    expect(payment.change).toBe(100)
  })

  it("descarta partes en cero", () => {
    const payment = resolvePayment(
      order({
        payment_method: "mixed",
        payment_breakdown: {
          parts: [
            { method: "cash", amount: 50 },
            { method: "card", amount: 0 },
          ],
        },
      }),
    )
    expect(payment.parts).toEqual([{ method: "cash", label: "Efectivo", amount: 50 }])
    expect(payment.label).toBe("Efectivo")
  })

  it("deja el desglose que manda la caja por encima de lo guardado", () => {
    const override: TicketPayment = {
      label: "Efectivo",
      status: "Pagado",
      parts: [{ method: "cash", label: "Efectivo", amount: 200 }],
      received: 200,
      change: 50,
    }
    const payment = resolvePayment(
      order({ payment_breakdown: { parts: [{ method: "card", amount: 150 }] } }),
      override,
    )
    expect(payment).toEqual(override)
  })

  it("no revienta sin forma de pago", () => {
    const payment = resolvePayment(order({ payment_method: null }))
    expect(payment.label).toBe("Sin especificar")
    expect(payment.parts).toEqual([])
  })

  it("muestra el valor crudo si el método es desconocido", () => {
    expect(resolvePayment(order({ payment_method: "crypto" })).label).toBe("crypto")
  })
})

describe("buildCustomerTicket", () => {
  it("copia los totales del pedido tal cual, sin sumar de nuevo", () => {
    const doc = buildCustomerTicket(
      order({
        items: [item({ price: 100, qty: 2 })],
        subtotal: 200,
        discount: 20,
        delivery_fee: 35,
        tip: 25,
        total: 240,
      }),
      CTX,
    )
    expect(doc.totals).toEqual({
      subtotal: 200,
      discount: 20,
      deliveryFee: 35,
      tip: 25,
      total: 240,
    })
    expect(doc.lines[0]?.amount).toBe(200)
  })

  it("lleva folio, sucursal, mesa y quién atendió", () => {
    const doc = buildCustomerTicket(
      order({ folio: "260214-0007", table_number: "12" }),
      { ...CTX, branchName: "Sucursal Centro", servedBy: "Ana" },
    )
    expect(doc.kind).toBe("customer")
    expect(doc.folio).toBe("260214-0007")
    expect(doc.branchName).toBe("Sucursal Centro")
    expect(doc.tableNumber).toBe("12")
    expect(doc.servedBy).toBe("Ana")
  })

  it("traduce la entrega a lenguaje de local", () => {
    expect(buildCustomerTicket(order({ fulfillment: "dine_in" }), CTX).fulfillmentLabel).toBe(
      "En mesa",
    )
    expect(buildCustomerTicket(order({ fulfillment: "delivery" }), CTX).fulfillmentLabel).toBe(
      "Domicilio",
    )
  })
})

describe("buildKitchenTicket", () => {
  it("no lleva precios ni datos de cobro", () => {
    const doc = buildKitchenTicket(order(), CTX)
    expect(doc.kind).toBe("kitchen")
    expect(doc.totals).toBeNull()
    expect(doc.payment).toBeNull()
    expect(doc.trackingUrl).toBeNull()
    expect(doc.customerPhone).toBeNull()
  })

  it("consolida líneas idénticas en un solo renglón", () => {
    const doc = buildKitchenTicket(
      order({
        items: [
          item({ qty: 1 }),
          item({ qty: 2 }),
          item({ item_id: "itm_2", name: "Taco de suadero", qty: 1 }),
        ],
      }),
      CTX,
    )
    expect(doc.lines).toHaveLength(2)
    expect(doc.lines[0]).toMatchObject({ name: "Taco al pastor", qty: 3 })
  })

  it("no consolida si cambian los modificadores", () => {
    const doc = buildKitchenTicket(
      order({
        items: [
          item({
            modifiers: [
              {
                group_id: "g1",
                group_name: "Salsa",
                value_id: "v1",
                value_name: "Sin cebolla",
                price_delta: 0,
              },
            ],
          }),
          item(),
        ],
      }),
      CTX,
    )
    expect(doc.lines).toHaveLength(2)
  })

  it("conserva la nota y la mesa para la cocina", () => {
    const doc = buildKitchenTicket(
      order({ note: "Sin picante", table_number: "4" }),
      CTX,
    )
    expect(doc.note).toBe("Sin picante")
    expect(doc.tableNumber).toBe("4")
  })
})

describe("buildTicket", () => {
  it("elige el builder según el tipo", () => {
    expect(buildTicket("kitchen", order(), CTX).totals).toBeNull()
    expect(buildTicket("customer", order(), CTX).totals).not.toBeNull()
  })
})

describe("printPathFor", () => {
  it("incluye el tipo y el auto-print", () => {
    expect(printPathFor("customer", "abc", true)).toBe(
      "/panel/foodos/pedidos/abc/print?kind=customer&auto=1",
    )
  })

  it("omite auto cuando no se pide", () => {
    expect(printPathFor("kitchen", "abc", false)).toBe(
      "/panel/foodos/pedidos/abc/print?kind=kitchen",
    )
  })
})

describe("formatTicketDate", () => {
  it("usa la hora de Ciudad de México, igual que el folio", () => {
    // 05:30 UTC del día 15 es todavía 23:30 del día 14 en CDMX.
    const formatted = formatTicketDate("2026-02-15T05:30:00.000Z")
    expect(formatted).toContain("23:30")
    expect(formatted).toContain("14/02/26")
  })

  it("devuelve cadena vacía con una fecha inválida", () => {
    expect(formatTicketDate("no-es-fecha")).toBe("")
  })
})
