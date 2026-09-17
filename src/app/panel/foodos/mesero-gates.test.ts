import { beforeEach, describe, expect, it, vi } from "vitest"

// El gate de nivel del Mesero IA vive en el servidor. El simulador del panel
// es cortesía; esto fija el contrato real: escrituras lanzan, lecturas degradan.

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
  getMeseroSettings,
  getMeseroStats,
  listMeseroMessages,
  listMeseroSessions,
  resumeMeseroSession,
  takeOverMeseroSession,
  upsertMeseroSettings,
} from "./actions"

const RESTAURANT_ID = "rest-1"
const SESSION_ID = "sess-1"
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

const EMPTY_STATS = {
  conversations: 0,
  handoffs: 0,
  orders: 0,
  conversion: 0,
  avgTicket: 0,
}

const SETTINGS_INPUT = {
  restaurant_id: RESTAURANT_ID,
  is_enabled: true,
  tone: "amable" as const,
  greeting: null,
  handoff_enabled: true,
  max_items: 20,
  daily_reply_cap: 200,
  business_hours_only: false,
}

/** Builder encadenable y "awaitable", como el de supabase-js. */
function tableBuilder(rows: unknown = []) {
  const builder: Record<string, unknown> = {}
  const resolved = { data: rows, error: null }
  for (const method of ["select", "insert", "update", "delete", "eq", "neq", "gte", "in", "order", "limit"]) {
    builder[method] = () => builder
  }
  builder.upsert = () => builder
  // `.maybeSingle()` es "cero o una fila": sin datos, la fila no existe.
  builder.maybeSingle = async () => ({ data: null, error: null })
  builder.single = async () => resolved
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolved).then(resolve)
  return builder
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireFoodosAuth.mockResolvedValue(
    operating({ from: () => tableBuilder() }),
  )
})

describe("mesero_ia: bloqueado sin nivel Diamante", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockRejectedValue(new Error("FOODOS_FEATURE_LOCKED"))
  })

  it("rechaza cada mutación antes de tocar la base", async () => {
    await expect(upsertMeseroSettings(SETTINGS_INPUT)).rejects.toThrow()
    await expect(takeOverMeseroSession(SESSION_ID)).rejects.toThrow()
    await expect(resumeMeseroSession(SESSION_ID)).rejects.toThrow()

    // La sesión ni se resuelve: el gate es lo primero que corre.
    expect(mocks.requireFoodosAuth).not.toHaveBeenCalled()
    expect(mocks.requireFoodosFeature).toHaveBeenCalledWith("mesero_ia")
  })

  it("las lecturas degradan en vez de romper la pantalla", async () => {
    await expect(getMeseroSettings(RESTAURANT_ID)).resolves.toBeNull()
    await expect(listMeseroSessions(RESTAURANT_ID)).resolves.toEqual([])
    await expect(listMeseroMessages(SESSION_ID)).resolves.toEqual([])
    await expect(getMeseroStats(RESTAURANT_ID)).resolves.toEqual(EMPTY_STATS)
    expect(mocks.requireFoodosAuth).not.toHaveBeenCalled()
  })
})

describe("mesero_ia: con nivel suficiente", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue({ tier: "Diamante" })
  })

  it("las lecturas proceden y consultan el feature correcto", async () => {
    await expect(listMeseroSessions(RESTAURANT_ID)).resolves.toEqual([])
    await expect(listMeseroMessages(SESSION_ID)).resolves.toEqual([])
    await expect(getMeseroSettings(RESTAURANT_ID)).resolves.toBeNull()
    expect(mocks.requireFoodosFeature).toHaveBeenCalledWith("mesero_ia")
    expect(mocks.requireFoodosAuth).toHaveBeenCalled()
  })

  it("las mutaciones proceden", async () => {
    await expect(upsertMeseroSettings(SETTINGS_INPUT)).resolves.toBeUndefined()
    await expect(takeOverMeseroSession(SESSION_ID)).resolves.toBeUndefined()
    await expect(resumeMeseroSession(SESSION_ID)).resolves.toBeUndefined()
    expect(mocks.requireFoodosAuth).toHaveBeenCalled()
  })
})
