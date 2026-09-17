import { describe, expect, it } from "vitest"
import type { FoodosOrder, FoodosOrderItem } from "@/types/foodos"
import {
  accountLineKey,
  accountTotals,
  activeTablesInZone,
  aggregateAccountItems,
  billableOrders,
  clampPosition,
  elapsedMinutes,
  isOpenComanda,
  isTableShape,
  isTicketOpen,
  maxAccountParts,
  nextTableLabel,
  openTicketByTable,
  ordersByTicket,
  sortZones,
  splitAmount,
  splitCents,
  sumGuests,
  tableStatus,
  tablesInZone,
  type MesasTable,
  type MesasZone,
  type TableTicket,
} from "./foodos-tables"

// ---------- Fixtures ----------

function order(overrides: Partial<FoodosOrder> = {}): FoodosOrder {
  return {
    id: "o1",
    restaurant_id: "r1",
    branch_id: "b1",
    customer_id: null,
    items: [],
    subtotal: 100,
    discount: 0,
    delivery_fee: 0,
    total: 100,
    channel: "mesero",
    fulfillment: "dine_in",
    status: "confirmed",
    payment_method: null,
    payment_status: "pending",
    stripe_payment_intent_id: null,
    slug: null,
    customer_name: null,
    customer_phone: null,
    note: null,
    table_number: "Mesa 1",
    tip: 0,
    coupon_code: null,
    loyalty_points_redeemed: 0,
    loyalty_points_earned: 0,
    scheduled_for: null,
    delivery_address: null,
    delivery_lat: null,
    delivery_lng: null,
    delivery_notes: null,
    created_at: "2026-02-17T18:00:00.000Z",
    ...overrides,
  }
}

function line(overrides: Partial<FoodosOrderItem> = {}): FoodosOrderItem {
  return { item_id: "i1", name: "Taco", price: 25, qty: 1, ...overrides }
}

function ticket(overrides: Partial<TableTicket> = {}): TableTicket {
  return {
    id: "t1",
    restaurant_id: "r1",
    branch_id: "b1",
    table_id: "tb1",
    status: "open",
    guests: 2,
    opened_by: "u1",
    opened_at: "2026-02-17T18:00:00.000Z",
    closed_by: null,
    closed_at: null,
    closed_order_id: null,
    billing_requested_at: null,
    note: null,
    ...overrides,
  }
}

function table(overrides: Partial<MesasTable> = {}): MesasTable {
  return {
    id: "tb1",
    restaurant_id: "r1",
    branch_id: "b1",
    zone_id: "z1",
    label: "Mesa 1",
    seats: 4,
    shape: "square",
    pos_x: 0,
    pos_y: 0,
    is_active: true,
    created_at: "2026-02-17T00:00:00.000Z",
    ...overrides,
  }
}

function zone(overrides: Partial<MesasZone> = {}): MesasZone {
  return {
    id: "z1",
    restaurant_id: "r1",
    branch_id: "b1",
    name: "Salón",
    sort_order: 0,
    width: 1000,
    height: 700,
    created_at: "2026-02-17T00:00:00.000Z",
    ...overrides,
  }
}

// ---------- Estado del mapa ----------

describe("tableStatus", () => {
  it("una mesa sin cuenta abierta está libre", () => {
    expect(tableStatus(null)).toBe("free")
    expect(tableStatus(ticket({ status: "closed" }))).toBe("free")
    expect(tableStatus(ticket({ status: "void" }))).toBe("free")
  })

  it("una cuenta abierta ocupa la mesa", () => {
    expect(tableStatus(ticket())).toBe("occupied")
  })

  it("el aviso de cuenta gana sobre ocupada", () => {
    expect(tableStatus(ticket({ billing_requested_at: "2026-02-17T19:00:00.000Z" }))).toBe(
      "billing",
    )
  })

  it("una cuenta cerrada con aviso de cuenta sigue libre", () => {
    expect(
      tableStatus(ticket({ status: "closed", billing_requested_at: "2026-02-17T19:00:00.000Z" })),
    ).toBe("free")
  })
})

