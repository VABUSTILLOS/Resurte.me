import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  accountsCreate: vi.fn(),
  accountsRetrieve: vi.fn(),
  accountsCreateLoginLink: vi.fn(),
  accountLinksCreate: vi.fn(),
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
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
  CONNECT_COUNTRY,
  buildDestinationChargeParams,
  buildRefundParams,
  computeApplicationFee,
  connectSnapshotFromAccount,
  connectStatusFromAccount,
  connectStatusFromRestaurant,
  createConnectDashboardLink,
  createConnectOnboardingLink,
  createExpressAccountForRestaurant,
  fetchConnectAccount,
  getRestaurantConnectStatus,
  handleConnectAccountUpdated,
  isConnectRoutingEnabled,
  parsePlatformFeePercent,
  syncConnectAccount,
  type ConnectAccountLike,
} from "./stripe-connect"
import type { ServiceClient } from "./stripe-webhook-handlers"
import { logger } from "@/lib/logger"

// ------------------------------------------------------------
// Fakes
// ------------------------------------------------------------

interface FakeSupabaseOptions {
  /** Respuesta de `.maybeSingle()` (lectura de estado). */
  selectData?: unknown
  selectError?: { message: string } | null
  /** Error por cada UPDATE esperado, en orden. */
  updateErrors?: ({ message: string } | null)[]
}

function makeSupabase(opts: FakeSupabaseOptions = {}) {
  const updateCalls: Record<string, unknown>[] = []
  const eqCalls: [string, unknown][] = []
  const isCalls: [string, unknown][] = []
  let awaited = 0

  const builder = {
    update: vi.fn((patch: Record<string, unknown>) => {
      updateCalls.push(patch)
      return builder
    }),
    eq: vi.fn((col: string, val: unknown) => {
      eqCalls.push([col, val])
      return builder
    }),
    is: vi.fn((col: string, val: unknown) => {
      isCalls.push([col, val])
      return builder
    }),
    select: vi.fn(() => builder),
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data: opts.selectData ?? null,
        error: opts.selectError ?? null,
      })
    ),
    // Sólo se invoca cuando se hace `await` sobre la cadena de UPDATE.
    then: (resolve: (value: unknown) => void) => {
      const error = (opts.updateErrors ?? [])[awaited] ?? null
      awaited += 1
      resolve({ data: null, error })
    },
  }

  const from = vi.fn(() => builder)
  return {
    client: { from } as unknown as ServiceClient,
    from,
    updateCalls,
    eqCalls,
    isCalls,
  }
}

function account(overrides: Partial<ConnectAccountLike> = {}): ConnectAccountLike {
  return {
    id: "acct_1",
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    requirements: { currently_due: [], disabled_reason: null },
    ...overrides,
  }
}

function restaurantRow(overrides: Record<string, unknown> = {}) {
  return {
    stripe_account_id: "acct_1",
    stripe_charges_enabled: true,
    stripe_payouts_enabled: true,
    stripe_details_submitted: true,
    stripe_requirements_due: [] as string[],
    stripe_onboarded_at: "2026-01-01T00:00:00.000Z",
    platform_fee_percent: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Por defecto el enrutamiento está apagado (es el default del producto).
  delete process.env.STRIPE_CONNECT_ENABLED
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete process.env.STRIPE_CONNECT_ENABLED
})

// ------------------------------------------------------------
// Interruptor de plataforma
// ------------------------------------------------------------

describe("isConnectRoutingEnabled", () => {
  it("está apagado cuando la variable no existe", () => {
    expect(isConnectRoutingEnabled()).toBe(false)
  })

  it("acepta exactamente 'true' y '1'", () => {
    vi.stubEnv("STRIPE_CONNECT_ENABLED", "true")
    expect(isConnectRoutingEnabled()).toBe(true)
    vi.stubEnv("STRIPE_CONNECT_ENABLED", "1")
    expect(isConnectRoutingEnabled()).toBe(true)
  })

  it("rechaza cualquier otro valor (incluido 'TRUE' y 'yes')", () => {
    for (const value of ["false", "0", "TRUE", "yes", "", "on"]) {
      vi.stubEnv("STRIPE_CONNECT_ENABLED", value)
      expect(isConnectRoutingEnabled(), `valor ${value}`).toBe(false)
    }
  })
})

// ------------------------------------------------------------
// Comisión
// ------------------------------------------------------------

