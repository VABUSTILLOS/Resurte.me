import { describe, it, expect, beforeEach } from "vitest"
import {
  saveShoppingList,
  getShoppingLists,
  getShoppingList,
  renameShoppingList,
  deleteShoppingList,
  listToCartItems,
} from "./shopping-lists"
import type { CartItem } from "@/types"

// Mock de localStorage para el entorno de test (node).
const store = new Map<string, string>()
const localStorageMock = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
}
Object.defineProperty(globalThis, "window", {
  value: { localStorage: localStorageMock },
  configurable: true,
})

const cartItems: CartItem[] = [
  {
    product_id: 1,
    name: "Aguacate Hass",
    slug: "aguacate-hass",
    image_url: "",
    brand: "Central",
    price: 850,
    sale_price: null,
    quantity: 2,
    stock_status: "in_stock",
  },
  {
    product_id: 2,
    name: "Queso menonita",
    slug: "queso-menonita",
    image_url: "",
    brand: "",
    price: 320,
    sale_price: 280,
    quantity: 1,
    stock_status: "in_stock",
  },
]

describe("shopping-lists", () => {
  beforeEach(() => {
    store.clear()
  })

  it("guarda una lista y la recupera", () => {
    const list = saveShoppingList("Canasta semanal", cartItems)
    expect(list.name).toBe("Canasta semanal")
    expect(list.items).toHaveLength(2)

    const all = getShoppingLists()
    expect(all).toHaveLength(1)
    expect(getShoppingList(list.id)?.name).toBe("Canasta semanal")
  })

  it("usa nombre por defecto si está vacío", () => {
    const list = saveShoppingList("  ", cartItems)
    expect(list.name).toBe("Mi lista")
  })

  it("renombra una lista", () => {
    const list = saveShoppingList("Vieja", cartItems)
    renameShoppingList(list.id, "Nueva")
    expect(getShoppingList(list.id)?.name).toBe("Nueva")
  })

  it("borra una lista", () => {
    const a = saveShoppingList("A", cartItems)
    saveShoppingList("B", cartItems)
    deleteShoppingList(a.id)
    const all = getShoppingLists()
    expect(all).toHaveLength(1)
    expect(all[0]?.name).toBe("B")
  })

  it("listToCartItems devuelve CartItem con stock in_stock", () => {
    const list = saveShoppingList("X", cartItems)
    const items = listToCartItems(list)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ product_id: 1, quantity: 2, stock_status: "in_stock" })
    expect(items[1]).toMatchObject({ product_id: 2, sale_price: 280 })
  })

  it("respeta el tope de listas (MAX_LISTS)", () => {
    for (let i = 0; i < 25; i++) saveShoppingList(`L${i}`, cartItems)
    expect(getShoppingLists().length).toBeLessThanOrEqual(20)
  })
})
