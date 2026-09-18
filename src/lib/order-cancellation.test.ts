import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import {
  applyOrderCancellationEffects,
  CANCEL_REFUSAL_MESSAGE,
  canCustomerCancel,
  CANCELLABLE_ORDER_STATUSES,
  CHARGED_PAYMENT_STATUSES,
  customerCancelRefusal,
  type CancellationClient,
} from "./order-cancellation"
import { logger } from "@/lib/logger"

/**
 * La frontera de producto del autoservicio de cancelación y la cascada de
 * recursos que una cancelación debe devolver.
 *
 * Contrato congelado:
 *   · El cliente cancela antes del despacho y sin dinero cobrado ni en vuelo.
 *   · Cancelar un pedido ya cancelado NO vuelve a devolver inventario
 *     (idempotencia): el guarda vive en el módulo, no en el llamador.
 *   · Un fallo de infraestructura no convierte una cancelación válida en un
 *     error para el cliente.
 *
 * Si estas pruebas se rompen, alguien está a punto de dejar que el sitio cobre
 * un pedido cancelado, o de devolver dos veces el mismo inventario.
 */

interface FakeOptions {
  rpcResult?: { data?: unknown; error?: unknown }
  coupon?: { id: number; used_count: number } | null
  couponReadError?: { message?: string } | null
  couponWriteError?: { message?: string } | null
  rpcThrows?: boolean
  couponReadThrows?: boolean
  couponWriteThrows?: boolean
}

/** Cliente mínimo: solo las dos ramas que el módulo usa de verdad. */
function fakeClient(options: FakeOptions = {}) {
  const couponUpdate = vi.fn()
  const couponEqUsedCount = vi.fn(() => Promise.resolve({ error: options.couponWriteError ?? null }))
  couponUpdate.mockImplementation(() => {
    if (options.couponWriteThrows) throw new Error("boom")
    return { eq: vi.fn(() => ({ eq: couponEqUsedCount })) }
  })

  const couponSelect = {
    ilike: vi.fn(() => ({
      maybeSingle: vi.fn(() => {
        if (options.couponReadThrows) throw new Error("boom")
        return Promise.resolve({
          data: options.coupon === undefined ? null : options.coupon,
          error: options.couponReadError ?? null,
        })
      }),
    })),
  }

  const rpc = vi.fn(() => {
    if (options.rpcThrows) throw new Error("boom")
    return Promise.resolve(options.rpcResult ?? { data: { ok: true, reason: "released" }, error: null })
  })

  const client = {
    rpc,
    from: vi.fn(() => ({ select: vi.fn(() => couponSelect), update: couponUpdate })),
  } as unknown as CancellationClient

  return { client, rpc, couponUpdate, couponEqUsedCount }
}

describe("order-cancellation · frontera de producto", () => {
  it("permite cancelar antes del despacho y sin cobro", () => {
    for (const status of CANCELLABLE_ORDER_STATUSES) {
      expect(canCustomerCancel(status, "pending")).toBe(true)
      expect(customerCancelRefusal(status, "pending")).toBeNull()
    }
  })

  it("no permite cancelar una vez el pedido salió a reparto", () => {
    expect(customerCancelRefusal("out_for_delivery", "pending")).toBe("dispatched")
    expect(canCustomerCancel("out_for_delivery", "pending")).toBe(false)
  })

  it("no permite cancelar un pedido entregado", () => {
    expect(customerCancelRefusal("delivered", "pending")).toBe("dispatched")
  })

  it("no permite cancelar un pedido ya cancelado, y lo dice con ese motivo", () => {
    // El orden importa: `cancelled` gana sobre cualquier estado de pago, porque
    // es el dato más informativo de los tres.
    expect(customerCancelRefusal("cancelled", "paid")).toBe("already_cancelled")
    expect(customerCancelRefusal("cancelled", "pending")).toBe("already_cancelled")
  })

  it("no permite cancelar cuando hay dinero cobrado o en vuelo", () => {
    for (const payment of CHARGED_PAYMENT_STATUSES) {
      expect(customerCancelRefusal("confirmed", payment)).toBe("charged")
      expect(canCustomerCancel("confirmed", payment)).toBe(false)
    }
  })

  it("`processing` bloquea: un cobro puede liquidarse después de la cancelación", () => {
    // Este es el caso que más fácil se escapa: el pedido todavía no está
    // `paid`, así que un chequeo ingenuo de `=== 'paid'` lo dejaría pasar y el
    // dinero entraría por un pedido que ya no existe.
    expect(customerCancelRefusal("pending", "processing")).toBe("charged")
  })

  it("un estado o pago desconocido no habilita la cancelación por accidente", () => {
    expect(customerCancelRefusal("zzz", "pending")).toBe("dispatched")
    expect(customerCancelRefusal(null, "pending")).toBe("dispatched")
    expect(customerCancelRefusal(undefined, "pending")).toBe("dispatched")
  })

  it("un payment_status ausente no bloquea: el pedido no se cobró", () => {
    expect(customerCancelRefusal("pending", null)).toBeNull()
    expect(customerCancelRefusal("pending", undefined)).toBeNull()
  })

  it("cada motivo tiene un mensaje que dice qué hacer, no un código", () => {
    expect(CANCEL_REFUSAL_MESSAGE.already_cancelled).toMatch(/cancelado/i)
    expect(CANCEL_REFUSAL_MESSAGE.dispatched).toMatch(/reparto/i)
    // El de cobro es el único donde el cliente necesita una salida.
    expect(CANCEL_REFUSAL_MESSAGE.charged).toMatch(/escríbenos|escribenos/i)
    expect(CANCEL_REFUSAL_MESSAGE.charged).toMatch(/devolver/i)
  })
})