describe("computeApplicationFee", () => {
  it("devuelve 0 sin comisión configurada (paridad con Take App)", () => {
    expect(computeApplicationFee(15_000, 0)).toBe(0)
  })

  it("redondea al centavo más cercano", () => {
    expect(computeApplicationFee(10_000, 2.5)).toBe(250)
    expect(computeApplicationFee(333, 10)).toBe(33)
    expect(computeApplicationFee(335, 10)).toBe(34)
  })

  it("nunca devuelve una comisión igual o mayor al total", () => {
    // Stripe rechaza application_fee_amount >= amount; además dejaría al
    // restaurante sin nada.
    expect(computeApplicationFee(5_000, 100)).toBe(0)
    expect(computeApplicationFee(5_000, 150)).toBe(0)
    expect(computeApplicationFee(1, 50)).toBe(0) // redondea a 1 = amount
  })

  it("devuelve 0 con montos o porcentajes inválidos", () => {
    expect(computeApplicationFee(0, 10)).toBe(0)
    expect(computeApplicationFee(-100, 10)).toBe(0)
    expect(computeApplicationFee(Number.NaN, 10)).toBe(0)
    expect(computeApplicationFee(10_000, -5)).toBe(0)
    expect(computeApplicationFee(10_000, Number.NaN)).toBe(0)
  })
})

describe("parsePlatformFeePercent", () => {
  it("acepta 0 y los decimales con dos cifras", () => {
    expect(parsePlatformFeePercent(0)).toEqual({ ok: true, value: 0 })
    expect(parsePlatformFeePercent(2.5)).toEqual({ ok: true, value: 2.5 })
    expect(parsePlatformFeePercent(2.55)).toEqual({ ok: true, value: 2.55 })
    expect(parsePlatformFeePercent(99.99)).toEqual({ ok: true, value: 99.99 })
  })

  it("acepta lo que teclea un humano en un input de texto", () => {
    expect(parsePlatformFeePercent(" 3 ")).toEqual({ ok: true, value: 3 })
    expect(parsePlatformFeePercent("2,5")).toEqual({ ok: true, value: 2.5 })
  })

  it("rechaza 100 porque dejaría al restaurante sin nada", () => {
    // `computeApplicationFee(_, 100)` devuelve 0: el admin creería haber
    // fijado una comisión del 100 % y en realidad no cobraría nada.
    const result = parsePlatformFeePercent(100)
    expect(result.ok).toBe(false)
    expect(parsePlatformFeePercent(150).ok).toBe(false)
  })

  it("rechaza negativos, vacíos y no numéricos", () => {
    expect(parsePlatformFeePercent(-1).ok).toBe(false)
    expect(parsePlatformFeePercent("").ok).toBe(false)
    expect(parsePlatformFeePercent(null).ok).toBe(false)
    expect(parsePlatformFeePercent(undefined).ok).toBe(false)
    expect(parsePlatformFeePercent("dos").ok).toBe(false)
  })

  it("rechaza más de dos decimales para que lo guardado sea lo aplicado", () => {
    expect(parsePlatformFeePercent(1.005).ok).toBe(false)
    expect(parsePlatformFeePercent("2.4999").ok).toBe(false)
  })

  it("sobrevive a un objeto o un arreglo en vez de un número", () => {
    expect(parsePlatformFeePercent({ percent: 3 }).ok).toBe(false)
    expect(parsePlatformFeePercent([3]).ok).toBe(false)
  })
})

// ------------------------------------------------------------
// Reembolso
// ------------------------------------------------------------

describe("buildRefundParams", () => {
  it("revierte la transferencia cuando el cargo se enrutó al restaurante", () => {
    // Sin reverse_transfer, Stripe reembolsa al cliente con fondos de la
    // plataforma y el restaurante conserva su liquidación.
    expect(buildRefundParams({ routed: true, applicationFeeAmount: 0 })).toEqual({
      reverse_transfer: true,
    })
  })

  it("devuelve también la comisión cuando el cargo la llevaba", () => {
    expect(buildRefundParams({ routed: true, applicationFeeAmount: 1_500 })).toEqual({
      reverse_transfer: true,
      refund_application_fee: true,
    })
  })

  it("omite refund_application_fee si no había comisión", () => {
    // Stripe rechaza `refund_application_fee` en un cargo sin comisión.
    for (const fee of [0, null, undefined]) {
      const params = buildRefundParams({ routed: true, applicationFeeAmount: fee })
      expect(params.refund_application_fee).toBeUndefined()
    }
  })

  it("no pide nada cuando el cargo vive contra la cuenta de la plataforma", () => {
    // Connect apagado: no hay transferencia que revertir ni comisión que
    // devolver, y mandar las banderas haría fallar el reembolso.
    expect(buildRefundParams({ routed: false, applicationFeeAmount: 1_500 })).toEqual({})
  })
})

