import { describe, it, expect } from "vitest"
import {
  saleState,
  isSaleActive,
  resolveSalePrice,
  resolveEffectivePrice,
  withResolvedSale,
  normalizeSale,
} from "./sale-window"

const NOW = new Date("2026-03-10T12:00:00.000Z")

describe("saleState", () => {
  it("sin sale_price no hay oferta", () => {
    expect(saleState({ sale_price: null }, NOW)).toBe("none")
    expect(saleState({}, NOW)).toBe("none")
  })

  it("sin ventana la oferta está activa", () => {
    expect(saleState({ sale_price: 20 }, NOW)).toBe("active")
  })

  it("detecta programada, activa y vencida", () => {
    expect(
      saleState({ sale_price: 20, sale_starts_at: "2026-03-11T00:00:00Z" }, NOW)
    ).toBe("scheduled")
    expect(
      saleState({ sale_price: 20, sale_ends_at: "2026-03-09T00:00:00Z" }, NOW)
    ).toBe("expired")
    expect(
      saleState(
        {
          sale_price: 20,
          sale_starts_at: "2026-03-01T00:00:00Z",
          sale_ends_at: "2026-03-20T00:00:00Z",
        },
        NOW
      )
    ).toBe("active")
  })

  it("trata fechas inválidas como sin límite", () => {
    expect(saleState({ sale_price: 20, sale_starts_at: "no-es-fecha" }, NOW)).toBe(
      "active"
    )
    expect(saleState({ sale_price: 20, sale_ends_at: "no-es-fecha" }, NOW)).toBe(
      "active"
    )
  })

  it("los extremos son inclusivos", () => {
    expect(
      saleState({ sale_price: 20, sale_ends_at: NOW.toISOString() }, NOW)
    ).toBe("active")
  })
})

describe("resolveSalePrice / resolveEffectivePrice", () => {
  it("devuelve la oferta solo si está vigente", () => {
    expect(resolveSalePrice({ sale_price: 20 }, NOW)).toBe(20)
    expect(
      resolveSalePrice({ sale_price: 20, sale_ends_at: "2026-01-01T00:00:00Z" }, NOW)
    ).toBeNull()
  })

  it("cae al precio de lista cuando la oferta no aplica", () => {
    expect(resolveEffectivePrice({ price: 30, sale_price: 20 }, NOW)).toBe(20)
    expect(
      resolveEffectivePrice(
        { price: 30, sale_price: 20, sale_starts_at: "2026-04-01T00:00:00Z" },
        NOW
      )
    ).toBe(30)
    expect(resolveEffectivePrice({ price: 30, sale_price: null }, NOW)).toBe(30)
  })

  it("tolera productos sin precio", () => {
    expect(resolveEffectivePrice({ price: null, sale_price: null }, NOW)).toBeNull()
  })
})

describe("withResolvedSale / normalizeSale", () => {
  it("anula el sale_price cuando la oferta no está vigente", () => {
    const expired = withResolvedSale(
      { id: 1, sale_price: 20, sale_ends_at: "2026-01-01T00:00:00Z" },
      NOW
    )
    expect(expired.sale_price).toBeNull()
    // No muta el original.
    expect(
      withResolvedSale({ id: 2, sale_price: 20 }, NOW).sale_price
    ).toBe(20)
  })

  it("normaliza listas y tolera null", () => {
    const rows = normalizeSale(
      [
        { sale_price: 20, sale_starts_at: "2026-04-01T00:00:00Z" },
        { sale_price: 15 },
      ],
      NOW
    )
    expect(rows[0]!.sale_price).toBeNull()
    expect(rows[1]!.sale_price).toBe(15)
    expect(normalizeSale(null)).toEqual([])
  })

  it("isSaleActive es coherente con saleState", () => {
    expect(isSaleActive({ sale_price: 5 }, NOW)).toBe(true)
    expect(isSaleActive({ sale_price: null }, NOW)).toBe(false)
  })
})
