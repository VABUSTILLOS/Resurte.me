import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"

const URL = "http://localhost/api/admin/comisiones/42/adjustments"

type Result = { data?: unknown; error?: unknown }

function makeQuery(result: Result, log: string[]) {
  const query: Record<string, unknown> = {
    then: (ok: unknown, ko: unknown) => Promise.resolve(result).then(ok as never, ko as never),
    catch: (ko: unknown) => Promise.resolve(result).catch(ko as never),
    finally: (f: unknown) => Promise.resolve(result).finally(f as never),
  }
  for (const method of ["select", "insert", "update", "eq", "maybeSingle", "single"]) {
    query[method] = (...args: unknown[]) => {
      log.push(`${method}(${JSON.stringify(args)})`)
      return query
    }
  }
  return query
}

/** Cola por tabla: commission_adjustments → insert/select/single. */
function serviceWith(queues: Record<string, Result[]>, log: string[] = []) {
  const seen: Record<string, number> = {}
  const from = vi.fn((table: string) => {
    const index = seen[table] ?? 0
    seen[table] = index + 1
    return makeQuery((queues[table] ?? [])[index] ?? { data: null, error: null }, log)
  })
  const rpc = vi.fn()
  vi.mocked(createServiceClient).mockResolvedValue({ from, rpc } as never)
  return { from, rpc, log }
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

function postRequest(body: unknown) {
  return new NextRequest(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function params(id = "42") {
  return { params: Promise.resolve({ id }) }
}

const INSERTED = { id: 7, period_id: 42, amount: 100, reason: "Bono por volumen" }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/admin/comisiones/[id]/adjustments", () => {
  it("rechaza sin sesión de admin y no toca la base", async () => {
    asDenied()
    const res = await POST(postRequest({ amount: 100, reason: "Bono por volumen" }), params())
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un id que no es entero positivo", async () => {
    asAdmin()
    for (const id of ["abc", "0", "-3", "1.5"]) {
      const res = await POST(postRequest({ amount: 100, reason: "Bono por volumen" }), params(id))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "Periodo inválido" })
    }
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un cuerpo que no es JSON", async () => {
    asAdmin()
    const res = await POST(postRequest("{no-es-json"), params())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un monto que no es número", async () => {
    asAdmin()
    const res = await POST(postRequest({ amount: "mucho", reason: "Bono por volumen" }), params())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "El ajuste debe ser un número" })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un ajuste de cero", async () => {
    asAdmin()
    const res = await POST(postRequest({ amount: 0, reason: "Bono por volumen" }), params())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "El ajuste no puede ser cero" })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("exige un motivo de al menos 5 caracteres", async () => {
    asAdmin()
    const { from } = serviceWith({})
    for (const reason of [undefined, "", "  ", "abc"]) {
      const res = await POST(postRequest({ amount: 100, reason }), params())
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: "Explica el ajuste (mínimo 5 caracteres)",
      })
    }
    expect(from).not.toHaveBeenCalled()
  })

  it("inserta el ajuste con el autor y recorta el motivo", async () => {
    asAdmin()
    const log: string[] = []
    serviceWith({ commission_adjustments: [{ data: INSERTED, error: null }] }, log)
    const res = await POST(
      postRequest({ amount: 100, reason: "  Bono por volumen  " }),
      params()
    )

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ adjustment: INSERTED })
    expect(log).toContain(
      'insert([{"period_id":42,"amount":100,"reason":"Bono por volumen","created_by":"admin-1"}])'
    )
    expect(log).toContain('select(["*"])')
    expect(log).toContain("single([])")
  })

  it("acepta un ajuste negativo", async () => {
    asAdmin()
    const log: string[] = []
    serviceWith({ commission_adjustments: [{ data: { ...INSERTED, amount: -50 }, error: null }] }, log)
    const res = await POST(postRequest({ amount: -50, reason: "Devolución parcial" }), params())

    expect(res.status).toBe(201)
    expect(log).toContain(
      'insert([{"period_id":42,"amount":-50,"reason":"Devolución parcial","created_by":"admin-1"}])'
    )
  })

  it("traduce el error del trigger cuando el periodo no está devengado", async () => {
    asAdmin()
    serviceWith({
      commission_adjustments: [
        { data: null, error: { code: "23514", message: "El periodo no está devengado" } },
      ],
    })
    const res = await POST(postRequest({ amount: 100, reason: "Bono por volumen" }), params())

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "El periodo no está devengado" })
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("devuelve 404 si el periodo no existe", async () => {
    asAdmin()
    serviceWith({
      commission_adjustments: [
        { data: null, error: { code: "23503", message: "Periodo inexistente" } },
      ],
    })
    const res = await POST(postRequest({ amount: 100, reason: "Bono por volumen" }), params())

    expect(res.status).toBe(404)
  })

  it("oculta el detalle de un error inesperado", async () => {
    asAdmin()
    serviceWith({
      commission_adjustments: [
        { data: null, error: { code: "42P01", message: "relation does not exist" } },
      ],
    })
    const res = await POST(postRequest({ amount: 100, reason: "Bono por volumen" }), params())

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Error al registrar el ajuste" })
  })

  it("registra la auditoría con el id del movimiento creado", async () => {
    asAdmin()
    serviceWith({ commission_adjustments: [{ data: INSERTED, error: null }] })
    await POST(postRequest({ amount: 100, reason: "Bono por volumen" }), params())

    expect(logAdminAction).toHaveBeenCalledTimes(1)
    const [, entry] = vi.mocked(logAdminAction).mock.calls[0] as [unknown, Record<string, unknown>]
    expect(entry.action).toBe("commission_adjust")
    expect(entry.entity).toBe("commission_adjustments")
    expect(entry.entityId).toBe(7)
    expect(entry.detail).toEqual({
      periodId: 42,
      amount: 100,
      reason: "Bono por volumen",
    })
  })
})
