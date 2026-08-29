import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import {
  parseUtmParams,
  sanitizeUtmValue,
  captureUtmParams,
  getStoredUtm,
  UTM_STORAGE_KEY,
} from "@/lib/utm"

// Entorno node: stub mínimo de window.localStorage para las funciones
// dependientes del DOM (capture/getStored).
function stubWindow() {
  const store = new Map<string, string>()
  vi.stubGlobal("window", {
    location: { search: "" },
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  })
  return store
}

describe("sanitizeUtmValue", () => {
  it("recorta espacios y devuelve undefined para vacíos", () => {
    expect(sanitizeUtmValue("  meta  ")).toBe("meta")
    expect(sanitizeUtmValue("")).toBeUndefined()
    expect(sanitizeUtmValue("   ")).toBeUndefined()
    expect(sanitizeUtmValue(null)).toBeUndefined()
    expect(sanitizeUtmValue(undefined)).toBeUndefined()
  })

  it("limita a 200 caracteres", () => {
    const long = "x".repeat(500)
    expect(sanitizeUtmValue(long)).toHaveLength(200)
  })
})

describe("parseUtmParams", () => {
  it("extrae los utm_* presentes", () => {
    const utm = parseUtmParams("?utm_source=meta&utm_campaign=verano&foo=bar")
    expect(utm).toEqual({ utm_source: "meta", utm_campaign: "verano" })
  })

  it("acepta query sin ? inicial", () => {
    expect(parseUtmParams("utm_medium=cpc")).toEqual({ utm_medium: "cpc" })
  })

  it("devuelve null cuando no hay utm_*", () => {
    expect(parseUtmParams("?foo=bar")).toBeNull()
    expect(parseUtmParams("")).toBeNull()
  })

  it("omite valores vacíos", () => {
    expect(parseUtmParams("?utm_source=&utm_term=tacos")).toEqual({
      utm_term: "tacos",
    })
  })
})

describe("captureUtmParams / getStoredUtm", () => {
  let store: Map<string, string>

  beforeEach(() => {
    store = stubWindow()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sin window devuelve null/false (SSR-safe)", () => {
    vi.unstubAllGlobals()
    expect(getStoredUtm()).toBeNull()
    expect(captureUtmParams("?utm_source=x")).toBe(false)
    store = stubWindow()
  })

  it("persiste la atribución y la recupera", () => {
    expect(captureUtmParams("?utm_source=google&utm_campaign=launch")).toBe(true)
    expect(getStoredUtm()).toEqual({
      utm_source: "google",
      utm_campaign: "launch",
    })
  })

  it("no pisa la atribución con navegaciones sin utm", () => {
    captureUtmParams("?utm_source=meta")
    expect(captureUtmParams("?foo=bar")).toBe(false)
    expect(getStoredUtm()).toEqual({ utm_source: "meta" })
  })

  it("tolera datos corruptos en storage", () => {
    store.set(UTM_STORAGE_KEY, "not-json{")
    expect(getStoredUtm()).toBeNull()
  })

  it("ignora claves ajenas y valores no string en storage", () => {
    store.set(
      UTM_STORAGE_KEY,
      JSON.stringify({ utm_source: "tiktok", hacker: "x", utm_medium: 42 })
    )
    expect(getStoredUtm()).toEqual({ utm_source: "tiktok" })
  })
})
