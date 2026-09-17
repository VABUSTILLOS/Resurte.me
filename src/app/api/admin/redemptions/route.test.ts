import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/redemption-actions", () => ({ advanceRedemption: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { GET, POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"
import { advanceRedemption } from "@/lib/redemption-actions"

const URL = "http://localhost/api/admin/redemptions"

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: "admin-1", email: "admin@resurte.me" },
    response: null,
  } as never)
}

function asDenied() {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: null,
    response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  } as never)
}

type StoreOptions = {
  list?: Record<string, unknown>[]
  listError?: unknown
  before?: Record<string, unknown> | null
  emails?: Record<string, string>
}

/**
 * Cliente de servicio mínimo con las dos formas que usa la ruta:
 * `select().order().limit()[.in()]` (encadenable y "awaitable") y
 * `select().eq().maybeSingle()`.
 */
function serviceWith(opts: StoreOptions = {}) {
  const listResult = { data: opts.list ?? [], error: opts.listError ?? null }
  const inSpy = vi.fn(() => ({ then: (r: (v: unknown) => unknown) => r(listResult) }))
  const limit = vi.fn(() => ({
    in: inSpy,
    then: (r: (v: unknown) => unknown) => r(listResult),
  }))
  const order = vi.fn(() => ({ limit }))

  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: opts.before ?? null, error: null })
  const eq = vi.fn(() => ({ maybeSingle }))

  const select = vi.fn((columns?: string) =>
    typeof columns === "string" && columns.includes("due_at") ? { order } : { eq }
  )

  const getUserById = vi.fn(async (uid: string) => ({
    data: { user: { email: opts.emails?.[uid] ?? null } },
  }))

  const from = vi.fn(() => ({ select }))
  vi.mocked(createServiceClient).mockResolvedValue({
    from,
    auth: { admin: { getUserById } },
  } as never)
  return { select, order, limit, in: inSpy, eq, getUserById }
}

function getRequest(query = "") {
  return new NextRequest(`${URL}${query}`)
}

