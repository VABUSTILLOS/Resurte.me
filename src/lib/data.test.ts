import { describe, expect, it, vi, beforeEach } from "vitest"

import type { Product } from "@/types"

// Cliente Supabase simulado: todas las llamadas son stub-ables por test.
const rpcMock = vi.fn()
const fromMock = vi.fn()

const fakeSupabase = {
  rpc: rpcMock,
  from: fromMock,
}

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: vi.fn(() => fakeSupabase),
}))

import { getProductsByCollection } from "@/lib/data"

const PRODUCTS = [
  {
    id: 1,
    name: "Cebolla",
    slug: "cebolla",
    description: "",
    image_url: "",
    brand: "",
    category_id: 1,
    price: 25,
    sale_price: null,
    stock_status: "in_stock",
    show_in_whatsapp: true,
    whatsapp_product_id: null,
    tags: ["verduras", "carne-asada"],
    is_visible: true,
  },
  {
    id: 2,
    name: "Tortillas",
    slug: "tortillas",
    description: "",
    image_url: "",
    brand: "",
    category_id: 2,
    price: 30,
    sale_price: null,
    stock_status: "in_stock",
    show_in_whatsapp: true,
    whatsapp_product_id: null,
    tags: ["tacos", "desayuno"],
    is_visible: true,
  },
  {
    id: 3,
    name: "Producto Oculto",
    slug: "oculto",
    description: "",
    image_url: "",
    brand: "",
    category_id: 3,
    price: 10,
    sale_price: null,
    stock_status: "out_of_stock",
    show_in_whatsapp: false,
    whatsapp_product_id: null,
    tags: ["carne-asada"],
    is_visible: false,
  },
] satisfies Product[]

describe("getProductsByCollection fallback en memoria", () => {
  beforeEach(() => {
    rpcMock.mockReset()
    fromMock.mockReset()
  })

  it("usa el RPC cuando está disponible (no toca el fallback)", async () => {
    rpcMock.mockResolvedValue({ data: [PRODUCTS[0]], error: null })
    const result = await getProductsByCollection("carne-asada")
    expect(rpcMock).toHaveBeenCalledWith("get_products_by_collection", {
      p_slug: "carne-asada",
    })
    expect(result).toEqual([PRODUCTS[0]])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it("cae al fallback en memoria cuando el RPC falla (schema cache)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "Could not find the function ... in the schema cache" },
    })
    fromMock.mockImplementation((table: string) => {
      if (table === "restaurant_collections") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 1,
                    name: "Carne Asada",
                    slug: "carne-asada",
                    description: null,
                    image_url: null,
                    tags: ["carne-asada", "carbon"],
                    display_order: 1,
                    is_active: true,
                  },
                }),
              }),
            }),
          }),
        }
      }
      if (table === "products") {
        return {
          select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: PRODUCTS }) }) }),
        }
      }
      return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }
    })

    const result = await getProductsByCollection("carne-asada")
    expect(result).toHaveLength(1)
    expect(result[0]!.slug).toBe("cebolla")
    // El producto con tags que coinciden pero is_visible=false queda excluido.
    expect(result.some((p) => p.slug === "oculto")).toBe(false)
  })

  it("devuelve [] si la colección no existe", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "rpc down" } })
    fromMock.mockImplementation((table: string) => {
      if (table === "restaurant_collections") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ single: async () => ({ data: null }) }),
            }),
          }),
        }
      }
      if (table === "products") {
        return {
          select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: PRODUCTS }) }) }),
        }
      }
      return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }
    })

    const result = await getProductsByCollection("no-existe")
    expect(result).toEqual([])
  })
})