// ------------------------------------------------------------
// Normalización del estado
// ------------------------------------------------------------

describe("connectSnapshotFromAccount", () => {
  it("normaliza los flags a booleanos estrictos", () => {
    const snapshot = connectSnapshotFromAccount({ id: "acct_x" })
    expect(snapshot).toEqual({
      accountId: "acct_x",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requirementsDue: [],
      disabledReason: null,
    })
  })

  it("descarta entradas vacías de currently_due", () => {
    const snapshot = connectSnapshotFromAccount(
      account({
        requirements: {
          currently_due: ["external_account", "", "business_profile.url"],
          disabled_reason: "requirements.past_due",
        },
      })
    )
    expect(snapshot.requirementsDue).toEqual(["external_account", "business_profile.url"])
    expect(snapshot.disabledReason).toBe("requirements.past_due")
  })
})

describe("connectStatusFromRestaurant", () => {
  it("es not_connected sin cuenta Express", () => {
    const status = connectStatusFromRestaurant(
      restaurantRow({ stripe_account_id: null })
    )
    expect(status.state).toBe("not_connected")
    expect(status.chargeable).toBe(false)
  })

  it("es pending con cuenta creada pero sin verificar", () => {
    const status = connectStatusFromRestaurant(
      restaurantRow({ stripe_charges_enabled: false, stripe_payouts_enabled: false })
    )
    expect(status.state).toBe("pending")
    expect(status.chargeable).toBe(false)
  })

  it("es active sólo con charges y payouts habilitados", () => {
    expect(connectStatusFromRestaurant(restaurantRow()).state).toBe("active")
    expect(
      connectStatusFromRestaurant(restaurantRow({ stripe_payouts_enabled: false })).state
    ).toBe("pending")
    expect(
      connectStatusFromRestaurant(restaurantRow({ stripe_charges_enabled: false })).state
    ).toBe("pending")
  })

  it("expone la comisión configurada y el sello de onboarding", () => {
    const status = connectStatusFromRestaurant(
      restaurantRow({ platform_fee_percent: 3.5, stripe_onboarded_at: null })
    )
    expect(status.platformFeePercent).toBe(3.5)
    expect(status.onboardedAt).toBeNull()
  })

  it("tolera requirements_due nulo", () => {
    const status = connectStatusFromRestaurant(
      restaurantRow({ stripe_requirements_due: null })
    )
    expect(status.requirementsDue).toEqual([])
  })
})

describe("connectStatusFromAccount", () => {
  it("es restricted cuando Stripe reporta disabled_reason", () => {
    const status = connectStatusFromAccount(
      account({ requirements: { currently_due: ["x"], disabled_reason: "rejected.fraud" } }),
      0
    )
    expect(status.state).toBe("restricted")
    expect(status.chargeable).toBe(false)
  })

  it("es active y chargeable con la cuenta completa", () => {
    const status = connectStatusFromAccount(account(), 2)
    expect(status.state).toBe("active")
    expect(status.chargeable).toBe(true)
    expect(status.platformFeePercent).toBe(2)
  })
})

// ------------------------------------------------------------
// Destination charges
// ------------------------------------------------------------

