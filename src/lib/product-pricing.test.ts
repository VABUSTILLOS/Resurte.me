import { describe, expect, it } from "vitest"
import {
  MARGIN_GOOD_PCT,
  MARGIN_WARN_PCT,
  analyzePricing,
  marginBand,
  marginPct,
  markupPct,
} from "./product-pricing"

/** Fechas fijas y lejanas: la vigencia de la oferta se prueba sin depender de `now`. */
const PAST = "2000-01-01T00:00"
const FUTURE = "2999-01-01T00:00"

describe("marginPct", () => {
  it("calcula el margen bruto sobre el precio de venta", () => {
    expect(marginPct(100, 60)).toBe(40)
  })

  it("redondea a dos decimales", () => {
    expect(marginPct(90, 60)).toBe(33.33)
  })

  it("es 100% cuando no hay costo capturado en cero", () => {
    expect(marginPct(100, 0)).toBe(100)
  })

  it("es negativo cuando se vende por debajo del costo", () => {
    expect(marginPct(50, 60)).toBe(-20)
  })

  it("devuelve null sin costo o sin precio, en vez de inventar un porcentaje", () => {
    expect(marginPct(100, null)).toBeNull()
    expect(marginPct(100, undefined)).toBeNull()
    expect(marginPct(null, 60)).toBeNull()
    expect(marginPct(0, 60)).toBeNull()
  })

  it("ignora valores no finitos o negativos (los campos llegan como texto libre)", () => {
    expect(marginPct(Number.NaN, 60)).toBeNull()
    expect(marginPct(Number.POSITIVE_INFINITY, 60)).toBeNull()
    expect(marginPct(100, Number.NaN)).toBeNull()
    expect(marginPct(100, -5)).toBeNull()
    expect(marginPct(-100, 60)).toBeNull()
  })
})

describe("markupPct", () => {
  it("calcula cuánto se le suma al costo", () => {
    expect(markupPct(100, 60)).toBe(66.67)
  })

  it("devuelve null sin costo o con costo cero (no hay base de comparación)", () => {
    expect(markupPct(100, 0)).toBeNull()
    expect(markupPct(100, null)).toBeNull()
    expect(markupPct(null, 60)).toBeNull()
  })
})

describe("marginBand", () => {
  it("usa los cortes de la tabla del catálogo", () => {
    expect(marginBand(MARGIN_GOOD_PCT)).toBe("good")
    expect(marginBand(MARGIN_WARN_PCT)).toBe("warn")
    expect(marginBand(MARGIN_WARN_PCT - 0.01)).toBe("bad")
    expect(marginBand(-20)).toBe("bad")
    expect(marginBand(null)).toBeNull()
  })
})

describe("analyzePricing", () => {
  it("sin oferta: el precio efectivo es el de lista y el margen sale de ahí", () => {
    const analysis = analyzePricing({ price: 100, cost: 60 })
    expect(analysis.effectivePrice).toBe(100)
    expect(analysis.saleState).toBe("none")
    expect(analysis.marginPct).toBe(40)
    expect(analysis.markupPct).toBe(66.67)
    expect(analysis.warnings).toEqual([])
  })

  it("con oferta vigente el margen se calcula sobre el precio de oferta", () => {
    const analysis = analyzePricing({ price: 100, salePrice: 80, cost: 60 })
    expect(analysis.saleState).toBe("active")
    expect(analysis.effectivePrice).toBe(80)
    expect(analysis.marginPct).toBe(25)
    expect(analysis.warnings).toEqual([])
  })

  it("una oferta programada todavía no aplica: el margen usa el precio normal", () => {
    const analysis = analyzePricing({
      price: 100,
      salePrice: 80,
      cost: 60,
      saleStartsAt: FUTURE,
    })
    expect(analysis.saleState).toBe("scheduled")
    expect(analysis.effectivePrice).toBe(100)
    expect(analysis.marginPct).toBe(40)
  })

  it("una oferta vencida no aplica: el margen usa el precio normal", () => {
    const analysis = analyzePricing({
      price: 100,
      salePrice: 80,
      cost: 60,
      saleEndsAt: PAST,
    })
    expect(analysis.saleState).toBe("expired")
    expect(analysis.effectivePrice).toBe(100)
    expect(analysis.marginPct).toBe(40)
  })

  it("avisa cuando la oferta no es un descuento", () => {
    const analysis = analyzePricing({ price: 100, salePrice: 120, cost: 60 })
    // La tienda cobra el `sale_price` vigente aunque sea mayor: eso es
    // justamente lo que hay que avisar.
    expect(analysis.effectivePrice).toBe(120)
    expect(analysis.warnings.map((w) => w.key)).toEqual(["sale_not_a_discount"])
    expect(analysis.warnings[0]?.message).toContain("$120")
    expect(analysis.warnings[0]?.message).toContain("$100")
  })

  it("avisa también cuando la oferta iguala el precio (no hay descuento que mostrar)", () => {
    const analysis = analyzePricing({ price: 100, salePrice: 100, cost: 60 })
    expect(analysis.warnings.map((w) => w.key)).toEqual(["sale_not_a_discount"])
    expect(analysis.warnings[0]?.message).toContain("igual al precio normal")
  })

  it("avisa cuando el precio queda por debajo del costo", () => {
    const analysis = analyzePricing({ price: 50, cost: 60 })
    expect(analysis.marginPct).toBe(-20)
    expect(analysis.warnings.map((w) => w.key)).toEqual(["below_cost"])
    expect(analysis.warnings[0]?.message).toContain("$50")
    expect(analysis.warnings[0]?.message).toContain("$60")
  })

  it("avisa cuando es la oferta vigente la que queda por debajo del costo", () => {
    const analysis = analyzePricing({ price: 100, salePrice: 40, cost: 60 })
    expect(analysis.effectivePrice).toBe(40)
    expect(analysis.warnings.map((w) => w.key)).toEqual(["below_cost"])
  })

  it("no avisa de pérdida si la oferta que la provoca ya venció", () => {
    const analysis = analyzePricing({
      price: 100,
      salePrice: 40,
      cost: 60,
      saleEndsAt: PAST,
    })
    expect(analysis.warnings).toEqual([])
  })

  it("acumula ambos avisos, con la pérdida de dinero primero", () => {
    const analysis = analyzePricing({ price: 50, salePrice: 70, cost: 75 })
    expect(analysis.effectivePrice).toBe(70)
    expect(analysis.warnings.map((w) => w.key)).toEqual(["below_cost", "sale_not_a_discount"])
  })

  it("sin costo no hay margen ni aviso de pérdida (no se puede afirmar que pierda)", () => {
    const analysis = analyzePricing({ price: 50, cost: null })
    expect(analysis.marginPct).toBeNull()
    expect(analysis.markupPct).toBeNull()
    expect(analysis.warnings).toEqual([])
  })

  it("sin precio de lista manda la oferta vigente (el precio es obligatorio, es un estado transitorio)", () => {
    const analysis = analyzePricing({ price: null, salePrice: 80, cost: 60 })
    expect(analysis.effectivePrice).toBe(80)
    expect(analysis.marginPct).toBe(25)
    expect(analysis.warnings).toEqual([])
  })

  it("tolera los valores no finitos que produce un campo a medio escribir", () => {
    const analysis = analyzePricing({ price: Number.NaN, salePrice: Number.NaN, cost: Number.NaN })
    expect(analysis.effectivePrice).toBeNull()
    expect(analysis.marginPct).toBeNull()
    expect(analysis.markupPct).toBeNull()
    expect(analysis.warnings).toEqual([])
  })
})
