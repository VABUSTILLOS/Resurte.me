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

const URL = "http://localhost/api/admin/foodos/payouts"
const RESTAURANT = "11111111-2222-3333-4444-555555555555"

type Result = { data?: unknown; error?: unknown }

function serviceWith(rpcResult: Result = { data: null, error: null }, log: string[] = []) {
  const from = vi.fn()
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

function validBody(over: Record<string, unknown> = {}) {
  return {
    restaurantId: RESTAURANT,
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    settledAmount: 900,
    feeAmount: 100,
    reference: "SPEI-4471",
    notes: "Dispersión de enero",
    ...over,
  }
}

const ROW = {
  id: 12,
  restaurant_id: RESTAURANT,
  settled_amount: 900,
  fee_amount: 100,
  reference: "SPEI-4471",
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/admin/foodos/payouts", () => {
  it("rechaza sin sesión de admin y no toca la base", async () => {
    asDenied()
    const res = await POST(postRequest(validBody()))
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

  it("rechaza un restaurante que no es UUID", async () => {
    asAdmin()
    const res = await POST(postRequest(validBody({ restaurantId: "no-soy-uuid" })))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Restaurante inválido" })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un periodo invertido", async () => {
    asAdmin()
    const res = await POST(
      postRequest(validBody({ periodStart: "2026-02-01", periodEnd: "2026-01-01" }))
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: "El fin del periodo no puede ser anterior al inicio",
    })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza el monto cero", async () => {
    asAdmin()
    const res = await POST(postRequest(validBody({ settledAmount: 0 })))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "El monto de la dispersión no puede ser cero" })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza una comisión retenida negativa", async () => {
    asAdmin()
    const res = await POST(postRequest(validBody({ feeAmount: -5 })))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "La comisión retenida no puede ser negativa" })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("exige un comprobante de al menos 4 caracteres", async () => {
    asAdmin()
    for (const reference of [undefined, "", "  ", "abc"]) {
      const res = await POST(postRequest(validBody({ reference })))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: "La dispersión exige un comprobante de al menos 4 caracteres",
      })
    }
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("exige motivo en una dispersión negativa", async () => {
    asAdmin()
    for (const notes of [undefined, "", "abc"]) {
      const res = await POST(postRequest(validBody({ settledAmount: -50, notes })))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: "Una dispersión negativa exige explicar por qué (mínimo 5 caracteres)",
      })
    }
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("acepta una dispersión negativa explicada y manda null en notas vacías", async () => {
    asAdmin()
    const { log } = serviceWith({ data: { ...ROW, settled_amount: -50 }, error: null })
    const res = await POST(
      postRequest(validBody({ settledAmount: -50, notes: "Devolución del restaurante" }))
    )
    expect(res.status).toBe(200)
    expect(log).toContain(
      'rpc(["record_foodos_payout",{"p_restaurant_id":"11111111-2222-3333-4444-555555555555","p_period_start":"2026-01-01","p_period_end":"2026-01-31","p_settled_amount":-50,"p_fee_amount":100,"p_reference":"SPEI-4471","p_actor":"admin-1","p_notes":"Devolución del restaurante"}])'
    )
  })

  it("llama a la RPC con el actor, la comisión y las notas normalizadas", async () => {
    asAdmin()
    const { rpc } = serviceWith({ data: ROW, error: null })
    const res = await POST(
      postRequest(validBody({ reference: "  SPEI-4471  ", notes: "  Dispersión de enero  " }))
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ payout: ROW })
    expect(rpc).toHaveBeenCalledWith("record_foodos_payout", {
      p_restaurant_id: RESTAURANT,
      p_period_start: "2026-01-01",
      p_period_end: "2026-01-31",
      p_settled_amount: 900,
      p_fee_amount: 100,
      p_reference: "SPEI-4471",
      p_actor: "admin-1",
      p_notes: "Dispersión de enero",
    })
  })

  it("manda periodo y notas en null cuando no se declaran", async () => {
    asAdmin()
    const { rpc } = serviceWith({ data: ROW, error: null })
    const res = await POST(
      postRequest(validBody({ periodStart: "", periodEnd: null, notes: "" }))
    )

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith(
      "record_foodos_payout",
      expect.objectContaining({ p_period_start: null, p_period_end: null, p_notes: null })
    )
  })

  it("asume comisión 0 cuando no se manda", async () => {
    asAdmin()
    const { rpc } = serviceWith({ data: ROW, error: null })
    await POST(postRequest(validBody({ feeAmount: undefined })))

    expect(rpc).toHaveBeenCalledWith(
      "record_foodos_payout",
      expect.objectContaining({ p_fee_amount: 0 })
    )
  })

  it("traduce el exceso de saldo pendiente a 400 con el mensaje de la base", async () => {
    asAdmin()
    const message =
      "La dispersión (1200.00) excede el saldo pendiente del restaurante (1000.00)"
    serviceWith({ data: null, error: { code: "23514", message } })
    const res = await POST(postRequest(validBody({ settledAmount: 1200 })))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: message })
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("traduce el comprobante repetido a 409", async () => {
    asAdmin()
    const message = 'duplicate key value violates unique constraint "foodos_payouts_unique_reference"'
    serviceWith({ data: null, error: { code: "23505", message } })
    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: message })
  })

  it("devuelve 404 si el restaurante no existe", async () => {
    asAdmin()
    serviceWith({
      data: null,
      error: { code: "23503", message: `El restaurante ${RESTAURANT} no existe` },
    })
    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(404)
  })

  it("oculta el detalle de un error inesperado", async () => {
    asAdmin()
    serviceWith({
      data: null,
      error: { code: "42P01", message: 'relation "public.foodos_payouts" does not exist' },
    })
    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Error al registrar la dispersión" })
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("registra la auditoría con el id numérico de la dispersión", async () => {
    asAdmin()
    serviceWith({ data: ROW, error: null })
    await POST(postRequest(validBody()))

    expect(logAdminAction).toHaveBeenCalledTimes(1)
    const [, entry] = vi.mocked(logAdminAction).mock.calls[0] as [unknown, Record<string, unknown>]
    expect(entry.action).toBe("foodos_payout_record")
    expect(entry.entity).toBe("foodos_payouts")
    expect(entry.entityId).toBe(12)
    expect(entry.detail).toEqual({
      restaurantId: RESTAURANT,
      periodStart: "2026-01-01",
      periodEnd: "2026-01-31",
      settledAmount: 900,
      feeAmount: 100,
      reference: "SPEI-4471",
      notes: "Dispersión de enero",
    })
  })
})