describe("buildDestinationChargeParams", () => {
  const chargeable = connectStatusFromRestaurant(restaurantRow({ platform_fee_percent: 2 }))

  it("no enruta nada si el interruptor de plataforma está apagado", () => {
    expect(
      buildDestinationChargeParams({ status: chargeable, amountCents: 10_000 })
    ).toEqual({})
  })

  it("no enruta nada si el restaurante no puede cobrar", () => {
    vi.stubEnv("STRIPE_CONNECT_ENABLED", "true")
    const pending = connectStatusFromRestaurant(
      restaurantRow({ stripe_charges_enabled: false })
    )
    expect(
      buildDestinationChargeParams({ status: pending, amountCents: 10_000 })
    ).toEqual({})
    const none = connectStatusFromRestaurant(restaurantRow({ stripe_account_id: null }))
    expect(buildDestinationChargeParams({ status: none, amountCents: 10_000 })).toEqual({})
  })

  it("manda sólo el destino cuando la comisión es 0", () => {
    vi.stubEnv("STRIPE_CONNECT_ENABLED", "true")
    const zero = connectStatusFromRestaurant(restaurantRow({ platform_fee_percent: 0 }))
    expect(buildDestinationChargeParams({ status: zero, amountCents: 10_000 })).toEqual({
      transfer_data: { destination: "acct_1" },
    })
  })

  it("manda destino y comisión cuando hay comisión", () => {
    vi.stubEnv("STRIPE_CONNECT_ENABLED", "true")
    expect(
      buildDestinationChargeParams({ status: chargeable, amountCents: 10_000 })
    ).toEqual({
      transfer_data: { destination: "acct_1" },
      application_fee_amount: 200,
    })
  })

  it("omite la comisión si el cálculo la deja fuera de rango", () => {
    vi.stubEnv("STRIPE_CONNECT_ENABLED", "true")
    const full = connectStatusFromRestaurant(restaurantRow({ platform_fee_percent: 100 }))
    expect(buildDestinationChargeParams({ status: full, amountCents: 10_000 })).toEqual({
      transfer_data: { destination: "acct_1" },
    })
  })
})

// ------------------------------------------------------------
// Sincronización del estado
// ------------------------------------------------------------

describe("syncConnectAccount", () => {
  it("escribe los flags y empareja por stripe_account_id", async () => {
    const sb = makeSupabase()
    await syncConnectAccount(
      sb.client,
      connectSnapshotFromAccount(account({ id: "acct_9" }))
    )
    expect(sb.updateCalls[0]).toEqual({
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
      stripe_requirements_due: [],
    })
    // Ambos writes (flags + sello) emparejan por la cuenta de Stripe.
    expect(sb.eqCalls).toEqual([
      ["stripe_account_id", "acct_9"],
      ["stripe_account_id", "acct_9"],
    ])
  })

  it("sella stripe_onboarded_at sólo al estar completamente verificado", async () => {
    const sb = makeSupabase()
    await syncConnectAccount(sb.client, connectSnapshotFromAccount(account()))
    expect(sb.updateCalls).toHaveLength(2)
    expect(sb.updateCalls[1]).toHaveProperty("stripe_onboarded_at")
    // La condición vive en el WHERE para no reescribir el sello en cada evento.
    expect(sb.isCalls).toEqual([["stripe_onboarded_at", null]])
  })

  it("no sella si la cuenta está incompleta", async () => {
    const sb = makeSupabase()
    await syncConnectAccount(
      sb.client,
      connectSnapshotFromAccount(account({ payouts_enabled: false }))
    )
    expect(sb.updateCalls).toHaveLength(1)
    expect(sb.updateCalls[0]).not.toHaveProperty("stripe_onboarded_at")
  })

  it("no sella si Stripe bloqueó la cuenta aunque los flags vengan en true", async () => {
    const sb = makeSupabase()
    await syncConnectAccount(
      sb.client,
      connectSnapshotFromAccount(
        account({ requirements: { currently_due: [], disabled_reason: "rejected.fraud" } })
      )
    )
    expect(sb.updateCalls).toHaveLength(1)
  })

  it("registra el error y no sella cuando el UPDATE falla", async () => {
    const sb = makeSupabase({ updateErrors: [{ message: "permission denied" }] })
    await syncConnectAccount(sb.client, connectSnapshotFromAccount(account()))
    expect(logger.error).toHaveBeenCalledWith(
      "stripe.connect.sync_failed",
      expect.objectContaining({ account: "acct_1", error: "permission denied" })
    )
    expect(sb.updateCalls).toHaveLength(1)
  })

  it("registra el error del sello sin propagarlo", async () => {
    const sb = makeSupabase({ updateErrors: [null, { message: "boom" }] })
    await expect(
      syncConnectAccount(sb.client, connectSnapshotFromAccount(account()))
    ).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalledWith(
      "stripe.connect.onboarded_stamp_failed",
      expect.objectContaining({ error: "boom" })
    )
  })
})

