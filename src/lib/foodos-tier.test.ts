import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Capa de servidor de entitlements: lectura de órdenes, overrides y el gate
 * que protegen las acciones premium. La lógica pura ya está cubierta en
 * `foodos-entitlements.test.ts`; aquí se prueba el cableado con la base.
 */

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
  getServerClient: vi.fn(),
  getSessionUser: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}))

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.getServiceClient,
}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.getServerClient,
}))
vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
  FoodosFeatureLockedError,
  getMyEntitlements,
  getRestaurantEntitlements,
  requireFoodosFeature,
} from "./foodos-tier"

/** Semana ISO de referencia: 2026-W05 (lunes 2026-01-26). */
const NOW = new Date("2026-01-27T18:00:00Z")

/** Query builder falso: encadenable y `await`-able como el de supabase-js. */
function query(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const method of ["select", "eq", "neq", "gte", "order", "limit"]) {
    builder[method] = () => builder
  }
  const resolved = { data: result.data ?? null, error: result.error ?? null }
  builder.maybeSingle = async () => resolved
  builder.single = async () => resolved
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolved).then(resolve)
  return builder
}

/**
 * Service client falso. `tables` mapea nombre de tabla a la respuesta de su
 * consulta; `orders` puede ser una función para variar por test.
 */
function serviceClient(tables: {
  restaurant?: { data?: unknown; error?: unknown }
  orders?: { data?: unknown; error?: unknown }
  override?: { data?: unknown; error?: unknown }
}) {
  return {
    from: (table: string) => {
      if (table === "foodos_restaurants") {
        return query({ error: null, ...tables.restaurant })
      }
      if (table === "orders") return query({ error: null, ...tables.orders })
      if (table === "foodos_entitlement_overrides") {
        return query({ error: null, ...(tables.override ?? { data: null }) })
      }
      throw new Error(`tabla inesperada: ${table}`)
    },
  }
}

/**
 * Órdenes pagadas que califican `weeks` semanas de enero 2026 (los lunes
 * 5, 12, 19 y 26 caen dentro del mes, así que las 4 cuentan).
 */
function qualifyingOrders(weeks: number, perWeek = 3000) {
  const mondayOf = (weekIndex: number) =>
    new Date(Date.UTC(2026, 0, 5 + weekIndex * 7, 18, 0, 0)).toISOString()
  return Array.from({ length: weeks }, (_, i) => ({
    created_at: mondayOf(i),
    total: perWeek,
  }))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  mocks.isSupabaseConfigured.mockReturnValue(true)
  mocks.getServerClient.mockImplementation(async () => ({
    auth: { getUser: mocks.getSessionUser },
  }))
})

