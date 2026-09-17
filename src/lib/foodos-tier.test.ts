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
  getUserRole: vi.fn(),
  getOperatingContext: vi.fn(),
  loadOperatingRestaurantName: vi.fn(),
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
vi.mock("@/lib/roles", () => ({
  getUserRole: mocks.getUserRole,
}))
// El restaurante que se opera lo decide el seam de P14; aquí se controla para
// poder ejercer el camino normal y el de impersonación por separado.
vi.mock("@/lib/foodos-operating", () => ({
  getOperatingContext: mocks.getOperatingContext,
  loadOperatingRestaurantName: mocks.loadOperatingRestaurantName,
}))

import {
  FoodosFeatureLockedError,
  getMyEntitlements,
  getPanelOperatingState,
  getRestaurantEntitlements,
  isCurrentUserAdmin,
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

/**
 * Contexto de operación falso. Por defecto el restaurante propio del usuario y
 * sin impersonación, que es el camino normal; cada test lo ajusta si necesita
 * el camino de P14.
 */
function operating(overrides: Record<string, unknown> = {}) {
  return {
    restaurantId: "rest-1",
    ownerUserId: "user-1",
    client: null,
    impersonating: false,
    actorUserId: "user-1",
    actorEmail: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  mocks.isSupabaseConfigured.mockReturnValue(true)
  // El client con cookies solo resuelve la sesión: el restaurante lo entrega el
  // seam, no una lectura directa por `user_id`.
  mocks.getServerClient.mockImplementation(async () => ({
    auth: { getUser: mocks.getSessionUser },
    from: () => query({ data: { id: "rest-1" }, error: null }),
  }))
  mocks.getOperatingContext.mockResolvedValue(operating())
  // Por defecto no hay sesión de soporte: el banner no se pinta.
  mocks.loadOperatingRestaurantName.mockResolvedValue(null)
  // Por defecto nadie es admin: el camino del restaurantero es el normal.
  mocks.getUserRole.mockResolvedValue(null)
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

  it("mientras un admin impersona resuelve el nivel del restaurante visitado", async () => {
    mocks.getSessionUser.mockResolvedValue({ data: { user: { id: "user-admin" } } })
    mocks.getOperatingContext.mockResolvedValue(
      operating({
        restaurantId: "rest-ajeno",
        ownerUserId: "dueno-2",
        impersonating: true,
      })
    )
    mocks.getServiceClient.mockResolvedValue(
      serviceClient({
        restaurant: { data: { user_id: "dueno-2" } },
        orders: { data: qualifyingOrders(4) },
      })
    )

    const state = await getMyEntitlements()

    // El nivel sale del restaurante visitado, no del admin (que no tiene
    // restaurante propio y por tanto siempre sería Verde).
    expect(state.tier).toBe("Diamante")
    expect(mocks.getServiceClient).toHaveBeenCalled()
  })
})

describe("getPanelOperatingState", () => {
  // El layout del panel necesita el nivel Y el nombre del restaurante visitado
  // en la misma pasada: pedirlos por separado duplicaría el sondeo.
  it("en el camino normal no hay impersonación ni nombre que anunciar", async () => {
    mocks.getSessionUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const state = await getPanelOperatingState()

    expect(state.impersonating).toBe(false)
    expect(state.operatingRestaurantName).toBeNull()
  })

  it("mientras un admin impersona reporta la sesión y el nombre del restaurante", async () => {
    mocks.getSessionUser.mockResolvedValue({ data: { user: { id: "user-admin" } } })
    mocks.getOperatingContext.mockResolvedValue(
      operating({ restaurantId: "rest-ajeno", ownerUserId: "dueno-2", impersonating: true })
    )
    mocks.getServiceClient.mockResolvedValue(
      serviceClient({
        restaurant: { data: { user_id: "dueno-2" } },
        orders: { data: qualifyingOrders(4) },
      })
    )
    mocks.loadOperatingRestaurantName.mockResolvedValue("Taquería Ajena")

    const state = await getPanelOperatingState()

    expect(state.impersonating).toBe(true)
    expect(state.operatingRestaurantName).toBe("Taquería Ajena")
    expect(state.entitlements.tier).toBe("Diamante")
  })

  it("sin Supabase configurado degrada sin abrir el cliente", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false)

    const state = await getPanelOperatingState()

    expect(state.entitlements.tier).toBe("Verde")
    expect(state.impersonating).toBe(false)
    expect(state.operatingRestaurantName).toBeNull()
    expect(mocks.getServerClient).not.toHaveBeenCalled()
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

describe("bypass del administrador de plataforma", () => {
  // El admin no tiene restaurante propio, así que su nivel real siempre es
  // Verde. Sin el bypass no podría ni probar ni dar soporte a las herramientas
  // premium que el restaurantero reporta como rotas.
  it("isCurrentUserAdmin reconoce el rol admin", async () => {
    mocks.getUserRole.mockResolvedValue("admin")
    await expect(isCurrentUserAdmin()).resolves.toBe(true)
  })

  it("isCurrentUserAdmin no confunde a un restaurantero con un admin", async () => {
    mocks.getUserRole.mockResolvedValue("cliente")
    await expect(isCurrentUserAdmin()).resolves.toBe(false)
  })

  it("si la verificación de rol falla degrada a no-admin en vez de romper", async () => {
    mocks.getUserRole.mockRejectedValue(new Error("boom"))
    await expect(isCurrentUserAdmin()).resolves.toBe(false)
  })

  it("un admin en Verde pasa una capacidad de Diamante", async () => {
    mocks.getUserRole.mockResolvedValue("admin")
    mocks.getSessionUser.mockResolvedValue({ data: { user: { id: "user-admin" } } })
    mocks.getServiceClient.mockResolvedValue(
      serviceClient({
        restaurant: { data: { user_id: "user-admin" } },
        orders: { data: [] },
      })
    )

    const state = await requireFoodosFeature("comandero")

    expect(state.tier).toBe("Verde")
  })

  it("un restaurantero en Verde sigue bloqueado en Diamante", async () => {
    mocks.getUserRole.mockResolvedValue("cliente")
    mocks.getSessionUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
    mocks.getServiceClient.mockResolvedValue(
      serviceClient({
        restaurant: { data: { user_id: "user-1" } },
        orders: { data: [] },
      })
    )

    await expect(requireFoodosFeature("comandero")).rejects.toBeInstanceOf(
      FoodosFeatureLockedError
    )
  })

  it("el camino del restaurantero no paga la verificación de rol", async () => {
    // Si el nivel alcanza, `isCurrentUserAdmin` no se consulta.
    mocks.getSessionUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
    mocks.getServiceClient.mockResolvedValue(
      serviceClient({
        restaurant: { data: { user_id: "user-1" } },
        orders: { data: qualifyingOrders(4) },
      })
    )

    await requireFoodosFeature("comandero")

    expect(mocks.getUserRole).not.toHaveBeenCalled()
  })
})

describe("impersonación (P14): manda el nivel real del restaurante", () => {
  // P14 sirve para ver exactamente lo que ve el dueño. Si el admin conservara
  // su bypass mientras impersona, el modo soporte mentiría: reportaría una
  // herramienta como disponible donde el dueño la tiene bloqueada.
  it("un admin impersonando un restaurante en Verde NO recibe el bypass", async () => {
    mocks.getUserRole.mockResolvedValue("admin")
    mocks.getSessionUser.mockResolvedValue({ data: { user: { id: "user-admin" } } })
    mocks.getOperatingContext.mockResolvedValue(
      operating({
        restaurantId: "rest-ajeno",
        ownerUserId: "dueno-2",
        impersonating: true,
      })
    )
    mocks.getServiceClient.mockResolvedValue(
      serviceClient({
        restaurant: { data: { user_id: "dueno-2" } },
        orders: { data: [] },
      })
    )

    await expect(requireFoodosFeature("comandero")).rejects.toBeInstanceOf(
      FoodosFeatureLockedError
    )
    // Ni se consulta el rol: al impersonar no hay privilegio que aplicar.
    expect(mocks.getUserRole).not.toHaveBeenCalled()
  })

  it("un admin impersonando un restaurante Diamante ve la capacidad habilitada", async () => {
    mocks.getUserRole.mockResolvedValue("admin")
    mocks.getSessionUser.mockResolvedValue({ data: { user: { id: "user-admin" } } })
    mocks.getOperatingContext.mockResolvedValue(
      operating({
        restaurantId: "rest-ajeno",
        ownerUserId: "dueno-2",
        impersonating: true,
      })
    )
    mocks.getServiceClient.mockResolvedValue(
      serviceClient({
        restaurant: { data: { user_id: "dueno-2" } },
        orders: { data: qualifyingOrders(4) },
      })
    )

    await expect(requireFoodosFeature("comandero")).resolves.toMatchObject({
      tier: "Diamante",
    })
  })

  it("al terminar la impersonación el admin recupera su bypass", async () => {
    mocks.getUserRole.mockResolvedValue("admin")
    mocks.getSessionUser.mockResolvedValue({ data: { user: { id: "user-admin" } } })
    mocks.getServiceClient.mockResolvedValue(
      serviceClient({
        restaurant: { data: { user_id: "user-admin" } },
        orders: { data: [] },
      })
    )

    // `beforeEach` deja el seam sin impersonar: el mismo admin en Verde pasa.
    await expect(requireFoodosFeature("comandero")).resolves.toMatchObject({
      tier: "Verde",
    })
  })
})
