import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/repurchase-coupon", () => ({ getActivePersonalCoupon: vi.fn() }))
vi.mock("@/lib/reorder-heuristics", () => ({ computeRunningOutProducts: vi.fn(() => []) }))

import {
  getActiveRepurchaseCoupon,
  getMonthlyCashbackProgress,
  getRunningOutProducts,
  getTotalRewards,
  getUserPurchaseHistory,
  getWalletBalance,
  getWalletHistory,
  redeemCredits,
} from "./wallet-actions"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { getActivePersonalCoupon } from "@/lib/repurchase-coupon"
import { computeRunningOutProducts } from "@/lib/reorder-heuristics"

const USER = { id: "user-1", email: "a@b.com" }

/** Builder PostgREST encadenable y "awaitable" que resuelve `result`. */
function chainable(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const builder: Record<string, unknown> = {}
  for (const m of ["select", "eq", "neq", "gt", "gte", "order", "range", "limit", "insert"]) {
    builder[m] = vi.fn().mockReturnValue(builder)
  }
  builder.single = vi.fn().mockResolvedValue(result)
  builder.maybeSingle = vi.fn().mockResolvedValue(result)
  builder.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled)
  return builder
}

/** Cliente con sesión `user` y builders por tabla. */
function clientWith(user: unknown, tables: Record<string, ReturnType<typeof chainable>> = {}) {
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: user ? null : null }) },
    from: vi.fn((table: string) => tables[table] ?? chainable({ data: null, error: null })),
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  return client
}

beforeEach(() => vi.clearAllMocks())

describe("getActiveRepurchaseCoupon", () => {
  it("null sin sesión", async () => {
    clientWith(null)
    await expect(getActiveRepurchaseCoupon()).resolves.toBeNull()
    expect(getActivePersonalCoupon).not.toHaveBeenCalled()
  })

  it("delega en getActivePersonalCoupon con el service client", async () => {
    clientWith(USER)
    const service = { from: vi.fn() }
    vi.mocked(createServiceClient).mockResolvedValue(service as never)
    vi.mocked(getActivePersonalCoupon).mockResolvedValue({ code: "VUELVE-X" } as never)

    await expect(getActiveRepurchaseCoupon()).resolves.toEqual({ code: "VUELVE-X" })
    expect(getActivePersonalCoupon).toHaveBeenCalledWith(service, USER.id)
  })
})

describe("getRunningOutProducts", () => {
  it("[] sin sesión", async () => {
    clientWith(null)
    await expect(getRunningOutProducts()).resolves.toEqual([])
  })

  it("aplana los order_items de las últimas órdenes y aplica la heurística", async () => {
    const orders = chainable({
      data: [
        { created_at: "2026-09-01", order_items: [{ product_id: 1 }, { product_id: 2 }] },
        { created_at: "2026-08-15", order_items: [{ product_id: 1 }] },
      ],
    })
    clientWith(USER, { orders })
    vi.mocked(computeRunningOutProducts).mockReturnValue([
      { product_id: 1, daysSinceLast: 11, avgIntervalDays: 17 },
    ] as never)

    const result = await getRunningOutProducts()
    expect(computeRunningOutProducts).toHaveBeenCalledWith([
      { product_id: 1, purchased_at: "2026-09-01" },
      { product_id: 2, purchased_at: "2026-09-01" },
      { product_id: 1, purchased_at: "2026-08-15" },
    ])
    expect(result).toHaveLength(1)
  })
})

describe("getUserPurchaseHistory", () => {
  it("vacío sin sesión", async () => {
    clientWith(null)
    await expect(getUserPurchaseHistory()).resolves.toEqual({ orders: [], total: 0, hasMore: false })
  })

  it("mapea items con nombre/imagen del producto y fallbacks", async () => {
    const orders = chainable({
      data: [
        {
          id: "o1",
          total: 100,
          order_items: [
            { id: "i1", order_id: "o1", product_id: 7, quantity: 2, unit_price: 50, products: { id: 7, name: "Café", image_url: "img", slug: "cafe" } },
            { id: "i2", order_id: "o1", product_id: 9, quantity: 1, unit_price: 10, products: null },
          ],
        },
      ],
      count: 25,
    })
    clientWith(USER, { orders })

    const { orders: result, total, hasMore } = await getUserPurchaseHistory(0, 10)
    expect(total).toBe(25)
    expect(hasMore).toBe(true)
    expect(result[0]!.items[0]).toMatchObject({ product_name: "Café", product_image: "img" })
    expect(result[0]!.items[1]).toMatchObject({ product_name: "Producto #9", product_image: "" })
  })
})

describe("getWalletBalance", () => {
  it("null sin sesión", async () => {
    clientWith(null)
    await expect(getWalletBalance()).resolves.toBeNull()
  })

  it("devuelve el monedero del usuario", async () => {
    const wallets = chainable({ data: { id: "w1", balance_credits: 1200 } })
    clientWith(USER, { wallets })
    await expect(getWalletBalance()).resolves.toEqual({ id: "w1", balance_credits: 1200 })
  })
})

