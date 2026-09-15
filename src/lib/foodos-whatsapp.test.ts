import { describe, expect, it } from "vitest"

// La clave se lee en tiempo de llamada; con stub alcanza para las pruebas.
process.env.FOODOS_WA_ENCRYPTION_KEY = "test-encryption-key"

import {
  buildCatalogProducts,
  buildProductListSections,
  decryptToken,
  encryptToken,
  orderedWhatsAppItems,
} from "./foodos-whatsapp"
import type { FoodosMenuCategory, FoodosMenuItem } from "@/types/foodos"

const item = (partial: Partial<FoodosMenuItem> = {}): FoodosMenuItem => ({
  id: "i1",
  restaurant_id: "r1",
  category_id: null,
  name: "Taco",
  description: null,
  price: 45,
  cost: 0,
  image_url: null,
  is_featured: false,
  is_available: true,
  tags: [],
  sort_order: 0,
  whatsapp_visible: false,
  whatsapp_position: null,
  created_at: "",
  ...partial,
})

const cat = (id: string, name: string): FoodosMenuCategory => ({
  id,
  restaurant_id: "r1",
  name,
  sort_order: 0,
  created_at: "",
})

describe("orderedWhatsAppItems", () => {
  it("solo visibles y disponibles, en el orden exacto de la curaduría", () => {
    const items = [
      item({ id: "a", whatsapp_visible: true, whatsapp_position: 3 }),
      item({ id: "b", whatsapp_visible: false }),
      item({ id: "c", whatsapp_visible: true, whatsapp_position: 1 }),
      item({ id: "d", whatsapp_visible: true, whatsapp_position: 2, is_available: false }),
      item({ id: "e", whatsapp_visible: true, whatsapp_position: 2 }),
    ]
    const ordered = orderedWhatsAppItems(items)
    expect(ordered.map((i) => i.id)).toEqual(["c", "e", "a"])
  })

  it("los visibles sin posición van al final por sort_order", () => {
    const items = [
      item({ id: "a", whatsapp_visible: true, whatsapp_position: null, sort_order: 2 }),
      item({ id: "b", whatsapp_visible: true, whatsapp_position: 1, sort_order: 5 }),
      item({ id: "c", whatsapp_visible: true, whatsapp_position: null, sort_order: 1 }),
    ]
    expect(orderedWhatsAppItems(items).map((i) => i.id)).toEqual(["b", "c", "a"])
  })
})

describe("buildCatalogProducts", () => {
  it("mapea a productos de WhatsApp Commerce", () => {
    const products = buildCatalogProducts([
      item({ id: "x", name: "Burrito", price: 90, whatsapp_visible: true, whatsapp_position: 1, description: "Con todo", image_url: "https://img" }),
    ])
    expect(products).toEqual([
      { id: "x", name: "Burrito", description: "Con todo", image_url: "https://img", price: 90, currency: "MXN" },
    ])
  })
})

describe("buildProductListSections", () => {
  it("agrupa por categoría preservando el orden global", () => {
    const items = [
      item({ id: "1", category_id: "c1", whatsapp_visible: true, whatsapp_position: 1 }),
      item({ id: "2", category_id: "c2", whatsapp_visible: true, whatsapp_position: 2 }),
      item({ id: "3", category_id: "c1", whatsapp_visible: true, whatsapp_position: 3 }),
    ]
    const sections = buildProductListSections(items, [cat("c1", "Tacos"), cat("c2", "Bebidas")])
    expect(sections).toHaveLength(2)
    expect(sections[0]).toEqual({
      title: "Tacos",
      product_items: [{ product_retailer_id: "1" }, { product_retailer_id: "3" }],
    })
    expect(sections[1]?.title).toBe("Bebidas")
  })

  it("sin categoría cae en sección Menú y limita a 30 ítems", () => {
    const items = Array.from({ length: 35 }, (_, n) =>
      item({ id: `i${n}`, whatsapp_visible: true, whatsapp_position: n + 1 })
    )
    const sections = buildProductListSections(items, [])
    expect(sections).toHaveLength(1)
    expect(sections[0]?.title).toBe("Menú")
    expect(sections[0]?.product_items).toHaveLength(30)
  })
})

describe("cifrado de token (AES-GCM)", () => {
  it("cifra y descifra de forma reversible", () => {
    const plain = "EAAGsuper-secret-token"
    const enc = encryptToken(plain)
    expect(enc).not.toContain(plain)
    expect(enc.split(".")).toHaveLength(3)
    expect(decryptToken(enc)).toBe(plain)
  })

  it("cada cifrado usa IV distinto", () => {
    expect(encryptToken("x")).not.toBe(encryptToken("x"))
  })
})
