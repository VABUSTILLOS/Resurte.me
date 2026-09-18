import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({
  rateLimited: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, retry_after_seconds: 0 }),
  clientIp: vi.fn(() => "127.0.0.1"),
  rateLimitResponse: vi.fn(
    (rate: { retry_after_seconds: number }) =>
      new Response(JSON.stringify({ error: "Demasiadas solicitudes" }), {
        status: 429,
        headers: { "Retry-After": String(rate.retry_after_seconds) },
      })
  ),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/foodos-notifications", () => ({
  notifyFoodosCustomer: vi.fn().mockResolvedValue({ whatsapp: "skipped", email: "skipped" }),
}))
// after() sólo existe dentro de un request scope de Next; en tests se ejecuta inline.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => void) => fn(),
}))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { clientIp, rateLimited } from "@/lib/rate-limit"
import { notifyFoodosCustomer } from "@/lib/foodos-notifications"
import { logger } from "@/lib/logger"

/**
 * POST /api/foodos/orders/[id]/cancel
 *
 * La ruta es la única puerta del comensal al estado `cancelled` en FoodOS, y
 * escribe: por eso lo que más se prueba aquí no es el camino feliz sino las
 * **cuatro formas de decir que no** (rate limit, restaurante inactivo, pedido
 * ajeno, estado no cancelable) y las **dos carreras** que puede perder (el
 * restaurante confirma entre la lectura y la escritura, y el cupón que no se
 * puede liberar).
 */

type Envelope = { data: unknown; error: unknown }
const EMPTY: Envelope = { data: null, error: null }

const RESTAURANT = { id: "rest-1" }
const ORDER = {
  id: "ord-1",
  status: "pending" as const,
  payment_status: "pending" as const,
  restaurant_id: "rest-1",
  coupon_code: null as string | null,
}

/**
 * Builder encadenable mínimo. `maybeSingle()/single()` resuelven la fila (la
 * lectura) y `await builder` resuelve el sobre del arreglo (la escritura), que
 * es justo como se comportan los helpers de PostgREST.
 */
function builder(write: Envelope, read: Envelope) {
  const b: Record<string, unknown> = {}
  for (const m of ["eq", "in", "order", "limit", "update", "delete", "insert"]) {
    b[m] = vi.fn().mockReturnValue(b)
  }
  b.select = vi.fn().mockReturnValue(b)
  b.maybeSingle = vi.fn(() => Promise.resolve(read))
  b.single = vi.fn(() => Promise.resolve(read))
  b.then = (onFulfilled: (value: unknown) => unknown) => onFulfilled(write)
  return b as Record<string, ReturnType<typeof vi.fn>>
}

function setup(
  config: {
    restaurant?: Envelope
    order?: Envelope
    write?: Envelope
    couponError?: { message: string } | null
    couponThrows?: boolean
  } = {}
) {
  const rpc = vi.fn(async () => {
    if (config.couponThrows) throw new Error("conexión caída")
    return { data: null, error: config.couponError ?? null }
  })

  const restaurantBuilder = builder(
    { data: null, error: null },
    config.restaurant ?? { data: RESTAURANT, error: null }
  )
  const orderBuilder = builder(
    config.write ?? {
      data: [{ id: "ord-1", status: "cancelled", payment_status: "failed" }],
      error: null,
    },
    config.order ?? { data: ORDER, error: null }
  )

  const from = vi.fn((table: string) =>
    table === "foodos_restaurants" ? restaurantBuilder : orderBuilder
  )

  vi.mocked(createServiceClient).mockResolvedValue({ from, rpc } as never)
  return { from, rpc, orderBuilder, restaurantBuilder }
}

function request(
  opts: { slug?: string | null; querySlug?: string; raw?: string } = {}
) {
  const url = new URL("http://localhost/api/foodos/orders/ord-1/cancel")
  if (opts.querySlug) url.searchParams.set("slug", opts.querySlug)
  const body =
    opts.raw !== undefined
      ? opts.raw
      : opts.slug === null
        ? "{}"
        : JSON.stringify({ slug: opts.slug ?? "tacos" })
  return new NextRequest(url, {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  })
}

