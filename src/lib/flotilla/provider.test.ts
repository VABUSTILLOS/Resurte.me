import { describe, expect, it, vi } from "vitest"

import {
  createUberDirectProvider,
  isDeliveryProviderConfigured,
  resolveDeliveryProvider,
  uberDirectConfig,
  type ProviderDeps,
} from "@/lib/flotilla/provider"

const ENV = {
  UBER_DIRECT_CLIENT_ID: "client",
  UBER_DIRECT_CLIENT_SECRET: "secret",
  UBER_DIRECT_CUSTOMER_ID: "cust-1",
}

interface Call {
  url: string
  method: string
  body: unknown
  authorization: string | null
}

interface Reply {
  status?: number
  json?: unknown
  text?: string
}

/** `fetch` falso que registra las llamadas y responde por turno. */
function fakeFetch(replies: Reply[]) {
  const calls: Call[] = []
  let index = 0
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ?? null,
      authorization: headers.Authorization ?? null,
    })
    const reply = replies[index] ?? {}
    index += 1
    const status = reply.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => reply.json ?? {},
      text: async () => reply.text ?? "",
    } as unknown as Response
  }) as unknown as typeof fetch
  return { calls, impl }
}

function deps(impl: typeof fetch, now = 1_700_000_000_000): ProviderDeps {
  return { fetch: impl, now: () => now }
}

const TOKEN_REPLY: Reply = {
  json: { access_token: "tok-1", expires_in: 3600 },
}

const PICKUP = {
  pickupName: "Taquería",
  pickupAddress: "Calle 1",
  pickupPhone: "+525511111111",
  dropoffName: "Ana",
  dropoffAddress: "Calle 2",
  dropoffPhone: "+525522222222",
  externalRef: "order-1",
}

// ------------------------------------------------------------
// Configuración
// ------------------------------------------------------------

describe("uberDirectConfig", () => {
  it("exige las tres credenciales", () => {
    expect(uberDirectConfig({})).toBeNull()
    expect(uberDirectConfig({ UBER_DIRECT_CLIENT_ID: "c" })).toBeNull()
    expect(
      uberDirectConfig({ ...ENV, UBER_DIRECT_CLIENT_SECRET: "  " })
    ).toBeNull()
    expect(uberDirectConfig(ENV)?.customerId).toBe("cust-1")
  })

  it("se apaga con UBER_DIRECT_ENABLED=false", () => {
    expect(uberDirectConfig({ ...ENV, UBER_DIRECT_ENABLED: "false" })).toBeNull()
    expect(uberDirectConfig({ ...ENV, UBER_DIRECT_ENABLED: "FALSE" })).toBeNull()
    expect(uberDirectConfig({ ...ENV, UBER_DIRECT_ENABLED: "true" })).not.toBeNull()
  })

  it("apunta al sandbox solo si se pide explícitamente", () => {
    expect(uberDirectConfig(ENV)?.baseUrl).toBe("https://api.uber.com")
    expect(
      uberDirectConfig({ ...ENV, UBER_DIRECT_SANDBOX: "true" })?.baseUrl
    ).toBe("https://sandbox-api.uber.com")
  })

  it("usa un timeout razonable y acepta uno propio", () => {
    expect(uberDirectConfig(ENV)?.timeoutMs).toBe(12_000)
    expect(uberDirectConfig({ ...ENV, UBER_DIRECT_TIMEOUT_MS: "3000" })?.timeoutMs).toBe(3000)
    expect(uberDirectConfig({ ...ENV, UBER_DIRECT_TIMEOUT_MS: "-1" })?.timeoutMs).toBe(12_000)
  })
})

describe("resolveDeliveryProvider", () => {
  it("sin credenciales devuelve null (flotilla propia, sin romper nada)", () => {
    expect(resolveDeliveryProvider({})).toBeNull()
    expect(isDeliveryProviderConfigured({})).toBe(false)
  })

  it("con credenciales devuelve el adaptador de Uber Direct", () => {
    expect(resolveDeliveryProvider(ENV)?.id).toBe("uber_direct")
    expect(isDeliveryProviderConfigured(ENV)).toBe(true)
  })
})

// ------------------------------------------------------------
// Autenticación
// ------------------------------------------------------------