describe("isTicketOpen", () => {
  it("tolera null y sólo acepta status open", () => {
    expect(isTicketOpen(null)).toBe(false)
    expect(isTicketOpen(undefined)).toBe(false)
    expect(isTicketOpen({ status: "open" })).toBe(true)
    expect(isTicketOpen({ status: "closed" })).toBe(false)
  })
})

describe("openTicketByTable", () => {
  it("indexa sólo las cuentas abiertas y deja la última si hubiera dos", () => {
    const map = openTicketByTable([
      ticket({ id: "t1", table_id: "tb1" }),
      ticket({ id: "t2", table_id: "tb2", status: "closed" }),
      ticket({ id: "t3", table_id: "tb1", billing_requested_at: "2026-02-17T19:00:00.000Z" }),
    ])
    expect([...map.keys()]).toEqual(["tb1"])
    expect(map.get("tb1")?.id).toBe("t3")
  })
})

// ---------- Cuentas ----------

describe("ordersByTicket", () => {
  it("agrupa por cuenta e ignora los pedidos sin mesa", () => {
    const map = ordersByTicket([
      order({ id: "o1", table_ticket_id: "t1" }),
      order({ id: "o2", table_ticket_id: "t1" }),
      order({ id: "o3", table_ticket_id: null }),
      order({ id: "o4" }),
    ])
    expect(map.get("t1")?.map((o) => o.id)).toEqual(["o1", "o2"])
    expect(map.size).toBe(1)
  })
})

describe("isOpenComanda / billableOrders", () => {
  it("una comanda pendiente de mesa no es ingreso", () => {
    expect(isOpenComanda({ channel: "mesero", payment_status: "pending" })).toBe(true)
    expect(isOpenComanda({ channel: "mesero", payment_status: "paid" })).toBe(false)
    expect(isOpenComanda({ channel: "web", payment_status: "pending" })).toBe(false)
  })

  it("sólo los pedidos pagados son cobrados", () => {
    const orders = [
      order({ id: "o1", payment_status: "pending" }),
      order({ id: "o2", payment_status: "paid" }),
      order({ id: "o3", payment_status: "failed" }),
    ]
    expect(billableOrders(orders).map((o) => o.id)).toEqual(["o2"])
  })
})

describe("accountTotals", () => {
  it("suma comandas y cuenta en centavos enteros", () => {
    const totals = accountTotals([
      order({ subtotal: 33.33, total: 33.33, items: [line({ qty: 1 })] }),
      order({ subtotal: 33.33, total: 33.33, items: [line({ qty: 2 })] }),
      order({ subtotal: 33.34, total: 36.34, tip: 3, items: [line({ qty: 1 })] }),
    ])
    expect(totals.subtotal).toBe(100)
    expect(totals.tip).toBe(3)
    expect(totals.total).toBe(103)
    expect(totals.items).toBe(4)
    expect(totals.orders).toBe(3)
  })

  it("con paidOnly sólo cuenta lo cobrado, para no contar dos veces la mesa", () => {
    const orders = [
      order({ id: "c1", total: 200, payment_status: "pending" }),
      order({ id: "c2", total: 100, payment_status: "pending" }),
      order({ id: "cuenta", total: 303, tip: 3, payment_status: "paid" }),
    ]
    expect(accountTotals(orders).total).toBe(603)
    expect(accountTotals(orders, { paidOnly: true }).total).toBe(303)
  })

  it("una cuenta sin pedidos suma cero", () => {
    expect(accountTotals([])).toEqual({
      orders: 0,
      items: 0,
      subtotal: 0,
      discount: 0,
      tip: 0,
      total: 0,
    })
  })

  it("tolera pedidos sin arreglo de items", () => {
    const totals = accountTotals([order({ items: undefined as unknown as FoodosOrderItem[] })])
    expect(totals.items).toBe(0)
    expect(totals.total).toBe(100)
  })
})

