import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ isAdminUser: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({
  rateLimited: vi.fn(),
  clientIp: vi.fn(() => "1.2.3.4"),
  rateLimitResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "Demasiadas solicitudes" }), { status: 429 })
  ),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { GET } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/admin-auth"
import { rateLimited } from "@/lib/rate-limit"

const TOKEN = "11111111-2222-3333-4444-555555555555"

function allowRate() {
  vi.mocked(rateLimited).mockResolvedValue({ allowed: true } as never)
}

function blockRate() {
  vi.mocked(rateLimited).mockResolvedValue({
    allowed: false,
    limit: 30,
    remaining: 0,
    resetAt: Date.now() + 60_000,
  } as never)
}

type StoreOptions = {
  order?: Record<string, unknown> | null
  readError?: unknown
  signError?: unknown
  signedUrl?: string | null
}

function serviceWith(opts: StoreOptions = {}) {
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: opts.signedUrl === null ? null : { signedUrl: opts.signedUrl ?? "https://signed.example/x" },
    error: opts.signError ?? null,
  })
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: opts.order ?? null, error: opts.readError ?? null })
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  const storage = { from: vi.fn(() => ({ createSignedUrl })) }
  vi.mocked(createServiceClient).mockResolvedValue({ from, storage } as never)
  return { createSignedUrl }
}

function asAnonymous() {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  } as never)
  vi.mocked(isAdminUser).mockResolvedValue(false)
}

function asSession(userId: string) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }) },
  } as never)
}

function request(query = "", method = "GET") {
  return new NextRequest(`http://localhost/api/orders/1/proof${query}`, { method })
}

function params(id = "1") {
  return { params: Promise.resolve({ id }) }
}

const ORDER = {
  id: 1,
  user_id: null,
  restore_token: TOKEN,
  delivery_proof_path: "marketplace/1/foto.jpg",
  delivery_proof_at: "2026-10-01T18:00:00.000Z",
  delivery_proof_note: "Recibió el encargado",
}

describe("GET /api/orders/[id]/proof", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    allowRate()
    asAnonymous()
  })

  it("400 con id no numérico", async () => {
    const res = await GET(request("", "GET"), params("1e3"))
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("429 cuando se pasa del límite por IP, sin firmar nada", async () => {
    // El cliente de servicio se crea antes de contar (es el contador), pero el
    // corto-circuito ocurre antes de leer el pedido y de firmar la URL.
    blockRate()
    const store = serviceWith({ order: ORDER })
    const res = await GET(request(`?t=${TOKEN}`), params())
    expect(res.status).toBe(429)
    expect(store.createSignedUrl).not.toHaveBeenCalled()
  })

  it("404 genérico si el pedido no existe", async () => {
    serviceWith({ order: null })
    const res = await GET(request(`?t=${TOKEN}`), params())
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe("Enlace inválido o expirado")
  })

  it("404 genérico con token incorrecto", async () => {
    serviceWith({ order: ORDER })
    const res = await GET(request("?t=otro-token"), params())
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe("Enlace inválido o expirado")
  })

  it("404 genérico sin token y sin sesión", async () => {
    serviceWith({ order: ORDER })
    const res = await GET(request(), params())
    expect(res.status).toBe(404)
  })

  it("el token sirve aunque el pedido sea de un invitado sin cuenta", async () => {
    // Sin esta vía, todos los pedidos de invitado quedarían sin acceso a su
    // propio comprobante.
    serviceWith({ order: ORDER })
    const res = await GET(request(`?t=${TOKEN}`), params())
    expect(res.status).toBe(200)
    expect((await res.json()).url).toBe("https://signed.example/x")
  })

  it("con token válido no consulta la sesión", async () => {
    serviceWith({ order: ORDER })
    await GET(request(`?t=${TOKEN}`), params())
    expect(createClient).not.toHaveBeenCalled()
  })

  it("el dueño del pedido entra con su sesión", async () => {
    serviceWith({ order: { ...ORDER, user_id: "user-1", restore_token: null } })
    asSession("user-1")
    const res = await GET(request(), params())
    expect(res.status).toBe(200)
  })

  it("un admin entra sin ser el dueño", async () => {
    serviceWith({ order: { ...ORDER, user_id: "user-1", restore_token: null } })
    asSession("admin-9")
    vi.mocked(isAdminUser).mockResolvedValue(true)
    const res = await GET(request(), params())
    expect(res.status).toBe(200)
  })

  it("otro usuario con sesión recibe 404 genérico", async () => {
    serviceWith({ order: { ...ORDER, user_id: "user-1", restore_token: null } })
    asSession("user-2")
    const res = await GET(request(), params())
    expect(res.status).toBe(404)
  })

  it("url null cuando el pedido aún no tiene comprobante", async () => {
    const store = serviceWith({ order: { ...ORDER, delivery_proof_path: null } })
    const res = await GET(request(`?t=${TOKEN}`), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: null, at: null, note: null })
    expect(store.createSignedUrl).not.toHaveBeenCalled()
  })

  it("devuelve url, fecha y nota con la ruta firmada", async () => {
    const store = serviceWith({ order: ORDER })
    const res = await GET(request(`?t=${TOKEN}`), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      url: "https://signed.example/x",
      at: ORDER.delivery_proof_at,
      note: ORDER.delivery_proof_note,
    })
    expect(store.createSignedUrl).toHaveBeenCalledWith("marketplace/1/foto.jpg", 3600)
  })

  it("nunca devuelve la ruta del objeto", async () => {
    serviceWith({ order: ORDER })
    const res = await GET(request(`?t=${TOKEN}`), params())
    expect(JSON.stringify(await res.json())).not.toContain("marketplace/1/foto.jpg")
  })

  it("no cachea la respuesta: la URL firmada es efímera", async () => {
    serviceWith({ order: ORDER })
    const res = await GET(request(`?t=${TOKEN}`), params())
    expect(res.headers.get("Cache-Control")).toBe("no-store")
  })

  it("500 si falla la firma", async () => {
    serviceWith({ order: ORDER, signError: { message: "boom" } })
    const res = await GET(request(`?t=${TOKEN}`), params())
    expect(res.status).toBe(500)
  })

  it("500 si falla la lectura del pedido", async () => {
    serviceWith({ order: null, readError: { message: "boom" } })
    const res = await GET(request(`?t=${TOKEN}`), params())
    expect(res.status).toBe(500)
  })
})
