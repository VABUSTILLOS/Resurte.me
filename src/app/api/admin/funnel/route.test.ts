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
  for (const method of ["select", "eq", "in", "gte", "lt", "lte", "is", "not", "order", "limit"]) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }
  builder.then = vi.fn((resolve: (value: unknown) => void) => resolve(result))
  return builder
}

type Builder = ReturnType<typeof tableBuilder>

const RPC_MISSING = { code: "42883", message: "function admin_conversion_funnel does not exist" }

/** Ventana tal como la devuelve `admin_conversion_funnel` (migración 00141). */
function rpcWindow(overrides: Record<string, unknown> = {}) {
  return {
    created: 10,
    byOutcome: [
      { outcome: "paid", count: 4, amount: 1600 },
      { outcome: "pending", count: 3, amount: 900 },
      { outcome: "failed", count: 1, amount: 300 },
      { outcome: "cancelled", count: 1, amount: 300 },
      { outcome: "other", count: 1, amount: 300 },
    ],
    byMethod: [
      { method: "card", created: 6, paid: 3, failed: 1, pending: 1, revenue: 1200 },
      { method: "oxxo", created: 4, paid: 1, failed: 0, pending: 2, revenue: 400 },
    ],
    byUtm: [
      { source: "meta", created: 7, paid: 3, failed: 1, revenue: 1200 },
      { source: "google", created: 3, paid: 1, failed: 0, revenue: 400 },
    ],
    ...overrides,
  }
}

const PREVIOUS_WINDOW = rpcWindow({
  created: 8,
  byOutcome: [
    { outcome: "paid", count: 2, amount: 800 },
    { outcome: "pending", count: 3, amount: 900 },
    { outcome: "failed", count: 2, amount: 600 },
    { outcome: "cancelled", count: 1, amount: 300 },
    { outcome: "other", count: 0, amount: 0 },
  ],
  // Cuadra con el embudo previo: 8 creados y 2 pagados repartidos entre
  // card/oxxo (4/1 y 4/1) y entre meta/google (6/2 y 2/0).
  byMethod: [
    { method: "card", created: 4, paid: 1, failed: 1, pending: 2, revenue: 400 },
    { method: "oxxo", created: 4, paid: 1, failed: 1, pending: 1, revenue: 400 },
  ],
  byUtm: [
    { source: "meta", created: 6, paid: 2, failed: 1, revenue: 800 },
    { source: "google", created: 2, paid: 0, failed: 1, revenue: 0 },
  ],
})

function mockSupabase(
  tables: Record<string, Builder> = {},
  rpcResult: TableResult = { data: null, error: RPC_MISSING },
) {
  const from = vi.fn((table: string) => tables[table] ?? tableBuilder())
  const rpc = vi.fn(async () => rpcResult)
  vi.mocked(createServiceClient).mockResolvedValue({ from, rpc } as never)
  return { from, rpc }
}

/** RPC disponible: la ruta debe preferir el agregado de Postgres. */
function mockRpc(payload: unknown, tables: Record<string, Builder> = {}) {
  return mockSupabase(tables, { data: payload, error: null })
}

function req(query = "days=30") {
  return new Request(`http://localhost/api/admin/funnel?${query}`)
}