// ---------- Consolidación de líneas ----------

describe("accountLineKey", () => {
  it("el mismo platillo con los mismos modificadores comparte clave", () => {
    const a = line({ modifiers: [{ group_id: "g", group_name: "Salsa", value_id: "v1", value_name: "Roja", price_delta: 0 }] })
    const b = line({ modifiers: [{ group_id: "g", group_name: "Salsa", value_id: "v1", value_name: "Roja", price_delta: 0 }] })
    expect(accountLineKey(a)).toBe(accountLineKey(b))
  })

  it("el orden de captura de los modificadores no cambia la clave", () => {
    const mod = (value_id: string) => ({ group_id: value_id, group_name: "G", value_id, value_name: value_id, price_delta: 0 })
    expect(accountLineKey(line({ modifiers: [mod("v1"), mod("v2")] }))).toBe(
      accountLineKey(line({ modifiers: [mod("v2"), mod("v1")] })),
    )
  })

  it("un modificador distinto es otra línea", () => {
    const mod = (value_id: string) => ({ group_id: "g", group_name: "Salsa", value_id, value_name: value_id, price_delta: 0 })
    expect(accountLineKey(line({ modifiers: [mod("v1")] }))).not.toBe(
      accountLineKey(line({ modifiers: [mod("v2")] })),
    )
  })

  it("sin modificadores la clave es el platillo a ese precio", () => {
    expect(accountLineKey(line())).toBe("i1|@25")
  })

  it("el mismo platillo a otro precio es otra línea, para que la cuenta cuadre", () => {
    expect(accountLineKey(line({ price: 25 }))).not.toBe(accountLineKey(line({ price: 30 })))
  })

  it("un combo se identifica por combo_id, no por sus componentes", () => {
    expect(accountLineKey(line({ combo_id: "c1" }))).toBe("combo:c1@25")
    expect(accountLineKey(line({ combo_id: "c1" }))).not.toBe(accountLineKey(line({ combo_id: "c2" })))
  })
})

describe("aggregateAccountItems", () => {
  it("funde la misma línea mandada en dos comandas", () => {
    const items = aggregateAccountItems([
      order({ items: [line({ qty: 2 }), line({ item_id: "i2", name: "Agua", price: 20, qty: 1 })] }),
      order({ items: [line({ qty: 1 })] }),
    ])
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ item_id: "i1", qty: 3 })
    expect(items[1]).toMatchObject({ item_id: "i2", qty: 1 })
  })

  it("conserva el precio con el que se pidió, no el del menú de hoy", () => {
    const items = aggregateAccountItems([
      order({ items: [line({ price: 25, qty: 1 })] }),
      order({ items: [line({ price: 30, qty: 1 })] }),
    ])
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.price)).toEqual([25, 30])
  })

  it("la cuenta consolidada suma exactamente lo que suman los pedidos", () => {
    const orders = [
      order({ items: [line({ price: 25, qty: 2 }), line({ item_id: "i2", price: 20, qty: 1 })] }),
      order({ items: [line({ price: 30, qty: 1 }), line({ item_id: "i2", price: 20, qty: 3 })] }),
    ]
    const fromOrders = orders.reduce(
      (sum, o) => sum + (o.items ?? []).reduce((s, i) => s + i.price * i.qty, 0),
      0,
    )
    const fromLines = aggregateAccountItems(orders).reduce((s, i) => s + i.price * i.qty, 0)
    expect(fromLines).toBe(fromOrders)
  })

  it("no muta los pedidos originales", () => {
    const original = order({ items: [line({ qty: 1 })] })
    aggregateAccountItems([original, order({ items: [line({ qty: 1 })] })])
    expect(original.items[0]?.qty).toBe(1)
  })

  it("copia los modificadores para que nadie edite el pedido por accidente", () => {
    const original = order({
      items: [line({ modifiers: [{ group_id: "g", group_name: "Salsa", value_id: "v1", value_name: "Roja", price_delta: 0 }] })],
    })
    const [first] = aggregateAccountItems([original])
    expect(first?.modifiers?.[0]).not.toBe(original.items[0]?.modifiers?.[0])
    expect(first?.modifiers?.[0]).toEqual(original.items[0]?.modifiers?.[0])
  })
})

