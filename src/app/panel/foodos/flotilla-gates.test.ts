import { beforeEach, describe, expect, it, vi } from "vitest"

// El gate de nivel de la Flotilla vive en el servidor. Igual que el resto del
// panel: las ESCRITURAS lanzan, las LECTURAS degradan.

const mocks = vi.hoisted(() => ({
  requireFoodosFeature: vi.fn(),
  requireAuth: vi.fn(),
  requireFoodosAuth: vi.fn(),
  getOperatingContext: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth, getCurrentUser: vi.fn() }))
vi.mock("@/lib/foodos-operating", () => ({
  requireFoodosAuth: mocks.requireFoodosAuth,
  getOperatingContext: mocks.getOperatingContext,
}))
vi.mock("@/lib/foodos-tier", () => ({
  requireFoodosFeature: mocks.requireFoodosFeature,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
  advanceFlotillaDelivery,
  assignFlotillaCourier,
  autoAssignFlotillaDelivery,
  deleteFlotillaCourier,
  deleteFlotillaZone,
  dispatchFlotillaToProvider,
  ensureFlotillaCourierLink,
  getFlotillaStats,
  listFlotillaCouriers,
  listFlotillaDeliveries,
  listFlotillaZones,
  revokeFlotillaCourierLink,
  toggleFlotillaCourier,
  upsertFlotillaCourier,
  upsertFlotillaZone,
} from "./actions"

const RESTAURANT_ID = "rest-1"
const DELIVERY_ID = "del-1"
const COURIER_ID = "cour-1"
const ZONE_ID = "zone-1"
const USER = { id: "user-1", email: "dueno@example.com" }

/**
 * Respuesta del seam de operación para el caso normal (sin impersonación):
 * `supabase` es el cliente de sesión que cada test fabrica, así que el
 * camino que ejecuta la acción es exactamente el de siempre.
 */
function operating(supabase: unknown) {
  const ctx = {
    restaurantId: RESTAURANT_ID,
    ownerUserId: USER.id,
    client: supabase,
    impersonating: false,
    actorUserId: USER.id,
    actorEmail: USER.email ?? null,
  }
  mocks.getOperatingContext.mockResolvedValue(ctx as never)
  return { supabase, user: USER, ownerUserId: USER.id, ctx } as never
}

const COURIER_INPUT = {
  restaurant_id: RESTAURANT_ID,
  name: "Beto",
  vehicle: "moto" as const,
  capacity: 2,
}

const ZONE_INPUT = {
  restaurant_id: RESTAURANT_ID,
  name: "Centro",
  center_lat: 19.4326,
  center_lng: -99.1332,
  radius_km: 3,
  fee: 45,
}

/**
 * Builder encadenable y "awaitable", como el de supabase-js.
 *
 * `ownRestaurant` controla la verificación de propiedad: cuando es `false`,
 * `maybeSingle()` simula la fila oculta por RLS.
 */
function tableBuilder(rows: unknown = [], ownRestaurant = true) {
  const builder: Record<string, unknown> = {}
  const resolved = { data: rows, error: null }
  for (const method of [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "neq",
    "gte",
    "in",
    "order",
    "limit",
  ]) {
    builder[method] = () => builder
  }
  builder.upsert = () => builder
  builder.maybeSingle = async () =>
    ownRestaurant ? { data: { id: RESTAURANT_ID }, error: null } : { data: null, error: null }
  builder.single = async () => resolved
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(resolved).then(resolve)
  return builder
}

function client(ownRestaurant = true) {
  return { from: () => tableBuilder([], ownRestaurant) }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Sin credenciales de proveedor externo: la Flotilla opera con reparto propio.
  delete process.env.UBER_DIRECT_CLIENT_ID
  delete process.env.UBER_DIRECT_CLIENT_SECRET
  delete process.env.UBER_DIRECT_CUSTOMER_ID
  mocks.requireFoodosAuth.mockResolvedValue(operating(client()))
})

describe("flotilla: bloqueada sin nivel Oro", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockRejectedValue(new Error("FOODOS_FEATURE_LOCKED"))
  })

  it("rechaza cada mutación antes de tocar la base", async () => {
    await expect(upsertFlotillaCourier(COURIER_INPUT)).rejects.toThrow()
    await expect(toggleFlotillaCourier(COURIER_ID, false)).rejects.toThrow()
    await expect(deleteFlotillaCourier(COURIER_ID)).rejects.toThrow()
    await expect(upsertFlotillaZone(ZONE_INPUT)).rejects.toThrow()
    await expect(deleteFlotillaZone(ZONE_ID)).rejects.toThrow()
    await expect(
      assignFlotillaCourier({
        restaurant_id: RESTAURANT_ID,
        delivery_id: DELIVERY_ID,
        courier_id: COURIER_ID,
      })
    ).rejects.toThrow()
    await expect(
      advanceFlotillaDelivery({
        restaurant_id: RESTAURANT_ID,
        delivery_id: DELIVERY_ID,
        status: "picked_up",
      })
    ).rejects.toThrow()
    await expect(
      dispatchFlotillaToProvider({ restaurant_id: RESTAURANT_ID, delivery_id: DELIVERY_ID })
    ).rejects.toThrow()
    await expect(
      autoAssignFlotillaDelivery({ restaurant_id: RESTAURANT_ID, delivery_id: DELIVERY_ID })
    ).rejects.toThrow()
    await expect(
      ensureFlotillaCourierLink({ restaurant_id: RESTAURANT_ID, courier_id: COURIER_ID })
    ).rejects.toThrow()
    await expect(
      revokeFlotillaCourierLink({ restaurant_id: RESTAURANT_ID, courier_id: COURIER_ID })
    ).rejects.toThrow()

    // Ni siquiera se resuelve la sesión: el gate corre primero.
    expect(mocks.requireFoodosAuth).not.toHaveBeenCalled()
    expect(mocks.requireFoodosFeature).toHaveBeenCalledWith("flotilla")
  })

  it("las lecturas degradan en vez de romper la pantalla", async () => {
    await expect(listFlotillaCouriers(RESTAURANT_ID)).resolves.toEqual([])
    await expect(listFlotillaZones(RESTAURANT_ID)).resolves.toEqual([])
    await expect(listFlotillaDeliveries(RESTAURANT_ID)).resolves.toEqual([])
    await expect(getFlotillaStats(RESTAURANT_ID)).resolves.toMatchObject({
      active: 0,
      couriers: 0,
      zones: 0,
    })
    expect(mocks.requireFoodosAuth).not.toHaveBeenCalled()
  })
})

