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

const URL = "http://localhost/api/admin/comisiones/42/cancel"
const SELLER = "11111111-2222-4333-8444-555555555555"

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

function serviceWith(rpcResult: Result = { data: null, error: null }) {
  const log: string[] = []
  const from = vi.fn((table: string) => {
    log.push(`from(${JSON.stringify([table])})`)
    return makeQuery({ data: null, error: null }, log)
  })
  const rpc = vi.fn((...args: unknown[]) => {
    log.push(`rpc(${JSON.stringify(args)})`)
    return Promise.resolve(rpcResult)
  })
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

const CANCELLED = {
  id: 42,
  seller_id: SELLER,
  status: "cancelada",
  notes: "Duplicado de abril",
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/admin/comisiones/[id]/cancel", () => {
  it("rechaza sin sesión de admin y no toca la base", async () => {
    asDenied()
    const res = await POST(postRequest({ reason: "Duplicado de abril" }), params())
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un id que no es entero positivo", async () => {
    asAdmin()
    for (const id of ["abc", "0", "-3", "1.5"]) {
      const res = await POST(postRequest({ reason: "Duplicado de abril" }), params(id))
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

  it("exige un motivo de al menos 5 caracteres", async () => {
    asAdmin()
    const { rpc } = serviceWith()
    for (const reason of [undefined, "", "  ", "abc", "no"]) {
      const res = await POST(postRequest({ reason }), params())
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: "Explica por qué cancelas el periodo (mínimo 5 caracteres)",
      })
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it("cancela el periodo y devuelve la fila", async () => {
    asAdmin()
    const { rpc } = serviceWith({ data: CANCELLED, error: null })
    const res = await POST(postRequest({ reason: "  Duplicado de abril  " }), params())

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith("cancel_commission_period", {
      p_period_id: 42,
      p_reason: "Duplicado de abril",
    })
    expect(await res.json()).toEqual({ period: CANCELLED })
  })

  it("traduce el error de negocio de la RPC (periodo ya pagado)", async () => {
    asAdmin()
    serviceWith({ data: null, error: { code: "23514", message: "El periodo ya está «pagada»" } })
    const res = await POST(postRequest({ reason: "Duplicado de abril" }), params())

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "El periodo ya está «pagada»" })
  })

  it("devuelve 404 si el periodo no existe", async () => {
    asAdmin()
    serviceWith({ data: null, error: { code: "23503", message: "Periodo inexistente" } })
    const res = await POST(postRequest({ reason: "Duplicado de abril" }), params())

    expect(res.status).toBe(404)
  })

  it("oculta el detalle de un error inesperado", async () => {
    asAdmin()
    serviceWith({ data: null, error: { code: "42P01", message: "relation does not exist" } })
    const res = await POST(postRequest({ reason: "Duplicado de abril" }), params())

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Error al cancelar el periodo" })
  })

  it("registra la auditoría con el motivo", async () => {
    asAdmin()
    serviceWith({ data: CANCELLED, error: null })
    await POST(postRequest({ reason: "Duplicado de abril" }), params())

    expect(logAdminAction).toHaveBeenCalledTimes(1)
    const [, entry] = vi.mocked(logAdminAction).mock.calls[0] as [unknown, Record<string, unknown>]
    expect(entry.action).toBe("commission_cancel")
    expect(entry.entity).toBe("commission_periods")
    expect(entry.entityId).toBe(42)
    expect(entry.detail).toEqual({ sellerId: SELLER, reason: "Duplicado de abril" })
  })

  it("responde 500 si la RPC lanza", async () => {
    asAdmin()
    vi.mocked(createServiceClient).mockResolvedValue({
      rpc: vi.fn(() => Promise.reject(new Error("boom"))),
      from: vi.fn(),
    } as never)
    const res = await POST(postRequest({ reason: "Duplicado de abril" }), params())

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Error al cancelar el periodo" })
  })
})
