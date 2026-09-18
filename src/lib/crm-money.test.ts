import { describe, expect, test } from "vitest"
import {
  asMoneyOrNull,
  estimatedCoverageLabel,
  formatEstimatedTotal,
  MONEY_GAP_LABEL,
  NO_ESTIMATE_LABEL,
  prospectMoneyView,
  type ProspectMoneyInput,
} from "./crm-money"

/**
 * Pruebas de la aritmética del dinero del CRM.
 *
 * Toda la fase F2 depende de una sola distinción: **`null` no es `0`**. Un
 * pipeline sin valorar no vale `$0`, un cliente sin cuenta vinculada no tiene
 * «cero ventas», y un prospecto sin comparación no «cumplió lo previsto». Cada
 * prueba de abajo existe para que esa distinción no se pueda perder sin que algo
 * se ponga rojo.
 */

function input(overrides: Partial<ProspectMoneyInput> = {}): ProspectMoneyInput {
  return {
    estimatedValue: null,
    actualRevenue: null,
    actualCommission: null,
    paidOrders: 0,
    ...overrides,
  }
}

describe("asMoneyOrNull", () => {
  test("la ausencia es ausencia", () => {
    expect(asMoneyOrNull(null)).toBeNull()
    expect(asMoneyOrNull(undefined)).toBeNull()
  })

  test("lo ilegible no es un número", () => {
    expect(asMoneyOrNull(Number.NaN)).toBeNull()
    expect(asMoneyOrNull(Number.POSITIVE_INFINITY)).toBeNull()
    expect(asMoneyOrNull("no es un número")).toBeNull()
    expect(asMoneyOrNull({})).toBeNull()
  })

  test("acepta el texto numérico que PostgREST devuelve para NUMERIC", () => {
    expect(asMoneyOrNull("1500.50")).toBe(1500.5)
  })

  test("un cero medido es un cero, no una ausencia", () => {
    expect(asMoneyOrNull(0)).toBe(0)
    expect(asMoneyOrNull("0")).toBe(0)
  })
})

describe("prospectMoneyView", () => {
  test("sin previsto no hay comparación, aunque haya ventas", () => {
    const view = prospectMoneyView(input({ actualRevenue: 5000, actualCommission: 500 }))

    expect(view.gap).toBeNull()
    expect(view.gapTone).toBe("unknown")
    expect(view.comparable).toBe(false)
    // Las cifras reales sí se conservan: se pueden mostrar sin comparar.
    expect(view.actual).toBe(5000)
    expect(view.commission).toBe(500)
  })

  test("sin cuenta vinculada no hay comparación, aunque haya previsto", () => {
    const view = prospectMoneyView(input({ estimatedValue: 5000 }))

    expect(view.estimated).toBe(5000)
    expect(view.actual).toBeNull()
    expect(view.gap).toBeNull()
    expect(view.gapTone).toBe("unknown")
  })

  test("con las dos cifras, la diferencia es actual menos previsto", () => {
    const view = prospectMoneyView(
      input({ estimatedValue: 4000, actualRevenue: 5000, actualCommission: 500, paidOrders: 7 }),
    )

    expect(view.gap).toBe(1000)
    expect(view.gapTone).toBe("gain")
    expect(view.comparable).toBe(true)
    expect(view.paidOrders).toBe(7)
  })

  test("vender por debajo de lo previsto es pérdida, y el signo es negativo", () => {
    const view = prospectMoneyView(input({ estimatedValue: 5000, actualRevenue: 3000 }))

    expect(view.gap).toBe(-2000)
    expect(view.gapTone).toBe("loss")
  })

  test("clavar el previsto es empate, no ganancia de cero", () => {
    const view = prospectMoneyView(input({ estimatedValue: 5000, actualRevenue: 5000 }))

    expect(view.gap).toBe(0)
    expect(view.gapTone).toBe("even")
    expect(view.comparable).toBe(true)
  })

  test("la diferencia se redondea a dos decimales", () => {
    const view = prospectMoneyView(input({ estimatedValue: 0.1, actualRevenue: 0.3 }))

    expect(view.gap).toBe(0.2)
  })

  test("un NaN en cualquiera de los dos lados se comporta como ausente", () => {
    expect(prospectMoneyView(input({ estimatedValue: Number.NaN, actualRevenue: 10 })).gap).toBeNull()
    expect(prospectMoneyView(input({ estimatedValue: 10, actualRevenue: Number.NaN })).gap).toBeNull()
    // Un texto donde se espera dinero solo puede llegar desde la base (PostgREST
    // no siempre tipa `NUMERIC`), así que la prueba lo fuerza.
    expect(
      prospectMoneyView(input({ actualRevenue: "abc" as unknown as number })).actual,
    ).toBeNull()
  })

  test("un previsto de cero con ventas reales sí es comparable", () => {
    const view = prospectMoneyView(input({ estimatedValue: 0, actualRevenue: 100 }))

    expect(view.comparable).toBe(true)
    expect(view.gap).toBe(100)
  })

  test("un conteo de pedidos no finito cae a cero en vez de propagarse", () => {
    expect(prospectMoneyView(input({ paidOrders: Number.NaN })).paidOrders).toBe(0)
    expect(prospectMoneyView(input({ paidOrders: Number.POSITIVE_INFINITY })).paidOrders).toBe(0)
  })

  test("cada tono tiene etiqueta, y el de la duda dice que es duda", () => {
    expect(MONEY_GAP_LABEL.gain).toContain("encima")
    expect(MONEY_GAP_LABEL.loss).toContain("debajo")
    expect(MONEY_GAP_LABEL.even).toContain("Justo")
    expect(MONEY_GAP_LABEL.unknown).toBe("Sin comparación")
  })
})

describe("formatEstimatedTotal", () => {
  test("sin valor declarado no se pinta $0, se pinta que no se declaró", () => {
    expect(formatEstimatedTotal({ total: null })).toBe(NO_ESTIMATE_LABEL)
    expect(NO_ESTIMATE_LABEL).not.toContain("$")
  })

  test("un total medido se pinta como dinero", () => {
    expect(formatEstimatedTotal({ total: 1250 })).toBe("$1,250")
  })

  test("una ventana corta se pinta como mínimo, no como total", () => {
    expect(formatEstimatedTotal({ total: 1250 }, true)).toBe("≥ $1,250")
  })

  test("un cero declarado sí se pinta como cero", () => {
    // El único caso en el que `$0` es una afirmación legítima: alguien valoró.
    expect(formatEstimatedTotal({ total: 0 })).toBe("$0")
  })
})

describe("estimatedCoverageLabel", () => {
  test("un grupo vacío no es un grupo mal valorado", () => {
    expect(estimatedCoverageLabel(0, 0)).toBe("Sin prospectos")
  })

  test("ninguno valorado lo dice con el tamaño del grupo", () => {
    expect(estimatedCoverageLabel(0, 12)).toBe("Ninguno de los 12 prospectos tiene valor declarado")
  })

  test("todos valorados lo dice sin cifras de cobertura", () => {
    expect(estimatedCoverageLabel(12, 12)).toBe("Suma de los 12 prospectos")
  })

  test("cobertura parcial dice sobre cuántos se midió", () => {
    expect(estimatedCoverageLabel(3, 12)).toBe("Suma de 3 de 12 prospectos valorados")
  })
})
