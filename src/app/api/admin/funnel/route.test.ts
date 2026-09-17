import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
// El default vive en la factory (como en api/orders/[id]/status/route.test.ts):
// así el caso admin no necesita construir un User completo de Supabase.
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn(async () => ({
    user: { id: "admin-1", email: "admin@resurte.mx" },
    response: null,
  })),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { NextResponse } from "next/server"
import { GET } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logger } from "@/lib/logger"

interface TableResult {
  data?: unknown
  error?: unknown
}

/**
 * Builder PostgREST chainable y awaitable: la ruta encadena select/eq/in/gte y
 * espera el resultado con `await` (sin .single()), igual que en
 * src/app/api/orders/[id]/status/route.test.ts.
 */
function tableBuilder(result: TableResult = { data: null, error: null }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ["select", "eq", "in", "gte", "lte", "is", "not", "order", "limit"]) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }
  builder.then = vi.fn((resolve: (value: unknown) => void) => resolve(result))
  return builder
}

type Builder = ReturnType<typeof tableBuilder>

function mockSupabase(tables: Record<string, Builder> = {}) {
  const from = vi.fn((table: string) => tables[table] ?? tableBuilder())
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return from
}

function req(query = "days=30") {
  return new Request(`http://localhost/api/admin/funnel?${query}`)
}

const ORDERS = [
  { id: 1, status: "pending", payment_status: "paid", payment_method: "card", utm_source: "meta" },
  { id: 2, status: "pending", payment_status: "pending", payment_method: "card", utm_source: "meta" },
  {
    id: 3,
    status: "pending",
    payment_status: "pending",
    payment_method: "cash_on_delivery",
    utm_source: null,
  },
]

describe("GET /api/admin/funnel", () => {
  beforeEach(() => {
    // clearAllMocks conserva la implementación de la factory (el admin por defecto).
    vi.clearAllMocks()
  })

  it("401 cuando no hay sesión autenticada", async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({
      user: null,
      response: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    })

    const res = await GET(req())

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

    const res = await GET(req())

    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("200 con el funnel, take-rates, toques y desglose UTM", async () => {
    const logs = tableBuilder({
      data: [
        { email_type: "abandoned_cart" },
        { email_type: "abandoned_cart" },
        { email_type: "abandoned_cart_48h" },
      ],
      error: null,
    })
    mockSupabase({
      orders: tableBuilder({ data: ORDERS, error: null }),
      order_items: tableBuilder({ data: [{ order_id: 1 }], error: null }),
      order_upsells: tableBuilder({ data: [], error: null }),
      email_logs: logs,
    })

    const res = await GET(req())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.days).toBe(30)
    expect(body.funnel.ordersCreated).toBe(3)
    expect(body.funnel.ordersPaid).toBe(1)
    // Solo el pedido 2 es abandono real: el 3 es contra entrega.
    expect(body.funnel.pendingAbandoned).toBe(1)
    expect(body.funnel.paidRate).toBeCloseTo(1 / 3)
    expect(body.bumpTakeRate).toBe(1)
    expect(body.upsellTakeRate).toBe(0)
    expect(body.recoveryByTouch).toEqual({ abandoned_cart: 2, abandoned_cart_48h: 1 })
    expect(body.utmBreakdown).toEqual([{ source: "meta", orders: 1 }])
  })

  it("filtra email_logs por sent_at, no por created_at (regresión)", async () => {
    // email_logs no tiene columna created_at: filtrarla así producía 42703 y un
    // 500 que dejaba /admin/conversion en "Error al cargar el funnel".
    const logs = tableBuilder({ data: [], error: null })
    mockSupabase({ email_logs: logs })

    const res = await GET(req())

    expect(res.status).toBe(200)
    expect(logs.gte).toHaveBeenCalledWith("sent_at", expect.any(String))
    expect(logs.gte).not.toHaveBeenCalledWith("created_at", expect.anything())
  })

  it("42703 de utm_source: reintenta sin la columna y degrada a null", async () => {
    const withUtm = tableBuilder({
      data: null,
      error: { code: "42703", message: "column orders.utm_source does not exist" },
    })
    const withoutUtm = tableBuilder({
      data: ORDERS.map(({ utm_source: _utm, ...rest }) => rest),
      error: null,
    })
    let ordersCalls = 0
    const from = vi.fn((table: string) => {
      if (table === "orders") return ordersCalls++ === 0 ? withUtm : withoutUtm
      return tableBuilder()
    })
    vi.mocked(createServiceClient).mockResolvedValue({ from } as never)

    const res = await GET(req())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.utmBreakdown).toBeNull()
    expect(body.funnel.ordersCreated).toBe(3)
    expect(withUtm.select).toHaveBeenCalledWith(expect.stringContaining("utm_source"))
    expect(withoutUtm.select).toHaveBeenCalledWith(
      "id, status, payment_status, payment_method"
    )
  })

  it("500 cuando email_logs devuelve un error real", async () => {
    mockSupabase({
      email_logs: tableBuilder({ data: null, error: { code: "42P01", message: "boom" } }),
    })

    const res = await GET(req())

    expect(res.status).toBe(500)
    // PostgrestError no es una instancia de Error: el mensaje expuesto es genérico.
    const body = await res.json()
    expect(body.error).toBe("Error interno del servidor")
    expect(logger.error).toHaveBeenCalledWith("[ADMIN-FUNNEL] error:", expect.anything())
  })

  it("acota el período al rango 1..90 días", async () => {
    mockSupabase()

    expect((await (await GET(req("days=999"))).json()).days).toBe(90)
    expect((await (await GET(req("days=-5"))).json()).days).toBe(1)
    // days=0 cae al default de 30 por el `|| 30` del parseo.
    expect((await (await GET(req("days=0"))).json()).days).toBe(30)
  })
})
