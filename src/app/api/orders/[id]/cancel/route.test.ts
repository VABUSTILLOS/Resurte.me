import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({
  rateLimited: vi.fn(async () => ({ allowed: true })),
  clientIp: vi.fn(() => "1.2.3.4"),
  rateLimitResponse: vi.fn(() =>
    NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 })
  ),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/workflows", () => ({ onOrderStatusChange: vi.fn().mockResolvedValue([]) }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn().mockResolvedValue(undefined) }))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { rateLimited } from "@/lib/rate-limit"
import { onOrderStatusChange } from "@/lib/workflows"
import { logAdminAction } from "@/lib/audit-log"

/**
 * El autoservicio de cancelación: quién puede, hasta cuándo, y qué se ejecuta
 * de verdad al cancelar.
 *
 * Lo que estas pruebas protegen:
 *   · Que la autorización no se pueda saltar (token o ser el dueño, nada más)
 *     y que un rechazo no revele si el pedido existe.
 *   · Que la ruta no reimplemente la cascada: llama a la misma función que el
 *     admin, y el pedido queda cancelado de verdad.
 *   · Que el compare-and-swap impida dos cancelaciones simultáneas.
 */

interface Row {
  data?: unknown
  error?: { code?: string; message?: string } | null
}

/**
 * Builder PostgREST chainable y awaitable. `orders` se consulta en dos
 * cadenas distintas —lectura (`select().eq().maybeSingle()`) y escritura
 * (`update().eq().eq().select()`)— así que se encola un builder por cadena.
 *
 * `awaitable` es el sobre completo que resuelve la cadena al ser awaited
 * (`{ data, error }`), porque la ruta desestructura `data`.
 */
interface Builder {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  then: (resolve: (value: unknown) => void) => void
}

function builder(
  result: Row,
  awaitable: unknown = { data: result.data, error: result.error ?? null }
): Builder {
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq", "ilike", "in", "is", "not", "order", "limit"]) {
    b[m] = vi.fn(() => b)
  }
  b.update = vi.fn(() => b)
  b.maybeSingle = vi.fn(() => Promise.resolve(result))
  b.single = vi.fn(() => Promise.resolve(result))
  b.then = (resolve: (value: unknown) => void) => resolve(awaitable)
  return b as unknown as Builder
}

const ORDER_PENDIENTE = {
  id: 7,
  status: "pending",
  payment_status: "pending",
  user_id: "user-1",
  restore_token: "tok-abc",
  coupon_code: null,
}

function setup(options: {
  orders?: Row[]
  coupons?: Row
  rpc?: Row
} = {}) {
  const orderBuilders = (options.orders ?? [{ data: ORDER_PENDIENTE }]).map((r) => builder(r))
  // La escritura resuelve al sobre de PostgREST con las filas representadas.
  const updateBuilder = builder(
    { data: null },
    { data: [{ id: 7, status: "cancelled", payment_status: "failed" }], error: null }
  )
  const couponBuilder = builder(options.coupons ?? { data: null })
  const rpc = vi.fn(() => Promise.resolve(options.rpc ?? { data: { ok: true }, error: null }))

  let orderCall = 0
  const from = vi.fn((table: string) => {
    if (table === "coupons") return couponBuilder
    if (table === "orders") {
      // Tras agotar los builders de lectura, todo `from("orders")` es la
      // escritura.
      orderCall++
      return orderCall > orderBuilders.length ? updateBuilder : orderBuilders[orderCall - 1]
    }
    return builder({ data: null })
  })

  const supabase = { from, rpc }
  vi.mocked(createServiceClient).mockResolvedValue(supabase as never)
  return { supabase, from, rpc, updateBuilder, couponBuilder }
}

function request(body?: unknown, id = "7", query = "") {
  return new NextRequest(`http://localhost/api/orders/${id}/cancel${query}`, {
    method: "POST",
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  })
}

const params = (id = "7") => ({ params: Promise.resolve({ id }) })

function sessionAs(userId: string | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
  sessionAs(null)
})