// ---------- División de la cuenta ----------

describe("splitCents", () => {
  it("reparte sin perder ni inventar centavos", () => {
    const parts = splitCents(1000, 3)
    expect(parts).toEqual([334, 333, 333])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000)
  })

  it("reparte exacto cuando el total es múltiplo", () => {
    expect(splitCents(900, 3)).toEqual([300, 300, 300])
  })

  it("un centavo entre tres deja un centavo en una parte", () => {
    const parts = splitCents(1, 3)
    expect(parts).toEqual([1, 0, 0])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1)
  })

  it("una sola persona se lleva todo", () => {
    expect(splitCents(1234, 1)).toEqual([1234])
  })

  it("rechaza totales negativos o no enteros", () => {
    expect(() => splitCents(-1, 2)).toThrow(/entero de centavos/)
    expect(() => splitCents(10.5, 2)).toThrow(/entero de centavos/)
  })

  it("rechaza dividir entre menos de una persona", () => {
    expect(() => splitCents(100, 0)).toThrow(/al menos una persona/)
    expect(() => splitCents(100, 2.5)).toThrow(/al menos una persona/)
  })

  it("reparte un total de 303.03 en 4 partes que cuadran", () => {
    const parts = splitCents(30303, 4)
    expect(parts).toEqual([7576, 7576, 7576, 7575])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(30303)
  })
})

describe("splitAmount", () => {
  it("devuelve pesos y sigue cuadrando con el total", () => {
    const parts = splitAmount(100, 3)
    expect(parts).toEqual([33.34, 33.33, 33.33])
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10)
  })
})

describe("maxAccountParts", () => {
  it("el tope son los comensales registrados", () => {
    expect(maxAccountParts({ guests: 4 })).toBe(4)
  })

  it("nunca baja de uno aunque la cuenta diga cero", () => {
    expect(maxAccountParts({ guests: 0 })).toBe(1)
  })

  it("acota a cincuenta partes para no partir una cuenta en cien", () => {
    expect(maxAccountParts({ guests: 120 })).toBe(50)
  })
})

// ---------- Salón ----------

describe("sumGuests", () => {
  it("sólo suma cuentas abiertas", () => {
    expect(
      sumGuests([
        ticket({ id: "t1", guests: 2 }),
        ticket({ id: "t2", guests: 4, status: "closed" }),
        ticket({ id: "t3", guests: 3 }),
      ]),
    ).toBe(5)
  })

  it("una lista vacía son cero personas", () => {
    expect(sumGuests([])).toBe(0)
  })
})

describe("sortZones", () => {
  it("ordena por sort_order y desempata por nombre", () => {
    const sorted = sortZones([
      zone({ id: "z3", name: "Terraza", sort_order: 2 }),
      zone({ id: "z2", name: "Barra", sort_order: 1 }),
      zone({ id: "z1", name: "Salón", sort_order: 1 }),
    ])
    expect(sorted.map((z) => z.name)).toEqual(["Barra", "Salón", "Terraza"])
  })
})

describe("tablesInZone", () => {
  it("filtra por zona y ordena naturalmente", () => {
    const tables = [
      table({ id: "a", label: "Mesa 10" }),
      table({ id: "b", label: "Mesa 2" }),
      table({ id: "c", label: "Barra 1", zone_id: "z2" }),
    ]
    expect(tablesInZone(tables, "z1").map((t) => t.label)).toEqual(["Mesa 2", "Mesa 10"])
    expect(tablesInZone(tables, "z2").map((t) => t.label)).toEqual(["Barra 1"])
  })

  it("las mesas sin zona viven en el grupo null", () => {
    expect(tablesInZone([table({ id: "a", zone_id: null })], null)).toHaveLength(1)
  })
})