describe("autenticación", () => {
  it("pide el token con client_credentials y lo reusa entre llamadas", async () => {
    const { calls, impl } = fakeFetch([
      TOKEN_REPLY,
      { json: { id: "d1", fee: 50, dropoff_eta: "2026-01-01T00:30:00Z" } },
      { json: { id: "d2" } },
    ])
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(impl))

    await provider.dispatch({ ...PICKUP, externalRef: "o1" })
    await provider.dispatch({ ...PICKUP, externalRef: "o2" })

    const tokenCalls = calls.filter((c) => c.url.includes("login.uber.com"))
    expect(tokenCalls).toHaveLength(1)
    const authBody = tokenCalls[0]?.body as URLSearchParams
    expect(authBody.get("grant_type")).toBe("client_credentials")
    expect(authBody.get("client_id")).toBe("client")
    expect(authBody.get("scope")).toBe("delivery")

    // Las dos entregas usan el token cacheado.
    const deliveryCalls = calls.filter((c) => c.url.includes("/deliveries"))
    expect(deliveryCalls).toHaveLength(2)
    expect(deliveryCalls[0]?.authorization).toBe("Bearer tok-1")
  })

  it("sin token no intenta despachar y degrada con error", async () => {
    const { calls, impl } = fakeFetch([{ status: 401, text: "nope" }])
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(impl))

    const result = await provider.dispatch({ ...PICKUP })
    expect(result).toMatchObject({ ok: false, provider: "uber_direct" })
    // Solo el intento de token: nada más se llamó.
    expect(calls).toHaveLength(1)
  })

  it("reintenta UNA vez si el token caducó antes de tiempo", async () => {
    const { calls, impl } = fakeFetch([
      TOKEN_REPLY,
      { status: 401, text: "expired" },
      TOKEN_REPLY,
      { json: { id: "d1" } },
    ])
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(impl))

    const result = await provider.dispatch({ ...PICKUP })
    expect(result).toMatchObject({ ok: true, providerDeliveryId: "d1" })
    expect(calls.filter((c) => c.url.includes("login.uber.com"))).toHaveLength(2)
  })

  it("no reintenta en bucle si el 401 persiste", async () => {
    const { calls, impl } = fakeFetch([
      TOKEN_REPLY,
      { status: 401, text: "expired" },
      TOKEN_REPLY,
      { status: 401, text: "expired" },
      TOKEN_REPLY,
      { status: 401, text: "expired" },
    ])
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(impl))

    const result = await provider.dispatch({ ...PICKUP })
    expect(result.ok).toBe(false)
    // Token, dispatch, token, dispatch → 4 llamadas, no más.
    expect(calls).toHaveLength(4)
  })
})

// ------------------------------------------------------------
// Despacho
// ------------------------------------------------------------

describe("dispatch", () => {
  it("manda los datos del pedido y devuelve id, rastreo, ETA y costo", async () => {
    const now = Date.parse("2026-01-01T00:00:00Z")
    const { calls, impl } = fakeFetch([
      TOKEN_REPLY,
      {
        json: {
          id: "d-99",
          tracking_url: "https://track.uber.com/d-99",
          dropoff_eta: "2026-01-01T00:35:00Z",
          fee: 62.5,
        },
      },
    ])
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(impl, now))

    const result = await provider.dispatch({ ...PICKUP, dropoffNotes: "Portón azul" })
    expect(result).toEqual({
      ok: true,
      provider: "uber_direct",
      providerDeliveryId: "d-99",
      trackingUrl: "https://track.uber.com/d-99",
      etaMinutes: 35,
      fee: 62.5,
    })

    const dispatchCall = calls.find((c) => c.url.endsWith("/deliveries"))
    expect(dispatchCall?.url).toBe(
      "https://api.uber.com/v1/customers/cust-1/deliveries"
    )
    expect(dispatchCall?.method).toBe("POST")
    expect(JSON.parse(String(dispatchCall?.body))).toMatchObject({
      pickup_address: "Calle 1",
      dropoff_address: "Calle 2",
      external_id: "order-1",
      dropoff_notes: "Portón azul",
    })
  })

  it("omite las notas vacías en vez de mandar un campo en blanco", async () => {
    const { calls, impl } = fakeFetch([TOKEN_REPLY, { json: { id: "d1" } }])
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(impl))

    await provider.dispatch({ ...PICKUP, dropoffNotes: "   " })
    const body = JSON.parse(String(calls.find((c) => c.url.endsWith("/deliveries"))?.body))
    expect(body).not.toHaveProperty("dropoff_notes")
  })

  it("adjunta la cotización previa cuando existe", async () => {
    const { calls, impl } = fakeFetch([TOKEN_REPLY, { json: { id: "d1" } }])
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(impl))

    await provider.dispatch({ ...PICKUP, quoteId: "q-7" })
    const body = JSON.parse(String(calls.find((c) => c.url.endsWith("/deliveries"))?.body))
    expect(body.quote_id).toBe("q-7")
  })

  it("un error del proveedor no lanza: devuelve el motivo", async () => {
    const { impl } = fakeFetch([TOKEN_REPLY, { status: 422, text: "bad address" }])
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(impl))

    await expect(provider.dispatch({ ...PICKUP })).resolves.toEqual({
      ok: false,
      provider: "uber_direct",
      error: "Uber Direct 422",
    })
  })

  it("un fallo de red no lanza: devuelve el motivo", async () => {
    const boom = (async () => {
      throw new Error("ECONNRESET")
    }) as unknown as typeof fetch
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(boom))

    const result = await provider.dispatch({ ...PICKUP })
    expect(result).toMatchObject({ ok: false, provider: "uber_direct" })
  })

  it("tolera una respuesta sin id ni rastreo", async () => {
    const { impl } = fakeFetch([TOKEN_REPLY, { json: {} }])
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(impl))

    await expect(provider.dispatch({ ...PICKUP })).resolves.toEqual({
      ok: true,
      provider: "uber_direct",
      providerDeliveryId: null,
      trackingUrl: null,
      etaMinutes: null,
      fee: null,
    })
  })
})

