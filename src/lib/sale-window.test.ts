import { describe, it, expect } from "vitest"
import {
  saleState,
  isSaleActive,
  resolveSalePrice,
  resolveEffectivePrice,
  withResolvedSale,
  normalizeSale,
  isMissingColumnError,
  isMissingRelationError,
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

describe("isMissingColumnError", () => {
  it("detecta la columna ausente en lecturas (Postgres 42703)", () => {
    expect(
      isMissingColumnError({
        code: "42703",
        message: 'column products.low_stock_threshold does not exist',
      })
    ).toBe(true)
  })

  it("detecta la columna ausente en escrituras (PostgREST PGRST204)", () => {
    // PostgREST valida el payload de INSERT/UPDATE antes de Postgres, así que
    // el error NO trae "does not exist": sin el código explícito, create y
    // update devolvían 500 mientras las lecturas degradaban.
    const writeError = {
      code: "PGRST204",
      message: "Could not find the 'low_stock_threshold' column of 'products' in the schema cache",
    }
    expect(writeError.message.includes("does not exist")).toBe(false)
    expect(isMissingColumnError(writeError)).toBe(true)
  })

  it("no confunde otros errores", () => {
    expect(isMissingColumnError({ code: "42501", message: "row-level security" })).toBe(false)
    expect(isMissingColumnError({ code: "23505", message: "duplicate key value" })).toBe(false)
    expect(isMissingColumnError(null)).toBe(false)
    expect(isMissingColumnError(undefined)).toBe(false)
  })
})

describe("isMissingRelationError", () => {
  it("detecta una vista pendiente de aplicar (Postgres 42P01)", () => {
    expect(
      isMissingRelationError({
        code: "42P01",
        message: 'relation "public.products_with_sales" does not exist',
      })
    ).toBe(true)
  })

  it("detecta la relación ausente en la caché de PostgREST", () => {
    expect(
      isMissingRelationError({
        code: "PGRST205",
        message: "Could not find the table 'public.products_with_sales' in the schema cache",
      })
    ).toBe(true)
  })

  it("no se confunde con una columna ausente ni con otros errores", () => {
    // `isMissingColumnError` acepta cualquier mensaje con "does not exist",
    // pero una columna no es una relación: ahí la vista existe y el problema
    // es otro, así que el listado no debe degradar por esta rama.
    expect(
      isMissingRelationError({
        code: "42703",
        message: "column products.low_stock_threshold does not exist",
      })
    ).toBe(false)
    expect(isMissingRelationError({ code: "42501", message: "row-level security" })).toBe(false)
    expect(isMissingRelationError(null)).toBe(false)
    expect(isMissingRelationError(undefined)).toBe(false)
  })
})
