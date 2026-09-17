import { beforeEach, describe, expect, it, vi } from "vitest"

// La frontera real de las capacidades premium es el servidor: ocultar la
// tarjeta en el hub es solo cortesía. Estos tests fijan ese contrato.

const mocks = vi.hoisted(() => ({
  requireFoodosFeature: vi.fn(),
  requireAuth: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth, getCurrentUser: vi.fn() }))
vi.mock("@/lib/foodos-tier", () => ({
  requireFoodosFeature: mocks.requireFoodosFeature,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
  deleteCampaign,
  generateCampaignCopy,
  getCampaignAbStats,
  insertCampaign,
  listAutomations,
  listCampaigns,
  runCampaignNow,
  toggleAutomation,
  updateCustomerProfile,
  upsertAutomation,
} from "./actions"

const RESTAURANT_ID = "rest-1"
const USER = { id: "user-1", email: "dueno@example.com" }

/** Builder encadenable y "awaitable", como el de supabase-js. */
function tableBuilder(rows: unknown = [], writes: unknown[] = []) {
  const builder: Record<string, unknown> = {}
  const resolved = { data: rows, error: null }
  for (const method of [
    "select",
    "delete",
    "eq",
    "neq",
    "not",
    "in",
    "gte",
    "lte",
    "order",
    "limit",
  ]) {
    builder[method] = () => builder
  }
  builder.update = (values: unknown) => {
    writes.push({ op: "update", values })
    return builder
  }
  builder.insert = (values: unknown) => {
    writes.push({ op: "insert", values })
    return builder
  }
  builder.maybeSingle = async () => resolved
  builder.single = async () => resolved
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolved).then(resolve)
  return builder
}

/** Cliente falso que distingue la tabla consultada. */
function fakeClient(byTable: Record<string, unknown> = {}, writes: unknown[] = []) {
  return { from: (table: string) => tableBuilder(byTable[table] ?? [], writes) }
}

/** Como `fakeClient`, pero `maybeSingle()` no encuentra la fila (RLS la oculta). */
function fakeClientMissing() {
  const builder = tableBuilder()
  builder.maybeSingle = async () => ({ data: null, error: null })
  return { from: () => builder }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAuth.mockResolvedValue({
    supabase: fakeClient(),
    user: USER,
  })
})

describe("marketing_ia: escrituras bloqueadas sin nivel", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockRejectedValue(new Error("FOODOS_FEATURE_LOCKED"))
  })

  it("rechaza cada mutación antes de tocar la base", async () => {
    await expect(
      upsertAutomation({ restaurant_id: RESTAURANT_ID, type: "thank_you", name: "Gracias" })
    ).rejects.toThrow()
    await expect(toggleAutomation("auto-1", true)).rejects.toThrow()
    await expect(insertCampaign({ restaurant_id: RESTAURANT_ID })).rejects.toThrow()
    await expect(runCampaignNow("camp-1")).rejects.toThrow()
    await expect(deleteCampaign("camp-1")).rejects.toThrow()
    await expect(
      updateCustomerProfile({ id: "cust-1", birthday: "1990-05-04" })
    ).rejects.toThrow()
    await expect(
      generateCampaignCopy({ restaurant_id: RESTAURANT_ID, brief: "Promo de tacos" })
    ).rejects.toThrow()

    // La sesión ni se resuelve: el gate es lo primero que corre.
    expect(mocks.requireAuth).not.toHaveBeenCalled()
    expect(mocks.requireFoodosFeature).toHaveBeenCalledWith("marketing_ia")
  })

  it("las lecturas degradan a vacío en vez de romper la pantalla", async () => {
    await expect(listAutomations(RESTAURANT_ID)).resolves.toEqual([])
    await expect(listCampaigns(RESTAURANT_ID)).resolves.toEqual([])
    await expect(getCampaignAbStats(RESTAURANT_ID)).resolves.toEqual([])
    expect(mocks.requireAuth).not.toHaveBeenCalled()
  })
})

describe("marketing_ia: con nivel suficiente", () => {
  beforeEach(() => {
    mocks.requireFoodosFeature.mockResolvedValue({ tier: "Diamante" })
  })

  it("las lecturas proceden y consultan el feature correcto", async () => {
    await expect(listAutomations(RESTAURANT_ID)).resolves.toEqual([])
    await expect(listCampaigns(RESTAURANT_ID)).resolves.toEqual([])
    expect(mocks.requireFoodosFeature).toHaveBeenCalledWith("marketing_ia")
    expect(mocks.requireAuth).toHaveBeenCalled()
  })

  it("normaliza el experimento A/B: sin segundo mensaje no hay prueba", async () => {
    const writes: unknown[] = []
    mocks.requireAuth.mockResolvedValue({ supabase: fakeClient({}, writes), user: USER })

    await upsertAutomation({
      restaurant_id: RESTAURANT_ID,
      type: "birthday",
      name: "Cumpleaños",
      ab_test: true,
      message_b: "   ",
    })
    await upsertAutomation({
      restaurant_id: RESTAURANT_ID,
      type: "birthday",
      name: "Cumpleaños",
      ab_test: true,
      message_b: "  Versión B  ",
      channel: "both",
      audience: "  champions  ",
    })

    const inserted = writes.map(
      (w) => (w as { values: Record<string, unknown> }).values
    )
    expect(inserted[0]?.ab_test).toBe(false)
    expect(inserted[0]?.message_b).toBeNull()
    expect(inserted[0]?.channel).toBe("whatsapp")
    expect(inserted[1]?.ab_test).toBe(true)
    expect(inserted[1]?.message_b).toBe("Versión B")
    expect(inserted[1]?.audience).toBe("champions")
    expect(inserted[1]?.channel).toBe("both")
  })

  it("el A/B se resume por variante sobre el reparto real", async () => {
    mocks.requireAuth.mockResolvedValue({
      supabase: fakeClient({
        foodos_campaigns: [
          { variant: "a", status: "sent" },
          { variant: "a", status: "sent" },
          { variant: "a", status: "failed" },
          { variant: "b", status: "sent" },
          { variant: "b", status: "scheduled" },
          { variant: null, status: "sent" },
        ],
      }),
      user: USER,
    })

    await expect(getCampaignAbStats(RESTAURANT_ID)).resolves.toEqual([
      { variant: "a", sent: 2, failed: 1, total: 3 },
      { variant: "b", sent: 1, failed: 0, total: 1 },
    ])
  })

  it("no deja escribir el CRM ni gastar IA sobre un restaurante ajeno", async () => {
    // `maybeSingle()` devuelve null: la fila existe pero no es suya.
    mocks.requireAuth.mockResolvedValue({ supabase: fakeClientMissing(), user: USER })
    await expect(
      updateCustomerProfile({ id: "cust-1", sms_opt_in: true })
    ).rejects.toThrow("Cliente no encontrado")
    await expect(
      generateCampaignCopy({ restaurant_id: RESTAURANT_ID, brief: "Promo" })
    ).rejects.toThrow("Restaurante no encontrado")
  })

  it("valida la fecha de cumpleaños antes de escribir", async () => {
    mocks.requireAuth.mockResolvedValue({
      supabase: fakeClient({ foodos_customers: { id: "cust-1" } }),
      user: USER,
    })
    await expect(
      updateCustomerProfile({ id: "cust-1", birthday: "04/05/1990" })
    ).rejects.toThrow("Fecha de cumpleaños inválida")
  })
})
