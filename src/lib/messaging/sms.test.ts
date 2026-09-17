import { afterEach, describe, expect, it, vi } from "vitest"

import {
  isSmsConfigured,
  resolveSmsAdapter,
  toE164,
} from "@/lib/messaging/sms"

const TWILIO_ENV = {
  TWILIO_ACCOUNT_SID: "AC123",
  TWILIO_AUTH_TOKEN: "token",
  TWILIO_FROM: "+525555555555",
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("toE164", () => {
  it("asume México para 10 dígitos", () => {
    expect(toE164("5512345678")).toBe("+525512345678")
    expect(toE164("55 1234 5678")).toBe("+525512345678")
  })

  it("respeta un número que ya trae lada internacional", () => {
    expect(toE164("+525512345678")).toBe("+525512345678")
    expect(toE164("+1 415 555 2671")).toBe("+14155552671")
  })

  it("reconoce el 52 y el 1 pegados sin +", () => {
    expect(toE164("525512345678")).toBe("+525512345678")
    expect(toE164("14155552671")).toBe("+14155552671")
  })

  it("usa otro país por defecto si se pide", () => {
    expect(toE164("5512345678", "1")).toBe("+15512345678")
  })

  it("devuelve null cuando no se puede saber el destino", () => {
    expect(toE164(null)).toBeNull()
    expect(toE164("")).toBeNull()
    expect(toE164("   ")).toBeNull()
    expect(toE164("12345")).toBeNull()
    expect(toE164("+123")).toBeNull()
  })
})

describe("resolveSmsAdapter", () => {
  it("sin credenciales no hay adaptador", () => {
    expect(resolveSmsAdapter({})).toBeNull()
    expect(isSmsConfigured({})).toBe(false)
  })

  it("con las credenciales de Twilio devuelve el adaptador", () => {
    const adapter = resolveSmsAdapter(TWILIO_ENV)
    expect(adapter?.id).toBe("twilio")
    expect(isSmsConfigured(TWILIO_ENV)).toBe(true)
  })

  it("SMS_ENABLED=false lo desactiva aunque haya credenciales", () => {
    expect(resolveSmsAdapter({ ...TWILIO_ENV, SMS_ENABLED: "false" })).toBeNull()
    expect(resolveSmsAdapter({ ...TWILIO_ENV, SMS_ENABLED: "FALSE" })).toBeNull()
  })

  it("un proveedor desconocido no se inventa un adaptador", () => {
    expect(resolveSmsAdapter({ ...TWILIO_ENV, SMS_PROVIDER: "otro" })).toBeNull()
  })

  it("exige las tres variables", () => {
    expect(resolveSmsAdapter({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t" })).toBeNull()
    expect(resolveSmsAdapter({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_FROM: "+52" })).toBeNull()
  })
})

describe("adaptador de Twilio", () => {
  function stubFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) =>
      Promise.resolve(impl(String(url), init ?? {}))
    )
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  it("envía con Basic auth y el remitente configurado", async () => {
    const fetchMock = stubFetch(() =>
      new Response(JSON.stringify({ sid: "SM123" }), { status: 201 })
    )
    const adapter = resolveSmsAdapter(TWILIO_ENV)
    const result = await adapter!.send({ to: "5512345678", text: "Hola" })

    expect(result).toEqual({ ok: true, provider: "twilio", id: "SM123" })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toContain("/Accounts/AC123/Messages.json")
    const headers = (init?.headers ?? {}) as Record<string, string>
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("AC123:token").toString("base64")}`
    )
    const body = init?.body as URLSearchParams
    expect(body.get("To")).toBe("+525512345678")
    expect(body.get("From")).toBe("+525555555555")
    expect(body.get("MessagingServiceSid")).toBeNull()
  })

  it("usa MessagingServiceSid si el remitente es un servicio", async () => {
    const fetchMock = stubFetch(() =>
      new Response(JSON.stringify({ sid: "SM9" }), { status: 201 })
    )
    const adapter = resolveSmsAdapter({ ...TWILIO_ENV, TWILIO_FROM: "MGabc" })
    await adapter!.send({ to: "5512345678", text: "Hola" })
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams
    expect(body.get("MessagingServiceSid")).toBe("MGabc")
    expect(body.get("From")).toBeNull()
  })

  it("no llama a la red si el teléfono no es usable", async () => {
    const fetchMock = stubFetch(() => new Response("{}", { status: 201 }))
    const adapter = resolveSmsAdapter(TWILIO_ENV)
    const result = await adapter!.send({ to: "123", text: "Hola" })
    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("un rechazo del proveedor no lanza", async () => {
    stubFetch(() => new Response("invalid number", { status: 400 }))
    const adapter = resolveSmsAdapter(TWILIO_ENV)
    const result = await adapter!.send({ to: "5512345678", text: "Hola" })
    expect(result).toEqual({ ok: false, provider: "twilio", error: "Twilio 400" })
  })

  it("un fallo de red no lanza", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ECONNRESET")))
    )
    const adapter = resolveSmsAdapter(TWILIO_ENV)
    const result = await adapter!.send({ to: "5512345678", text: "Hola" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe("ECONNRESET")
  })
})