/** Filas de `orders` del periodo actual (todas dentro de la ventana). */
function orderRows(createdAt = new Date(Date.now() - 60_000).toISOString()) {
  const created_at = createdAt
  return [
    { id: 1, status: "pending", payment_status: "paid", payment_method: "card", total: 400, created_at },
    { id: 2, status: "pending", payment_status: "pending", payment_method: "card", total: 300, created_at },
    {
      id: 3,
      status: "pending",
      payment_status: "pending",
      payment_method: "cash_on_delivery",
      total: 300,
      created_at,
    },
  ]
}

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

  it("usa el agregado del RPC en vez de contar las filas traídas", async () => {
    const { rpc } = mockRpc(
      { current: rpcWindow(), previous: PREVIOUS_WINDOW },
      {
        orders: tableBuilder({ data: orderRows(), error: null }),
        order_items: tableBuilder({ data: [{ order_id: 1 }], error: null }),
        order_upsells: tableBuilder({ data: [], error: null }),
        email_logs: tableBuilder({ data: [], error: null }),
      }
    )

    const res = await GET(req())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(rpc).toHaveBeenCalledWith(
      "admin_conversion_funnel",
      expect.objectContaining({
        p_since: expect.any(String),
        p_until: expect.any(String),
        p_prev_since: expect.any(String),
        p_prev_until: expect.any(String),
      })
    )
    expect(body.source).toBe("rpc")
    expect(body.days).toBe(30)
    // El embudo es el del RPC (created 10), no el de las 3 filas de detalle.
    expect(body.funnel.created).toBe(10)
    expect(body.funnel.paid).toBe(4)
    expect(body.funnel.paidRate).toBe(40)
    expect(body.funnel.reconciled).toBe(true)
    expect(body.funnel.revenue).toBe(1600)
    expect(body.funnel.avgTicket).toBe(400)
    expect(body.outcomes).toHaveLength(5)
    // Orden por volumen: card (6) antes que oxxo (4).
    expect(body.methods.map((m: { method: string }) => m.method)).toEqual(["card", "oxxo"])
    // Orden por ingresos: meta (1200) antes que google (400).
    expect(body.utm.map((u: { source: string }) => u.source)).toEqual(["meta", "google"])
    expect(body.degraded).toEqual([])
  })

  it("compara contra el periodo anterior de la misma ventana", async () => {
    mockRpc(
      { current: rpcWindow(), previous: PREVIOUS_WINDOW },
      { orders: tableBuilder({ data: orderRows(), error: null }) }
    )

    const body = await (await GET(req())).json()

    expect(body.comparison).not.toBeNull()
    expect(body.comparison.previous.created).toBe(8)
    expect(body.comparison.created.current).toBe(10)
    expect(body.comparison.created.previous).toBe(8)
    // 40% actual contra 25% anterior: +15 puntos porcentuales.
    expect(body.comparison.paidRateDeltaPp).toBe(15)
  })

  it("compara el desglose por método y por origen, no solo el total", async () => {
    mockRpc(
      { current: rpcWindow(), previous: PREVIOUS_WINDOW },
      { orders: tableBuilder({ data: orderRows(), error: null }) }
    )

    const body = await (await GET(req())).json()

    // card: 6 creados / 3 pagados (50%) contra 4 / 1 (25%).
    expect(body.methodComparison.card.created).toEqual({
      current: 6,
      previous: 4,
      deltaPct: 50,
      direction: "up",
    })
    expect(body.methodComparison.card.paidRateDeltaPp).toBe(25)
    // oxxo: mismo volumen y misma tasa (25%) en los dos periodos.
    expect(body.methodComparison.oxxo.created.deltaPct).toBe(0)
    expect(body.methodComparison.oxxo.paidRateDeltaPp).toBe(0)

    // meta: 7 / 3 (43%) contra 6 / 2 (33%) → +10 pp.
    expect(body.utmComparison.meta.paidRateDeltaPp).toBe(10)
    expect(body.utmComparison.meta.created.deltaPct).toBe(16.7)
    // google: 3 / 1 (33%) contra 2 / 0 (0%).
    expect(body.utmComparison.google.paidRateDeltaPp).toBe(33)
  })

  it("marca 'sin base' un método u origen que no existía antes, sin inventar 0%", async () => {
    mockRpc(
      { current: rpcWindow(), previous: rpcWindow({ byMethod: [], byUtm: [] }) },
      { orders: tableBuilder({ data: orderRows(), error: null }) }
    )

    const body = await (await GET(req())).json()

    // compareMetric deja deltaPct null con base cero: la UI dice "sin base".
    expect(body.methodComparison.card.created.deltaPct).toBeNull()
    expect(body.methodComparison.card.paidRateDeltaPp).toBeNull()
    expect(body.utmComparison.meta.created.deltaPct).toBeNull()
  })

  it("declara la comparación como no disponible si el RPC no devuelve ventana previa", async () => {
    mockRpc(
      { current: rpcWindow(), previous: null },
      { orders: tableBuilder({ data: orderRows(), error: null }) }
    )

    const body = await (await GET(req())).json()

    // Sin periodo anterior no hay desglose comparable que mostrar.
    expect(body.methodComparison).toBeNull()
    expect(body.utmComparison).toBeNull()
  })

  it("compara los desgloses también en el respaldo en JS", async () => {
    const now = Date.now()
    const rows = [
      { id: 1, status: "pending", payment_status: "paid", payment_method: "card", total: 100, created_at: new Date(now - 1000).toISOString(), utm_source: "meta" },
      { id: 2, status: "pending", payment_status: "paid", payment_method: "card", total: 100, created_at: new Date(now - 2000).toISOString(), utm_source: "meta" },
      // Periodo anterior (más de 30 días atrás, dentro de los 60 de la ventana previa).
      { id: 3, status: "pending", payment_status: "failed", payment_method: "card", total: 100, created_at: new Date(now - 40 * 86400000).toISOString(), utm_source: "meta" },
      { id: 4, status: "pending", payment_status: "pending", payment_method: "card", total: 100, created_at: new Date(now - 41 * 86400000).toISOString(), utm_source: "meta" },
    ]
    mockSupabase({ orders: tableBuilder({ data: rows, error: null }) })

    const body = await (await GET(req())).json()

    expect(body.source).toBe("fallback")
    // 100% pagado contra 0%: la comparación por método y por origen la replica
    // el motor en JS, no solo el RPC.
    expect(body.comparison.paidRateDeltaPp).toBe(100)
    expect(body.methodComparison.card.paidRateDeltaPp).toBe(100)
    expect(body.utmComparison.meta.paidRateDeltaPp).toBe(100)
    expect(body.degraded).not.toContain("utm")
  })

  it("omite la comparación en el respaldo cuando el detalle viene recortado", async () => {
    // 2000 filas es el tope: el corte pudo llevarse pedidos de cualquiera de
    // los dos periodos, así que una caída sería inventada.
    const created_at = new Date().toISOString()
    const rows = Array.from({ length: 2000 }, (_, i) => ({
      id: i + 1,
      status: "pending",
      payment_status: "paid",
      payment_method: "card",
      total: 100,
      created_at,
      utm_source: "meta",
    }))
    mockSupabase({ orders: tableBuilder({ data: rows, error: null }) })

    const body = await (await GET(req())).json()

    expect(body.detailTruncated).toBe(true)
    expect(body.comparison).toBeNull()
    expect(body.methodComparison).toBeNull()
    expect(body.utmComparison).toBeNull()
    expect(body.degraded).toContain("comparison")
    // El embudo actual sí se reporta: lo que falta es la base de comparación.
    expect(body.funnel.created).toBe(2000)
  })

  it("degrada a 'comparison' si el RPC no devuelve ventana previa", async () => {
    mockRpc(
      { current: rpcWindow(), previous: null },
      { orders: tableBuilder({ data: orderRows(), error: null }) }
    )

    const body = await (await GET(req())).json()

    expect(body.comparison).toBeNull()
    expect(body.degraded).toContain("comparison")
    // El embudo actual sí se reporta: la comparación degrada sola.
    expect(body.funnel.created).toBe(10)
  })

  it("cae al motor JS cuando el RPC no está aplicado y lo anuncia", async () => {
    mockSupabase({ orders: tableBuilder({ data: orderRows(), error: null }) })

    const res = await GET(req())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe("fallback")
    expect(body.degraded).toEqual(expect.arrayContaining(["funnel", "outcomes", "methods"]))
    // El embudo sale ahora de las filas de detalle: 3 creados, 1 pagado.
    expect(body.funnel.created).toBe(3)
    expect(body.funnel.paid).toBe(1)
    // Solo el pedido 2 es abandono real: el 3 es contra entrega.
    expect(body.funnel.pending).toBe(1)
    expect(body.funnel.reconciled).toBe(true)
    expect(logger.warn).toHaveBeenCalled()
  })

  it("filtra email_logs por sent_at, no por created_at (regresión)", async () => {
    // email_logs no tiene columna created_at: filtrarla así producía 42703 y un
    // 500 que dejaba /admin/conversion en "Error al cargar el funnel".
    const logs = tableBuilder({ data: [], error: null })
    mockRpc(
      { current: rpcWindow(), previous: PREVIOUS_WINDOW },
      { orders: tableBuilder({ data: orderRows(), error: null }), email_logs: logs }
    )

    const res = await GET(req())

    expect(res.status).toBe(200)
    expect(logs.gte).toHaveBeenCalledWith("sent_at", expect.any(String))
    expect(logs.gte).not.toHaveBeenCalledWith("created_at", expect.anything())
  })

  it("cuenta la recuperación por toque sin inventar tasa sin denominador", async () => {
    const logs = tableBuilder({
      data: [
        { email_type: "abandoned_cart", order_id: 1 },
        { email_type: "abandoned_cart", order_id: 2 },
        { email_type: "abandoned_cart_48h", order_id: 1 },
      ],
      error: null,
    })
    mockRpc(
      { current: rpcWindow(), previous: PREVIOUS_WINDOW },
      { orders: tableBuilder({ data: orderRows(), error: null }), email_logs: logs }
    )

    const body = await (await GET(req())).json()

    const touch1 = body.recovery.find((r: { type: string }) => r.type === "abandoned_cart")
    expect(touch1.sent).toBe(2)
    expect(touch1.contacted).toBe(2)
    // De los contactados solo el pedido 1 acabó pagado: 1/2.
    expect(touch1.recoveredOrders).toBe(1)
    expect(touch1.rate).toBe(50)
    const touch3 = body.recovery.find((r: { type: string }) => r.type === "abandoned_cart_48h")
    expect(touch3.rate).toBe(100)
  })

  it("declara la recuperación como no disponible cuando email_logs falla", async () => {
    mockRpc(
      { current: rpcWindow(), previous: PREVIOUS_WINDOW },
      {
        orders: tableBuilder({ data: orderRows(), error: null }),
        email_logs: tableBuilder({ data: null, error: { code: "42P01", message: "boom" } }),
      }
    )

    const res = await GET(req())

    // Una sección rota no tumba la respuesta.
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.recovery).toBeNull()
    expect(body.degraded).toContain("recovery")
    expect(logger.error).toHaveBeenCalled()
  })

  it("declara la recuperación recortada al topar con el límite de correos", async () => {
    const logs = tableBuilder({
      data: Array.from({ length: 2000 }, (_, i) => ({
        email_type: "abandoned_cart",
        order_id: i + 1,
      })),
      error: null,
    })
    mockRpc(
      { current: rpcWindow(), previous: PREVIOUS_WINDOW },
      { orders: tableBuilder({ data: orderRows(), error: null }), email_logs: logs }
    )

    const body = await (await GET(req())).json()

    // La tasa por toque puede quedar corta: se avisa en vez de publicarla como
    // si fuera el total.
    expect(body.recoveryTruncated).toBe(true)
    expect(logs.limit).toHaveBeenCalledWith(2000)
  })

  it("arma la tendencia diaria con el mismo detalle, sin consulta extra", async () => {
    mockRpc(
      { current: rpcWindow(), previous: PREVIOUS_WINDOW },
      { orders: tableBuilder({ data: orderRows(), error: null }), email_logs: tableBuilder({ data: [], error: null }) }
    )

    const body = await (await GET(req())).json()

    // Un punto por día local que toca la ventana móvil (31 días), incluidos los
    // días sin pedidos: un hueco en la gráfica se ve igual que un cero.
    expect(body.trendUnavailable).toBeNull()
    expect(body.trend).toHaveLength(31)
    expect(body.trend[0].created).toBe(0)
    // La serie sale del detalle leído, no del agregado del RPC: por eso mismo
    // se apaga cuando esa lectura se recorta (el titular sigue siendo el RPC).
    const sum = (key: "created" | "paid" | "pending" | "revenue") =>
      body.trend.reduce((s: number, p: Record<string, number>) => s + (p[key] ?? 0), 0)
    expect(sum("created")).toBe(3)
    expect(sum("paid")).toBe(1)
    expect(sum("pending")).toBe(1)
    expect(sum("revenue")).toBe(400)
    // Los tres pedidos del fixture son del mismo día, así que caen en un solo
    // punto (el día local de `created_at`, no el día UTC del borde).
    const busy = body.trend.filter((p: { created: number }) => p.created > 0)
    expect(busy).toHaveLength(1)
    expect(busy[0]).toMatchObject({ created: 3, paid: 1, pending: 1, revenue: 400 })
  })

  it("apaga la tendencia si el detalle viene recortado, en vez de dibujar un alza falsa", async () => {
    // Un corte sobre una lectura ordenada por fecha descendente deja completos
    // los días recientes y vacíos los primeros: graficarla inventaría un
    // crecimiento que no ocurrió.
    const created_at = new Date().toISOString()
    const rows = Array.from({ length: 2000 }, (_, i) => ({
      id: i + 1,
      status: "pending",
      payment_status: "paid",
      payment_method: "card",
      total: 100,
      created_at,
    }))
    mockRpc(
      { current: rpcWindow(), previous: PREVIOUS_WINDOW },
      { orders: tableBuilder({ data: rows, error: null }) }
    )

    const body = await (await GET(req())).json()

    expect(body.detailTruncated).toBe(true)
    expect(body.trend).toBeNull()
    expect(body.trendUnavailable).toBe("truncated")
    // El resto del reporte sigue vivo.
    expect(body.funnel.created).toBe(10)
  })

  it("apaga la tendencia si falla la lectura del detalle y lo explica", async () => {
    mockRpc(
      { current: rpcWindow(), previous: PREVIOUS_WINDOW },
      { orders: tableBuilder({ data: null, error: { code: "42P01", message: "boom" } }) }
    )

    const res = await GET(req())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.trend).toBeNull()
    expect(body.trendUnavailable).toBe("detailError")
  })

  it("también arma la tendencia en el respaldo en JS", async () => {
    mockSupabase({ orders: tableBuilder({ data: orderRows(), error: null }) })

    const body = await (await GET(req())).json()

    expect(body.source).toBe("fallback")
    expect(body.trendUnavailable).toBeNull()
    expect(body.trend).toHaveLength(31)
    // En el respaldo el titular y la serie salen del mismo detalle, así que aquí
    // sí cuadran exactamente: si se separan, la gráfica contradice la tarjeta.
    const sum = (key: "created" | "paid" | "revenue") =>
      body.trend.reduce((s: number, p: Record<string, number>) => s + (p[key] ?? 0), 0)
    expect(sum("created")).toBe(body.funnel.created)
    expect(sum("paid")).toBe(body.funnel.paid)
    expect(sum("revenue")).toBe(body.funnel.revenue)
  })

  it("no marca recortes cuando las lecturas caben en sus límites", async () => {
    mockRpc(
      { current: rpcWindow(), previous: PREVIOUS_WINDOW },
      { orders: tableBuilder({ data: orderRows(), error: null }), email_logs: tableBuilder({ data: [], error: null }) }
    )

    const body = await (await GET(req())).json()

    expect(body.detailTruncated).toBe(false)
    expect(body.recoveryTruncated).toBe(false)
    expect(body.takeRateTruncated).toBe(false)
  })
  it("42703 de utm_source: reintenta sin la columna y reporta null, no 'todo directo'", async () => {
    const withUtm = tableBuilder({
      data: null,
      error: { code: "42703", message: "column orders.utm_source does not exist" },
    })
    const withoutUtm = tableBuilder({ data: orderRows(), error: null })
    let ordersCalls = 0
    const from = vi.fn((table: string) => {
      if (table === "orders") return ordersCalls++ === 0 ? withUtm : withoutUtm
      return tableBuilder()
    })
    const rpc = vi.fn(async () => ({ data: null, error: RPC_MISSING }))
    vi.mocked(createServiceClient).mockResolvedValue({ from, rpc } as never)

    const res = await GET(req())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.utm).toBeNull()
    expect(body.degraded).toContain("utm")
    expect(withUtm.select).toHaveBeenCalledWith(expect.stringContaining("utm_source"))
    expect(withoutUtm.select).toHaveBeenCalledWith(
      "id, status, payment_status, payment_method, total, created_at"
    )
    // El detalle sí llegó: el embudo se calcula igual.
    expect(body.funnel.created).toBe(3)
  })

  it("no mide el take-rate sin pagados en el periodo (null, no 0%)", async () => {
    const noPaid = orderRows().map((row) => ({
      ...row,
      payment_status: "pending",
      payment_method: "card",
    }))
    mockRpc(
      { current: rpcWindow(), previous: PREVIOUS_WINDOW },
      { orders: tableBuilder({ data: noPaid, error: null }) }
    )

    const body = await (await GET(req())).json()

    expect(body.bumpTakeRate).toBeNull()
    expect(body.upsellTakeRate).toBeNull()
    // Sin ids pagados la sección no es medible, pero tampoco está rota.
    expect(body.degraded).not.toContain("bumpTakeRate")
    expect(body.degraded).not.toContain("upsellTakeRate")
  })

  it("mide el take-rate de bumps y upsells sobre los pedidos pagados", async () => {
    mockRpc(
      { current: rpcWindow(), previous: PREVIOUS_WINDOW },
      {
        orders: tableBuilder({ data: orderRows(), error: null }),
        order_items: tableBuilder({ data: [{ order_id: 1 }], error: null }),
        order_upsells: tableBuilder({ data: [], error: null }),
      }
    )

    const body = await (await GET(req())).json()

    // Un solo pedido pagado, y lleva bump: 1/1.
    expect(body.bumpTakeRate).toBe(1)
    expect(body.upsellTakeRate).toBe(0)
  })

  it("recorta el take-rate a los primeros mil ids pagados y lo declara", async () => {
    const created_at = new Date().toISOString()
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      id: i + 1,
      status: "pending",
      payment_status: "paid",
      payment_method: "card",
      total: 100,
      created_at,
    }))
    const orderItems = tableBuilder({ data: [{ order_id: 1 }], error: null })
    mockRpc(
      { current: rpcWindow(), previous: PREVIOUS_WINDOW },
      { orders: tableBuilder({ data: rows, error: null }), order_items: orderItems }
    )

    const body = await (await GET(req())).json()

    // La lista viaja en la URL de PostgREST: no puede crecer sin tope.
    expect(body.takeRateTruncated).toBe(true)
    expect(orderItems.in).toHaveBeenCalledWith("order_id", expect.any(Array))
    const [, sentIds] = orderItems.in!.mock.calls[0] ?? []
    expect(sentIds).toHaveLength(1000)
    // 1 de 1000, no 1 de 1001: es una muestra y se declara como tal.
    expect(body.bumpTakeRate).toBe(0.001)
  })

  it("trata una tabla de upsells ausente (42P01) como no medible", async () => {
    mockRpc(
      { current: rpcWindow(), previous: PREVIOUS_WINDOW },
      {
        orders: tableBuilder({ data: orderRows(), error: null }),
        order_items: tableBuilder({ data: [{ order_id: 1 }], error: null }),
        order_upsells: tableBuilder({ data: null, error: { code: "42P01", message: "no existe" } }),
      }
    )

    const body = await (await GET(req())).json()

    expect(body.upsellTakeRate).toBeNull()
    expect(body.degraded).toContain("upsellTakeRate")
    // El bump sí se midió: las secciones degradan por separado.
    expect(body.bumpTakeRate).toBe(1)
  })

  it("acepta solo 7, 30 y 90 días; cualquier otro valor cae a 30", async () => {
    mockRpc({ current: rpcWindow(), previous: PREVIOUS_WINDOW })

    expect((await (await GET(req("days=7"))).json()).days).toBe(7)
    expect((await (await GET(req("days=90"))).json()).days).toBe(90)
    expect((await (await GET(req("days=30"))).json()).days).toBe(30)
    // Solo 7/30/90 son opciones del selector y tienen periodo anterior comparable.
    expect((await (await GET(req("days=999"))).json()).days).toBe(30)
    expect((await (await GET(req("days=-5"))).json()).days).toBe(30)
    expect((await (await GET(req("days=0"))).json()).days).toBe(30)
    expect((await (await GET(req(""))).json()).days).toBe(30)
  })

  it("500 solo ante un fallo fatal, con el mensaje del Error real", async () => {
    vi.mocked(createServiceClient).mockRejectedValueOnce(new Error("boom"))

    const res = await GET(req())

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe("boom")
    expect(logger.error).toHaveBeenCalledWith("[ADMIN-FUNNEL] error:", expect.anything())
  })
})