describe("nextTableLabel", () => {
  it("empieza en Mesa 1 cuando no hay nada", () => {
    expect(nextTableLabel([])).toBe("Mesa 1")
  })

  it("salta las etiquetas ya usadas sin repetir número", () => {
    expect(nextTableLabel(["Mesa 1", "Mesa 2"])).toBe("Mesa 3")
  })

  it("ignora mayúsculas y espacios sobrantes", () => {
    expect(nextTableLabel(["  mesa 1  "])).toBe("Mesa 2")
  })

  it("rellena el hueco que dejó una mesa borrada", () => {
    expect(nextTableLabel(["Mesa 1", "Mesa 3"])).toBe("Mesa 2")
  })
})

describe("clampPosition", () => {
  it("deja intacta una posición que ya está dentro", () => {
    expect(clampPosition(100, 200, { width: 1000, height: 700 }, 100)).toEqual({ x: 100, y: 200 })
  })

  it("pega al borde izquierdo y superior una mesa fuera del lienzo", () => {
    expect(clampPosition(-50, -80, { width: 1000, height: 700 }, 100)).toEqual({ x: 50, y: 50 })
  })

  it("pega al borde derecho e inferior una mesa fuera del lienzo", () => {
    expect(clampPosition(5000, 5000, { width: 1000, height: 700 }, 100)).toEqual({
      x: 950,
      y: 650,
    })
  })

  it("una mesa más grande que la zona se queda centrada en el borde", () => {
    expect(clampPosition(10, 10, { width: 40, height: 40 }, 100)).toEqual({ x: 50, y: 50 })
  })

  it("una coordenada no numérica cae al centro del borde", () => {
    expect(clampPosition(Number.NaN, Number.POSITIVE_INFINITY, { width: 1000, height: 700 }, 100)).toEqual({
      x: 50,
      y: 650,
    })
  })

  it("un arrastre muy por debajo del lienzo pega al borde superior", () => {
    expect(clampPosition(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, { width: 1000, height: 700 }, 100)).toEqual({
      x: 50,
      y: 50,
    })
  })
})

describe("activeTablesInZone", () => {
  it("cuenta sólo las mesas activas de la zona", () => {
    const tables = [
      table({ id: "a", zone_id: "z1" }),
      table({ id: "b", zone_id: "z1", is_active: false }),
      table({ id: "c", zone_id: "z2" }),
    ]
    expect(activeTablesInZone(tables, "z1")).toBe(1)
    expect(activeTablesInZone(tables, "z2")).toBe(1)
  })
})

describe("elapsedMinutes", () => {
  it("mide los minutos desde la apertura", () => {
    const now = new Date("2026-02-17T18:45:00.000Z").getTime()
    expect(elapsedMinutes("2026-02-17T18:00:00.000Z", now)).toBe(45)
  })

  it("nunca devuelve negativos aunque el reloj vaya atrás", () => {
    const now = new Date("2026-02-17T17:00:00.000Z").getTime()
    expect(elapsedMinutes("2026-02-17T18:00:00.000Z", now)).toBe(0)
  })

  it("una fecha inválida cuenta como cero", () => {
    expect(elapsedMinutes("no-es-fecha")).toBe(0)
  })
})

describe("isTableShape", () => {
  it("acepta las tres formas soportadas", () => {
    expect(isTableShape("square")).toBe(true)
    expect(isTableShape("round")).toBe(true)
    expect(isTableShape("rect")).toBe(true)
  })

  it("rechaza cualquier otra cosa", () => {
    expect(isTableShape("triangle")).toBe(false)
    expect(isTableShape(null)).toBe(false)
    expect(isTableShape(3)).toBe(false)
  })
})
