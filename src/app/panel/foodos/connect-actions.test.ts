import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  accountsCreate: vi.fn(),
  accountsRetrieve: vi.fn(),
  accountsCreateLoginLink: vi.fn(),
  accountLinksCreate: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }))
vi.mock("@/lib/foodos-operating", () => ({ requireFoodosAuth: vi.fn() }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    accounts: {
      create: mocks.accountsCreate,
      retrieve: mocks.accountsRetrieve,
      createLoginLink: mocks.accountsCreateLoginLink,
    },
    accountLinks: { create: mocks.accountLinksCreate },
  }),
}))

import {
  getConnectStatus,
  openConnectDashboard,
  refreshConnectStatus,
  startConnectOnboarding,
} from "./connect-actions"
import { requireFoodosAuth } from "@/lib/foodos-operating"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

const USER = { id: "user-1", email: "dueno@example.com" }

const RESTAURANT = {
  id: "rest-1",
  name: "Taquería El Compa",
  user_id: "user-1",
  stripe_account_id: "acct_1",
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
  stripe_details_submitted: true,
  stripe_requirements_due: [],
  stripe_onboarded_at: "2026-01-01T00:00:00.000Z",
  platform_fee_percent: 2,
}

/** Builder encadenable y "awaitable" que registra las escrituras. */
function tableBuilder(row: unknown) {
  const writes: Record<string, unknown>[] = []
  const builder = {
    select: vi.fn(() => builder),
    update: vi.fn((patch: Record<string, unknown>) => {
      writes.push(patch)
      return builder
    }),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
    then: (resolve: (value: unknown) => void) => resolve({ data: null, error: null }),
  }
  return { builder, writes }
}

function setupSession(row: unknown) {
  const session = tableBuilder(row)
  const supabase = { from: vi.fn(() => session.builder) }
  vi.mocked(requireFoodosAuth).mockResolvedValue({
    supabase,
    user: USER,
    ownerUserId: USER.id,
    ctx: {
      restaurantId: RESTAURANT.id,
      ownerUserId: USER.id,
      client: supabase,
      impersonating: false,
      actorUserId: USER.id,
      actorEmail: USER.email,
    },
  } as never)
  return session
}

function setupService() {
  const service = tableBuilder(null)
  vi.mocked(createServiceClient).mockResolvedValue({
    from: vi.fn(() => service.builder),
  } as never)
  return service
}

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "acct_1",
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    requirements: { currently_due: [], disabled_reason: null },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.accountLinksCreate.mockResolvedValue({ url: "https://connect.stripe.com/setup" })
  mocks.accountsCreate.mockResolvedValue({ id: "acct_new" })
  mocks.accountsCreateLoginLink.mockResolvedValue({ url: "https://connect.stripe.com/express" })
})

describe("getConnectStatus", () => {
  it("deriva el estado del restaurante del usuario", async () => {
    setupSession(RESTAURANT)
    const status = await getConnectStatus("rest-1")
    expect(status?.state).toBe("active")
    expect(status?.accountId).toBe("acct_1")
    expect(status?.platformFeePercent).toBe(2)
  })

  it("devuelve null cuando RLS no deja ver el restaurante", async () => {
    setupSession(null)
    expect(await getConnectStatus("rest-1")).toBeNull()
  })
})

describe("startConnectOnboarding", () => {
  it("crea la cuenta Express, la persiste con el service client y devuelve el link", async () => {
    setupSession({ ...RESTAURANT, stripe_account_id: null })
    const service = setupService()

    const result = await startConnectOnboarding("rest-1")

    expect(mocks.accountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "express",
        email: "dueno@example.com",
        metadata: { foodos_restaurant_id: "rest-1" },
      })
    )
    // Escritura de una columna revocada a `authenticated` → service client.
    expect(service.writes).toContainEqual({ stripe_account_id: "acct_new" })
    expect(mocks.accountLinksCreate).toHaveBeenCalledWith({
      account: "acct_new",
      type: "account_onboarding",
      return_url: expect.stringMatching(
        /^https?:\/\/.+\/panel\/foodos\/restaurante\?connect=done$/
      ),
      refresh_url: expect.stringMatching(
        /^https?:\/\/.+\/panel\/foodos\/restaurante\?connect=refresh$/
      ),
    })
    expect(result.url).toBe("https://connect.stripe.com/setup")
  })

  it("reutiliza la cuenta existente sin crear otra", async () => {
    setupSession(RESTAURANT)
    const service = setupService()

    await startConnectOnboarding("rest-1")

    expect(mocks.accountsCreate).not.toHaveBeenCalled()
    expect(service.writes).toEqual([])
    expect(mocks.accountLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({ account: "acct_1" })
    )
  })

  it("falla cerrado si el restaurante no es del usuario", async () => {
    setupSession(null)
    const service = setupService()

    await expect(startConnectOnboarding("rest-1")).rejects.toThrow(
      "Restaurante no encontrado"
    )
    expect(mocks.accountsCreate).not.toHaveBeenCalled()
    expect(service.writes).toEqual([])
  })

  it("no genera link si la cuenta no se pudo persistir", async () => {
    setupSession({ ...RESTAURANT, stripe_account_id: null })
    const service = tableBuilder(null)
    service.builder.then = (resolve: (value: unknown) => void) =>
      resolve({ data: null, error: { message: "permission denied" } })
    vi.mocked(createServiceClient).mockResolvedValue({
      from: vi.fn(() => service.builder),
    } as never)

    await expect(startConnectOnboarding("rest-1")).rejects.toThrow(
      "No se pudo guardar la cuenta de cobros"
    )
    expect(logger.error).toHaveBeenCalledWith(
      "foodos.connect.persist_account_failed",
      expect.objectContaining({ restaurant: "rest-1", error: "permission denied" })
    )
    expect(mocks.accountLinksCreate).not.toHaveBeenCalled()
  })
})

describe("refreshConnectStatus", () => {
  it("relee Stripe, sincroniza y devuelve el estado fresco", async () => {
    setupSession({ ...RESTAURANT, stripe_payouts_enabled: false })
    const service = setupService()
    mocks.accountsRetrieve.mockResolvedValue(account())

    const status = await refreshConnectStatus("rest-1")

    expect(mocks.accountsRetrieve).toHaveBeenCalledWith("acct_1")
    expect(service.writes[0]).toEqual({
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
      stripe_requirements_due: [],
    })
    expect(status?.state).toBe("active")
    expect(status?.chargeable).toBe(true)
  })

  it("no consulta Stripe si el restaurante no tiene cuenta", async () => {
    setupSession({ ...RESTAURANT, stripe_account_id: null })
    const service = setupService()

    const status = await refreshConnectStatus("rest-1")

    expect(mocks.accountsRetrieve).not.toHaveBeenCalled()
    expect(service.writes).toEqual([])
    expect(status?.state).toBe("not_connected")
  })
})

describe("openConnectDashboard", () => {
  it("devuelve el login link de la cuenta del restaurante", async () => {
    setupSession(RESTAURANT)
    const result = await openConnectDashboard("rest-1")
    expect(mocks.accountsCreateLoginLink).toHaveBeenCalledWith("acct_1")
    expect(result.url).toBe("https://connect.stripe.com/express")
  })

  it("no genera link sin cuenta de cobros", async () => {
    setupSession({ ...RESTAURANT, stripe_account_id: null })
    await expect(openConnectDashboard("rest-1")).rejects.toThrow(
      "todavía no tiene cuenta de cobros"
    )
    expect(mocks.accountsCreateLoginLink).not.toHaveBeenCalled()
  })
})
