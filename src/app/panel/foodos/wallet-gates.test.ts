import { beforeEach, describe, expect, it, vi } from "vitest"

// El gate de nivel de la tarjeta de lealtad vive en el servidor. Igual que el
// resto del panel: las ESCRITURAS lanzan, las LECTURAS degradan.

const mocks = vi.hoisted(() => ({
  requireFoodosFeature: vi.fn(),
  requireAuth: vi.fn(),
  createServiceClient: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth, getCurrentUser: vi.fn() }))
vi.mock("@/lib/foodos-tier", () => ({
  requireFoodosFeature: mocks.requireFoodosFeature,
}))
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
  getWalletKpis,
  getWalletSettings,
  issueWalletPass,
  listWalletPassRows,
  refreshWalletPassRow,
  setWalletPassEnabled,
  upsertWalletSettings,
} from "./actions"

const RESTAURANT_ID = "rest-1"
const CUSTOMER_ID = "cust-1"
const PASS_ID = "pass-1"
const USER = { id: "user-1", email: "dueno@example.com" }

/**
 * Fila que satisface a la vez `loadRestaurant`, `assertOwnRestaurant` y
 * `getWalletSettings`: el builder falso responde lo mismo a todo.
 */
const RESTAURANT_ROW = {
  id: RESTAURANT_ID,
  name: "Taquería Centro",
  slug: "taqueria-centro",
  logo_url: null,
  theme_color: null,
  wallet_enabled: true,
  reward_points: null,
  reward_label: null,
  points_per_100: 0,
  point_value: 0,
  is_active: true,
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
    ownRestaurant ? { data: RESTAURANT_ROW, error: null } : { data: null, error: null }
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
  mocks.requireAuth.mockResolvedValue({ supabase: client(), user: USER })
  mocks.createServiceClient.mockResolvedValue(client())
})

describe("wallet: bloqueada sin nivel Diamante", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockRejectedValue(new Error("FOODOS_FEATURE_LOCKED"))
  })

  it("rechaza cada escritura antes de tocar la base", async () => {
    await expect(
      upsertWalletSettings({
        restaurant_id: RESTAURANT_ID,
        wallet_enabled: true,
        reward_points: 100,
        reward_label: "Postre gratis",
      })
    ).rejects.toThrow()
    await expect(
      issueWalletPass({ restaurant_id: RESTAURANT_ID, customer_id: CUSTOMER_ID })
    ).rejects.toThrow()
    await expect(
      refreshWalletPassRow({ restaurant_id: RESTAURANT_ID, pass_id: PASS_ID })
    ).rejects.toThrow()
    await expect(
      setWalletPassEnabled({
        restaurant_id: RESTAURANT_ID,
        pass_id: PASS_ID,
        is_active: false,
      })
    ).rejects.toThrow()

    // Ni siquiera se resuelve la sesión: el gate corre primero.
    expect(mocks.requireAuth).not.toHaveBeenCalled()
    expect(mocks.requireFoodosFeature).toHaveBeenCalledWith("wallet_passes")
  })

  it("las lecturas degradan en vez de romper la pantalla", async () => {
    await expect(listWalletPassRows(RESTAURANT_ID)).resolves.toEqual([])
    await expect(getWalletKpis(RESTAURANT_ID)).resolves.toMatchObject({
      total: 0,
      active: 0,
      installed: 0,
      pointsOutstanding: 0,
      valueOutstanding: 0,
    })
    await expect(getWalletSettings(RESTAURANT_ID)).resolves.toBeNull()
    expect(mocks.requireAuth).not.toHaveBeenCalled()
  })
})

describe("wallet: con nivel suficiente", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue({ tier: "Diamante" })
  })

  it("las lecturas proceden", async () => {
    await expect(listWalletPassRows(RESTAURANT_ID)).resolves.toEqual([])
    await expect(getWalletKpis(RESTAURANT_ID)).resolves.toMatchObject({ total: 0 })
    await expect(getWalletSettings(RESTAURANT_ID)).resolves.toMatchObject({
      wallet_enabled: true,
    })
    expect(mocks.requireFoodosFeature).toHaveBeenCalledWith("wallet_passes")
    expect(mocks.requireAuth).toHaveBeenCalled()
  })

  it("las escrituras proceden", async () => {
    await expect(
      upsertWalletSettings({
        restaurant_id: RESTAURANT_ID,
        wallet_enabled: true,
        reward_points: 250,
        reward_label: "  Postre gratis  ",
      })
    ).resolves.toBeUndefined()
    await expect(
      issueWalletPass({ restaurant_id: RESTAURANT_ID, customer_id: CUSTOMER_ID })
    ).resolves.toMatchObject({ ok: true })
    await expect(
      refreshWalletPassRow({ restaurant_id: RESTAURANT_ID, pass_id: PASS_ID })
    ).resolves.toEqual({ ok: true })
    await expect(
      setWalletPassEnabled({
        restaurant_id: RESTAURANT_ID,
        pass_id: PASS_ID,
        is_active: false,
      })
    ).resolves.toEqual({ ok: true })
  })

  it("la emisión usa service role y no la sesión del dueño", async () => {
    // La RLS de `foodos_wallet_passes` solo deja insertar a admin: el dueño no
    // tiene política de INSERT, así que la emisión necesita service role.
    await issueWalletPass({ restaurant_id: RESTAURANT_ID, customer_id: CUSTOMER_ID })
    expect(mocks.createServiceClient).toHaveBeenCalled()
  })

  it("rechaza escribir en un restaurante ajeno", async () => {
    mocks.requireAuth.mockResolvedValue({ supabase: client(false), user: USER })
    await expect(
      upsertWalletSettings({ restaurant_id: RESTAURANT_ID, wallet_enabled: true })
    ).rejects.toThrow("Restaurante no encontrado")
    await expect(
      setWalletPassEnabled({
        restaurant_id: RESTAURANT_ID,
        pass_id: PASS_ID,
        is_active: false,
      })
    ).rejects.toThrow("Restaurante no encontrado")
  })

  it("exige nombre cuando hay umbral de recompensa", async () => {
    await expect(
      upsertWalletSettings({
        restaurant_id: RESTAURANT_ID,
        wallet_enabled: true,
        reward_points: 100,
        reward_label: "   ",
      })
    ).rejects.toThrow("La recompensa necesita un nombre")
  })

  it("sin umbral la recompensa se limpia en vez de anunciarse", async () => {
    // Un umbral en cero dejaría una meta imposible en la tarjeta.
    await expect(
      upsertWalletSettings({
        restaurant_id: RESTAURANT_ID,
        wallet_enabled: true,
        reward_points: 0,
        reward_label: "Postre gratis",
      })
    ).resolves.toBeUndefined()
    await expect(
      upsertWalletSettings({
        restaurant_id: RESTAURANT_ID,
        wallet_enabled: true,
        reward_points: null,
      })
    ).resolves.toBeUndefined()
  })
})
