import { describe, expect, it } from "vitest"
import { counterSummary, entryTotal, type TotalsEntry } from "./ventas-shared"

const venta = (over: Partial<TotalsEntry> = {}): TotalsEntry => ({
  date: "2026-03-04",
  quantity: 1,
  unitPrice: 100,
  ...over,
})

describe("entryTotal — fuente única del total de una venta de mostrador", () => {
  it("multiplica cantidad por precio unitario cuando no hay descuento", () => {
    expect(entryTotal(venta({ quantity: 3, unitPrice: 45.5 }))).toBe(136.5)
  })

  it("aplica el descuento porcentual sobre el subtotal, no sobre el unitario", () => {
    // 4 × 50 = 200, 15 % → 170
    expect(entryTotal(venta({ quantity: 4, unitPrice: 50, discount: { type: "porcentaje", value: 15 } }))).toBe(170)
  })

  it("resta el descuento de monto fijo una sola vez, no por unidad", () => {
    // 4 × 50 = 200, −30 → 170 (no 4 × (50 − 30) = 80)
    expect(entryTotal(venta({ quantity: 4, unitPrice: 50, discount: { type: "monto", value: 30 } }))).toBe(170)
  })

  it("nunca devuelve un total negativo cuando el descuento fijo supera el subtotal", () => {
    // Este es el caso que el hub calculaba mal antes de delegar aquí.
    expect(entryTotal(venta({ quantity: 1, unitPrice: 50, discount: { type: "monto", value: 80 } }))).toBe(0)
  })

  it("nunca devuelve un total negativo cuando el descuento porcentual supera el 100 %", () => {
    expect(entryTotal(venta({ quantity: 2, unitPrice: 60, discount: { type: "porcentaje", value: 150 } }))).toBe(0)
  })

  it("un descuento porcentual del 100 % deja la venta en cero", () => {
    expect(entryTotal(venta({ quantity: 2, unitPrice: 60, discount: { type: "porcentaje", value: 100 } }))).toBe(0)
  })

  it("un descuento de monto exactamente igual al subtotal deja la venta en cero", () => {
    expect(entryTotal(venta({ quantity: 1, unitPrice: 100, discount: { type: "monto", value: 100 } }))).toBe(0)
  })

  it("una cantidad en cero vale cero aunque haya descuento", () => {
    expect(entryTotal(venta({ quantity: 0, unitPrice: 100, discount: { type: "monto", value: 10 } }))).toBe(0)
  })

  it("ignora el descuento cuando su valor es cero", () => {
    expect(entryTotal(venta({ quantity: 2, unitPrice: 30, discount: { type: "monto", value: 0 } }))).toBe(60)
    expect(entryTotal(venta({ quantity: 2, unitPrice: 30, discount: { type: "porcentaje", value: 0 } }))).toBe(60)
  })

  it("acumula decimales sin acumular error de coma flotante apreciable", () => {
    // 3 × 33.33 = 99.99, 10 % → 89.991
    expect(entryTotal(venta({ quantity: 3, unitPrice: 33.33, discount: { type: "porcentaje", value: 10 } }))).toBeCloseTo(89.991, 6)
  })

  it("es pura: no muta la entrada recibida", () => {
    const e = venta({ quantity: 2, unitPrice: 10, discount: { type: "porcentaje", value: 50 } })
    const copia = structuredClone(e)
    entryTotal(e)
    expect(e).toEqual(copia)
  })
})

describe("counterSummary — fuente única del mostrador de un día", () => {
  it("devuelve ceros para un día vacío sin recorrer las entradas", () => {
    expect(counterSummary([venta({ quantity: 5, unitPrice: 10 })], "")).toEqual({ count: 0, revenue: 0 })
  })

  it("devuelve ceros sin entradas", () => {
    expect(counterSummary([], "2026-03-04")).toEqual({ count: 0, revenue: 0 })
  })

  it("cuenta ventas, no unidades: dos entradas de 3 piezas son count 2", () => {
    const s = counterSummary(
      [venta({ date: "2026-03-04", quantity: 3, unitPrice: 10 }), venta({ date: "2026-03-04", quantity: 3, unitPrice: 10 })],
      "2026-03-04"
    )
    expect(s.count).toBe(2)
    expect(s.revenue).toBe(60)
  })

  it("excluye las ventas de otros días", () => {
    const s = counterSummary(
      [
        venta({ date: "2026-03-03", quantity: 1, unitPrice: 100 }),
        venta({ date: "2026-03-04", quantity: 1, unitPrice: 40 }),
        venta({ date: "2026-03-05", quantity: 1, unitPrice: 100 }),
      ],
      "2026-03-04"
    )
    expect(s).toEqual({ count: 1, revenue: 40 })
  })

  it("suma el total ya descontado de cada venta, no el subtotal", () => {
    const s = counterSummary(
      [venta({ date: "2026-03-04", quantity: 2, unitPrice: 50, discount: { type: "monto", value: 20 } })],
      "2026-03-04"
    )
    expect(s.revenue).toBe(80)
  })

  it("no deja que una venta con descuento excesivo reste del acumulado", () => {
    const s = counterSummary(
      [
        venta({ date: "2026-03-04", quantity: 1, unitPrice: 100 }),
        venta({ date: "2026-03-04", quantity: 1, unitPrice: 100, discount: { type: "monto", value: 500 } }),
      ],
      "2026-03-04"
    )
    expect(s.revenue).toBe(100)
  })

  it("filtra por prefijo: una fecha ISO completa cae en su día", () => {
    const s = counterSummary([venta({ date: "2026-03-04T18:30:00.000Z", quantity: 1, unitPrice: 25 })], "2026-03-04")
    expect(s).toEqual({ count: 1, revenue: 25 })
  })

  it("el filtro es por prefijo, así que un mes cuenta todo el mes (documentado)", () => {
    // Trampa conocida de `startsWith`: los llamadores deben pasar un día, no un
    // mes. El día de mes (`YYYY-MM`) sí es un filtro válido para reportes.
    const s = counterSummary(
      [venta({ date: "2026-03-04", quantity: 1, unitPrice: 10 }), venta({ date: "2026-03-28", quantity: 1, unitPrice: 10 })],
      "2026-03"
    )
    expect(s).toEqual({ count: 2, revenue: 20 })
  })

  it("no confunde días con el mismo prefijo numérico parcial", () => {
    const s = counterSummary([venta({ date: "2026-03-10", quantity: 1, unitPrice: 99 })], "2026-03-1")
    // "2026-03-10".startsWith("2026-03-1") es verdadero: el llamador debe pasar
    // el día completo con ceros a la izquierda.
    expect(s.count).toBe(1)
  })

  it("es pura: no muta el arreglo recibido", () => {
    const entries = [venta({ date: "2026-03-04", quantity: 1, unitPrice: 10 })]
    const copia = structuredClone(entries)
    counterSummary(entries, "2026-03-04")
    expect(entries).toEqual(copia)
  })
})