// ------------------------------------------------------------
// Cotización y cancelación
// ------------------------------------------------------------

describe("quote", () => {
  it("devuelve costo y ETA redondeando hacia arriba", async () => {
    const now = Date.parse("2026-01-01T00:00:00Z")
    const { impl } = fakeFetch([
      TOKEN_REPLY,
      { json: { id: "q1", fee: "48.00", dropoff_eta: "2026-01-01T00:12:30Z" } },
    ])
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(impl, now))

    await expect(
      provider.quote({ pickupAddress: "Calle 1", dropoffAddress: "Calle 2" })
    ).resolves.toEqual({ id: "q1", fee: 48, etaMinutes: 13 })
  })

  it("sin cotización disponible devuelve null en vez de inventar un precio", async () => {
    const { impl } = fakeFetch([TOKEN_REPLY, { status: 404, text: "not found" }])
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(impl))

    await expect(
      provider.quote({ pickupAddress: "Calle 1", dropoffAddress: "Calle 2" })
    ).resolves.toBeNull()
  })

  it("una ETA ya vencida se reporta como 0, no como negativa", async () => {
    const now = Date.parse("2026-01-01T01:00:00Z")
    const { impl } = fakeFetch([
      TOKEN_REPLY,
      { json: { dropoff_eta: "2026-01-01T00:30:00Z" } },
    ])
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(impl, now))

    expect(
      (await provider.quote({ pickupAddress: "a", dropoffAddress: "b" }))?.etaMinutes
    ).toBe(0)
  })
})

describe("cancel", () => {
  it("cancela por id de proveedor", async () => {
    const { calls, impl } = fakeFetch([TOKEN_REPLY, { json: {} }])
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(impl))

    await expect(provider.cancel("d-99")).resolves.toEqual({
      ok: true,
      provider: "uber_direct",
    })
    expect(calls[1]?.url).toBe(
      "https://api.uber.com/v1/customers/cust-1/deliveries/d-99/cancel"
    )
  })

  it("si el proveedor rechaza la cancelación, lo reporta", async () => {
    const { impl } = fakeFetch([TOKEN_REPLY, { status: 409, text: "already delivered" }])
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(impl))

    await expect(provider.cancel("d-99")).resolves.toEqual({
      ok: false,
      provider: "uber_direct",
      error: "Uber Direct 409",
    })
  })

  it("escapa el id para que no se pueda inyectar una ruta", async () => {
    const { calls, impl } = fakeFetch([TOKEN_REPLY, { json: {} }])
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(impl))

    await provider.cancel("../../admin")
    expect(calls[1]?.url).toContain("..%2F..%2Fadmin")
    expect(calls[1]?.url).not.toContain("/admin")
  })
})

// ------------------------------------------------------------
// Seguridad
// ------------------------------------------------------------

describe("seguridad", () => {
  it("nunca registra el secreto ni el token", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { impl } = fakeFetch([TOKEN_REPLY, { status: 500, text: "boom" }])
    const provider = createUberDirectProvider(uberDirectConfig(ENV)!, deps(impl))

    await provider.dispatch({ ...PICKUP })

    const logged = warn.mock.calls.flat().map(String).join(" ")
    expect(logged).not.toContain("secret")
    expect(logged).not.toContain("tok-1")
    warn.mockRestore()
  })
})
