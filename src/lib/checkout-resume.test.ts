import { describe, expect, it } from "vitest"
import {
  CHECKOUT_STEP_KEY,
  FIRST_STEP,
  clearCheckoutStep,
  parseCheckoutStep,
  readCheckoutStep,
  resumeCheckoutStep,
  saveCheckoutStep,
} from "./checkout-resume"

/** Storage en memoria: el entorno de Vitest es `node`, sin sessionStorage. */
function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed))
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key)
    },
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
  } as Storage
}

/** Storage que siempre lanza: Safari en modo privado, cuota llena, permisos. */
const hostileStorage = {
  get length(): number {
    throw new Error("blocked")
  },
  clear: () => {
    throw new Error("blocked")
  },
  getItem: () => {
    throw new Error("blocked")
  },
  key: () => {
    throw new Error("blocked")
  },
  removeItem: () => {
    throw new Error("blocked")
  },
  setItem: () => {
    throw new Error("blocked")
  },
} as Storage

describe("parseCheckoutStep", () => {
  it("acepta los cuatro pasos del flujo", () => {
    expect(parseCheckoutStep("address")).toBe("address")
    expect(parseCheckoutStep("schedule")).toBe("schedule")
    expect(parseCheckoutStep("review")).toBe("review")
    expect(parseCheckoutStep("payment")).toBe("payment")
  })

  it("rechaza vacío, ausente y basura", () => {
    expect(parseCheckoutStep(null)).toBeNull()
    expect(parseCheckoutStep(undefined)).toBeNull()
    expect(parseCheckoutStep("")).toBeNull()
    expect(parseCheckoutStep("   ")).toBeNull()
    expect(parseCheckoutStep("bumps")).toBeNull()
    expect(parseCheckoutStep("PAYMENT")).toBeNull()
    expect(parseCheckoutStep("payment ")).toBe("payment")
    expect(parseCheckoutStep("{}")).toBeNull()
  })
})

describe("resumeCheckoutStep", () => {
  it("no reanuda el pago: sin PaymentIntent vivo el paso queda vacío", () => {
    expect(resumeCheckoutStep("payment")).toBe("review")
  })

  it("reanuda los pasos reconstruibles tal cual", () => {
    expect(resumeCheckoutStep("address")).toBe("address")
    expect(resumeCheckoutStep("schedule")).toBe("schedule")
    expect(resumeCheckoutStep("review")).toBe("review")
  })

  it("no inventa un paso cuando el valor no sirve", () => {
    expect(resumeCheckoutStep(null)).toBeNull()
    expect(resumeCheckoutStep("cualquiera")).toBeNull()
  })
})

describe("readCheckoutStep", () => {
  it("lee el paso guardado", () => {
    const storage = memoryStorage({ [CHECKOUT_STEP_KEY]: "schedule" })
    expect(readCheckoutStep(storage)).toBe("schedule")
  })

  it("degrada a null sin almacenamiento (SSR)", () => {
    expect(readCheckoutStep(null)).toBeNull()
  })

  it("degrada a null cuando el almacenamiento está vacío", () => {
    expect(readCheckoutStep(memoryStorage())).toBeNull()
  })

  it("degrada a null cuando el almacenamiento lanza", () => {
    expect(readCheckoutStep(hostileStorage)).toBeNull()
  })

  it("tolera espacios alrededor del valor guardado", () => {
    const storage = memoryStorage({ [CHECKOUT_STEP_KEY]: "  review  " })
    expect(readCheckoutStep(storage)).toBe("review")
  })

  it("no reanuda el pago aunque esté guardado", () => {
    const storage = memoryStorage({ [CHECKOUT_STEP_KEY]: "payment" })
    expect(readCheckoutStep(storage)).toBe("review")
  })
})

describe("saveCheckoutStep / clearCheckoutStep", () => {
  it("hace round-trip por el almacenamiento", () => {
    const storage = memoryStorage()
    saveCheckoutStep("schedule", storage)
    expect(storage.getItem(CHECKOUT_STEP_KEY)).toBe("schedule")
    expect(readCheckoutStep(storage)).toBe("schedule")

    clearCheckoutStep(storage)
    expect(storage.getItem(CHECKOUT_STEP_KEY)).toBeNull()
    expect(readCheckoutStep(storage)).toBeNull()
  })

  it("no lanza sin almacenamiento", () => {
    expect(() => saveCheckoutStep("review", null)).not.toThrow()
    expect(() => clearCheckoutStep(null)).not.toThrow()
  })

  it("no lanza cuando el almacenamiento está bloqueado", () => {
    expect(() => saveCheckoutStep("review", hostileStorage)).not.toThrow()
    expect(() => clearCheckoutStep(hostileStorage)).not.toThrow()
  })
})

describe("FIRST_STEP", () => {
  it("es el primer paso del flujo", () => {
    expect(FIRST_STEP).toBe("address")
  })
})
