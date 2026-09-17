import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Seam de "operar como restaurante" (P14). Es la superficie sensible del
 * cambio: al impersonar se lee y escribe con **service role**, así que la
 * comprobación de admin del seam es la única barrera. Los casos hostiles
 * (cookie sin sesión, cookie con id arbitrario, usuario no-admin) están aquí
 * para que esa barrera no se pueda relajar sin romper un test.
 */

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  cookieValue: undefined as string | undefined,
  requireAuth: vi.fn(),
  logAdminAction: vi.fn(),
}))

vi.mock("@/lib/foodos-admin", () => ({ isCurrentUserAdmin: mocks.isAdmin }))
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}))
vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: mocks.logAdminAction }))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      mocks.cookieValue === undefined ? undefined : { name, value: mocks.cookieValue },
    set: vi.fn(),
  }),
}))

import {
  decideOperatingTarget,
  getOperatingContext,
  getOperatingPickerState,
  loadOperatingRestaurantName,
  OPERATING_COOKIE,
  requireFoodosAuth,
} from "./foodos-operating"

const ADMIN = "2ab1e10b-d577-415d-8040-0895198b8e3c"
const OWN_RESTAURANT = "2ca52320-70df-4427-a06f-edd4da7d5061"
const OTHER_RESTAURANT = "9f1c4d3a-1b2e-4c5d-8e7f-0a1b2c3d4e5f"

/** Query builder falso: encadenable y `await`-able como el de supabase-js. */
function query(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const method of ["select", "eq", "neq", "gte", "order", "limit"]) {
    builder[method] = () => builder
  }
  const resolved = { data: result.data ?? null, error: result.error ?? null }
  builder.maybeSingle = async () => resolved
  builder.single = async () => resolved
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(resolved).then(resolve)
  return builder
}

/** Cliente de cookies falso: el restaurante propio del usuario. */
function ownClient(own: { data?: unknown; error?: unknown }) {
  return { from: () => query(own) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cookieValue = undefined
  mocks.isAdmin.mockResolvedValue(false)
  mocks.createServiceClient.mockResolvedValue({
    from: () => query({ data: { id: OTHER_RESTAURANT, user_id: "otro-dueno" } }),
  })
})

describe("decideOperatingTarget", () => {
  const own = { requestedId: null, isAdmin: false, ownRestaurantId: OWN_RESTAURANT, ownUserId: ADMIN, requested: null }

  it("sin cookie opera el restaurante propio", () => {
    expect(decideOperatingTarget(own)).toEqual({
      restaurantId: OWN_RESTAURANT,
      ownerUserId: ADMIN,
      impersonating: false,
    })
  })

  it("ignora la cookie de un usuario que no es admin", () => {
    const r = decideOperatingTarget({
      ...own,
      requestedId: OTHER_RESTAURANT,
      isAdmin: false,
      requested: { id: OTHER_RESTAURANT, user_id: "otro-dueno" },
    })
    expect(r.impersonating).toBe(false)
    expect(r.restaurantId).toBe(OWN_RESTAURANT)
    expect(r.ownerUserId).toBe(ADMIN)
  })

  it("ignora la cookie cuando el restaurante pedido no existe", () => {
    const r = decideOperatingTarget({
      ...own,
      requestedId: OTHER_RESTAURANT,
      isAdmin: true,
      requested: null,
    })
    expect(r.impersonating).toBe(false)
    expect(r.restaurantId).toBe(OWN_RESTAURANT)
  })

  it("no impersona cuando el admin pide su propio restaurante", () => {
    const r = decideOperatingTarget({
      ...own,
      requestedId: OWN_RESTAURANT,
      isAdmin: true,
      requested: { id: OWN_RESTAURANT, user_id: ADMIN },
    })
    expect(r.impersonating).toBe(false)
    expect(r.restaurantId).toBe(OWN_RESTAURANT)
  })

  it("impersona el restaurante ajeno con su dueño real", () => {
    const r = decideOperatingTarget({
      ...own,
      requestedId: OTHER_RESTAURANT,
      isAdmin: true,
      requested: { id: OTHER_RESTAURANT, user_id: "otro-dueno" },
    })
    expect(r).toEqual({
      restaurantId: OTHER_RESTAURANT,
      ownerUserId: "otro-dueno",
      impersonating: true,
    })
  })

  it("sin restaurante propio ni cookie devuelve contexto vacío", () => {
    expect(
      decideOperatingTarget({ ...own, ownRestaurantId: null })
    ).toEqual({ restaurantId: null, ownerUserId: null, impersonating: false })
  })

  it("un admin sin restaurante propio sí puede impersonar", () => {
    const r = decideOperatingTarget({
      ...own,
      ownRestaurantId: null,
      requestedId: OTHER_RESTAURANT,
      isAdmin: true,
      requested: { id: OTHER_RESTAURANT, user_id: "otro-dueno" },
    })
    expect(r.impersonating).toBe(true)
    expect(r.restaurantId).toBe(OTHER_RESTAURANT)
  })
})

