import { describe, expect, it } from "vitest"
import {
  PENDING_CARD_KEY,
  clearPendingCardPayment,
  isReturnOfPendingPayment,
  paymentIntentIdFromClientSecret,
  readPendingCardPayment,
  savePendingCardPayment,
  type PendingCardPayment,
} from "./payment-return"

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

const pending: PendingCardPayment = { orderId: 4242, paymentIntentId: "pi_abc" }

/** Query de una vuelta de Stripe confirmada. */
function returnQuery(intent = "pi_abc", status = "succeeded"): string {
  return `?payment_intent=${intent}&payment_intent_client_secret=${intent}_secret_xyz&redirect_status=${status}`
}

describe("paymentIntentIdFromClientSecret", () => {
  it("extrae el id del intent", () => {
    expect(paymentIntentIdFromClientSecret("pi_3Qabc_secret_9xyz")).toBe("pi_3Qabc")
  })

  it("devuelve null cuando el secreto no es de un PaymentIntent", () => {
    expect(paymentIntentIdFromClientSecret("seti_1_secret_2")).toBeNull()
    expect(paymentIntentIdFromClientSecret("")).toBeNull()
  })
})

describe("save / read / clear", () => {
  it("guarda y recupera la marca", () => {
    const storage = memoryStorage()
    savePendingCardPayment(pending, storage)
    expect(readPendingCardPayment(storage)).toEqual(pending)
    clearPendingCardPayment(storage)
    expect(readPendingCardPayment(storage)).toBeNull()
    expect(storage.getItem(PENDING_CARD_KEY)).toBeNull()
  })

  it("trata como ausente lo corrupto o incompleto", () => {
    expect(readPendingCardPayment(memoryStorage({ [PENDING_CARD_KEY]: "no-json" }))).toBeNull()
    expect(readPendingCardPayment(memoryStorage({ [PENDING_CARD_KEY]: "{}" }))).toBeNull()
    expect(
      readPendingCardPayment(memoryStorage({ [PENDING_CARD_KEY]: '{"orderId":"42"}' }))
    ).toBeNull()
  })

  it("no lanza sin almacenamiento (SSR, modo privado)", () => {
    expect(readPendingCardPayment(null)).toBeNull()
    expect(() => savePendingCardPayment(pending, null)).not.toThrow()
    expect(() => clearPendingCardPayment(null)).not.toThrow()
  })
})

describe("isReturnOfPendingPayment", () => {
  it("reclama la vuelta cuando el intent coincide y el pago salió bien", () => {
    expect(isReturnOfPendingPayment(returnQuery(), pending)).toBe(true)
  })

  it("no reclama nada sin marca (otro flujo de Stripe, otra pestaña)", () => {
    expect(isReturnOfPendingPayment(returnQuery(), null)).toBe(false)
  })

  it("no reclama un intent distinto (completar el pago de un pedido viejo)", () => {
    expect(isReturnOfPendingPayment(returnQuery("pi_otro"), pending)).toBe(false)
  })

  it("no reclama un pago que no salió bien", () => {
    expect(isReturnOfPendingPayment(returnQuery("pi_abc", "failed"), pending)).toBe(false)
    expect(isReturnOfPendingPayment("", pending)).toBe(false)
    expect(isReturnOfPendingPayment("?redirect_status=succeeded", pending)).toBe(false)
  })

  it("sin id conocido se apoya en la marca", () => {
    const sinIntent = { orderId: 7, paymentIntentId: null }
    expect(isReturnOfPendingPayment(returnQuery("pi_lo-que-sea"), sinIntent)).toBe(true)
    expect(isReturnOfPendingPayment(returnQuery("pi_x", "processing"), sinIntent)).toBe(false)
  })
})
