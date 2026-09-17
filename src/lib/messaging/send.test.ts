import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { SmsAdapter } from "@/lib/messaging/sms"
import type { WhatsAppConfig } from "@/lib/whatsapp"

const mocks = vi.hoisted(() => ({
  sendTextMessage:
    vi.fn<(params: { to: string; text: string }, config?: WhatsAppConfig) => Promise<unknown>>(),
  resolveSmsAdapter:
    vi.fn<(env?: Record<string, string | undefined>) => SmsAdapter | null>(),
  actualResolveSmsAdapter: null as
    | ((env?: Record<string, string | undefined>) => SmsAdapter | null)
    | null,
}))

vi.mock("@/lib/whatsapp", () => ({ sendTextMessage: mocks.sendTextMessage }))

// El adaptador real se conserva como implementación por defecto: los tests
// que necesitan un adaptador distinto (uno que lanza) lo inyectan.
vi.mock("@/lib/messaging/sms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/messaging/sms")>()
  mocks.actualResolveSmsAdapter = actual.resolveSmsAdapter
  return { ...actual, resolveSmsAdapter: mocks.resolveSmsAdapter }
})

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { encryptToken } from "@/lib/foodos-whatsapp"
import { logger } from "@/lib/logger"
import { resolveChannel } from "@/lib/messaging/channel"
import {
  loadMessagingCapabilities,
  sendMarketingMessage,
  type MessagingCapabilities,
  type SendMarketingMessageParams,
} from "@/lib/messaging/send"

const TEST_KEY = "clave-de-prueba-m3"
const TEST_TOKEN = "EAAG-token-de-prueba"

/** Se cifra una sola vez, con la clave puesta y luego retirada del entorno. */
const ENCRYPTED_TOKEN = (() => {
  const previous = process.env.FOODOS_WA_ENCRYPTION_KEY
  process.env.FOODOS_WA_ENCRYPTION_KEY = TEST_KEY
  try {
    return encryptToken(TEST_TOKEN)
  } finally {
    if (previous === undefined) delete process.env.FOODOS_WA_ENCRYPTION_KEY
    else process.env.FOODOS_WA_ENCRYPTION_KEY = previous
  }
})()

const WA_CONFIG: WhatsAppConfig = {
  accessToken: "token-del-restaurante",
  phoneNumberId: "pn-rest-1",
  wabaId: "waba-rest-1",
}

type Call = { table: string; method: string; args: unknown[] }

/** Cliente falso mínimo: una sola tabla, encadenable y awaitable. */
function fakeClient(options: { row?: unknown; error?: unknown; throws?: boolean } = {}) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {}
      for (const method of ["select", "eq", "order", "limit"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args })
          return builder
        }
      }
      // PostgREST nunca devuelve `data` y `error` a la vez.
      const response = () => ({
        data: options.error ? null : (options.row ?? null),
        error: options.error ?? null,
      })
      builder.maybeSingle = async () => {
        calls.push({ table, method: "maybeSingle", args: [] })
        if (options.throws) throw new Error("sin conexión")
        return response()
      }
      builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(response()).then(resolve)
      return builder
    },
  }
  return { supabase: client as unknown as SupabaseClient, calls }
}

function connectionRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    phone_number_id: "pn-rest-1",
    waba_id: "waba-rest-1",
    access_token_enc: ENCRYPTED_TOKEN,
    status: "connected",
    ...over,
  }
}

function caps(over: Partial<MessagingCapabilities> = {}): MessagingCapabilities {
  return { whatsapp: false, sms: false, waConfig: null, ...over }
}

function params(over: Partial<SendMarketingMessageParams> = {}): SendMarketingMessageParams {
  return {
    caps: caps(),
    to: "5215512345678",
    text: "Hola 👋",
    preferred: "whatsapp",
    smsOptIn: false,
    ...over,
  }
}

type FetchInit = {
  method?: string
  headers?: Record<string, string>
  body?: URLSearchParams
}