describe("getWalletHistory", () => {
  it("página vacía sin sesión", async () => {
    clientWith(null)
    await expect(getWalletHistory(2, 10)).resolves.toEqual({
      transactions: [], total: 0, page: 2, pageSize: 10, hasMore: false,
    })
  })

  it("pagina y calcula hasMore", async () => {
    const wallets = chainable({ data: { id: "w1" } })
    const txs = chainable({ data: [{ id: "t1" }, { id: "t2" }], count: 5 })
    clientWith(USER, { wallets, wallet_transactions: txs })

    const page = await getWalletHistory(0, 2)
    expect(page.transactions).toHaveLength(2)
    expect(page.total).toBe(5)
    expect(page.hasMore).toBe(true)

    const last = await getWalletHistory(2, 2)
    expect(last.hasMore).toBe(false)
  })
})

describe("getTotalRewards", () => {
  it("0 sin sesión o sin monedero", async () => {
    clientWith(null)
    await expect(getTotalRewards()).resolves.toBe(0)

    clientWith(USER, { wallets: chainable({ data: null }) })
    await expect(getTotalRewards()).resolves.toBe(0)
  })

  it("suma solo los abonos positivos", async () => {
    const wallets = chainable({ data: { id: "w1" } })
    const txs = chainable({ data: [{ amount: 50 }, { amount: "25.5" }] })
    clientWith(USER, { wallets, wallet_transactions: txs })
    await expect(getTotalRewards()).resolves.toBe(75.5)
    expect(txs.gt).toHaveBeenCalledWith("amount", 0)
  })
})

describe("getMonthlyCashbackProgress", () => {
  function ordersThisMonth(...entries: { day: number; total: number; cashback?: number }[]) {
    const now = new Date()
    return entries.map((e, i) => ({
      created_at: new Date(now.getFullYear(), now.getMonth(), e.day, 12).toISOString(),
      total: e.total,
      cashback_credits: e.cashback ?? 0,
      id: `o${i}`,
    }))
  }

  it("null sin sesión", async () => {
    clientWith(null)
    await expect(getMonthlyCashbackProgress()).resolves.toBeNull()
  })

  it("error de BD → progreso en cero nivel Verde", async () => {
    const orders = chainable({ data: null, error: { message: "boom" } })
    clientWith(USER, { orders })
    await expect(getMonthlyCashbackProgress()).resolves.toEqual({
      weeksWithPurchases: 0,
      currentTier: "Verde",
      currentTierPct: 5,
      totalCashbackThisMonth: 0,
      totalOrdersThisMonth: 0,
      monthlySpend: 0,
      walletBalance: 0,
    })
  })

  it("cuenta semanas calificadas (>= $2,500 por semana ISO) y deriva el nivel", async () => {
    // Días 1, 8 y 15 caen en semanas ISO distintas; la semana del día 15 no califica.
    const orders = chainable({
      data: ordersThisMonth(
        { day: 1, total: 3000, cashback: 150 },
        { day: 8, total: 1000 },
        { day: 8, total: 2000, cashback: 100 }, // misma semana → suma 3000, califica
        { day: 15, total: 100 } // semana sin calificar
      ),
    })
    const wallets = chainable({ data: { balance_credits: 250 } })
    clientWith(USER, { orders, wallets })

    const progress = await getMonthlyCashbackProgress()
    expect(progress).toMatchObject({
      weeksWithPurchases: 2,
      currentTier: "Plata",
      currentTierPct: 10,
      totalCashbackThisMonth: 250,
      totalOrdersThisMonth: 4,
      monthlySpend: 6100,
      walletBalance: 250,
    })
  })
})

describe("redeemCredits", () => {
  function serviceWithRpc(result: { data?: unknown; error?: { message: string } | null }) {
    const rpc = vi.fn().mockResolvedValue(result)
    vi.mocked(createServiceClient).mockResolvedValue({ rpc } as never)
    return rpc
  }

  const SERVICE = { id: "resenas-google", name: "Gestión de Reseñas Google", cost: 2200 }

  it("canje exitoso devuelve nuevo saldo e id de redención", async () => {
    const rpc = serviceWithRpc({
      data: [{ success: true, new_balance: 800, redemption_id: "r1" }],
      error: null,
    })
    const result = await redeemCredits(USER.id, SERVICE)
    expect(result).toEqual({ success: true, newBalance: 800, redemptionId: "r1" })
    expect(rpc).toHaveBeenCalledWith("redeem_service", {
      p_user_id: USER.id,
      p_service_id: SERVICE.id,
      p_service_name: SERVICE.name,
      p_cost: SERVICE.cost,
    })
  })

  it("error del RPC → success false con el mensaje", async () => {
    serviceWithRpc({ data: null, error: { message: "connection lost" } })
    await expect(redeemCredits(USER.id, SERVICE)).resolves.toEqual({
      success: false,
      error: "connection lost",
    })
  })

  it("saldo insuficiente (success false del RPC) → error_msg", async () => {
    serviceWithRpc({ data: [{ success: false, error_msg: "Saldo insuficiente" }], error: null })
    await expect(redeemCredits(USER.id, SERVICE)).resolves.toEqual({
      success: false,
      error: "Saldo insuficiente",
    })
  })
})
