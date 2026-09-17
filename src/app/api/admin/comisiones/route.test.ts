import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/comercializacion/commissions", () => ({ getCommissionRate: vi.fn() }))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"
import { getCommissionRate } from "@/lib/comercializacion/commissions"

const URL = "http://localhost/api/admin/comisiones"
const SELLER = "11111111-2222-4333-8444-555555555555"

type Result = { data?: unknown; error?: unknown }

const CHAIN_METHODS = ["select", "insert", "update", "eq", "neq", "is", "order", "limit", "maybeSingle", "single"] as const

/** Consulta encadenable: cualquier método devuelve el mismo thenable. */
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

const PERIOD = {
  id: 42,
  seller_id: SELLER,
  period_start: "2026-09-01",
  period_end: "2026-09-30",
  rate: 0.05,
  revenue: 1000,
  order_count: 2,
  adjustments: 0,
  amount_due: 50,
  status: "devengada",
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCommissionRate).mockReturnValue(0.05)
})

describe("POST /api/admin/comisiones", () => {
  it("rechaza sin sesión de admin y no toca la base", async () => {
    asDenied()
    const res = await POST(postRequest({ sellerId: SELLER, month: "2026-09" }))
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un cuerpo que no es JSON", async () => {
    asAdmin()
    const res = await POST(postRequest("{no-es-json"))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un vendedor que no es UUID", async () => {
    asAdmin()
    const res = await POST(postRequest({ sellerId: "cualquiera", month: "2026-09" }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Elige un vendedor válido" })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un mes mal formado", async () => {
    asAdmin()
    const res = await POST(postRequest({ sellerId: SELLER, month: "septiembre" }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "El periodo debe tener el formato AAAA-MM" })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza una tasa fuera de [0,1]", async () => {
    asAdmin()
    const res = await POST(postRequest({ sellerId: SELLER, month: "2026-09", rate: 1.5 }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "La tasa debe ser un número entre 0 y 1" })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("devenga el periodo con la tasa global cuando no se manda tasa", async () => {
    asAdmin()
    const { rpc } = serviceWith({}, { data: PERIOD, error: null })
    const res = await POST(postRequest({ sellerId: SELLER, month: "2026-09" }))

    expect(res.status).toBe(201)
    expect(getCommissionRate).toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith("accrue_commission_period", {
      p_seller_id: SELLER,
      p_period_start: "2026-09-01",
      p_period_end: "2026-09-30",
      p_rate: 0.05,
    })
    expect(await res.json()).toEqual({ period: PERIOD })
  })

  it("respeta la tasa explícita del cuerpo", async () => {
    asAdmin()
    const { rpc } = serviceWith({}, { data: PERIOD, error: null })
    await POST(postRequest({ sellerId: SELLER, month: "2026-09", rate: 0.12 }))

    expect(getCommissionRate).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith(
      "accrue_commission_period",
      expect.objectContaining({ p_rate: 0.12 })
    )
  })

  it("cae a la tasa global si la tasa llega nula o vacía", async () => {
    asAdmin()
    for (const rate of [null, ""]) {
      vi.clearAllMocks()
      vi.mocked(getCommissionRate).mockReturnValue(0.07)
      asAdmin()
      const { rpc } = serviceWith({}, { data: PERIOD, error: null })
      await POST(postRequest({ sellerId: SELLER, month: "2026-09", rate }))
      expect(rpc).toHaveBeenCalledWith(
        "accrue_commission_period",
        expect.objectContaining({ p_rate: 0.07 })
      )
    }
  })

  it("normaliza un mes de un dígito", async () => {
    asAdmin()
    const { rpc } = serviceWith({}, { data: PERIOD, error: null })
    await POST(postRequest({ sellerId: SELLER, month: "2026-9" }))

    expect(rpc).toHaveBeenCalledWith(
      "accrue_commission_period",
      expect.objectContaining({ p_period_start: "2026-09-01", p_period_end: "2026-09-30" })
    )
  })

  it("traduce el error de la RPC con código de negocio", async () => {
    asAdmin()
    serviceWith({}, { data: null, error: { code: "23514", message: "El periodo ya está pagado" } })
    const res = await POST(postRequest({ sellerId: SELLER, month: "2026-09" }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "El periodo ya está pagado" })
  })

  it("devuelve 404 si el vendedor no existe", async () => {
    asAdmin()
    serviceWith({}, { data: null, error: { code: "23503", message: "Vendedor inexistente" } })
    const res = await POST(postRequest({ sellerId: SELLER, month: "2026-09" }))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Vendedor inexistente" })
  })

  it("oculta el detalle de un error inesperado", async () => {
    asAdmin()
    serviceWith({}, { data: null, error: { code: "42P01", message: "relation does not exist" } })
    const res = await POST(postRequest({ sellerId: SELLER, month: "2026-09" }))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Error al devengar el periodo" })
  })

  it("registra la auditoría con el id del periodo devengado", async () => {
    asAdmin()
    const { log } = serviceWith({}, { data: PERIOD, error: null })
    await POST(postRequest({ sellerId: SELLER, month: "2026-09" }))

    expect(log.some((entry) => entry.startsWith("rpc("))).toBe(true)
    expect(logAdminAction).toHaveBeenCalledTimes(1)
    const [, entry] = vi.mocked(logAdminAction).mock.calls[0] as [unknown, Record<string, unknown>]
    expect(entry.action).toBe("commission_accrue")
    expect(entry.entity).toBe("commission_periods")
    expect(entry.entityId).toBe(42)
    expect(entry.detail).toMatchObject({
      sellerId: SELLER,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      rate: 0.05,
      amountDue: 50,
    })
  })

  it("responde 500 si la RPC lanza", async () => {
    asAdmin()
    vi.mocked(createServiceClient).mockResolvedValue({
      rpc: vi.fn(() => Promise.reject(new Error("boom"))),
      from: vi.fn(),
    } as never)
    const res = await POST(postRequest({ sellerId: SELLER, month: "2026-09" }))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Error al devengar el periodo" })
  })
})