const params = (id = "ord-1") => Promise.resolve({ id })

describe("POST /api/foodos/orders/[id]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({
      allowed: true,
      remaining: 9,
      retry_after_seconds: 0,
    })
  })

  it("429 cuando el rate limit no permite, sin tocar la base", async () => {
    vi.mocked(rateLimited).mockResolvedValue({
      allowed: false,
      remaining: 0,
      retry_after_seconds: 30,
    })
    const { from } = setup()
    const res = await POST(request(), { params: params() })
    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("30")
    expect(from).not.toHaveBeenCalled()
  })

  it("el tope es más estrecho que el del seguimiento y va por IP", async () => {
    setup()
    await POST(request(), { params: params() })
    expect(clientIp).toHaveBeenCalled()
    expect(rateLimited).toHaveBeenCalledWith(
      expect.anything(),
      "foodos_cancel:127.0.0.1",
      10,
      60
    )
  })

  it("400 sin slug ni en el cuerpo ni en la query", async () => {
    setup()
    const res = await POST(request({ slug: null }), { params: params() })
    expect(res.status).toBe(400)
  })

  it("400 con un cuerpo que no es JSON (cae a la query y tampoco hay)", async () => {
    setup()
    const res = await POST(request({ raw: "esto no es json" }), { params: params() })
    expect(res.status).toBe(400)
  })

  it("400 sin id", async () => {
    setup()
    const res = await POST(request(), { params: params("") })
    expect(res.status).toBe(400)
  })

  it("404 si el restaurante no existe o no está activo", async () => {
    setup({ restaurant: EMPTY })
    const res = await POST(request(), { params: params() })
    expect(res.status).toBe(404)
  })

  it("404 si el pedido no pertenece al restaurante", async () => {
    setup({ order: EMPTY })
    const res = await POST(request(), { params: params() })
    expect(res.status).toBe(404)
  })

  it("un id ajeno y uno inexistente responden igual: la ruta no es un oráculo", async () => {
    setup({ order: EMPTY })
    const ajeno = await POST(request(), { params: params("ord-de-otro") })
    setup({ order: EMPTY })
    const inexistente = await POST(request(), { params: params("no-existe") })
    expect(ajeno.status).toBe(inexistente.status)
    expect(await ajeno.json()).toEqual(await inexistente.json())
  })

  it("500 si la lectura del pedido falla", async () => {
    setup({ order: { data: null, error: { message: "boom" } } })
    const res = await POST(request(), { params: params() })
    expect(res.status).toBe(500)
    expect(logger.error).toHaveBeenCalled()
  })

  it("409 con el motivo cuando el pedido ya estaba cancelado", async () => {
    setup({ order: { data: { ...ORDER, status: "cancelled" }, error: null } })
    const res = await POST(request(), { params: params() })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { reason: string; error: string }
    expect(body.reason).toBe("already_cancelled")
    expect(body.error).toMatch(/cancelado/i)
  })

  it("409 con el motivo cuando el restaurante ya empezó", async () => {
    setup({ order: { data: { ...ORDER, status: "preparing" }, error: null } })
    const res = await POST(request(), { params: params() })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { reason: string }
    expect(body.reason).toBe("started")
  })

  it("409 con el motivo cuando ya hay un pago cobrado", async () => {
    setup({ order: { data: { ...ORDER, payment_status: "paid" }, error: null } })
    const res = await POST(request(), { params: params() })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { reason: string; error: string }
    expect(body.reason).toBe("charged")
    // Sin maquinaria de reembolso, cancelar un pedido cobrado sería quedarse
    // con el dinero: el mensaje manda al comensal con el restaurante.
    expect(body.error).toMatch(/ll[aá]mal|escr[ií]b/i)
  })

  it("el motivo se comprueba antes de escribir", async () => {
    const { orderBuilder } = setup({
      order: { data: { ...ORDER, status: "delivered" }, error: null },
    })
    await POST(request(), { params: params() })
    expect(orderBuilder.update).not.toHaveBeenCalled()
  })

  it("200 cancela y cierra la ventana de pago si seguía pendiente", async () => {
    const { orderBuilder } = setup()
    const res = await POST(request(), { params: params() })
    expect(res.status).toBe(200)
    const payload = orderBuilder.update!.mock.calls[0]![0] as Record<string, unknown>
    expect(payload.status).toBe("cancelled")
    expect(payload.payment_status).toBe("failed")
    expect(typeof payload.updated_at).toBe("string")
  })

  it("no pisa un pago fallado o expirado al cancelar", async () => {
    const { orderBuilder } = setup({
      order: { data: { ...ORDER, payment_status: "expired" }, error: null },
    })
    const res = await POST(request(), { params: params() })
    expect(res.status).toBe(200)
    const payload = orderBuilder.update!.mock.calls[0]![0] as Record<string, unknown>
    expect("payment_status" in payload).toBe(false)
  })

  it("la escritura lleva compare-and-swap sobre el estado leído", async () => {
    const { orderBuilder } = setup()
    await POST(request(), { params: params() })
    const eqs = orderBuilder.eq!.mock.calls.map((c) => c as [string, unknown])
    expect(eqs).toContainEqual(["id", "ord-1"])
    // Sin esto, el comensal cancelaría un pedido que el restaurante acaba de
    // meter en la cocina.
    expect(eqs).toContainEqual(["status", "pending"])
  })

  it("409 si el pedido cambió entre la lectura y la escritura", async () => {
    setup({ write: { data: [], error: null } })
    const res = await POST(request(), { params: params() })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/recarga/i)
  })

  it("500 si la escritura falla", async () => {
    setup({ write: { data: null, error: { message: "boom" } } })
    const res = await POST(request(), { params: params() })
    expect(res.status).toBe(500)
    expect(logger.error).toHaveBeenCalled()
  })

  it("la respuesta devuelve el estado real escrito y no se cachea", async () => {
    setup()
    const res = await POST(request(), { params: params() })
    expect(res.headers.get("cache-control")).toBe("no-store")
    const body = (await res.json()) as { order: { id: string; status: string } }
    expect(body.order).toEqual({
      id: "ord-1",
      status: "cancelled",
      payment_status: "failed",
    })
  })

  it("no llama al RPC del cupón si el pedido no usó ninguno", async () => {
    const { rpc } = setup()
    await POST(request(), { params: params() })
    expect(rpc).not.toHaveBeenCalled()
  })

  it("libera el cupón que el alta del pedido consumió", async () => {
    const { rpc } = setup({
      order: { data: { ...ORDER, coupon_code: "PROMO10" }, error: null },
    })
    const res = await POST(request(), { params: params() })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith("decrement_foodos_coupon_usage", {
      p_restaurant_id: "rest-1",
      p_code: "PROMO10",
    })
  })

  it("un error del RPC del cupón no deshace la cancelación", async () => {
    const { rpc } = setup({
      order: { data: { ...ORDER, coupon_code: "PROMO10" }, error: null },
      couponError: { message: "function does not exist" },
    })
    const res = await POST(request(), { params: params() })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  it("una excepción del RPC del cupón tampoco deshace la cancelación", async () => {
    const { rpc } = setup({
      order: { data: { ...ORDER, coupon_code: "PROMO10" }, error: null },
      couponThrows: true,
    })
    const res = await POST(request(), { params: params() })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  it("avisa al comensal de la cancelación", async () => {
    setup()
    await POST(request(), { params: params() })
    expect(notifyFoodosCustomer).toHaveBeenCalledWith("ord-1", "status:cancelled")
  })

  it("acepta el slug por la query para el enlace sin cuerpo", async () => {
    const { from } = setup()
    const res = await POST(request({ raw: "", querySlug: "tacos" }), { params: params() })
    expect(res.status).toBe(200)
    expect(from).toHaveBeenCalledWith("foodos_restaurants")
  })

  it("500 si algo inesperado revienta", async () => {
    vi.mocked(createServiceClient).mockRejectedValue(new Error("sin credenciales"))
    const res = await POST(request(), { params: params() })
    expect(res.status).toBe(500)
    expect(logger.error).toHaveBeenCalled()
  })
})
