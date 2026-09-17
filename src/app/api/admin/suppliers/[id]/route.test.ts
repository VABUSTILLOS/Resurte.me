import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { DELETE, PATCH } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"

const URL = "http://localhost/api/admin/suppliers/4"

type Result = { data?: unknown; error?: unknown; count?: number | null }

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "delete",
  "upsert",
  "eq",
  "neq",
  "is",
  "ilike",
  "order",
  "limit",
  "range",
  "maybeSingle",
  "single",
  "head",
] as const

function makeQuery(result: Result, log: string[]) {
  const query: Record<string, unknown> = {
    then: (onFulfilled: unknown, onRejected: unknown) =>
      Promise.resolve(result).then(onFulfilled as never, onRejected as never),
    catch: (onRejected: unknown) => Promise.resolve(result).catch(onRejected as never),
    finally: (onFinally: unknown) => Promise.resolve(result).finally(onFinally as never),
  }
  for (const method of CHAIN_METHODS) {
    query[method] = (...args: unknown[]) => {
      log.push(`${method}(${JSON.stringify(args)})`)
      return query
    }
  }
  return query
}

function serviceWith(queues: Record<string, Result[]>, log: string[] = []) {
  const seen: Record<string, number> = {}
  const from = vi.fn((table: string) => {
    const index = seen[table] ?? 0
    seen[table] = index + 1
    return makeQuery((queues[table] ?? [])[index] ?? { data: null, error: null }, log)
  })
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from, log }
}

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

function patchRequest(body: unknown) {
  return new NextRequest(URL, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function deleteRequest(query = "") {
  return new NextRequest(`${URL}${query}`, { method: "DELETE" })
}

function params(id = "4") {
  return { params: Promise.resolve({ id }) }
}

const UPDATED = { id: 4, name: "Nuevo", slug: "nuevo", status: "verificado" }

describe("PATCH /api/admin/suppliers/[id]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 sin rol admin", async () => {
    asDenied()
    const res = await PATCH(patchRequest({ name: "X" }), params())
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con id no numérico", async () => {
    asAdmin()
    const res = await PATCH(patchRequest({ name: "X" }), params("abc"))
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con un cuerpo sin campos editables", async () => {
    asAdmin()
    const res = await PATCH(patchRequest({}), params())
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con email inválido y no escribe", async () => {
    asAdmin()
    const res = await PATCH(patchRequest({ email: "no-es-correo" }), params())
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("404 si el proveedor no existe", async () => {
    asAdmin()
    serviceWith({ suppliers: [{ data: null }] })
    const res = await PATCH(patchRequest({ city: "Puebla" }), params())
    expect(res.status).toBe(404)
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("edita sin tocar el slug si no cambia el nombre", async () => {
    asAdmin()
    const { from, log } = serviceWith({ suppliers: [{ data: UPDATED }] })
    const res = await PATCH(patchRequest({ city: "Puebla", status: "verificado" }), params())
    expect(res.status).toBe(200)
    expect(from).toHaveBeenCalledTimes(1)
    expect(log.some((entry) => entry.includes('"slug"'))).toBe(false)
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "supplier_update", entityId: 4 })
    )
  })

  it("re-deriva el slug al renombrar y respeta los slugs ajenos", async () => {
    asAdmin()
    const { log } = serviceWith({
      suppliers: [{ data: [{ slug: "nuevo" }, { slug: "otro" }] }, { data: UPDATED }],
    })
    const res = await PATCH(patchRequest({ name: "Nuevo" }), params())
    expect(res.status).toBe(200)
    expect(log.some((entry) => entry.includes('"slug":"nuevo-2"'))).toBe(true)
  })

  it("409 si el nuevo slug choca con otro proveedor", async () => {
    asAdmin()
    serviceWith({
      suppliers: [
        { data: [] },
        { data: null, error: { code: "23505", message: "dup" } },
      ],
    })
    const res = await PATCH(patchRequest({ name: "Nuevo" }), params())
    expect(res.status).toBe(409)
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("400 si el CHECK de estatus revienta", async () => {
    asAdmin()
    serviceWith({ suppliers: [{ data: null, error: { code: "23514", message: "check" } }] })
    const res = await PATCH(patchRequest({ status: "activo" }), params())
    expect(res.status).toBe(400)
  })

  it("500 en un error inesperado", async () => {
    asAdmin()
    serviceWith({ suppliers: [{ data: null, error: { code: "08006", message: "red" } }] })
    const res = await PATCH(patchRequest({ city: "Puebla" }), params())
    expect(res.status).toBe(500)
  })
})

describe("DELETE /api/admin/suppliers/[id]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 sin rol admin", async () => {
    asDenied()
    const res = await DELETE(deleteRequest("?confirm=1"), params())
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con id no numérico", async () => {
    asAdmin()
    const res = await DELETE(deleteRequest("?confirm=1"), params("0"))
    expect(res.status).toBe(400)
  })

  it("404 si no existe", async () => {
    asAdmin()
    serviceWith({ suppliers: [{ data: null }] })
    const res = await DELETE(deleteRequest(), params())
    expect(res.status).toBe(404)
  })

  it("409 sin confirmar cuando hay costos vinculados, y no borra", async () => {
    asAdmin()
    const { log } = serviceWith({
      suppliers: [{ data: { id: 4, name: "Café" } }],
      product_suppliers: [{ count: 3 }],
    })
    const res = await DELETE(deleteRequest(), params())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.requiresConfirmation).toBe(true)
    expect(body.links).toBe(3)
    expect(body.error).toContain("3 producto")
    expect(log.some((entry) => entry.startsWith("delete("))).toBe(false)
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("borra sin confirmación cuando no hay vínculos", async () => {
    asAdmin()
    serviceWith({
      suppliers: [{ data: { id: 4, name: "Café" } }],
      product_suppliers: [{ count: 0 }],
    })
    const res = await DELETE(deleteRequest(), params())
    expect(res.status).toBe(200)
    expect((await res.json()).linksRemoved).toBe(0)
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "supplier_delete", entityId: 4 })
    )
  })

  it("borra con ?confirm=1 y reporta cuántos vínculos se perdieron", async () => {
    asAdmin()
    serviceWith({
      suppliers: [{ data: { id: 4, name: "Café" } }],
      product_suppliers: [{ count: 2 }],
    })
    const res = await DELETE(deleteRequest("?confirm=1"), params())
    expect(res.status).toBe(200)
    expect((await res.json()).linksRemoved).toBe(2)
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ detail: { name: "Café", linksRemoved: 2 } })
    )
  })

  it("500 si falla el borrado y no deja bitácora", async () => {
    asAdmin()
    serviceWith({
      suppliers: [{ data: { id: 4, name: "Café" } }, { data: null, error: { message: "fk" } }],
      product_suppliers: [{ count: 0 }],
    })
    const res = await DELETE(deleteRequest(), params())
    expect(res.status).toBe(500)
    expect(logAdminAction).not.toHaveBeenCalled()
  })
})
