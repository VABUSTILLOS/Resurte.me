import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({
  rateLimited: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, retry_after_seconds: 0 }),
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
vi.mock("@/lib/foodos-notifications", () => ({ notifyFoodosCustomer: vi.fn().mockResolvedValue({ whatsapp: "skipped", email: "skipped" }) }))
// after() sólo existe dentro de un request scope de Next; en tests se ejecuta inline.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => void) => fn(),
}))

import { GET, POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { rateLimited } from "@/lib/rate-limit"
import { notifyFoodosCustomer } from "@/lib/foodos-notifications"

type Result = { data: unknown; error: unknown }
const EMPTY: Result = { data: null, error: null }

const RESTAURANT = { id: "rest-1" }
const ORDER = { id: "ord-1", total: "250.00", payment_status: "pending" }

/**
 * Builder encadenable mínimo. `await builder` resuelve el arreglo y
 * `maybeSingle()/single()` resuelven la fila, que es justo como se
 * comportan los helpers de PostgREST. El `select` se respeta: sólo se
 * devuelven las columnas pedidas, para poder comprobar proyecciones.
 */
function tableBuilder(result: Result) {
  const builder: Record<string, unknown> = {}
  let columns: string | null = null
  const resolve = () => ({ ...result, data: project(result.data, columns) })

  for (const m of ["eq", "in", "order", "limit", "update", "delete"]) {
    builder[m] = vi.fn().mockReturnValue(builder)
  }
  builder.select = vi.fn((cols: string) => {
    columns = cols
    return builder
  })
  builder.insert = vi.fn().mockReturnValue(builder)
  builder.maybeSingle = vi.fn(() => Promise.resolve(resolve()))
  builder.single = vi.fn(() => Promise.resolve(resolve()))
  builder.then = (onFulfilled: (value: unknown) => unknown) => onFulfilled(resolve())
  return builder as Record<string, ReturnType<typeof vi.fn>>
}

/** Simula la proyección de columnas de PostgREST para listas simples. */
function project(data: unknown, columns: string | null) {
  if (!columns || columns === "*" || columns.includes("(") || columns.includes(":")) return data
  const keys = columns.split(",").map((c) => c.trim())
  const pick = (row: unknown) => {
    if (row === null || typeof row !== "object") return row
    const out: Record<string, unknown> = {}
    for (const k of keys) {
      if (k in (row as Record<string, unknown>)) out[k] = (row as Record<string, unknown>)[k]
    }
    return out
  }
  return Array.isArray(data) ? data.map(pick) : pick(data)
}

function setup(config: {
  restaurant?: Result
  order?: Result
  payments?: Result
  uploadError?: { message: string } | null
  insertError?: { message: string; code?: string } | null
} = {}) {
  const upload = vi
    .fn()
    .mockResolvedValue({ data: { path: "p" }, error: config.uploadError ?? null })
  const remove = vi.fn().mockResolvedValue({ data: [], error: null })
  const storage = { from: vi.fn(() => ({ upload, remove })) }

  const builders: Record<string, ReturnType<typeof tableBuilder>> = {}
  const from = vi.fn((table: string) => {
    const result =
      table === "foodos_restaurants"
        ? (config.restaurant ?? { data: RESTAURANT, error: null })
        : table === "foodos_orders"
          ? (config.order ?? { data: ORDER, error: null })
          : (config.payments ?? { data: { id: 9, status: "pending" }, error: null })
    const builder = tableBuilder(
      table === "foodos_order_payments" && config.insertError
        ? { data: null, error: config.insertError }
        : result
    )
    builders[table] = builder
    return builder
  })

  vi.mocked(createServiceClient).mockResolvedValue({ from, storage } as never)
  return { from, storage, upload, remove, builders }
}

function png(size = 1024) {
  const file = new File([new Uint8Array(size)], "comprobante.png", { type: "image/png" })
  return file
}

function proofRequest(
  fields: Record<string, string | File> = {},
  url = "http://localhost/api/foodos/orders/ord-1/payment-proof?slug=tacos"
) {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  return new NextRequest(url, { method: "POST", body: form })
}

const params = Promise.resolve({ id: "ord-1" })

describe("POST /api/foodos/orders/[id]/payment-proof", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({
      allowed: true,
      remaining: 4,
      retry_after_seconds: 0,
    })
  })

  it("429 cuando el rate limit no permite", async () => {
    vi.mocked(rateLimited).mockResolvedValue({
      allowed: false,
      remaining: 0,
      retry_after_seconds: 30,
    })
    const res = await POST(proofRequest({ file: png() }), { params })
    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("30")
  })

  it("400 sin slug", async () => {
    const res = await POST(
      proofRequest({ file: png() }, "http://localhost/api/foodos/orders/ord-1/payment-proof"),
      { params }
    )
    expect(res.status).toBe(400)
  })

  it("404 si el restaurante no existe o no está activo", async () => {
    setup({ restaurant: EMPTY })
    const res = await POST(proofRequest({ file: png() }), { params })
    expect(res.status).toBe(404)
  })

  it("404 si el pedido no pertenece al restaurante", async () => {
    setup({ order: EMPTY })
    const res = await POST(proofRequest({ file: png() }), { params })
    expect(res.status).toBe(404)
  })

  it("409 si el pedido ya está pagado", async () => {
    setup({ order: { data: { ...ORDER, payment_status: "paid" }, error: null } })
    const res = await POST(proofRequest({ file: png() }), { params })
    expect(res.status).toBe(409)
  })

  it("400 si no viene el archivo", async () => {
    setup()
    const res = await POST(proofRequest({ reference: "1234" }), { params })
    expect(res.status).toBe(400)
  })

  it("400 con mime no soportado", async () => {
    setup()
    const bad = new File([new Uint8Array(10)], "virus.exe", { type: "application/x-msdownload" })
    const res = await POST(proofRequest({ file: bad }), { params })
    expect(res.status).toBe(400)
  })

  it("400 si el archivo supera 5 MB", async () => {
    setup()
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "grande.png", {
      type: "image/png",
    })
    const res = await POST(proofRequest({ file: big }), { params })
    expect(res.status).toBe(400)
  })

  it("400 si el archivo está vacío", async () => {
    setup()
    const empty = new File([new Uint8Array(0)], "vacio.png", { type: "image/png" })
    const res = await POST(proofRequest({ file: empty }), { params })
    expect(res.status).toBe(400)
  })

  it("500 si falla la subida a Storage", async () => {
    const { remove } = setup({ uploadError: { message: "bucket caído" } })
    const res = await POST(proofRequest({ file: png() }), { params })
    expect(res.status).toBe(500)
    expect(remove).not.toHaveBeenCalled()
  })

  it("201 sube el archivo y registra el comprobante", async () => {
    const { upload, builders } = setup()
    const res = await POST(
      proofRequest({ file: png(), method: "oxxo", reference: "  ref-99  ", amount: "250.00" }),
      { params }
    )
    expect(res.status).toBe(201)

    expect(upload).toHaveBeenCalledTimes(1)
    const [path, uploaded, opts] = upload.mock.calls[0] as [string, File, { contentType: string }]
    expect(path).toMatch(/^rest-1\/ord-1\/[0-9a-f-]{36}\.png$/)
    expect(uploaded).toBeInstanceOf(File)
    expect(opts.contentType).toBe("image/png")

    const insert = builders.foodos_order_payments!.insert as ReturnType<typeof vi.fn>
    expect(insert).toHaveBeenCalledWith({
      order_id: "ord-1",
      restaurant_id: "rest-1",
      method: "oxxo",
      amount: 250,
      proof_path: path,
      reference: "ref-99",
    })

    expect(notifyFoodosCustomer).toHaveBeenCalledWith("ord-1", "payment:proof_pending")
  })

  it("no avisa al comensal si el comprobante no se registró", async () => {
    const { remove } = setup({ uploadError: { message: "bucket caído" } })
    await POST(proofRequest({ file: png() }), { params })
    expect(notifyFoodosCustomer).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it("el monto sale del formulario y nunca del total del pedido", async () => {
    const { builders } = setup()
    // El pedido vale 250.00; el cliente declara 1.00.
    await POST(proofRequest({ file: png(), amount: "1" }), { params })
    const insert = builders.foodos_order_payments!.insert as ReturnType<typeof vi.fn>
    expect(insert.mock.calls[0]![0]).toMatchObject({ amount: 1 })
  })

  it("amount inválido queda en null y el método cae a transfer", async () => {
    const { builders } = setup()
    const res = await POST(
      proofRequest({ file: png(), amount: "no-numero", method: "bitcoin" }),
      { params }
    )
    expect(res.status).toBe(201)
    const insert = builders.foodos_order_payments!.insert as ReturnType<typeof vi.fn>
    expect(insert.mock.calls[0]![0]).toMatchObject({ amount: null, method: "transfer" })
  })

  it("recorta la referencia a 120 caracteres", async () => {
    const { builders } = setup()
    await POST(proofRequest({ file: png(), reference: "x".repeat(300) }), { params })
    const insert = builders.foodos_order_payments!.insert as ReturnType<typeof vi.fn>
    expect((insert.mock.calls[0]![0] as { reference: string }).reference).toHaveLength(120)
  })

  it("409 y borra el archivo si ya había un comprobante pendiente", async () => {
    const { remove, upload } = setup({
      insertError: { message: "duplicate key", code: "23505" },
    })
    const res = await POST(proofRequest({ file: png() }), { params })
    expect(res.status).toBe(409)
    const path = (upload.mock.calls[0] as [string])[0]
    expect(remove).toHaveBeenCalledWith([path])
  })

  it("500 sin borrar el archivo ante un error de inserción distinto", async () => {
    const { remove } = setup({ insertError: { message: "boom", code: "42P01" } })
    const res = await POST(proofRequest({ file: png() }), { params })
    expect(res.status).toBe(500)
    expect(remove).toHaveBeenCalled()
  })

  it("usa el bucket privado comprobantes", async () => {
    const { storage } = setup()
    await POST(proofRequest({ file: png() }), { params })
    expect(storage.from).toHaveBeenCalledWith("comprobantes")
  })
})