function postRequest(body: unknown) {
  return new NextRequest(URL, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const ROW = {
  id: 7,
  user_id: "user-1",
  service_id: "google-maps",
  service_name: "Google Maps",
  cost_credits: 2800,
  concept: "Canje: Google Maps",
  status: "requested",
  brief: { restaurant_name: "Taquería" },
  assigned_to: null,
  due_at: "2026-10-15T00:00:00.000Z",
  started_at: null,
  delivered_at: null,
  cancelled_at: null,
  refunded_at: null,
  cancel_reason: null,
  deliverable_url: null,
  deliverable_note: null,
  created_at: "2026-10-01T00:00:00.000Z",
  status_updated_at: "2026-10-01T00:00:00.000Z",
}

describe("GET /api/admin/redemptions", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 sin rol admin y no consulta nada", async () => {
    asDenied()
    const res = await GET(getRequest())
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("por defecto filtra a las solicitudes abiertas", async () => {
    asAdmin()
    const store = serviceWith({ list: [ROW] })
    const res = await GET(getRequest())
    expect(res.status).toBe(200)
    expect(store.in).toHaveBeenCalledWith("status", ["requested", "in_progress"])
  })

  it("?status=all no filtra por estado", async () => {
    asAdmin()
    const store = serviceWith({ list: [{ ...ROW, status: "delivered" }] })
    const res = await GET(getRequest("?status=all"))
    expect(res.status).toBe(200)
    expect(store.in).not.toHaveBeenCalled()
    expect((await res.json()).redemptions[0].status).toBe("delivered")
  })

  it("ordena por vencimiento y acota a 300", async () => {
    asAdmin()
    const store = serviceWith({ list: [] })
    await GET(getRequest())
    expect(store.order).toHaveBeenCalledWith("due_at", { ascending: true, nullsFirst: false })
    expect(store.limit).toHaveBeenCalledWith(300)
  })

  it("resuelve el correo desde auth, no desde el brief", async () => {
    asAdmin()
    serviceWith({ list: [ROW], emails: { "user-1": "dueno@taqueria.mx" } })
    const res = await GET(getRequest())
    const body = await res.json()
    expect(body.redemptions[0].email).toBe("dueno@taqueria.mx")
  })

  it("entrega la cola aunque falte el correo", async () => {
    asAdmin()
    serviceWith({ list: [ROW] })
    const res = await GET(getRequest())
    expect((await res.json()).redemptions[0].email).toBe(null)
  })

  it("500 si falla la consulta", async () => {
    asAdmin()
    serviceWith({ listError: { message: "boom" } })
    const res = await GET(getRequest())
    expect(res.status).toBe(500)
  })
})

describe("POST /api/admin/redemptions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    asAdmin()
  })

  it("403 sin rol admin", async () => {
    asDenied()
    const res = await POST(postRequest({ id: 7, status: "in_progress" }))
    expect(res.status).toBe(403)
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("400 con id inválido", async () => {
    const res = await POST(postRequest({ id: "abc", status: "in_progress" }))
    expect(res.status).toBe(400)
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("400 con un estado desconocido", async () => {
    // Un typo no debe convertirse en una transición silenciosa.
    const res = await POST(postRequest({ id: 7, status: "shipped" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Estado desconocido")
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("404 si la solicitud no existe", async () => {
    serviceWith({ before: null })
    const res = await POST(postRequest({ id: 7, status: "in_progress" }))
    expect(res.status).toBe(404)
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("sin `status` solo actualiza metadatos (no transiciona)", async () => {
    serviceWith({ before: ROW })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: true,
      status: "requested",
      changed: false,
      refunded: false,
    })
    const res = await POST(postRequest({ id: 7, assigned_to: "Ana" }))
    expect(res.status).toBe(200)
    expect(advanceRedemption).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, status: undefined, assignedTo: "Ana" })
    )
  })

  it("`status: null` explícito tampoco transiciona", async () => {
    serviceWith({ before: ROW })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: true,
      status: "requested",
      changed: false,
      refunded: false,
    })
    await POST(postRequest({ id: 7, status: null, note: "Llamado" }))
    expect(advanceRedemption).toHaveBeenCalledWith(
      expect.objectContaining({ status: null, note: "Llamado" })
    )
  })

  it("normaliza cadenas vacías a null", async () => {
    serviceWith({ before: ROW })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: true,
      status: "requested",
      changed: false,
      refunded: false,
    })
    await POST(postRequest({ id: 7, note: "   ", deliverable_url: "" }))
    expect(advanceRedemption).toHaveBeenCalledWith(
      expect.objectContaining({ note: null, deliverableUrl: null })
    )
  })

  it("400 cuando la función rechaza la transición", async () => {
    serviceWith({ before: { ...ROW, status: "delivered" } })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: false,
      status: "delivered",
      changed: false,
      refunded: false,
      error: "Transición inválida: delivered → cancelled",
    })
    const res = await POST(postRequest({ id: 7, status: "cancelled" }))
    expect(res.status).toBe(400)
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("mueve el estado, audita y reporta changed/refunded", async () => {
    serviceWith({ before: ROW })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: true,
      status: "cancelled",
      changed: true,
      refunded: true,
    })
    const res = await POST(postRequest({ id: 7, status: "cancelled", note: "No aplica" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true,
      status: "cancelled",
      changed: true,
      refunded: true,
    })
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "redemption_status_update",
        entity: "redemptions",
        entityId: 7,
        detail: expect.objectContaining({
          service_name: "Google Maps",
          previous_status: "requested",
          new_status: "cancelled",
          changed: true,
          refunded: true,
          credits: 2800,
        }),
      })
    )
  })

  it("el actor del registro es el admin que movió la solicitud", async () => {
    serviceWith({ before: ROW })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: true,
      status: "in_progress",
      changed: true,
      refunded: false,
    })
    await POST(postRequest({ id: 7, status: "in_progress" }))
    expect(advanceRedemption).toHaveBeenCalledWith(
      expect.objectContaining({ actor: "admin@resurte.me" })
    )
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: "admin-1", actorEmail: "admin@resurte.me" })
    )
  })
})