describe("order-cancellation · cascada de recursos", () => {
  it("devuelve el inventario y libera el cupón", async () => {
    const { client, rpc, couponUpdate } = fakeClient({ coupon: { id: 3, used_count: 5 } })

    const effects = await applyOrderCancellationEffects(client, {
      orderId: 42,
      oldStatus: "confirmed",
      couponCode: "DIEZ",
    })

    expect(rpc).toHaveBeenCalledWith("release_order_stock", { p_order_id: 42 })
    expect(couponUpdate).toHaveBeenCalledWith({ used_count: 4 })
    expect(effects).toEqual({ stockReleased: true, couponReversed: true })
  })

  it("es idempotente: un pedido ya cancelado no vuelve a devolver nada", async () => {
    const { client, rpc, couponUpdate } = fakeClient({ coupon: { id: 3, used_count: 5 } })

    const effects = await applyOrderCancellationEffects(client, {
      orderId: 42,
      oldStatus: "cancelled",
      couponCode: "DIEZ",
    })

    expect(rpc).not.toHaveBeenCalled()
    expect(couponUpdate).not.toHaveBeenCalled()
    expect(effects).toEqual({ stockReleased: false, couponReversed: false })
  })

  it("no toca la tabla coupons si el pedido no usó cupón", async () => {
    const { client } = fakeClient()
    const effects = await applyOrderCancellationEffects(client, {
      orderId: 42,
      oldStatus: "confirmed",
      couponCode: null,
    })
    expect(client.from).not.toHaveBeenCalled()
    expect(effects.couponReversed).toBe(false)
  })

  it("un cupón con used_count en 0 no se decrementa a negativo", async () => {
    const { client, couponUpdate } = fakeClient({ coupon: { id: 3, used_count: 0 } })
    const effects = await applyOrderCancellationEffects(client, {
      orderId: 42,
      oldStatus: "confirmed",
      couponCode: "DIEZ",
    })
    expect(couponUpdate).not.toHaveBeenCalled()
    expect(effects.couponReversed).toBe(false)
  })

  it("un cupón inexistente no rompe la cancelación", async () => {
    const { client, couponUpdate } = fakeClient({ coupon: null })
    const effects = await applyOrderCancellationEffects(client, {
      orderId: 42,
      oldStatus: "confirmed",
      couponCode: "FANTASMA",
    })
    expect(couponUpdate).not.toHaveBeenCalled()
    expect(effects.couponReversed).toBe(false)
  })

  it("`not_reserved` no es un fallo: el pedido nunca reservó inventario", async () => {
    const { client } = fakeClient({
      rpcResult: { data: { ok: false, reason: "not_reserved" }, error: null },
    })
    const effects = await applyOrderCancellationEffects(client, {
      orderId: 42,
      oldStatus: "pending",
    })
    expect(effects.stockReleased).toBe(false)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it("un conflicto real de inventario se registra sin romper la cancelación", async () => {
    const { client } = fakeClient({
      rpcResult: { data: { ok: false, reason: "insufficient_stock" }, error: null },
    })
    const effects = await applyOrderCancellationEffects(client, {
      orderId: 42,
      oldStatus: "pending",
    })
    expect(effects.stockReleased).toBe(false)
    expect(logger.warn).toHaveBeenCalled()
  })

  it("si la RPC de inventario no existe, el pedido igual queda cancelado", async () => {
    // Frontera explícita: el cliente ve el pedido cancelado, y el fallo queda
    // en la bitácora. Preferimos una cancelación sin devolución de stock a un
    // cliente atrapado en un pedido que ya no quiere.
    const { client } = fakeClient({
      rpcResult: { data: null, error: { code: "42883", message: "function does not exist" } },
    })
    const effects = await applyOrderCancellationEffects(client, {
      orderId: 42,
      oldStatus: "pending",
    })
    expect(effects.stockReleased).toBe(false)
    expect(logger.error).toHaveBeenCalled()
  })

  it("una excepción en el inventario no se propaga", async () => {
    const { client } = fakeClient({ rpcThrows: true, coupon: { id: 3, used_count: 2 } })
    const effects = await applyOrderCancellationEffects(client, {
      orderId: 42,
      oldStatus: "pending",
      couponCode: "DIEZ",
    })
    // El cupón se sigue intentando: un canal roto no debe impedir el otro.
    expect(effects.couponReversed).toBe(true)
    expect(logger.error).toHaveBeenCalled()
  })

  it("una excepción al leer el cupón no se propaga", async () => {
    const { client } = fakeClient({ couponReadThrows: true })
    await expect(
      applyOrderCancellationEffects(client, {
        orderId: 42,
        oldStatus: "pending",
        couponCode: "DIEZ",
      })
    ).resolves.toEqual({ stockReleased: true, couponReversed: false })
  })

  it("un error al escribir el cupón se registra y no se reporta como liberado", async () => {
    const { client } = fakeClient({
      coupon: { id: 3, used_count: 5 },
      couponWriteError: { message: "deadlock detected" },
    })
    const effects = await applyOrderCancellationEffects(client, {
      orderId: 42,
      oldStatus: "pending",
      couponCode: "DIEZ",
    })
    expect(effects.couponReversed).toBe(false)
    expect(logger.warn).toHaveBeenCalled()
  })

  it("nunca lanza, pase lo que pase", async () => {
    const { client } = fakeClient({
      rpcThrows: true,
      couponWriteThrows: true,
      coupon: { id: 3, used_count: 5 },
    })
    await expect(
      applyOrderCancellationEffects(client, {
        orderId: 42,
        oldStatus: "pending",
        couponCode: "DIEZ",
      })
    ).resolves.toBeDefined()
  })
})
