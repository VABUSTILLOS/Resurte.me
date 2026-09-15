import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn(async () => ({
    user: { id: "admin-1", email: "admin@resurte.mx" },
    response: null,
  })),
}))
vi.mock("@/lib/audit", () => ({ logAdminAction: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/workflows", () => ({ onOrderStatusChange: vi.fn().mockResolvedValue([]) }))
vi.mock("@/lib/notifications", () => ({ notifyUser: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { PATCH } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit"
import { onOrderStatusChange } from "@/lib/workflows"
import { notifyUser } from "@/lib/notifications"

interface TableResult {
  data?: unknown
  error?: unknown
}

/** Builder PostgREST chainable y awaitable, igual que en src/app/api/orders/route.test.ts. */
function tableBuilder(result: TableResult = { data: null, error: null }) {
  const builder: Record<string, unknown> = {}
  for (const method of ["select", "eq", "in", "is", "not", "update", "insert", "order", "limit", "ilike"]) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }
  builder.maybeSingle = vi.fn().mockResolvedValue(result)
  builder.single = vi.fn().mockResolvedValue(result)
  builder.then = (resolve: (v: unknown) => void) => resolve(result)
  return builder as Record<string, ReturnType<typeof vi.fn>> & {
    single: ReturnType<typeof vi.fn>
    maybeSingle: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}

/**
 * orders se consulta dos veces en la ruta: fetch del estado actual
 * (select().eq().single()) y luego el update (update().eq().select().single()).
 * Ambas cadenas terminan en single(), así que se resuelven en orden.
 */
function ordersTable(current: TableResult, updated: TableResult) {
  const b = tableBuilder()
  b.single.mockResolvedValueOnce(current).mockResolvedValue(updated)
  return b
}

function mockSupabase(tables: Record<string, ReturnType<typeof tableBuilder>>) {
  const from = vi.fn((table: string) => tables[table] ?? tableBuilder())
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return from
}

const CURRENT_ORDER = {
  status: "pending",
  payment_status: "pending",
  customer_phone: "+5215512345678",
  coupon_code: null,
}

function req(body: unknown) {
  return new NextRequest("http://localhost/api/orders/7/status", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const params7 = Promise.resolve({ id: "7" })

describe("PATCH /api/orders/[id]/status", () => {
  beforeEach(() => vi.clearAllMocks())

  it("401 cuando no hay sesión autenticada", async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      user: null,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    })

    const res = await PATCH(req({ status: "confirmed" }), { params: params7 })

    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("403 cuando el usuario autenticado no es admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      user: null,
      response: NextResponse.json(
        { error: "Acceso restringido a administradores" },
        { status: 403 }
      ),
    })

    const res = await PATCH(req({ status: "confirmed" }), { params: params7 })

    expect(res.status).toBe(403)
    expect(onOrderStatusChange).not.toHaveBeenCalled()
  })

  it("400 con id de pedido no numérico", async () => {
    const res = await PATCH(req({ status: "confirmed" }), {
      params: Promise.resolve({ id: "abc" }),
    })

    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 sin status, payment_status ni driver_id", async () => {
    const res = await PATCH(req({}), { params: params7 })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("Se requiere")
  })

  it("400 con estado inválido", async () => {
    const res = await PATCH(req({ status: "en_camino" }), { params: params7 })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("Invalid status")
  })

  it("400 con payment_status distinto de 'paid'", async () => {
    const res = await PATCH(req({ payment_status: "failed" }), { params: params7 })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("payment_status")
  })

  it("404 cuando el pedido no existe", async () => {
    mockSupabase({
      orders: ordersTable({ data: null, error: { message: "not found" } }, { data: null, error: null }),
    })

    const res = await PATCH(req({ status: "confirmed" }), { params: params7 })

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe("Order not found")
    expect(onOrderStatusChange).not.toHaveBeenCalled()
  })

  it("transición válida: actualiza el pedido y dispara el workflow de estado", async () => {
    const updated = { id: 7, status: "confirmed", user_id: "u-1", cashback_credits: 0 }
    const from = mockSupabase({
      orders: ordersTable({ data: CURRENT_ORDER, error: null }, { data: updated, error: null }),
    })
    vi.mocked(onOrderStatusChange).mockResolvedValueOnce([{ channel: "whatsapp" }] as never)

    const res = await PATCH(req({ status: "confirmed" }), { params: params7 })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.order.status).toBe("confirmed")
    expect(body.workflow).toEqual([{ channel: "whatsapp" }])
    // El workflow recibe la transición vieja → nueva
    expect(onOrderStatusChange).toHaveBeenCalledWith(7, "pending", "confirmed")
    // El update solo toca updated_at y status
    const ordersBuilder = from("orders")
    expect(ordersBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "confirmed" })
    )
    expect(ordersBuilder.update.mock.calls[0]![0]).not.toHaveProperty("payment_status")
    // Bitácora admin del cambio de estado
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        action: "order_status_changed",
        orderId: 7,
        detail: "pending → confirmed",
      })
    )
  })

  it("transición a estado final delivered dispara el workflow", async () => {
    const updated = { id: 7, status: "delivered", user_id: "u-1", cashback_credits: 0 }
    mockSupabase({
      orders: ordersTable(
        { data: { ...CURRENT_ORDER, status: "out_for_delivery" }, error: null },
        { data: updated, error: null }
      ),
    })

    const res = await PATCH(req({ status: "delivered" }), { params: params7 })

    expect(res.status).toBe(200)
    expect(onOrderStatusChange).toHaveBeenCalledWith(7, "out_for_delivery", "delivered")
  })

  it("cancelación: marca el pago pendiente como failed y libera la reserva del cupón", async () => {
    const updated = { id: 7, status: "cancelled", payment_status: "failed", user_id: null }
    const coupons = tableBuilder({ data: { id: 3, used_count: 5 }, error: null })
    const from = mockSupabase({
      orders: ordersTable(
        { data: { ...CURRENT_ORDER, status: "confirmed", coupon_code: "DIEZ" }, error: null },
        { data: updated, error: null }
      ),
      coupons,
    })

    const res = await PATCH(req({ status: "cancelled" }), { params: params7 })

    expect(res.status).toBe(200)
    expect(onOrderStatusChange).toHaveBeenCalledWith(7, "confirmed", "cancelled")
    // Pago pendiente → failed al cancelar
    expect(from("orders").update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", payment_status: "failed" })
    )
    // La reserva del cupón se revierte (used_count - 1, condicional)
    expect(coupons.update).toHaveBeenCalledWith({ used_count: 4 })
  })

  it("cancelación sin cupón no toca la tabla coupons", async () => {
    const updated = { id: 7, status: "cancelled", payment_status: "failed", user_id: null }
    const from = mockSupabase({
      orders: ordersTable(
        { data: { ...CURRENT_ORDER, status: "confirmed" }, error: null },
        { data: updated, error: null }
      ),
    })

    const res = await PATCH(req({ status: "cancelled" }), { params: params7 })

    expect(res.status).toBe(200)
    expect(from).not.toHaveBeenCalledWith("coupons")
  })

  it("mismo estado: responde 'Status unchanged' sin update ni workflow", async () => {
    const from = mockSupabase({
      orders: ordersTable({ data: CURRENT_ORDER, error: null }, { data: null, error: null }),
    })

    const res = await PATCH(req({ status: "pending" }), { params: params7 })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message).toBe("Status unchanged")
    expect(body.order).toEqual({ id: 7, status: "pending" })
    expect(from("orders").update).not.toHaveBeenCalled()
    expect(onOrderStatusChange).not.toHaveBeenCalled()
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("confirmación manual de pago con cashback notifica al usuario en su campana", async () => {
    const updated = {
      id: 7,
      status: "pending",
      payment_status: "paid",
      user_id: "u-1",
      cashback_credits: 12.5,
      cashback_tier: "Verde",
    }
    mockSupabase({
      orders: ordersTable({ data: CURRENT_ORDER, error: null }, { data: updated, error: null }),
    })

    const res = await PATCH(req({ payment_status: "paid" }), { params: params7 })

    expect(res.status).toBe(200)
    // Solo cambió el pago: no hay workflow de estado
    expect(onOrderStatusChange).not.toHaveBeenCalled()
    expect(notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-1",
        type: "cashback_credited",
        orderId: 7,
      })
    )
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "order_payment_confirmed", orderId: 7 })
    )
  })

  it("un error del workflow no rompe la respuesta (non-blocking)", async () => {
    const updated = { id: 7, status: "confirmed", user_id: null, cashback_credits: 0 }
    mockSupabase({
      orders: ordersTable({ data: CURRENT_ORDER, error: null }, { data: updated, error: null }),
    })
    vi.mocked(onOrderStatusChange).mockRejectedValueOnce(new Error("twilio caído"))

    const res = await PATCH(req({ status: "confirmed" }), { params: params7 })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.workflow).toEqual([])
  })
})