describe("POST /api/orders/[id]/cancel · entrada y autorización", () => {
  it("rechaza un id que no es un entero positivo", async () => {
    setup()
    const res = await POST(request({ t: "tok-abc" }), params("abc"))
    expect(res.status).toBe(400)
  })

  it("sin token y sin sesión responde 404, no 403", async () => {
    setup()
    const res = await POST(request({}), params())
    // 403 diría "existe pero no es tuyo": eso convierte la ruta en un oráculo
    // de qué ids existen.
    expect(res.status).toBe(404)
  })

  it("un token equivocado responde 404", async () => {
    setup()
    const res = await POST(request({ t: "tok-malo" }), params())
    expect(res.status).toBe(404)
  })

  it("una sesión de OTRO usuario no puede cancelar el pedido", async () => {
    setup()
    sessionAs("user-2")
    const res = await POST(request({}), params())
    expect(res.status).toBe(404)
  })

  it("un pedido inexistente responde 404 con el mismo mensaje que un token malo", async () => {
    setup({ orders: [{ data: null }] })
    const res = await POST(request({ t: "tok-abc" }), params())
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(404)
    expect(body.error).toBe("Pedido no encontrado")
  })

  it("el dueño autenticado cancela sin necesidad de token", async () => {
    const { rpc } = setup()
    sessionAs("user-1")
    const res = await POST(request({}), params())
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith("release_order_stock", { p_order_id: 7 })
  })

  it("el token también se acepta por query, como el seguimiento", async () => {
    setup()
    const res = await POST(request(undefined, "7", "?t=tok-abc"), params())
    expect(res.status).toBe(200)
  })

  it("un cuerpo que no es JSON no rompe: cae al query param", async () => {
    setup()
    const req = new NextRequest("http://localhost/api/orders/7/cancel?t=tok-abc", {
      method: "POST",
      body: "no soy json",
      headers: { "content-type": "application/json" },
    })
    const res = await POST(req, params())
    expect(res.status).toBe(200)
  })

  it("respeta el rate limit", async () => {
    setup()
    vi.mocked(rateLimited).mockResolvedValue({ allowed: false } as never)
    const res = await POST(request({ t: "tok-abc" }), params())
    expect(res.status).toBe(429)
  })
})