describe("getOperatingContext", () => {
  const user = { id: ADMIN, email: "admin@resurte.me" }

  it("sin cookie no consulta el rol ni crea service role", async () => {
    const client = ownClient({ data: { id: OWN_RESTAURANT } })
    const ctx = await getOperatingContext(client as never, user)

    expect(ctx).toMatchObject({
      restaurantId: OWN_RESTAURANT,
      ownerUserId: ADMIN,
      impersonating: false,
      actorUserId: ADMIN,
      actorEmail: "admin@resurte.me",
    })
    expect(ctx.client).toBe(client)
    expect(mocks.isAdmin).not.toHaveBeenCalled()
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it("cookie con id arbitrario y usuario no-admin: opera lo propio y no toca service role", async () => {
    mocks.cookieValue = OTHER_RESTAURANT
    const client = ownClient({ data: { id: OWN_RESTAURANT } })
    const ctx = await getOperatingContext(client as never, user)

    expect(ctx.impersonating).toBe(false)
    expect(ctx.restaurantId).toBe(OWN_RESTAURANT)
    expect(ctx.ownerUserId).toBe(ADMIN)
    expect(ctx.client).toBe(client)
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it("sin sesión (sin restaurante propio) y con cookie arbitraria no concede nada", async () => {
    mocks.cookieValue = OTHER_RESTAURANT
    const ctx = await getOperatingContext(
      ownClient({ data: null }) as never,
      { id: "anonimo" }
    )

    expect(ctx.restaurantId).toBeNull()
    expect(ctx.ownerUserId).toBeNull()
    expect(ctx.impersonating).toBe(false)
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it("admin con cookie impersona y recibe el cliente de service role", async () => {
    mocks.cookieValue = OTHER_RESTAURANT
    mocks.isAdmin.mockResolvedValue(true)
    const service = {
      from: () =>
        query({ data: { id: OTHER_RESTAURANT, user_id: "otro-dueno" } }),
    }
    mocks.createServiceClient.mockResolvedValue(service)

    const client = ownClient({ data: { id: OWN_RESTAURANT } })
    const ctx = await getOperatingContext(client as never, user)

    expect(ctx).toMatchObject({
      restaurantId: OTHER_RESTAURANT,
      ownerUserId: "otro-dueno",
      impersonating: true,
      actorUserId: ADMIN,
    })
    expect(ctx.client).toBe(service)
  })

  it("descarta una cookie que no es un UUID", async () => {
    mocks.cookieValue = "no-soy-un-uuid"
    const ctx = await getOperatingContext(
      ownClient({ data: { id: OWN_RESTAURANT } }) as never,
      user
    )

    expect(ctx.impersonating).toBe(false)
    expect(ctx.restaurantId).toBe(OWN_RESTAURANT)
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
  })

  it("si el service role no está configurado degrada al restaurante propio", async () => {
    mocks.cookieValue = OTHER_RESTAURANT
    mocks.isAdmin.mockResolvedValue(true)
    mocks.createServiceClient.mockRejectedValue(new Error("sin service role"))

    const client = ownClient({ data: { id: OWN_RESTAURANT } })
    const ctx = await getOperatingContext(client as never, user)

    expect(ctx.impersonating).toBe(false)
    expect(ctx.restaurantId).toBe(OWN_RESTAURANT)
    expect(ctx.client).toBe(client)
  })

  it("si el rol no se puede verificar, no impersona", async () => {
    mocks.cookieValue = OTHER_RESTAURANT
    mocks.isAdmin.mockRejectedValue(new Error("boom"))

    const client = ownClient({ data: { id: OWN_RESTAURANT } })
    const ctx = await getOperatingContext(client as never, user)

    expect(ctx.impersonating).toBe(false)
    expect(ctx.restaurantId).toBe(OWN_RESTAURANT)
  })

  it("expone el nombre de la cookie que escribe el selector", () => {
    expect(OPERATING_COOKIE).toBe("resurte_foodos_operating")
  })
})

describe("requireFoodosAuth: rastro de auditoría de la sesión de soporte", () => {
  const user = { id: ADMIN, email: "soporte@resurte.me" }

  beforeEach(() => {
    mocks.logAdminAction.mockResolvedValue(undefined)
  })

  it("registra una acción por llamada mientras se impersona", async () => {
    mocks.cookieValue = OTHER_RESTAURANT
    mocks.isAdmin.mockResolvedValue(true)
    const service = { from: () => query({ data: { id: OTHER_RESTAURANT, user_id: "otro-dueno" } }) }
    mocks.createServiceClient.mockResolvedValue(service)
    const own = ownClient({ data: { id: OWN_RESTAURANT } })
    mocks.requireAuth.mockResolvedValue({ supabase: own, user })

    const auth = await requireFoodosAuth()

    expect(auth.ctx.impersonating).toBe(true)
    expect(auth.ownerUserId).toBe("otro-dueno")
    expect(mocks.logAdminAction).toHaveBeenCalledTimes(1)
    const [client, entry] = mocks.logAdminAction.mock.calls[0]!
    // El rastro se escribe con el cliente de service role: es el que está
    // activo mientras se impersona y `admin_audit_log` no tiene política de
    // inserción para el rol `authenticated`.
    expect(client).toBe(service)
    expect(entry).toMatchObject({
      actorId: ADMIN,
      actorEmail: "soporte@resurte.me",
      action: "foodos_operating_action",
      entity: "foodos_restaurant",
      entityId: OTHER_RESTAURANT,
    })
  })

  it("no escribe nada en el camino normal", async () => {
    const own = ownClient({ data: { id: OWN_RESTAURANT } })
    mocks.requireAuth.mockResolvedValue({ supabase: own, user })

    const auth = await requireFoodosAuth()

    expect(auth.ctx.impersonating).toBe(false)
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })

  it("no escribe nada si quien trae la cookie no es admin", async () => {
    mocks.cookieValue = OTHER_RESTAURANT
    mocks.isAdmin.mockResolvedValue(false)
    const own = ownClient({ data: { id: OWN_RESTAURANT } })
    mocks.requireAuth.mockResolvedValue({ supabase: own, user })

    await requireFoodosAuth()

    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })

  it("la auditoría no tumba la acción si la bitácora falla", async () => {
    mocks.cookieValue = OTHER_RESTAURANT
    mocks.isAdmin.mockResolvedValue(true)
    mocks.createServiceClient.mockResolvedValue({
      from: () => query({ data: { id: OTHER_RESTAURANT, user_id: "otro-dueno" } }),
    })
    const own = ownClient({ data: { id: OWN_RESTAURANT } })
    mocks.requireAuth.mockResolvedValue({ supabase: own, user })
    mocks.logAdminAction.mockRejectedValue(new Error("bitácora caída"))

    const auth = await requireFoodosAuth()

    expect(auth.ctx.impersonating).toBe(true)
  })
})

describe("loadOperatingRestaurantName", () => {
  it("no consulta nada cuando no se impersona", async () => {
    const from = vi.fn()
    const name = await loadOperatingRestaurantName({
      restaurantId: OWN_RESTAURANT,
      ownerUserId: ADMIN,
      client: { from } as never,
      impersonating: false,
      actorUserId: ADMIN,
      actorEmail: null,
    })

    expect(name).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it("devuelve el nombre del restaurante operado", async () => {
    const name = await loadOperatingRestaurantName({
      restaurantId: OTHER_RESTAURANT,
      ownerUserId: "otro-dueno",
      client: { from: () => query({ data: { name: "Taquería Sol" } }) } as never,
      impersonating: true,
      actorUserId: ADMIN,
      actorEmail: null,
    })

    expect(name).toBe("Taquería Sol")
  })
})

describe("getOperatingPickerState", () => {
  const user = { id: ADMIN, email: "soporte@resurte.me" }

  it("en el camino normal el restaurante propio está resuelto y no hay sesión", async () => {
    const own = ownClient({ data: { id: OWN_RESTAURANT } })
    mocks.requireAuth.mockResolvedValue({ supabase: own, user })

    const state = await getOperatingPickerState()

    expect(state).toEqual({
      operatingRestaurantId: null,
      ownRestaurantId: OWN_RESTAURANT,
    })
  })

  it("mientras se impersona devuelve los dos, y son distintos", async () => {
    // El selector necesita el propio para no ofrecer un botón que
    // `decideOperatingTarget` va a rechazar por ser un no-op.
    mocks.cookieValue = OTHER_RESTAURANT
    mocks.isAdmin.mockResolvedValue(true)
    mocks.createServiceClient.mockResolvedValue({
      from: () => query({ data: { id: OTHER_RESTAURANT, user_id: "otro-dueno" } }),
    })
    const own = ownClient({ data: { id: OWN_RESTAURANT } })
    mocks.requireAuth.mockResolvedValue({ supabase: own, user })

    const state = await getOperatingPickerState()

    expect(state.operatingRestaurantId).toBe(OTHER_RESTAURANT)
    expect(state.ownRestaurantId).toBe(OWN_RESTAURANT)
  })

  it("una cookie de alguien que no es admin no abre sesión", async () => {
    mocks.cookieValue = OTHER_RESTAURANT
    mocks.isAdmin.mockResolvedValue(false)
    const own = ownClient({ data: { id: OWN_RESTAURANT } })
    mocks.requireAuth.mockResolvedValue({ supabase: own, user })

    const state = await getOperatingPickerState()

    expect(state.operatingRestaurantId).toBeNull()
    expect(state.ownRestaurantId).toBe(OWN_RESTAURANT)
  })

  it("apuntar al restaurante propio tampoco abre sesión", async () => {
    mocks.cookieValue = OWN_RESTAURANT
    mocks.isAdmin.mockResolvedValue(true)
    mocks.createServiceClient.mockResolvedValue({
      from: () => query({ data: { id: OWN_RESTAURANT, user_id: ADMIN } }),
    })
    const own = ownClient({ data: { id: OWN_RESTAURANT } })
    mocks.requireAuth.mockResolvedValue({ supabase: own, user })

    const state = await getOperatingPickerState()

    expect(state.operatingRestaurantId).toBeNull()
    expect(state.ownRestaurantId).toBe(OWN_RESTAURANT)
  })

  it("un usuario sin restaurante devuelve propio nulo en vez de inventarlo", async () => {
    const own = ownClient({ data: null })
    mocks.requireAuth.mockResolvedValue({ supabase: own, user })

    const state = await getOperatingPickerState()

    expect(state).toEqual({ operatingRestaurantId: null, ownRestaurantId: null })
  })
})
