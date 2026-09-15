import { afterEach, describe, expect, it, vi } from "vitest"
import {
  batchCatalogItems,
  buildCatalogBatchRequests,
  isRetryableMetaError,
  resolveCatalogId,
  retryDelayMs,
  type WhatsAppConfig,
  type WhatsAppProduct,
} from "./whatsapp"

const product = (partial: Partial<WhatsAppProduct> = {}): WhatsAppProduct => ({
  id: "1",
  name: "Producto",
  price: 50,
  ...partial,
})

describe("resolveCatalogId", () => {
  const cfg = (catalogId?: string): WhatsAppConfig => ({
    accessToken: "t",
    phoneNumberId: "p",
    wabaId: "waba-1",
    catalogId,
  })

  it("prefiere el catalogId de la config", () => {
    expect(resolveCatalogId(cfg("cat-9"))).toBe("cat-9")
  })

  it("cae al waba_id si no hay catalogId ni env", () => {
    delete process.env.WHATSAPP_CATALOG_ID
    expect(resolveCatalogId(cfg())).toBe("waba-1")
  })

  it("usa WHATSAPP_CATALOG_ID de env antes que el waba_id", () => {
    process.env.WHATSAPP_CATALOG_ID = "env-cat"
    expect(resolveCatalogId(cfg())).toBe("env-cat")
    delete process.env.WHATSAPP_CATALOG_ID
  })
})

describe("buildCatalogBatchRequests", () => {
  it("convierte precios a centavos y marca CREATE con allow_upsert", () => {
    const [req] = buildCatalogBatchRequests(
      [product({ id: "7", name: "Aguacate", price: 49.9, image_url: "https://x/img.png" })],
      "CREATE"
    )
    expect(req).toEqual({
      method: "CREATE",
      retailer_id: "7",
      data: expect.objectContaining({
        name: "Aguacate",
        price: 4990,
        currency: "MXN",
        availability: "in stock",
        image_url: "https://x/img.png",
      }),
    })
  })

  it("incluye sale_price solo si es menor al precio regular", () => {
    const [conOferta] = buildCatalogBatchRequests(
      [product({ price: 100, sale_price: 80 })],
      "UPDATE"
    )
    expect(conOferta?.data?.sale_price).toBe(8000)
    expect(conOferta?.data?.sale_price_start_date).toBeTruthy()

    const [sinOferta] = buildCatalogBatchRequests(
      [product({ price: 100, sale_price: 100 })],
      "UPDATE"
    )
    expect(sinOferta?.data?.sale_price).toBeUndefined()
  })

  it("usa el nombre como descripción por defecto", () => {
    const [req] = buildCatalogBatchRequests([product({ name: "Limón" })], "CREATE")
    expect(req?.data?.description).toBe("Limón")
  })
})

describe("isRetryableMetaError", () => {
  it("marca 429 y 5xx como reintentables", () => {
    expect(isRetryableMetaError(429, "")).toBe(true)
    expect(isRetryableMetaError(503, "")).toBe(true)
    expect(isRetryableMetaError(400, "{}")).toBe(false)
  })

  it("marca códigos de rate-limit de Meta aunque el status sea 400", () => {
    const body = JSON.stringify({ error: { code: 80004, message: "too many calls" } })
    expect(isRetryableMetaError(400, body)).toBe(true)
    expect(isRetryableMetaError(400, JSON.stringify({ error: { code: 190 } }))).toBe(false)
  })
})

describe("retryDelayMs", () => {
  it("honra Retry-After y acota a 60s", () => {
    expect(retryDelayMs(0, "2")).toBe(2000)
    expect(retryDelayMs(0, "999")).toBe(60_000)
  })

  it("sin header usa backoff exponencial acotado a 10s", () => {
    const d0 = retryDelayMs(0, null)
    const d2 = retryDelayMs(2, null)
    expect(d0).toBeGreaterThanOrEqual(500)
    expect(d0).toBeLessThan(1000)
    expect(d2).toBeGreaterThanOrEqual(2000)
    expect(d2).toBeLessThanOrEqual(10_000)
  })
})

describe("batchCatalogItems con reintentos", () => {
  const cfg: WhatsAppConfig = {
    accessToken: "token",
    phoneNumberId: "phone",
    wabaId: "waba",
    catalogId: "cat-1",
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("reintenta ante 429 y resuelve con handles", async () => {
    const responses = [
      new Response("rate limited", { status: 429, headers: { "retry-after": "0" } }),
      new Response(JSON.stringify({ handles: ["h-1"] }), { status: 200 }),
    ]
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(responses.shift()))
    vi.stubGlobal("fetch", fetchMock)

    const result = await batchCatalogItems(
      buildCatalogBatchRequests([product({ id: "1" })], "CREATE"),
      cfg
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.handles).toEqual(["h-1"])
    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain("/cat-1/items_batch")
  })

  it("no reintenta errores permanentes (400 sin código reintentable)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 100, message: "bad param" } }), { status: 400 })
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      batchCatalogItems(buildCatalogBatchRequests([product({ id: "1" })], "CREATE"), cfg)
    ).rejects.toThrow("WhatsApp API error 400")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("particiona en chunks de 100", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ handles: ["h"] }), { status: 200 }))
    )
    vi.stubGlobal("fetch", fetchMock)

    const many = Array.from({ length: 250 }, (_, i) => product({ id: String(i) }))
    const result = await batchCatalogItems(buildCatalogBatchRequests(many, "CREATE"), cfg)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.chunks).toBe(3)
  })
})