function stubFetch(response: { ok?: boolean; status?: number; body?: unknown; text?: string } = {}) {
  const fetchMock = vi.fn(async (_url: string, _init?: FetchInit) => ({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.body ?? { sid: "SM123" },
    text: async () => response.text ?? "",
  }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function enableTwilio(over: Record<string, string> = {}) {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC-test")
  vi.stubEnv("TWILIO_AUTH_TOKEN", "token-secreto")
  vi.stubEnv("TWILIO_FROM", "+5215555000000")
  for (const [key, value] of Object.entries(over)) vi.stubEnv(key, value)
}

function twilioInit(fetchMock: ReturnType<typeof stubFetch>): FetchInit {
  return fetchMock.mock.calls[0]![1]!
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.resolveSmsAdapter.mockImplementation((env) => mocks.actualResolveSmsAdapter!(env))

  // Base determinista: sin capacidades de plataforma salvo que el test las pida.
  for (const key of [
    "SMS_ENABLED",
    "SMS_PROVIDER",
    "SMS_TIMEOUT_MS",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_FROM",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "FOODOS_WA_ENCRYPTION_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    vi.stubEnv(key, "")
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("loadMessagingCapabilities", () => {
  it("sin conexión ni credenciales globales no hay ninguna capacidad", async () => {
    const { supabase } = fakeClient({ row: null })
    await expect(loadMessagingCapabilities(supabase, "rest-1")).resolves.toEqual({
      whatsapp: false,
      sms: false,
      waConfig: null,
    })
  })

  it("consulta la conexión del restaurante que se le pide", async () => {
    const { supabase, calls } = fakeClient({ row: null })
    await loadMessagingCapabilities(supabase, "rest-42")
    expect(calls).toContainEqual({
      table: "foodos_whatsapp_connections",
      method: "eq",
      args: ["restaurant_id", "rest-42"],
    })
  })

  it("con conexión del restaurante devuelve el token descifrado", async () => {
    vi.stubEnv("FOODOS_WA_ENCRYPTION_KEY", TEST_KEY)
    const { supabase } = fakeClient({ row: connectionRow() })
    const result = await loadMessagingCapabilities(supabase, "rest-1")
    expect(result.whatsapp).toBe(true)
    expect(result.waConfig).toEqual({
      accessToken: TEST_TOKEN,
      phoneNumberId: "pn-rest-1",
      wabaId: "waba-rest-1",
    })
  })

  it("un error de consulta deja al restaurante sin WhatsApp, sin lanzar", async () => {
    vi.stubEnv("FOODOS_WA_ENCRYPTION_KEY", TEST_KEY)
    const { supabase } = fakeClient({ row: connectionRow(), error: { message: "boom" } })
    const result = await loadMessagingCapabilities(supabase, "rest-1")
    expect(result.waConfig).toBeNull()
    expect(result.whatsapp).toBe(false)
  })

  it("si la consulta revienta, degrada en vez de propagar el fallo", async () => {
    vi.stubEnv("FOODOS_WA_ENCRYPTION_KEY", TEST_KEY)
    const { supabase } = fakeClient({ throws: true })
    const result = await loadMessagingCapabilities(supabase, "rest-1")
    expect(result.waConfig).toBeNull()
    expect(result.whatsapp).toBe(false)
    // La degradación deja de ser silenciosa: sin el aviso, el envío caería al
    // WhatsApp global de la plataforma sin rastro en los logs.
    expect(logger.warn).toHaveBeenCalledWith(
      "messaging.wa-config",
      expect.objectContaining({ restaurantId: "rest-1" })
    )
  })

  it("si el token guardado no se puede descifrar, degrada en vez de propagar", async () => {
    // Sin `FOODOS_WA_ENCRYPTION_KEY` ni `SUPABASE_SERVICE_ROLE_KEY` el descifrado
    // falla: la campaña debe seguir sin WhatsApp del restaurante, no reventar.
    const { supabase } = fakeClient({ row: connectionRow() })
    const result = await loadMessagingCapabilities(supabase, "rest-1")
    expect(result.waConfig).toBeNull()
    expect(result.whatsapp).toBe(false)
  })

  it("una conexión sin token guardado degrada en vez de lanzar", async () => {
    vi.stubEnv("FOODOS_WA_ENCRYPTION_KEY", TEST_KEY)
    const { supabase } = fakeClient({ row: connectionRow({ access_token_enc: null }) })
    const result = await loadMessagingCapabilities(supabase, "rest-1")
    expect(result.waConfig).toBeNull()
    expect(result.whatsapp).toBe(false)
  })

  it("las credenciales globales cuentan como capacidad, sin inventar config de restaurante", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token-global")
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "pn-global")
    const { supabase } = fakeClient({ row: null })
    const result = await loadMessagingCapabilities(supabase, "rest-1")
    expect(result.whatsapp).toBe(true)
    expect(result.waConfig).toBeNull()
  })

  it("si la conexión del restaurante falla, la campaña sale por el global pero queda avisada", async () => {
    // El módulo existe para que las campañas NO salgan por el WhatsApp global
    // (ver cabecera de send.ts). Un fallo al descifrar el token sigue degradando
    // a `waConfig: null` y el envío cae al número de la plataforma, pero ya no
    // en silencio: el aviso es lo que hace diagnosticable este caso.
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token-global")
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "pn-global")
    const { supabase } = fakeClient({ row: connectionRow() })

    const loaded = await loadMessagingCapabilities(supabase, "rest-1")
    expect(loaded).toEqual({ whatsapp: true, sms: false, waConfig: null })

    await sendMarketingMessage(params({ caps: loaded }))
    expect(mocks.sendTextMessage).toHaveBeenCalledWith(expect.anything(), undefined)
    expect(logger.warn).toHaveBeenCalledWith(
      "messaging.wa-config",
      expect.objectContaining({ restaurantId: "rest-1" })
    )
  })

  it("con una sola de las dos credenciales globales no hay WhatsApp", async () => {
    const partials: Array<Record<string, string>> = [
      { WHATSAPP_ACCESS_TOKEN: "token-global" },
      { WHATSAPP_PHONE_NUMBER_ID: "pn-global" },
    ]
    for (const partial of partials) {
      for (const [key, value] of Object.entries(partial)) vi.stubEnv(key, value)
      const { supabase } = fakeClient({ row: null })
      const result = await loadMessagingCapabilities(supabase, "rest-1")
      expect(result.whatsapp, JSON.stringify(partial)).toBe(false)
      for (const key of Object.keys(partial)) vi.stubEnv(key, "")
    }
  })

  it("con credenciales de Twilio hay SMS", async () => {
    enableTwilio()
    const { supabase } = fakeClient({ row: null })
    const result = await loadMessagingCapabilities(supabase, "rest-1")
    expect(result.sms).toBe(true)
    expect(result.whatsapp).toBe(false)
  })

  it("SMS_ENABLED=false apaga el SMS aunque haya credenciales", async () => {
    enableTwilio({ SMS_ENABLED: "false" })
    const { supabase } = fakeClient({ row: null })
    const result = await loadMessagingCapabilities(supabase, "rest-1")
    expect(result.sms).toBe(false)
  })

  it("un proveedor de SMS distinto de Twilio no cuenta como capacidad", async () => {
    enableTwilio({ SMS_PROVIDER: "vonage" })
    const { supabase } = fakeClient({ row: null })
    const result = await loadMessagingCapabilities(supabase, "rest-1")
    expect(result.sms).toBe(false)
  })

  it("un SMS_TIMEOUT_MS inválido no deja al restaurante sin SMS", async () => {
    enableTwilio({ SMS_TIMEOUT_MS: "no-es-un-numero" })
    const { supabase } = fakeClient({ row: null })
    const result = await loadMessagingCapabilities(supabase, "rest-1")
    expect(result.sms).toBe(true)
  })

  it("las capacidades son independientes entre sí", async () => {
    vi.stubEnv("FOODOS_WA_ENCRYPTION_KEY", TEST_KEY)
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token-global")
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "pn-global")
    enableTwilio()
    const { supabase } = fakeClient({ row: connectionRow() })
    const result = await loadMessagingCapabilities(supabase, "rest-1")
    expect(result.whatsapp).toBe(true)
    expect(result.sms).toBe(true)
    expect(result.waConfig?.accessToken).toBe(TEST_TOKEN)
  })
})

describe("sendMarketingMessage / sin canal disponible", () => {
  it("devuelve un resultado tipado en vez de lanzar", async () => {
    const result = await sendMarketingMessage(params())
    expect(result).toEqual({
      ok: false,
      channel: null,
      provider: null,
      reason: "whatsapp_unavailable",
      error: null,
    })
    expect(mocks.sendTextMessage).not.toHaveBeenCalled()
  })

  it("explica el motivo según lo que se pidió", async () => {
    const cases: Array<{
      preferred: SendMarketingMessageParams["preferred"]
      caps: MessagingCapabilities
      smsOptIn: boolean
      reason: string
    }> = [
      {
        preferred: "sms",
        caps: caps({ sms: false }),
        smsOptIn: false,
        reason: "sms_unavailable",
      },
      {
        preferred: "sms",
        caps: caps({ sms: true }),
        smsOptIn: false,
        reason: "no_sms_opt_in",
      },
      {
        preferred: "both",
        caps: caps({ sms: false }),
        smsOptIn: false,
        reason: "whatsapp_unavailable",
      },
      {
        preferred: "both",
        caps: caps({ sms: true }),
        smsOptIn: false,
        reason: "no_sms_opt_in",
      },
      {
        // Pedir WhatsApp es una decisión explícita: no cae a SMS por su cuenta.
        preferred: "whatsapp",
        caps: caps({ sms: true }),
        smsOptIn: true,
        reason: "whatsapp_unavailable",
      },
    ]

    for (const testCase of cases) {
      const fetchMock = stubFetch()
      const result = await sendMarketingMessage(
        params({
          caps: testCase.caps,
          preferred: testCase.preferred,
          smsOptIn: testCase.smsOptIn,
        })
      )
      const label = `${testCase.preferred} ${JSON.stringify(testCase.caps)}`
      expect(result.channel, label).toBeNull()
      expect(result.ok, label).toBe(false)
      expect(result.reason, label).toBe(testCase.reason)
      expect(result.error, label).toBeNull()
      expect(result.provider, label).toBeNull()
      expect(fetchMock, label).not.toHaveBeenCalled()
      expect(mocks.sendTextMessage, label).not.toHaveBeenCalled()
      vi.clearAllMocks()
    }
  })
})

describe("sendMarketingMessage / WhatsApp", () => {
  it("sale por el WhatsApp del restaurante, no por el global", async () => {
    // Regresión del bug que motivó este módulo: las campañas salían por el
    // WhatsApp global de la plataforma porque nunca se pasaba la config.
    await sendMarketingMessage(params({ caps: caps({ whatsapp: true, waConfig: WA_CONFIG }) }))
    expect(mocks.sendTextMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendTextMessage).toHaveBeenCalledWith(
      { to: "5215512345678", text: "Hola 👋" },
      WA_CONFIG
    )
  })

  it("sin conexión del restaurante deja que el cliente use la global", async () => {
    const result = await sendMarketingMessage(params({ caps: caps({ whatsapp: true }) }))
    expect(result).toMatchObject({ ok: true, channel: "whatsapp", provider: "meta", reason: "ok" })
    expect(mocks.sendTextMessage).toHaveBeenCalledWith(expect.anything(), undefined)
  })

  it("manda el teléfono reducido a dígitos", async () => {
    await sendMarketingMessage(
      params({
        caps: caps({ whatsapp: true, waConfig: WA_CONFIG }),
        to: "+52 (155) 1234-5678",
      })
    )
    expect(mocks.sendTextMessage.mock.calls[0]![0]).toEqual({
      to: "5215512345678",
      text: "Hola 👋",
    })
  })

  it("manda el texto sin tocarlo", async () => {
    const text = "Oferta:\n2x1 en tacos 🌮\n\nResponde SÍ para apartar"
    await sendMarketingMessage(params({ caps: caps({ whatsapp: true }), text }))
    expect(mocks.sendTextMessage.mock.calls[0]![0].text).toBe(text)
  })

  it("reporta el éxito con el canal y el proveedor", async () => {
    const result = await sendMarketingMessage(params({ caps: caps({ whatsapp: true }) }))
    expect(result).toEqual({
      ok: true,
      channel: "whatsapp",
      provider: "meta",
      reason: "ok",
      error: null,
    })
  })

  it("no reintenta ni cae a SMS cuando WhatsApp falla", async () => {
    const fetchMock = stubFetch()
    mocks.sendTextMessage.mockRejectedValue(new Error("Meta rechazó el mensaje"))
    const result = await sendMarketingMessage(
      params({ caps: caps({ whatsapp: true, sms: true }), smsOptIn: true })
    )
    expect(result).toEqual({
      ok: false,
      channel: "whatsapp",
      provider: "meta",
      reason: "ok",
      error: "Meta rechazó el mensaje",
    })
    expect(mocks.sendTextMessage).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("convierte un fallo que no es Error en un mensaje legible", async () => {
    mocks.sendTextMessage.mockRejectedValue("texto plano")
    const result = await sendMarketingMessage(params({ caps: caps({ whatsapp: true }) }))
    expect(result.ok).toBe(false)
    expect(result.error).toBe("Error de WhatsApp")
  })
})

describe("sendMarketingMessage / SMS", () => {
  it("sale por Twilio con el número en E.164", async () => {
    enableTwilio()
    const fetchMock = stubFetch()
    const result = await sendMarketingMessage(
      params({
        caps: caps({ sms: true }),
        preferred: "sms",
        smsOptIn: true,
        to: "+52 (155) 1234-5678",
        text: "Promo de fin de semana",
      })
    )

    expect(result).toEqual({
      ok: true,
      channel: "sms",
      provider: "twilio",
      reason: "ok",
      error: null,
    })
    expect(mocks.sendTextMessage).not.toHaveBeenCalled()

    const init = twilioInit(fetchMock)
    expect(fetchMock.mock.calls[0]![0]).toContain("/Accounts/AC-test/Messages.json")
    expect(init.method).toBe("POST")
    expect(init.body!.get("To")).toBe("+5215512345678")
    expect(init.body!.get("Body")).toBe("Promo de fin de semana")
    expect(init.body!.get("From")).toBe("+5215555000000")
    expect(init.headers?.Authorization).toBe(
      `Basic ${Buffer.from("AC-test:token-secreto").toString("base64")}`
    )
    // El secreto viaja en la cabecera, nunca en el cuerpo.
    expect(init.body!.toString()).not.toContain("token-secreto")
  })

  it("acepta un Messaging Service como remitente", async () => {
    enableTwilio({ TWILIO_FROM: "MG1234567890" })
    const fetchMock = stubFetch()
    const result = await sendMarketingMessage(
      params({ caps: caps({ sms: true }), preferred: "sms", smsOptIn: true })
    )
    expect(result.ok).toBe(true)
    const body = twilioInit(fetchMock).body!
    expect(body.get("MessagingServiceSid")).toBe("MG1234567890")
    expect(body.get("From")).toBeNull()
  })

  it("reporta el rechazo de Twilio sin lanzar", async () => {
    enableTwilio()
    const fetchMock = stubFetch({ ok: false, status: 400, text: "invalid To number" })
    const result = await sendMarketingMessage(
      params({ caps: caps({ sms: true }), preferred: "sms", smsOptIn: true })
    )
    expect(result).toEqual({
      ok: false,
      channel: "sms",
      provider: "twilio",
      reason: "ok",
      error: "Twilio 400",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      "[SMS] Twilio rechazó el envío",
      expect.objectContaining({ status: 400 })
    )
  })

  it("reporta un fallo de red sin lanzar", async () => {
    enableTwilio()
    const fetchMock = vi.fn(async () => {
      throw new Error("ETIMEDOUT")
    })
    vi.stubGlobal("fetch", fetchMock)
    const result = await sendMarketingMessage(
      params({ caps: caps({ sms: true }), preferred: "sms", smsOptIn: true })
    )
    expect(result.ok).toBe(false)
    expect(result.provider).toBe("twilio")
    expect(result.error).toBe("ETIMEDOUT")
  })

  it("no llama a Twilio con un teléfono inutilizable", async () => {
    enableTwilio()
    const fetchMock = stubFetch()
    const result = await sendMarketingMessage(
      params({ caps: caps({ sms: true }), preferred: "sms", smsOptIn: true, to: "123" })
    )
    expect(result).toEqual({
      ok: false,
      channel: "sms",
      provider: "twilio",
      reason: "ok",
      error: "Teléfono no válido",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("no cae a WhatsApp cuando el SMS falla", async () => {
    enableTwilio()
    stubFetch({ ok: false, status: 500 })
    const result = await sendMarketingMessage(
      params({ caps: caps({ whatsapp: true, sms: true }), preferred: "sms", smsOptIn: true })
    )
    expect(result.channel).toBe("sms")
    expect(result.ok).toBe(false)
    expect(mocks.sendTextMessage).not.toHaveBeenCalled()
  })

  it("reporta cuando la capacidad dice SMS pero el adaptador ya no existe", async () => {
    // La capacidad se resuelve una vez por corrida; el adaptador, en cada envío.
    for (const env of [{}, { SMS_ENABLED: "false" }]) {
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
      const result = await sendMarketingMessage(
        params({ caps: caps({ sms: true }), preferred: "sms", smsOptIn: true })
      )
      expect(result).toEqual({
        ok: false,
        channel: "sms",
        provider: null,
        reason: "ok",
        error: "SMS no configurado",
      })
    }
  })
})

describe("sendMarketingMessage / ambos canales", () => {
  it("prefiere WhatsApp cuando hay de los dos", async () => {
    enableTwilio()
    const fetchMock = stubFetch()
    const result = await sendMarketingMessage(
      params({ caps: caps({ whatsapp: true, sms: true }), preferred: "both", smsOptIn: true })
    )
    expect(result).toMatchObject({ ok: true, channel: "whatsapp", provider: "meta" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("cae a SMS cuando WhatsApp falla", async () => {
    enableTwilio()
    const fetchMock = stubFetch()
    mocks.sendTextMessage.mockRejectedValue(new Error("Meta rechazó el mensaje"))
    const result = await sendMarketingMessage(
      params({ caps: caps({ whatsapp: true, sms: true }), preferred: "both", smsOptIn: true })
    )
    expect(result).toEqual({
      ok: true,
      channel: "sms",
      provider: "twilio",
      reason: "ok",
      error: null,
    })
    expect(mocks.sendTextMessage).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("reporta el fallo del canal principal cuando fallan los dos", async () => {
    enableTwilio()
    stubFetch({ ok: false, status: 500 })
    mocks.sendTextMessage.mockRejectedValue(new Error("Meta rechazó el mensaje"))
    const result = await sendMarketingMessage(
      params({ caps: caps({ whatsapp: true, sms: true }), preferred: "both", smsOptIn: true })
    )
    expect(result.ok).toBe(false)
    expect(result.channel).toBe("whatsapp")
    expect(result.provider).toBe("meta")
    expect(result.error).toBe("Meta rechazó el mensaje")
  })

  it("no usa el respaldo por SMS sin opt-in", async () => {
    enableTwilio()
    const fetchMock = stubFetch()
    mocks.sendTextMessage.mockRejectedValue(new Error("Meta rechazó el mensaje"))
    const result = await sendMarketingMessage(
      params({ caps: caps({ whatsapp: true, sms: true }), preferred: "both", smsOptIn: false })
    )
    expect(result.ok).toBe(false)
    expect(result.error).toBe("Meta rechazó el mensaje")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sale por SMS directamente cuando no hay WhatsApp", async () => {
    enableTwilio()
    const fetchMock = stubFetch()
    const result = await sendMarketingMessage(
      params({ caps: caps({ sms: true }), preferred: "both", smsOptIn: true })
    )
    expect(result).toMatchObject({ ok: true, channel: "sms", provider: "twilio" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mocks.sendTextMessage).not.toHaveBeenCalled()
  })

  it("sin WhatsApp ni opt-in no hay canal y se explica por qué", async () => {
    const result = await sendMarketingMessage(
      params({ caps: caps({ sms: true }), preferred: "both", smsOptIn: false })
    )
    expect(result.channel).toBeNull()
    expect(result.reason).toBe("no_sms_opt_in")
  })
})

describe("sendMarketingMessage / contrato", () => {
  it("solo envía cuando hay canal, y siempre por el canal decidido", async () => {
    enableTwilio()
    const combos = [
      { whatsapp: false, sms: false, smsOptIn: false },
      { whatsapp: true, sms: false, smsOptIn: false },
      { whatsapp: false, sms: true, smsOptIn: false },
      { whatsapp: false, sms: true, smsOptIn: true },
      { whatsapp: true, sms: true, smsOptIn: false },
      { whatsapp: true, sms: true, smsOptIn: true },
    ]

    for (const combo of combos) {
      for (const preferred of ["whatsapp", "sms", "both"] as const) {
        vi.clearAllMocks()
        const fetchMock = stubFetch()
        const result = await sendMarketingMessage(
          params({
            caps: caps({ whatsapp: combo.whatsapp, sms: combo.sms }),
            preferred,
            smsOptIn: combo.smsOptIn,
          })
        )
        const expected = resolveChannel(preferred, combo)
        const label = `${preferred} ${JSON.stringify(combo)}`
        expect(result.channel, label).toBe(expected.channel)
        expect(result.ok, label).toBe(expected.channel !== null)
        const attempts = mocks.sendTextMessage.mock.calls.length + fetchMock.mock.calls.length
        expect(attempts, label).toBe(expected.channel === null ? 0 : 1)
      }
    }
  })

  it("un fallo total no deja el canal sin reportar", async () => {
    mocks.sendTextMessage.mockRejectedValue(new Error("Meta rechazó el mensaje"))
    const result = await sendMarketingMessage(params({ caps: caps({ whatsapp: true }) }))
    expect(result.ok).toBe(false)
    expect(result.channel).toBe("whatsapp")
    expect(result.error).not.toBeNull()
  })

  it("caracterización: en un fallo total `reason` sigue siendo `ok`", async () => {
    // El motivo real del fallo va en `error`; `reason` describe la elección de
    // canal, así que un envío fallido se reporta igual que uno correcto.
    mocks.sendTextMessage.mockRejectedValue(new Error("Meta rechazó el mensaje"))
    const result = await sendMarketingMessage(params({ caps: caps({ whatsapp: true }) }))
    expect(result.ok).toBe(false)
    expect(result.reason).toBe("ok")
  })

  it("un adaptador de SMS que lanza devuelve un fallo tipado, no una excepción", async () => {
    // `attemptWhatsApp` y `attemptSms` blindan por igual: un adaptador que lance
    // no puede romper la promesa de "nunca lanza" de `sendMarketingMessage` ni
    // tumbar la corrida de campañas que lo invoca.
    const broken: SmsAdapter = {
      id: "roto",
      async send() {
        throw new Error("adaptador roto")
      },
    }
    mocks.resolveSmsAdapter.mockReturnValue(broken)
    const result = await sendMarketingMessage(
      params({ caps: caps({ sms: true }), preferred: "sms", smsOptIn: true })
    )
    expect(result.ok).toBe(false)
    expect(result.channel).toBe("sms")
    expect(result.error).toBe("adaptador roto")
  })
})
