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

const URL = "http://localhost/api/admin/comisiones/42/pay"
const SELLER = "11111111-2222-4333-8444-555555555555"

type Result = { data?: unknown; error?: unknown }

const CHAIN_METHODS = ["select", "insert", "update", "eq", "neq", "is", "order", "limit", "maybeSingle", "single"] as const

function makeQuery(result: Result, log: string[]) {
  const query: Record<string, unknown> = {
    then: (ok: unknown, ko: unknown) => Promise.resolve(result).then(ok as never, ko as never),
    catch: (ko: unknown) => Promise.resolve(result).catch(ko as never),
    finally: (f: unknown) => Promise.resolve(result).finally(f as never),
  }
  for (const method of CHAIN_METHODS) {
    query[method] = (...args: unknown[]) => {
      log.push(`${method}(${JSON.stringify(args)})`)
      return query
    }
  }
  return query
}

/**
 * Cola por tabla en el orden exacto en que la ruta las toca:
 *   commission_periods → select/maybeSingle (lectura del monto real)
 */
function serviceWith(queues: Record<string, Result[]>, rpcResult: Result = { data: null, error: null }) {
  const log: string[] = []
  const seen: Record<string, number> = {}
  const from = vi.fn((table: string) => {
    const index = seen[table] ?? 0
    seen[table] = index + 1
    return makeQuery((queues[table] ?? [])[index] ?? { data: null, error: null }, log)
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

const CURRENT = { id: 42, amount_due: 132.5, status: "devengada", seller_id: SELLER }
const PAID = { ...CURRENT, status: "pagada", payment_reference: "SPEI 4471" }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/admin/comisiones/[id]/pay", () => {
  it("rechaza sin sesión de admin y no toca la base", async () => {
    asDenied()
    const res = await POST(postRequest({ reference: "SPEI 4471" }), params())
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un id que no es entero positivo", async () => {
    asAdmin()
    for (const id of ["abc", "0", "-3", "1.5", "99999999999999999999"]) {
      const res = await POST(postRequest({ reference: "SPEI 4471" }), params(id))
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

  it("devuelve 404 si el periodo no existe", async () => {
    asAdmin()
    serviceWith({ commission_periods: [{ data: null, error: null }] })
    const res = await POST(postRequest({ reference: "SPEI 4471" }), params())

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "El periodo no existe" })
  })

  it("exige referencia cuando el monto a pagar es mayor que cero", async () => {
    asAdmin()
    const { rpc } = serviceWith({ commission_periods: [{ data: CURRENT, error: null }] })
    const res = await POST(postRequest({ reference: "12" }), params())

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: "Registra la referencia del pago (mínimo 4 caracteres)",
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it("ignora el monto que mande el cliente y usa el de la base", async () => {
    asAdmin()
    const { rpc, log } = serviceWith(
      { commission_periods: [{ data: CURRENT, error: null }] },
      { data: PAID, error: null }
    )
    const res = await POST(
      postRequest({ reference: "SPEI 4471", amountDue: 1 }),
      params()
    )

    expect(res.status).toBe(200)
    // La lectura pide amount_due explícitamente y filtra por id.
    const read = log.filter((e) => e.startsWith("select("))
    expect(read).toEqual(['select(["id, amount_due, status, seller_id"])'])
    expect(log).toContain('eq(["id",42])')
    expect(rpc).toHaveBeenCalledWith("pay_commission_period", {
      p_period_id: 42,
      p_actor: "admin-1",
      p_reference: "SPEI 4471",
      p_notes: null,
    })
  })

  it("permite cerrar en cero sin referencia", async () => {
    asAdmin()
    const { rpc } = serviceWith(
      { commission_periods: [{ data: { ...CURRENT, amount_due: 0 }, error: null }] },
      { data: PAID, error: null }
    )
    const res = await POST(postRequest({}), params())

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith(
      "pay_commission_period",
      expect.objectContaining({ p_reference: "", p_notes: null })
    )
  })

  it("recorta los espacios de la referencia y guarda la nota", async () => {
    asAdmin()
    const { rpc } = serviceWith(
      { commission_periods: [{ data: CURRENT, error: null }] },
      { data: PAID, error: null }
    )
    await POST(postRequest({ reference: "  SPEI 4471  ", notes: "  Pagó Ana  " }), params())

    expect(rpc).toHaveBeenCalledWith(
      "pay_commission_period",
      expect.objectContaining({ p_reference: "SPEI 4471", p_notes: "Pagó Ana" })
    )
  })

  it("traduce el error de negocio de la RPC (doble pago)", async () => {
    asAdmin()
    serviceWith(
      { commission_periods: [{ data: CURRENT, error: null }] },
      { data: null, error: { code: "23514", message: "El periodo ya está «pagada»" } }
    )
    const res = await POST(postRequest({ reference: "SPEI 4471" }), params())

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "El periodo ya está «pagada»" })
  })

  it("devuelve 404 si la RPC no encuentra el periodo", async () => {
    asAdmin()
    serviceWith(
      { commission_periods: [{ data: CURRENT, error: null }] },
      { data: null, error: { code: "23503", message: "Periodo inexistente" } }
    )
    const res = await POST(postRequest({ reference: "SPEI 4471" }), params())

    expect(res.status).toBe(404)
  })

  it("responde 500 si la lectura del periodo falla", async () => {
    asAdmin()
    serviceWith({ commission_periods: [{ data: null, error: { code: "42703", message: "no column" } }] })
    const res = await POST(postRequest({ reference: "SPEI 4471" }), params())

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Error al registrar el pago" })
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("registra la auditoría con el monto real, no el del cliente", async () => {
    asAdmin()
    serviceWith(
      { commission_periods: [{ data: CURRENT, error: null }] },
      { data: PAID, error: null }
    )
    await POST(postRequest({ reference: "SPEI 4471", notes: "Pagó Ana", amountDue: 1 }), params())

    expect(logAdminAction).toHaveBeenCalledTimes(1)
    const [, entry] = vi.mocked(logAdminAction).mock.calls[0] as [unknown, Record<string, unknown>]
    expect(entry.action).toBe("commission_pay")
    expect(entry.entity).toBe("commission_periods")
    expect(entry.entityId).toBe(42)
    expect(entry.detail).toEqual({
      sellerId: SELLER,
      amountDue: 132.5,
      reference: "SPEI 4471",
      notes: "Pagó Ana",
    })
  })
})
