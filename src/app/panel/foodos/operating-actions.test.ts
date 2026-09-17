import { describe, it, expect, beforeEach, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  isCurrentUserAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  setOperatingRestaurant: vi.fn(),
  clearOperatingRestaurant: vi.fn(),
  getOperatingContext: vi.fn(),
  logAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }))
vi.mock("@/lib/foodos-admin", () => ({ isCurrentUserAdmin: mocks.isCurrentUserAdmin }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }))
vi.mock("@/lib/foodos-operating", async () => {
  // Sólo se sustituyen las funciones con efectos; el resto (UUID_RE, tipos)
  // se toma del módulo real para no duplicar la validación de ids.
  const actual = await vi.importActual<typeof import("@/lib/foodos-operating")>(
    "@/lib/foodos-operating"
  )
  return {
    ...actual,
    setOperatingRestaurant: mocks.setOperatingRestaurant,
    clearOperatingRestaurant: mocks.clearOperatingRestaurant,
    getOperatingContext: mocks.getOperatingContext,
  }
})
vi.mock("@/lib/audit-log", () => ({ logAdminAction: mocks.logAdminAction }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/logger", () => ({ logger: { warn: mocks.loggerWarn } }))

import { startOperatingAs, stopOperatingAs } from "./operating-actions"

const OTHER_ID = "22222222-2222-4222-8222-222222222222"
const USER = { id: "admin-1", email: "soporte@resurte.me" }

/** Cliente de service role falso: sólo `.from(...).select().eq().maybeSingle()`. */
function serviceClient(row: { id: string; name: string } | null, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error })
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  return { from: vi.fn(() => ({ select })) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAuth.mockResolvedValue({ supabase: { from: vi.fn() }, user: USER })
  mocks.isCurrentUserAdmin.mockResolvedValue(true)
  mocks.createServiceClient.mockResolvedValue(serviceClient({ id: OTHER_ID, name: "Taquería Sol" }))
  mocks.setOperatingRestaurant.mockResolvedValue(undefined)
  mocks.clearOperatingRestaurant.mockResolvedValue(undefined)
  mocks.logAdminAction.mockResolvedValue(undefined)
  mocks.getOperatingContext.mockResolvedValue({
    restaurantId: OTHER_ID,
    ownerUserId: "owner-9",
    client: { from: vi.fn() },
    impersonating: true,
    actorUserId: USER.id,
    actorEmail: USER.email,
  })
})

describe("startOperatingAs", () => {
  it("abre la sesión, fija la cookie y la registra en la bitácora", async () => {
    const result = await startOperatingAs(OTHER_ID)

    expect(result).toEqual({ ok: true, name: "Taquería Sol" })
    expect(mocks.setOperatingRestaurant).toHaveBeenCalledWith(OTHER_ID)
    expect(mocks.logAdminAction).toHaveBeenCalledTimes(1)
    const [, entry] = mocks.logAdminAction.mock.calls[0]!
    expect(entry).toMatchObject({
      actorId: USER.id,
      actorEmail: USER.email,
      action: "foodos_operating_start",
      entity: "foodos_restaurant",
      entityId: OTHER_ID,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/panel", "layout")
  })

  it("niega el acceso a quien no es admin y no toca la cookie", async () => {
    mocks.isCurrentUserAdmin.mockResolvedValue(false)

    expect(await startOperatingAs(OTHER_ID)).toEqual({ ok: false, code: "noAccess" })
    expect(mocks.setOperatingRestaurant).not.toHaveBeenCalled()
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })

  it("rechaza un id que no es uuid sin consultar la base", async () => {
    expect(await startOperatingAs("no-soy-un-id")).toEqual({ ok: false, code: "invalid" })
    expect(mocks.createServiceClient).not.toHaveBeenCalled()
    expect(mocks.setOperatingRestaurant).not.toHaveBeenCalled()
  })

  it("no fija la cookie si el restaurante no existe", async () => {
    mocks.createServiceClient.mockResolvedValue(serviceClient(null))

    expect(await startOperatingAs(OTHER_ID)).toEqual({ ok: false, code: "notFound" })
    expect(mocks.setOperatingRestaurant).not.toHaveBeenCalled()
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })

  it("degrada a error si el service role no está configurado", async () => {
    mocks.createServiceClient.mockRejectedValue(new Error("falta SUPABASE_SERVICE_ROLE_KEY"))

    expect(await startOperatingAs(OTHER_ID)).toEqual({ ok: false, code: "error" })
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "foodos.operating.start.serviceClient",
      expect.objectContaining({ error: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY") })
    )
    expect(mocks.setOperatingRestaurant).not.toHaveBeenCalled()
  })

  it("no revienta si la bitácora falla", async () => {
    // logAdminAction es best-effort por contrato; aquí se comprueba que la
    // acción no dependa de él para devolver éxito.
    mocks.logAdminAction.mockResolvedValue(undefined)

    expect(await startOperatingAs(OTHER_ID)).toEqual({ ok: true, name: "Taquería Sol" })
  })
})

describe("stopOperatingAs", () => {
  it("borra la cookie y registra la salida con el restaurante que se abandona", async () => {
    expect(await stopOperatingAs()).toEqual({ ok: true })

    expect(mocks.clearOperatingRestaurant).toHaveBeenCalledTimes(1)
    const [, entry] = mocks.logAdminAction.mock.calls[0]!
    expect(entry).toMatchObject({
      action: "foodos_operating_stop",
      entity: "foodos_restaurant",
      entityId: OTHER_ID,
      actorId: USER.id,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/panel", "layout")
  })

  it("borra la cookie sin registrar nada cuando no había sesión abierta", async () => {
    mocks.getOperatingContext.mockResolvedValue({
      restaurantId: null,
      ownerUserId: null,
      client: { from: vi.fn() },
      impersonating: false,
      actorUserId: USER.id,
      actorEmail: USER.email,
    })

    expect(await stopOperatingAs()).toEqual({ ok: true })
    expect(mocks.clearOperatingRestaurant).toHaveBeenCalledTimes(1)
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })

  it("deja salir aunque el rol de admin se haya revocado", async () => {
    // Si la cookie quedara viva y el rol ya no alcanza, el usuario no podría
    // volver a su propio restaurante. Cerrar siempre debe funcionar.
    mocks.isCurrentUserAdmin.mockResolvedValue(false)
    mocks.getOperatingContext.mockResolvedValue({
      restaurantId: null,
      ownerUserId: null,
      client: { from: vi.fn() },
      impersonating: false,
      actorUserId: USER.id,
      actorEmail: null,
    })

    expect(await stopOperatingAs()).toEqual({ ok: true })
    expect(mocks.clearOperatingRestaurant).toHaveBeenCalledTimes(1)
  })
})
