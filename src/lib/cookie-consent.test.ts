import { describe, expect, it } from "vitest"
import type { StorageLike } from "@/lib/storage"
import {
  COOKIE_CONSENT_KEY,
  isConsentDecision,
  readConsentDecision,
  writeConsentDecision,
} from "@/lib/cookie-consent"

/** Storage en memoria: el entorno de test es `node`, sin localStorage global. */
function fakeStorage(seed: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

describe("cookie-consent", () => {
  it("la clave conserva el formato histórico del banner", () => {
    // Canario: el banner guardaba la decisión bajo este literal exacto antes de
    // que existiera este módulo. Cambiarlo invalidaría las decisiones ya
    // guardadas y el banner reaparecería para todos los usuarios existentes.
    expect(COOKIE_CONSENT_KEY).toBe("resurte_cookie_consent")
  })

  it("sin decisión devuelve null (el banner está pendiente)", () => {
    expect(readConsentDecision(fakeStorage())).toBeNull()
  })

  it("lee las dos decisiones reales del banner", () => {
    expect(readConsentDecision(fakeStorage({ [COOKIE_CONSENT_KEY]: "accepted" }))).toBe("accepted")
    expect(readConsentDecision(fakeStorage({ [COOKIE_CONSENT_KEY]: "essential" }))).toBe("essential")
  })

  it("trata un valor corrupto o desconocido como pendiente", () => {
    // Un valor ilegible no puede contar como consentimiento: si lo contara, el
    // banner no volvería a pedirse nunca y la guía se auto-abriría encima.
    for (const raw of ["", "sí", "ACCEPTED", "true", "{}", "null", "rejected"]) {
      expect(readConsentDecision(fakeStorage({ [COOKIE_CONSENT_KEY]: raw }))).toBeNull()
    }
  })

  it("escribe la decisión en crudo, no como JSON", () => {
    // `writeStored` guardaría `"accepted"` con comillas; el banner histórico
    // guardaba `accepted`. Un lector antiguo (o el propio gate) tiene que seguir
    // entendiéndolo, así que el formato es parte del contrato.
    const storage = fakeStorage()
    writeConsentDecision("essential", storage)
    expect(storage.data.get(COOKIE_CONSENT_KEY)).toBe("essential")
  })

  it("sin storage disponible no lanza y reporta pendiente", () => {
    // SSR, modo privado o storage bloqueado: degradar a "pendiente" es lo
    // correcto — consentir es una obligación, no un detalle de UX.
    expect(readConsentDecision(null)).toBeNull()
    expect(() => writeConsentDecision("accepted", null)).not.toThrow()
  })

  it("no propaga errores de un storage que lanza", () => {
    const hostile: StorageLike = {
      getItem: () => {
        throw new Error("bloqueado")
      },
      setItem: () => {
        throw new Error("cuota")
      },
      removeItem: () => {},
    }
    expect(readConsentDecision(hostile)).toBeNull()
    expect(() => writeConsentDecision("accepted", hostile)).not.toThrow()
  })

  it("isConsentDecision solo acepta los dos valores del banner", () => {
    expect(isConsentDecision("accepted")).toBe(true)
    expect(isConsentDecision("essential")).toBe(true)
    expect(isConsentDecision("other")).toBe(false)
    expect(isConsentDecision(null)).toBe(false)
    expect(isConsentDecision(undefined)).toBe(false)
  })
})