describe("handleConnectAccountUpdated", () => {
  it("normaliza el account del evento y lo sincroniza", async () => {
    const sb = makeSupabase()
    await handleConnectAccountUpdated(
      sb.client,
      account({
        id: "acct_7",
        charges_enabled: false,
        requirements: { currently_due: ["external_account"], disabled_reason: null },
      })
    )
    expect(sb.updateCalls[0]).toEqual({
      stripe_charges_enabled: false,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
      stripe_requirements_due: ["external_account"],
    })
    expect(sb.eqCalls).toEqual([["stripe_account_id", "acct_7"]])
  })
})

// ------------------------------------------------------------
// Lecturas
// ------------------------------------------------------------

describe("getRestaurantConnectStatus", () => {
  it("devuelve null si el restaurante no existe", async () => {
    const sb = makeSupabase({ selectData: null })
    expect(await getRestaurantConnectStatus(sb.client, "r1")).toBeNull()
  })

  it("devuelve null y registra el error de lectura", async () => {
    const sb = makeSupabase({ selectError: { message: "nope" } })
    expect(await getRestaurantConnectStatus(sb.client, "r1")).toBeNull()
    expect(logger.error).toHaveBeenCalledWith(
      "stripe.connect.status_read_failed",
      expect.objectContaining({ restaurant: "r1", error: "nope" })
    )
  })

  it("deriva el estado de la fila", async () => {
    const sb = makeSupabase({
      selectData: restaurantRow({ platform_fee_percent: 1.5 }),
    })
    const status = await getRestaurantConnectStatus(sb.client, "r1")
    expect(status?.state).toBe("active")
    expect(status?.chargeable).toBe(true)
    expect(status?.platformFeePercent).toBe(1.5)
  })
})

describe("fetchConnectAccount", () => {
  it("consulta la cuenta por id", async () => {
    mocks.accountsRetrieve.mockResolvedValue(account({ id: "acct_5" }))
    const result = await fetchConnectAccount("acct_5")
    expect(mocks.accountsRetrieve).toHaveBeenCalledWith("acct_5")
    expect(result.id).toBe("acct_5")
  })
})

// ------------------------------------------------------------
// Llamadas a Stripe
// ------------------------------------------------------------

describe("createExpressAccountForRestaurant", () => {
  it("crea una cuenta Express con las dos capacidades y el restaurante en metadata", async () => {
    mocks.accountsCreate.mockResolvedValue({ id: "acct_new" })
    const id = await createExpressAccountForRestaurant({
      restaurantId: "r1",
      restaurantName: "Taquería El Compa",
      email: "dueno@example.com",
    })
    expect(id).toBe("acct_new")
    expect(mocks.accountsCreate).toHaveBeenCalledWith({
      type: "express",
      country: CONNECT_COUNTRY,
      email: "dueno@example.com",
      business_profile: { name: "Taquería El Compa" },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { foodos_restaurant_id: "r1" },
    })
  })

  it("omite el email cuando no hay", async () => {
    mocks.accountsCreate.mockResolvedValue({ id: "acct_new" })
    await createExpressAccountForRestaurant({
      restaurantId: "r1",
      restaurantName: "Sin correo",
      email: null,
    })
    expect(mocks.accountsCreate.mock.calls[0]?.[0]).not.toHaveProperty("email")
  })
})

describe("createConnectOnboardingLink", () => {
  it("pide un account_onboarding con return y refresh", async () => {
    mocks.accountLinksCreate.mockResolvedValue({ url: "https://connect.stripe.com/setup" })
    const url = await createConnectOnboardingLink({
      accountId: "acct_1",
      returnUrl: "https://resurte.me/panel/foodos/restaurante?connect=done",
      refreshUrl: "https://resurte.me/panel/foodos/restaurante?connect=refresh",
    })
    expect(url).toBe("https://connect.stripe.com/setup")
    expect(mocks.accountLinksCreate).toHaveBeenCalledWith({
      account: "acct_1",
      type: "account_onboarding",
      return_url: "https://resurte.me/panel/foodos/restaurante?connect=done",
      refresh_url: "https://resurte.me/panel/foodos/restaurante?connect=refresh",
    })
  })
})

describe("createConnectDashboardLink", () => {
  it("devuelve el login link del panel Express", async () => {
    mocks.accountsCreateLoginLink.mockResolvedValue({ url: "https://connect.stripe.com/express" })
    const url = await createConnectDashboardLink("acct_1")
    expect(url).toBe("https://connect.stripe.com/express")
    expect(mocks.accountsCreateLoginLink).toHaveBeenCalledWith("acct_1")
  })
})
