import { describe, expect, it } from "vitest"
import { cartStorageKey, mapLinesToMenu, type FoodosCartMenu } from "./use-foodos-cart"
import type { FoodosCombo, FoodosMenuItem, FoodosOrderItem } from "@/types/foodos"

function item(over: Partial<FoodosMenuItem> = {}): FoodosMenuItem {
  return {
    id: "i1",
    restaurant_id: "r1",
    category_id: "c1",
    name: "Taco",
    description: null,
    price: 25,
    image_url: null,
    cost: 8,
    is_featured: false,
    is_available: true,
    tags: [],
    sort_order: 0,
    whatsapp_visible: true,
    whatsapp_position: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  }
}

function combo(over: Partial<FoodosCombo> = {}): FoodosCombo {
  return {
    id: "k1",
    restaurant_id: "r1",
    name: "Combo 3",
    price: 99,
    discount_pct: 10,
    item_ids: ["i1"],
    is_active: true,
    highlight: false,
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  }
}

function line(over: Partial<FoodosOrderItem> = {}): FoodosOrderItem {
  return { item_id: "i1", name: "Taco", price: 25, qty: 2, ...over }
}

const menu = (over: Partial<FoodosCartMenu> = {}): FoodosCartMenu => ({
  items: [item()],
  combos: [combo()],
  optionValues: [],
  ...over,
})

const price = (i: FoodosMenuItem) => i.price

describe("cartStorageKey", () => {
  it("aísla el carrito por restaurante", () => {
    expect(cartStorageKey("la-taqueria")).toBe("foodos-cart-la-taqueria")
    expect(cartStorageKey("la-taqueria")).not.toBe(cartStorageKey("otra"))
  })
})

describe("mapLinesToMenu", () => {
  it("conserva la línea cuando el platillo sigue en el menú", () => {
    const out = mapLinesToMenu([line()], menu(), price)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ item_id: "i1", qty: 2, price: 25 })
  })

  it("re-precía con el precio vigente y no con el guardado", () => {
    const out = mapLinesToMenu([line({ price: 25 })], menu({ items: [item({ price: 31 })] }), price)
    expect(out[0]?.price).toBe(31)
  })

  it("aplica el override de sucursal vía priceOf", () => {
    const out = mapLinesToMenu(
      [line()],
      menu({ items: [item({ price: 25 })] }),
      () => 40
    )
    expect(out[0]?.price).toBe(40)
  })

  it("descarta platillos que ya no existen", () => {
    expect(mapLinesToMenu([line({ item_id: "fantasma" })], menu(), price)).toEqual([])
  })

  it("descarta platillos agotados", () => {
    const out = mapLinesToMenu([line()], menu({ items: [item({ is_available: false })] }), price)
    expect(out).toEqual([])
  })

  it("mapea un combo a su precio de combo, no a la suma de sus partes", () => {
    const out = mapLinesToMenu([line({ item_id: "k1", combo_id: "k1", price: 1 })], menu(), price)
    expect(out[0]).toMatchObject({ item_id: "k1", combo_id: "k1", price: 99, qty: 2 })
  })

  it("descarta combos desactivados", () => {
    const out = mapLinesToMenu([line({ combo_id: "k1" })], menu({ combos: [combo({ is_active: false })] }), price)
    expect(out).toEqual([])
  })

  it("suma el precio de los modificadores vigentes al platillo", () => {
    const withValues = menu({
      optionValues: [
        { id: "v1", group_id: "g1", name: "Extra queso", price_delta: 10, is_available: true, sort_order: 0 },
      ] as FoodosCartMenu["optionValues"],
    })
    const out = mapLinesToMenu(
      [line({ modifiers: [{ group_id: "g1", group_name: "Extras", value_id: "v1", value_name: "Extra queso", price_delta: 10 }] })],
      withValues,
      price
    )
    expect(out[0]?.price).toBe(35)
  })

  it("quita modificadores que ya no están disponibles sin perder la línea", () => {
    const withValues = menu({
      optionValues: [
        { id: "v1", group_id: "g1", name: "Extra queso", price_delta: 10, is_available: false, sort_order: 0 },
      ] as FoodosCartMenu["optionValues"],
    })
    const out = mapLinesToMenu(
      [line({ modifiers: [{ group_id: "g1", group_name: "Extras", value_id: "v1", value_name: "Extra queso", price_delta: 10 }] })],
      withValues,
      price
    )
    expect(out[0]?.price).toBe(25)
    expect(out[0]?.modifiers).toBeUndefined()
  })

  it("no muta las líneas de origen", () => {
    const source = [line({ price: 25 })]
    mapLinesToMenu(source, menu({ items: [item({ price: 31 })] }), price)
    expect(source[0]?.price).toBe(25)
  })

  it("devuelve un arreglo vacío sin líneas", () => {
    expect(mapLinesToMenu([], menu(), price)).toEqual([])
  })
})