describe("flotilla: con nivel suficiente", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue({ tier: "Oro" })
  })

  it("las lecturas proceden", async () => {
    await expect(listFlotillaCouriers(RESTAURANT_ID)).resolves.toEqual([])
    await expect(listFlotillaZones(RESTAURANT_ID)).resolves.toEqual([])
    await expect(listFlotillaDeliveries(RESTAURANT_ID)).resolves.toEqual([])
    await expect(getFlotillaStats(RESTAURANT_ID)).resolves.toMatchObject({ active: 0 })
    expect(mocks.requireFoodosFeature).toHaveBeenCalledWith("flotilla")
    expect(mocks.requireFoodosAuth).toHaveBeenCalled()
  })

  it("las mutaciones proceden", async () => {
    await expect(upsertFlotillaCourier(COURIER_INPUT)).resolves.toBeUndefined()
    await expect(toggleFlotillaCourier(COURIER_ID, true)).resolves.toBeUndefined()
    await expect(deleteFlotillaCourier(COURIER_ID)).resolves.toBeUndefined()
    await expect(upsertFlotillaZone(ZONE_INPUT)).resolves.toBeUndefined()
    await expect(deleteFlotillaZone(ZONE_ID)).resolves.toBeUndefined()
    await expect(
      assignFlotillaCourier({
        restaurant_id: RESTAURANT_ID,
        delivery_id: DELIVERY_ID,
        courier_id: COURIER_ID,
      })
    ).resolves.toEqual({ ok: true })
    // La fila falsa llega en `pending`, así que el primer salto válido es `assigned`.
    await expect(
      advanceFlotillaDelivery({
        restaurant_id: RESTAURANT_ID,
        delivery_id: DELIVERY_ID,
        status: "assigned",
      })
    ).resolves.toEqual({ ok: true })
  })

  it("rechaza un salto de estado imposible", async () => {
    await expect(
      advanceFlotillaDelivery({
        restaurant_id: RESTAURANT_ID,
        delivery_id: DELIVERY_ID,
        status: "delivered",
      })
    ).resolves.toEqual({
      ok: false,
      error: 'No se puede pasar de "pending" a "delivered"',
    })
  })

  it("rechaza escribir en un restaurante ajeno", async () => {
    mocks.requireFoodosAuth.mockResolvedValue(operating(client(false)))
    await expect(upsertFlotillaCourier(COURIER_INPUT)).rejects.toThrow("Restaurante no encontrado")
    await expect(upsertFlotillaZone(ZONE_INPUT)).rejects.toThrow("Restaurante no encontrado")
  })

  it("valida los datos antes de escribir", async () => {
    await expect(upsertFlotillaCourier({ ...COURIER_INPUT, name: "   " })).rejects.toThrow(
      "El repartidor necesita un nombre"
    )
    await expect(upsertFlotillaZone({ ...ZONE_INPUT, name: "" })).rejects.toThrow(
      "La zona necesita un nombre"
    )
    await expect(upsertFlotillaZone({ ...ZONE_INPUT, radius_km: 0 })).rejects.toThrow(
      "El radio de la zona debe ser mayor a cero"
    )
    await expect(
      upsertFlotillaZone({ ...ZONE_INPUT, center_lat: Number.NaN })
    ).rejects.toThrow("La zona necesita coordenadas válidas")
  })

  it("genera el enlace del repartidor y lo revoca", async () => {
    const link = await ensureFlotillaCourierLink({
      restaurant_id: RESTAURANT_ID,
      courier_id: COURIER_ID,
    })
    expect(link.ok).toBe(true)
    // El token es una capability URL: no debe filtrar el id del repartidor.
    expect(link.url).toMatch(/\/reparto\/[0-9a-f]{32}$/)
    expect(link.url).not.toContain(COURIER_ID)

    await expect(
      revokeFlotillaCourierLink({ restaurant_id: RESTAURANT_ID, courier_id: COURIER_ID })
    ).resolves.toEqual({ ok: true })
  })

  it("la autoasignación avisa cuando no hay repartidores", async () => {
    await expect(
      autoAssignFlotillaDelivery({ restaurant_id: RESTAURANT_ID, delivery_id: DELIVERY_ID })
    ).resolves.toEqual({
      ok: false,
      error: "Ningún repartidor disponible (turno o cupo)",
    })
  })

  it("el despacho a proveedor externo avisa si no hay credenciales", async () => {
    await expect(
      dispatchFlotillaToProvider({ restaurant_id: RESTAURANT_ID, delivery_id: DELIVERY_ID })
    ).resolves.toEqual({
      ok: false,
      error: "No hay proveedor de reparto configurado",
    })
  })
})
