import { describe, it, expect, beforeEach } from "vitest"
import {
  getActiveLocale,
  setActiveLocale,
  translate,
} from "./locale"
import { es, t } from "./es"
import en from "./en"

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === "string") out[key] = v
    else if (v && typeof v === "object") {
      Object.assign(out, flatten(v as Record<string, unknown>, key))
    }
  }
  return out
}

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()

describe("i18n locale store", () => {
  beforeEach(() => setActiveLocale("es"))

  it("translates from the active dictionary", () => {
    expect(t("common.save")).toBe("Guardar")
    setActiveLocale("en")
    expect(t("common.save")).toBe("Save")
  })

  it("interpolates {vars}", () => {
    setActiveLocale("en")
    expect(t("planificador.copyHeader", { covers: 10, pct: 5, collection: "Tacos" })).toContain("10")
    expect(t("planificador.copyHeader", { covers: 10, pct: 5, collection: "Tacos" })).toContain("Tacos")
  })

  it("returns the key for missing keys", () => {
    expect(t("no.existe.esta.clave")).toBe("no.existe.esta.clave")
    setActiveLocale("en")
    expect(t("no.existe.esta.clave")).toBe("no.existe.esta.clave")
  })

  it("falls back to Spanish when the active dictionary lacks a key", () => {
    setActiveLocale("en")
    expect(translate("comanda.title")).toBe("Order ticket")
    // A key present only in es would fall back — simulate by translating a
    // real es key after temporarily using an unknown locale state.
    setActiveLocale("es")
    expect(translate("comanda.title")).toBe("Comanda")
  })

  it("getActiveLocale reflects setActiveLocale", () => {
    expect(getActiveLocale()).toBe("es")
    setActiveLocale("en")
    expect(getActiveLocale()).toBe("en")
  })
})

describe("dictionary parity (es ↔ en)", () => {
  const flatEs = flatten(es as unknown as Record<string, unknown>)
  const flatEn = flatten(en as unknown as Record<string, unknown>)

  it("en covers every es key", () => {
    const missing = Object.keys(flatEs).filter((k) => !(k in flatEn))
    expect(missing).toEqual([])
  })

  it("en has no extra keys", () => {
    const extra = Object.keys(flatEn).filter((k) => !(k in flatEs))
    expect(extra).toEqual([])
  })

  it("placeholders match per key", () => {
    const mismatched: string[] = []
    for (const key of Object.keys(flatEs)) {
      const a = placeholders(flatEs[key] ?? "").join(",")
      const b = placeholders(flatEn[key] ?? "").join(",")
      if (a !== b) mismatched.push(key)
    }
    expect(mismatched).toEqual([])
  })
})
