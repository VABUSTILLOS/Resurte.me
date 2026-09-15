import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { GET, POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"

const ORDER_ID = 9
const TOKEN = "tok-secreto"
const OWNER = "11111111-1111-1111-1111-111111111111"

interface Setup {
  /** Resultado de orders.select().eq().maybeSingle() */
  order?: { data: unknown; error: unknown }
  /** Resultado de order_reviews.select().eq().maybeSingle() */
  review?: { data: unknown; error: unknown }
  /** Error devuelto por order_reviews.upsert() */
  upsertError?: unknown
  /** Fila del RPC consume_rate_limit; false simula ventana agotada */
  rate?: { allowed: boolean; remaining?: number; retry_after_seconds?: number }
  /** Sesión devuelta por auth.getUser() */
  user?: { id: string } | null
}

/** Builder con la cadena select().eq().maybeSingle() que usa la ruta. */
function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const m of ["select", "eq"]) builder[m] = vi.fn().mockReturnValue(builder)
  builder.maybeSingle = vi.fn().mockResolvedValue(result)
  return builder
}

function setup(opts: Setup = {}) {
  const orders = chain(opts.order ?? { data: null, error: null })
  const reviews = chain(opts.review ?? { data: null, error: null })
  const upsert = vi.fn().mockResolvedValue({ error: opts.upsertError ?? null })
  reviews.upsert = upsert

  const from = vi.fn((table: string) => (table === "orders" ? orders : reviews))
  const rpc = vi.fn().mockResolvedValue({
    data: [
      opts.rate ?? { allowed: true, remaining: 9, retry_after_seconds: 0 },
    ],
    error: null,
  })

  vi.mocked(createServiceClient).mockResolvedValue({ from, rpc } as never)
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: opts.user ?? null } }) },
  } as never)

  return { orders, reviews, upsert, from, rpc }
}

const ORDER = {
  id: ORDER_ID,
  user_id: OWNER,
  status: "delivered",
  restore_token: TOKEN,
}

function get(query: string) {
  return new NextRequest(`http://localhost/api/reviews${query}`)
}