describe("POST /api/orders/[id]/cancel · qué NO se puede cancelar", () => {
  it("un pedido ya despachado se rechaza con 409 y motivo", async () => {
    setup({ orders: [{ data: { ...ORDER_PENDIENTE, status: "out_for_delivery" } }] })
    const res = await POST(request({ t: "tok-abc" }), params())
    const body = (await res.json()) as { reason: string }
    expect(res.status).toBe(409)
    expect(body.reason).toBe("dispatched")
  })

  it("un pedido cobrado se rechaza: no hay maquinaria de reembolso", async () => {
    setup({ orders: [{ data: { ...ORDER_PENDIENTE, payment_status: "paid" } }] })
    const res = await POST(request({ t: "tok-abc" }), params())
    const body = (await res.json()) as { reason: string; error: string }
    expect(res.status).toBe(409)
    expect(body.reason).toBe("charged")
    // El mensaje tiene que dar una salida, no solo negar.
    expect(body.error).toMatch(/escríbenos/i)
  })

  it("un pedido ya cancelado se rechaza y no vuelve a devolver inventario", async () => {
    const { rpc } = setup({ orders: [{ data: { ...ORDER_PENDIENTE, status: "cancelled" } }] })
    const res = await POST(request({ t: "tok-abc" }), params())
    const body = (await res.json()) as { reason: string }
    expect(res.status).toBe(409)
    expect(body.reason).toBe("already_cancelled")
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe("POST /api/orders/[id]/cancel · qué ejecuta de verdad", () => {
  it("cancela, cierra la ventana de pago y ejecuta la cascada compartida", async () => {
    const { rpc, updateBuilder } = setup()
    const res = await POST(request({ t: "tok-abc" }), params())

    expect(res.status).toBe(200)
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", payment_status: "failed" })
    )
    // La cascada NO se reimplementa: se llama a la RPC de inventario.
    expect(rpc).toHaveBeenCalledWith("release_order_stock", { p_order_id: 7 })
    expect(onOrderStatusChange).toHaveBeenCalledWith(7, "pending", "cancelled")
  })

  it("no pisa un payment_status que ya no estaba pendiente", async () => {
    const { updateBuilder } = setup({
      orders: [{ data: { ...ORDER_PENDIENTE, payment_status: "failed" } }],
    })
    await POST(request({ t: "tok-abc" }), params())
    const payload = updateBuilder.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload).not.toHaveProperty("payment_status")
  })

  it("hace compare-and-swap sobre el estado para no devolver inventario dos veces", async () => {
    const { updateBuilder } = setup()
    await POST(request({ t: "tok-abc" }), params())
    // Un `eq` con el estado leído: si otro canceló en el medio, no toca la fila.
    expect(updateBuilder.eq).toHaveBeenCalledWith("status", "pending")
  })

  it("si el pedido cambió mientras se cancelaba, responde 409 sin ejecutar la cascada", async () => {
    const { rpc, updateBuilder } = setup()
    // La escritura no representa ninguna fila: otro llegó primero.
    updateBuilder.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
    const res = await POST(request({ t: "tok-abc" }), params())
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(409)
    expect(body.error).toMatch(/recarga/i)
    expect(rpc).not.toHaveBeenCalled()
  })

  it("un error al escribir responde 500 y no ejecuta la cascada", async () => {
    const { rpc, updateBuilder } = setup()
    updateBuilder.then = (resolve: (v: unknown) => void) =>
      resolve({ data: null, error: { message: "deadlock detected" } })
    const res = await POST(request({ t: "tok-abc" }), params())
    expect(res.status).toBe(500)
    expect(rpc).not.toHaveBeenCalled()
  })

  it("una excepción inesperada tampoco deja la cancelación a medias", async () => {
    const { rpc, updateBuilder } = setup()
    updateBuilder.select = vi.fn(() => {
      throw new Error("boom")
    })
    const res = await POST(request({ t: "tok-abc" }), params())
    expect(res.status).toBe(500)
    expect(rpc).not.toHaveBeenCalled()
  })

  it("reintenta sin coupon_code si la columna no existe (42703)", async () => {
    const { updateBuilder } = setup({
      orders: [
        { data: null, error: { code: "42703", message: "column orders.coupon_code does not exist" } },
        { data: ORDER_PENDIENTE },
      ],
    })
    const res = await POST(request({ t: "tok-abc" }), params())
    expect(res.status).toBe(200)
    expect(updateBuilder.update).toHaveBeenCalled()
  })

  it("un fallo del workflow no impide la cancelación", async () => {
    setup()
    vi.mocked(onOrderStatusChange).mockRejectedValue(new Error("whatsapp caído"))
    const res = await POST(request({ t: "tok-abc" }), params())
    expect(res.status).toBe(200)
  })

  it("registra la cancelación en la bitácora atribuyéndola al dueño", async () => {
    setup()
    sessionAs("user-1")
    await POST(request({}), params())
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "order_cancelled_by_customer",
        entity: "orders",
        entityId: 7,
        actorId: "user-1",
      })
    )
  })

  it("con token de invitado NO atribuye la acción a la sesión del navegador", async () => {
    setup()
    // Alguien con su propia sesión abre el enlace de un invitado: la acción no
    // es suya, y anotarla como suya sería mentir en la bitácora.
    sessionAs("user-9")
    await POST(request({ t: "tok-abc" }), params())
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: null, detail: { from: "pending", via: "token" } })
    )
  })

  it("no filtra PII ni datos de pago en la respuesta", async () => {
    setup()
    const res = await POST(request({ t: "tok-abc" }), params())
    const body = (await res.json()) as Record<string, unknown>
    expect(Object.keys(body)).toEqual(["order"])
    expect(Object.keys(body.order as object).sort()).toEqual(["id", "payment_status", "status"])
  })
})