describe("getRestaurantEntitlements", () => {
  it("sin credenciales de service role devuelve el estado vacío", async () => {
    mocks.getServiceClient.mockRejectedValue(new Error("missing env"))
    const state = await getRestaurantEntitlements("rest-1")
    expect(state.tier).toBe("Verde")
    expect(state.available).toEqual([])
    expect(state.locked.length).toBeGreaterThan(0)
  })

  it("restaurante inexistente devuelve el estado vacío", async () => {
    mocks.getServiceClient.mockResolvedValue(
      serviceClient({ restaurant: { data: null } })
    )
    const state = await getRestaurantEntitlements("rest-1")
    expect(state.tier).toBe("Verde")
    expect(state.earnedTier).toBe("Verde")
  })

  it("sin compras el dueño se queda en Verde", async () => {
    mocks.getServiceClient.mockResolvedValue(
      serviceClient({
        restaurant: { data: { user_id: "user-1" } },
        orders: { data: [] },
      })
    )
    const state = await getRestaurantEntitlements("rest-1")
    expect(state.tier).toBe("Verde")
    expect(state.weekSpend).toBe(0)
  })

  it("dos semanas calificadas abren Plata y su marketing", async () => {
    mocks.getServiceClient.mockResolvedValue(
      serviceClient({
        restaurant: { data: { user_id: "user-1" } },
        orders: { data: qualifyingOrders(2) },
      })
    )
    const state = await getRestaurantEntitlements("rest-1")
    expect(state.tier).toBe("Plata")
    expect(state.available).toContain("marketing_ia")
    // Flotilla es de Oro: sigue cerrada.
    expect(state.locked).toContain("flotilla")
    expect(state.nextTier).toBe("Oro")
  })

  it("cuatro semanas calificadas abren Diamante completo", async () => {
    mocks.getServiceClient.mockResolvedValue(
      serviceClient({
        restaurant: { data: { user_id: "user-1" } },
        orders: { data: qualifyingOrders(4) },
      })
    )
    const state = await getRestaurantEntitlements("rest-1")
    expect(state.tier).toBe("Diamante")
    expect(state.locked).toEqual([])
    expect(state.nextTier).toBeNull()
  })

  it("un override vigente de admin gana sobre las compras", async () => {
    mocks.getServiceClient.mockResolvedValue(
      serviceClient({
        restaurant: { data: { user_id: "user-1" } },
        orders: { data: [] },
        override: { data: { tier: "Oro", expires_at: "2026-03-01T00:00:00Z" } },
      })
    )
    const state = await getRestaurantEntitlements("rest-1")
    expect(state.tier).toBe("Oro")
    expect(state.earnedTier).toBe("Verde")
    expect(state.overridden).toBe(true)
  })

  it("un override vencido se ignora", async () => {
    mocks.getServiceClient.mockResolvedValue(
      serviceClient({
        restaurant: { data: { user_id: "user-1" } },
        orders: { data: qualifyingOrders(2) },
        override: { data: { tier: "Diamante", expires_at: "2026-01-01T00:00:00Z" } },
      })
    )
    const state = await getRestaurantEntitlements("rest-1")
    expect(state.tier).toBe("Plata")
    expect(state.overridden).toBe(false)
  })

  it("un error al leer órdenes no rompe: cae a Verde", async () => {
    mocks.getServiceClient.mockResolvedValue(
      serviceClient({
        restaurant: { data: { user_id: "user-1" } },
        orders: { data: null, error: { message: "boom" } },
      })
    )
    const state = await getRestaurantEntitlements("rest-1")
    expect(state.tier).toBe("Verde")
  })
})

describe("getMyEntitlements", () => {
  // Invariante de render: sin Supabase configurado (dev local, preview sin
  // secrets) los layouts del panel tienen que degradar, no lanzar.
  it("sin Supabase configurado degrada a Verde sin abrir el cliente", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false)

    const state = await getMyEntitlements()

    expect(state.tier).toBe("Verde")
    expect(state.earnedTier).toBe("Verde")
    expect(mocks.getServerClient).not.toHaveBeenCalled()
  })

  it("sin sesión degrada a Verde", async () => {
    mocks.getSessionUser.mockResolvedValue({ data: { user: null } })

    const state = await getMyEntitlements()

    expect(mocks.getServerClient).toHaveBeenCalled()
    expect(state.tier).toBe("Verde")
    expect(mocks.getServiceClient).not.toHaveBeenCalled()
  })
})

describe("requireFoodosFeature", () => {
  it("sin sesión no deja pasar una capacidad premium", async () => {
    mocks.getSessionUser.mockResolvedValue({ data: { user: null } })
    await expect(requireFoodosFeature("marketing_ia")).rejects.toBeInstanceOf(
      FoodosFeatureLockedError
    )
  })

  it("describe el bloqueo con capacidad, nivel requerido y nivel actual", async () => {
    mocks.getSessionUser.mockResolvedValue({ data: { user: null } })
    const err = await requireFoodosFeature("flotilla").catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FoodosFeatureLockedError)
    const locked = err as FoodosFeatureLockedError
    expect(locked.code).toBe("FOODOS_FEATURE_LOCKED")
    expect(locked.feature).toBe("flotilla")
    expect(locked.requiredTier).toBe("Oro")
    expect(locked.currentTier).toBe("Verde")
  })

  it("el error es serializable a un objeto plano (lo cruza el límite RSC)", () => {
    const err = new FoodosFeatureLockedError("mesero_ia", "Diamante", "Plata")
    expect(JSON.parse(JSON.stringify(err))).toMatchObject({
      code: "FOODOS_FEATURE_LOCKED",
      feature: "mesero_ia",
      requiredTier: "Diamante",
      currentTier: "Plata",
    })
  })
})
