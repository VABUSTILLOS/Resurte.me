import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { GET } from "./route"
import { createServiceClient } from "@/lib/supabase/service"

/** Builder con la cadena select().eq().eq().maybeSingle() que usa la ruta. */
function ordersReturning(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const m of ["select", "eq"]) builder[m] = vi.fn().mockReturnValue(builder)
  builder.maybeSingle = vi.fn().mockResolvedValue(result)
  vi.mocked(createServiceClient).mockResolvedValue({ from: vi.fn(() => builder) } as never)
  return builder
}

function req(url: string) {
  return new NextRequest(`http://localhost${url}`)
}

const ORDER_ROW = {
  id: 9,
  status: "pending",
  restore_token: "tok-secreto",
  order_items: [
    {
      product_id: 7,
      quantity: 2,
      unit_price: "50.00",
      products: { id: 7, name: "Aguacate", image_url: "https://img/aguacate.jpg", slug: "aguacate" },
    },
    {
      product_id: 11,
      quantity: 1,
      unit_price: "25.50",
      products: null, // producto borrado: la ruta aplica fallbacks
    },
  ],
}

describe("GET /api/cart/restore", () => {
  beforeEach(() => vi.clearAllMocks())

  it("400 sin parámetros order/t", async () => {
    const res = await GET(req("/api/cart/restore"))

    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con order no numérico", async () => {
    const res = await GET(req("/api/cart/restore?order=abc&t=tok"))

    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con order pero sin token", async () => {
    const res = await GET(req("/api/cart/restore?order=9"))

    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("404 con token inválido o pedido inexistente (respuesta genérica)", async () => {
    ordersReturning({ data: null, error: null })

    const res = await GET(req("/api/cart/restore?order=9&t=token-malo"))

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe("Enlace inválido o expirado")
    // No filtra existencia del pedido ni del token
    expect(JSON.stringify(body)).not.toContain("9")
  })

  it("500 ante error de la consulta", async () => {
    ordersReturning({ data: null, error: { message: "boom" } })

    const res = await GET(req("/api/cart/restore?order=9&t=tok"))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe("No se pudo restaurar el carrito")
  })

  it("200 restaura los items mapeados con fallback para productos borrados", async () => {
    ordersReturning({ data: ORDER_ROW, error: null })

    const res = await GET(req("/api/cart/restore?order=9&t=tok-secreto"))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(2)
    expect(body.items[0]).toEqual({
      product_id: 7,
      quantity: 2,
      price: 50,
      name: "Aguacate",
      slug: "aguacate",
      image_url: "https://img/aguacate.jpg",
    })
    // Producto borrado (products: null): fallbacks por product_id
    expect(body.items[1]).toEqual({
      product_id: 11,
      quantity: 1,
      price: 25.5,
      name: "Producto #11",
      slug: "producto-11",
      image_url: "",
    })
    // Capability URL: el token consulta pero no se expone en la respuesta
    expect(JSON.stringify(body)).not.toContain("tok-secreto")
    expect(res.headers.get("cache-control")).toBe("no-store")
  })
})
