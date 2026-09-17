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

const ADMIN = { id: "admin-1", email: "vabustillos@gmail.com" }

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: ADMIN, response: null } as never)
}

function asDenied() {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: null,
    response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  } as never)
}

const ROW = {
  id: 9,
  user_id: "user-1",
  service_id: "resenas-google",
  service_name: "Gestión de Reseñas Google",
  cost_credits: 2200,
  status: "requested",
  brief: { restaurant_name: "El Buen Pastor" },
  assigned_to: null,
  due_at: "2026-02-01T00:00:00.000Z",
  created_at: "2026-01-15T00:00:00.000Z",
}

/**
 * Builder que imita al de PostgREST: encadenable Y "thenable".
 *
 * El `then` no es decorativo. La ruta hace `query.limit(300)` y después
 * `query = query.in(...)`, así que si `limit()` devolviera una promesa el
 * segundo eslabón se llamaría sobre la promesa y no sobre el builder —igual
 * que en producción, donde el builder real implementa `then`.
 */
function serviceWith(opts: { rows?: unknown[]; before?: unknown; rowError?: unknown } = {}) {
  const builder: Record<string, unknown> = {}
  for (const m of ["select", "in", "eq"]) builder[m] = vi.fn().mockReturnValue(builder)
  builder.order = vi.fn().mockReturnValue(builder)
  builder.limit = vi.fn().mockReturnValue(builder)
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: opts.rows ?? [], error: opts.rowError ?? null })
  builder.maybeSingle = vi.fn().mockResolvedValue({
    data: opts.before ?? null,
    error: opts.rowError ?? null,
  })
  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn(() => builder),
    auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: "c@d.com" } } }) } },
  } as never)
  return builder
}

function post(body: unknown) {
  return new NextRequest("http://localhost/api/admin/redemptions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function get(url = "http://localhost/api/admin/redemptions") {
  return new NextRequest(url)
}

describe("/api/admin/redemptions", () => {
  beforeEach(() => vi.clearAllMocks())

  it("GET 403 sin rol admin", async () => {
    asDenied()
    const res = await GET(get())
    expect(res.status).toBe(403)
  })

  it("GET resuelve el email del cliente: el brief no lo trae", async () => {
    asAdmin()
    serviceWith({ rows: [ROW] })
    const res = await GET(get())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.redemptions[0]).toMatchObject({ id: 9, email: "c@d.com" })
  })

  it("GET filtra a abiertas por defecto y a todas con ?status=all", async () => {
    asAdmin()
    const builder = serviceWith({ rows: [] })
    await GET(get())
    expect(builder.in).toHaveBeenCalledWith("status", ["requested", "in_progress"])

    vi.clearAllMocks()
    asAdmin()
    const all = serviceWith({ rows: [] })
    await GET(get("http://localhost/api/admin/redemptions?status=all"))
    expect(all.in).not.toHaveBeenCalled()
  })

  it("GET 500 si la consulta falla", async () => {
    asAdmin()
    serviceWith({ rows: undefined, rowError: { message: "boom" } })
    const res = await GET(get())
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe("boom")
  })

  it("POST 400 con id inválido", async () => {
    asAdmin()
    for (const id of [undefined, 0, -3, 1.5, "abc"]) {
      const res = await POST(post({ id }))
      expect(res.status).toBe(400)
    }
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("POST 400 con estado desconocido y no llega a la base", async () => {
    asAdmin()
    serviceWith({ before: ROW })
    const res = await POST(post({ id: 9, status: "shipped" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Estado desconocido")
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("POST 404 si la solicitud no existe", async () => {
    asAdmin()
    serviceWith({ before: null })
    const res = await POST(post({ id: 9, status: "in_progress" }))
    expect(res.status).toBe(404)
    expect(advanceRedemption).not.toHaveBeenCalled()
  })

  it("POST avanza y deja bitácora con el antes y el después", async () => {
    asAdmin()
    serviceWith({ before: ROW })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: true,
      status: "in_progress",
      changed: true,
      refunded: false,
    })
    const res = await POST(post({ id: 9, status: "in_progress" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, status: "in_progress", changed: true })

    expect(logAdminAction).toHaveBeenCalledTimes(1)
    const entry = vi.mocked(logAdminAction).mock.calls[0]![1]
    expect(entry).toMatchObject({
      actorEmail: "vabustillos@gmail.com",
      action: "redemption_status_update",
      entity: "redemptions",
      entityId: 9,
    })
    expect(entry.detail).toMatchObject({ previous_status: "requested", new_status: "in_progress" })
  })

  it("POST sin `status` sólo toca metadatos: no hay transición", async () => {
    asAdmin()
    serviceWith({ before: ROW })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: true,
      status: "requested",
      changed: false,
      refunded: false,
    })
    const res = await POST(post({ id: 9, assigned_to: "Ana" }))
    expect(res.status).toBe(200)
    const args = vi.mocked(advanceRedemption).mock.calls[0]![0]
    expect(args.status).toBeUndefined()
    expect(args.assignedTo).toBe("Ana")
  })

  it("POST con status null significa explícitamente 'no transiciones'", async () => {
    asAdmin()
    serviceWith({ before: ROW })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: true,
      status: "requested",
      changed: false,
      refunded: false,
    })
    await POST(post({ id: 9, status: null, note: "Llamado" }))
    expect(vi.mocked(advanceRedemption).mock.calls[0]![0].status).toBeNull()
  })

  it("POST normaliza cadenas vacías a null", async () => {
    asAdmin()
    serviceWith({ before: ROW })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: true,
      status: "requested",
      changed: false,
      refunded: false,
    })
    await POST(post({ id: 9, assigned_to: "   ", note: "" }))
    const args = vi.mocked(advanceRedemption).mock.calls[0]![0]
    expect(args.assignedTo).toBeNull()
    expect(args.note).toBeNull()
  })

  it("POST propaga el rechazo de la base como 400, sin bitácora falsa", async () => {
    asAdmin()
    serviceWith({ before: { ...ROW, status: "delivered" } })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: false,
      status: null,
      changed: false,
      refunded: false,
      error: "Transición inválida: delivered → cancelled",
    })
    const res = await POST(post({ id: 9, status: "cancelled" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Transición inválida: delivered → cancelled")
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("POST propaga el reembolso: el equipo debe saber que se devolvieron créditos", async () => {
    asAdmin()
    serviceWith({ before: ROW })
    vi.mocked(advanceRedemption).mockResolvedValue({
      ok: true,
      status: "cancelled",
      changed: true,
      refunded: true,
    })
    const res = await POST(post({ id: 9, status: "cancelled" }))
    expect(await res.json()).toMatchObject({ refunded: true })
    expect(vi.mocked(logAdminAction).mock.calls[0]![1].detail).toMatchObject({ refunded: true })
  })
})