function post(body: unknown) {
  return new NextRequest("http://localhost/api/reviews", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

/** Argumentos capturados por el upsert, ya tipados (los tests esperan la llamada). */
function upsertArgs(upsert: Mock, index = 0) {
  const [payload, options] = upsert.mock.calls[index] ?? []
  if (!payload) throw new Error(`upsert no fue llamado en la posición ${index}`)
  return { payload: payload as Record<string, unknown>, options }
}

describe("GET /api/reviews", () => {
  beforeEach(() => vi.clearAllMocks())

  it("400 sin el parámetro pedido, sin tocar la base", async () => {
    const res = await GET(get(""))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Parámetros inválidos")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con pedido no numérico, sin tocar la base", async () => {
    const res = await GET(get("?pedido=abc"))

    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("429 con Retry-After cuando la ventana está agotada", async () => {
    setup({ rate: { allowed: false, remaining: 0, retry_after_seconds: 42 } })

    const res = await GET(get(`?pedido=${ORDER_ID}&t=${TOKEN}`))

    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("42")
    expect((await res.json()).error).toBe("Demasiadas peticiones. Intenta en un minuto.")
  })

  it("404 genérico cuando el pedido no existe o no está autorizado", async () => {
    setup({ order: { data: null, error: null } })

    const res = await GET(get(`?pedido=${ORDER_ID}&t=token-malo`))

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe("Pedido no encontrado")
    // No filtra la existencia del pedido
    expect(JSON.stringify(body)).not.toContain(String(ORDER_ID))
  })

  it("404 (no 500) cuando la consulta del pedido devuelve error", async () => {
    setup({ order: { data: null, error: { message: "boom" } } })

    const res = await GET(get(`?pedido=${ORDER_ID}&t=${TOKEN}`))

    expect(res.status).toBe(404)
  })

  it("autoriza por capability URL sin consultar la sesión", async () => {
    setup({ order: { data: ORDER, error: null } })

    const res = await GET(get(`?pedido=${ORDER_ID}&t=${TOKEN}`))

    expect(res.status).toBe(200)
    expect(createClient).not.toHaveBeenCalled()
    // El token consulta pero nunca se expone en la respuesta
    expect(JSON.stringify(await res.json())).not.toContain(TOKEN)
  })

  it("autoriza por sesión del dueño del pedido", async () => {
    setup({ order: { data: ORDER, error: null }, user: { id: OWNER } })

    const res = await GET(get(`?pedido=${ORDER_ID}`))

    expect(res.status).toBe(200)
    expect(createClient).toHaveBeenCalled()
  })

  it("404 cuando la sesión no es la dueña del pedido", async () => {
    setup({
      order: { data: ORDER, error: null },
      user: { id: "22222222-2222-2222-2222-222222222222" },
    })

    const res = await GET(get(`?pedido=${ORDER_ID}`))

    expect(res.status).toBe(404)
  })

  it("200 sin reseña previa: review null y cache deshabilitado", async () => {
    setup({ order: { data: ORDER, error: null } })

    const res = await GET(get(`?pedido=${ORDER_ID}&t=${TOKEN}`))

    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.json()).toEqual({
      orderId: ORDER_ID,
      delivered: true,
      review: null,
    })
  })

  it("200 con la reseña existente (prefill del formulario)", async () => {
    const review = { rating: 4, comment: "Muy fresco", created_at: "2026-01-02T03:04:05.000Z" }
    setup({ order: { data: ORDER, error: null }, review: { data: review, error: null } })

    const res = await GET(get(`?pedido=${ORDER_ID}&t=${TOKEN}`))

    expect((await res.json()).review).toEqual(review)
  })

  it("200 con delivered false para un pedido aún no entregado", async () => {
    setup({ order: { data: { ...ORDER, status: "shipped" }, error: null } })

    const res = await GET(get(`?pedido=${ORDER_ID}&t=${TOKEN}`))

    expect((await res.json()).delivered).toBe(false)
  })

  it("degrada a review null cuando la tabla order_reviews no responde", async () => {
    setup({ order: { data: ORDER, error: null }, review: { data: null, error: { code: "42P01" } } })

    const res = await GET(get(`?pedido=${ORDER_ID}&t=${TOKEN}`))

    expect(res.status).toBe(200)
    expect((await res.json()).review).toBeNull()
  })

  it("500 ante un fallo inesperado", async () => {
    vi.mocked(createServiceClient).mockRejectedValue(new Error("sin conexión"))

    const res = await GET(get(`?pedido=${ORDER_ID}&t=${TOKEN}`))

    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe("No se pudo cargar el pedido")
  })
})

describe("POST /api/reviews", () => {
  beforeEach(() => vi.clearAllMocks())

  it("400 con order_id ausente o no numérico", async () => {
    for (const body of [{}, { order_id: "abc" }, { order_id: 0 }, null]) {
      const res = await POST(post(body))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe("Pedido inválido")
    }
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con body que no es JSON válido", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{no-json",
      })
    )

    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con calificación fuera de 1-5 o no entera", async () => {
    for (const rating of [0, 6, 2.5, -1, "abc", undefined, null]) {
      const res = await POST(post({ order_id: ORDER_ID, rating }))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe("La calificación debe ser de 1 a 5 estrellas")
    }
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("429 cuando la ventana está agotada", async () => {
    setup({ rate: { allowed: false, remaining: 0, retry_after_seconds: 30 } })

    const res = await POST(post({ order_id: ORDER_ID, rating: 5, token: TOKEN }))

    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("30")
  })

  it("404 cuando el pedido no está autorizado", async () => {
    setup({ order: { data: null, error: null } })

    const res = await POST(post({ order_id: ORDER_ID, rating: 5, token: "token-malo" }))

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe("Pedido no encontrado")
  })

  it("409 cuando el pedido todavía no fue entregado", async () => {
    const { upsert } = setup({ order: { data: { ...ORDER, status: "shipped" }, error: null } })

    const res = await POST(post({ order_id: ORDER_ID, rating: 5, token: TOKEN }))

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("Solo puedes calificar pedidos ya entregados")
    expect(upsert).not.toHaveBeenCalled()
  })

  it("200 con upsert por order_id y updated_at explícito (invitado con token)", async () => {
    const { upsert } = setup({ order: { data: ORDER, error: null } })

    const res = await POST(post({ order_id: ORDER_ID, rating: 5, token: TOKEN }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    expect(upsert).toHaveBeenCalledTimes(1)
    const { payload, options } = upsertArgs(upsert)
    expect(options).toEqual({ onConflict: "order_id" })
    expect(payload.order_id).toBe(ORDER_ID)
    expect(payload.rating).toBe(5)
    // Sin sesión del dueño el user_id queda NULL (no rompe la FK a auth.users)
    expect(payload.user_id).toBeNull()
    // La tabla no tiene trigger: la ruta fija updated_at explícitamente
    const updatedAt = String(payload.updated_at)
    expect(new Date(updatedAt).toISOString()).toBe(updatedAt)
  })

  it("200 guarda el user_id cuando la sesión es la dueña del pedido", async () => {
    const { upsert } = setup({ order: { data: ORDER, error: null }, user: { id: OWNER } })

    const res = await POST(post({ order_id: ORDER_ID, rating: 4 }))

    expect(res.status).toBe(200)
    expect(upsertArgs(upsert).payload.user_id).toBe(OWNER)
  })

  it("200 con sesión ajena al pedido: autoriza por token y no atribuye la reseña", async () => {
    const { upsert } = setup({
      order: { data: ORDER, error: null },
      user: { id: "22222222-2222-2222-2222-222222222222" },
    })

    const res = await POST(post({ order_id: ORDER_ID, rating: 4, token: TOKEN }))

    expect(res.status).toBe(200)
    // La reseña no queda colgada de la cuenta equivocada
    expect(upsertArgs(upsert).payload.user_id).toBeNull()
  })

  it("normaliza el comentario: trim, vacío a null y recorte a 500", async () => {
    const { upsert } = setup({ order: { data: ORDER, error: null } })

    await POST(post({ order_id: ORDER_ID, rating: 5, token: TOKEN, comment: "  todo bien  " }))
    expect(upsertArgs(upsert).payload.comment).toBe("todo bien")

    await POST(post({ order_id: ORDER_ID, rating: 5, token: TOKEN, comment: "   " }))
    expect(upsertArgs(upsert, 1).payload.comment).toBeNull()

    await POST(post({ order_id: ORDER_ID, rating: 5, token: TOKEN }))
    expect(upsertArgs(upsert, 2).payload.comment).toBeNull()

    await POST(post({ order_id: ORDER_ID, rating: 5, token: TOKEN, comment: "x".repeat(600) }))
    expect(upsertArgs(upsert, 3).payload.comment).toHaveLength(500)
  })

  it("500 cuando el upsert falla", async () => {
    setup({ order: { data: ORDER, error: null }, upsertError: { message: "boom" } })

    const res = await POST(post({ order_id: ORDER_ID, rating: 5, token: TOKEN }))

    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe("No se pudo guardar tu reseña")
  })
})
