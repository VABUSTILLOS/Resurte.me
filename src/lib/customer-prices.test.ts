import { describe, expect, it } from "vitest"
import { fetchCustomerPrices, validateCustomerPriceInput } from "./customer-prices"

describe("validateCustomerPriceInput (Ola 5)", () => {
  it("acepta un precio positivo sin costo conocido", () => {
    expect(validateCustomerPriceInput({ price: 85.5, cost: null })).toEqual({ ok: true, price: 85.5 })
    expect(validateCustomerPriceInput({ price: "90", cost: undefined })).toEqual({ ok: true, price: 90 })
  })

  it("redondea a centavos", () => {
    expect(validateCustomerPriceInput({ price: 10.006, cost: null })).toEqual({ ok: true, price: 10.01 })
  })

  it("rechaza cero, negativos y no numéricos", () => {
    expect(validateCustomerPriceInput({ price: 0, cost: null }).ok).toBe(false)
    expect(validateCustomerPriceInput({ price: -5, cost: null }).ok).toBe(false)
    expect(validateCustomerPriceInput({ price: "abc", cost: null }).ok).toBe(false)
  })

  it("rechaza el especial por debajo del costo conocido", () => {
    const r = validateCustomerPriceInput({ price: 79.99, cost: 80 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("por debajo del costo")
  })

  it("acepta el especial igual o arriba del costo", () => {
    expect(validateCustomerPriceInput({ price: 80, cost: 80 }).ok).toBe(true)
    expect(validateCustomerPriceInput({ price: 120, cost: 80 }).ok).toBe(true)
  })
})

/** Cadena mínima de Supabase que resuelve el resultado dado. */
function fakeSupabase(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const passthrough = () => chain
  for (const m of ["select", "eq", "in", "order"]) chain[m] = passthrough
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return { from: () => chain }
}

describe("fetchCustomerPrices (Ola 5)", () => {
  it("sin usuario no lee nada y devuelve vacío", async () => {
    const supabase = fakeSupabase({ data: [{ product_id: 1, price: 10 }], error: null })
    const map = await fetchCustomerPrices(supabase as never, null)
    expect(map.size).toBe(0)
  })

  it("mapea product_id → precio y descarta filas inválidas", async () => {
    const supabase = fakeSupabase({
      data: [
        { product_id: 7, price: "88.50" },
        { product_id: 9, price: -1 },
        { product_id: 11, price: 0 },
      ],
      error: null,
    })
    const map = await fetchCustomerPrices(supabase as never, "user-1")
    expect(map.get(7)).toBe(88.5)
    expect(map.size).toBe(1)
  })

  it("sin la tabla (42P01) degrada a vacío sin lanzar", async () => {
    const supabase = fakeSupabase({
      data: null,
      error: { code: "42P01", message: "relation customer_product_prices does not exist" },
    })
    const map = await fetchCustomerPrices(supabase as never, "user-1")
    expect(map.size).toBe(0)
  })
})