describe("GET /api/foodos/orders/[id]/payment-proof", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimited).mockResolvedValue({
      allowed: true,
      remaining: 29,
      retry_after_seconds: 0,
    })
  })

  it("400 sin slug", async () => {
    setup()
    const res = await GET(
      new NextRequest("http://localhost/api/foodos/orders/ord-1/payment-proof"),
      { params }
    )
    expect(res.status).toBe(400)
  })

  it("404 si el restaurante no existe", async () => {
    setup({ restaurant: EMPTY })
    const res = await GET(
      new NextRequest("http://localhost/api/foodos/orders/ord-1/payment-proof?slug=tacos"),
      { params }
    )
    expect(res.status).toBe(404)
  })

  it("200 devuelve los comprobantes sin exponer proof_path", async () => {
    setup({
      payments: {
        data: [
          {
            id: 9,
            method: "transfer",
            amount: "250.00",
            reference: "ref-99",
            status: "pending",
            notes: null,
            reviewed_at: null,
            created_at: "2026-09-12T18:00:00Z",
            proof_path: "rest-1/ord-1/secreto.png",
          },
        ],
        error: null,
      },
    })
    const res = await GET(
      new NextRequest("http://localhost/api/foodos/orders/ord-1/payment-proof?slug=tacos"),
      { params }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.payments).toHaveLength(1)
    expect(body.payments[0]).toMatchObject({ id: 9, status: "pending" })
    expect(JSON.stringify(body)).not.toContain("secreto.png")
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("200 con arreglo vacío si no hay comprobantes", async () => {
    setup({ payments: { data: null, error: null } })
    const res = await GET(
      new NextRequest("http://localhost/api/foodos/orders/ord-1/payment-proof?slug=tacos"),
      { params }
    )
    expect(res.status).toBe(200)
    expect((await res.json()).payments).toEqual([])
  })

  it("500 ante error de la consulta", async () => {
    setup({ payments: { data: null, error: { message: "boom" } } })
    const res = await GET(
      new NextRequest("http://localhost/api/foodos/orders/ord-1/payment-proof?slug=tacos"),
      { params }
    )
    expect(res.status).toBe(500)
  })
})
