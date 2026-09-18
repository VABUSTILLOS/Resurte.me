import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(), getCurrentUser: vi.fn() }))
vi.mock("@/lib/foodos-operating", () => ({ requireFoodosAuth: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/foodos-notifications", () => ({ notifyFoodosCustomer: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => void) => fn(),
}))

import { markOrderPaid, updateOrderStatus } from "./actions"
import { requireFoodosAuth } from "@/lib/foodos-operating"
import { notifyFoodosCustomer } from "@/lib/foodos-notifications"
import { logger } from "@/lib/logger"
import { revalidatePath } from "next/cache"

const ORDER_ID = "11111111-2222-3333-4444-abcdef"

interface Result {
  data?: unknown
  error?: unknown
}

/** Builder encadenable con resultado distinto para lecturas y escrituras. */
function setup(results: { read?: Result; write?: Result; rpc?: Result } = {}) {
  const builder: Record<string, unknown> = {}
  const update = vi.fn(() => builder)
  for (const m of ["eq", "in", "order", "limit"]) builder[m] = vi.fn(() => builder)
  builder.select = vi.fn(() => builder)
  builder.update = update
  builder.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: results.read?.data ?? null, error: results.read?.error ?? null })
  )
  builder.then = (onFulfilled: (v: unknown) => unknown) =>
    onFulfilled({ data: null, error: results.write?.error ?? null })

  const rpc = vi.fn(() => Promise.resolve({ data: null, error: results.rpc?.error ?? null }))

  const from = vi.fn(() => builder)
  vi.mocked(requireFoodosAuth).mockResolvedValue({ supabase: { from, rpc } } as never)
  return { builder, update, from, rpc }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("updateOrderStatus", () => {
  it("guarda el estado y avisa al comensal", async () => {
    const { update } = setup({ read: { data: { status: "pending" } } })

    await updateOrderStatus(ORDER_ID, "confirmed")

    expect(update).toHaveBeenCalledWith({ status: "confirmed" })
    expect(revalidatePath).toHaveBeenCalledWith("/panel/foodos/pedidos")
    expect(notifyFoodosCustomer).toHaveBeenCalledWith(ORDER_ID, "status:confirmed")
  })

  it("no reescribe ni reavisa si el estado no cambió", async () => {
    const { update } = setup({ read: { data: { status: "confirmed" } } })

    await updateOrderStatus(ORDER_ID, "confirmed")

    expect(update).not.toHaveBeenCalled()
    expect(notifyFoodosCustomer).not.toHaveBeenCalled()
  })

  it("propaga el error de escritura y no avisa", async () => {
    // `confirmed -> preparing` es la transición real del panel; el fixture
    // antes decía `pending` y la máquina de estados lo rechaza antes de
    // llegar a la escritura, que es justo lo que esta prueba no mide.
    setup({ read: { data: { status: "confirmed" } }, write: { error: { message: "RLS denegó" } } })

    await expect(updateOrderStatus(ORDER_ID, "preparing")).rejects.toThrow("RLS denegó")
    expect(notifyFoodosCustomer).not.toHaveBeenCalled()
  })

  it("rechaza retroceder un pedido entregado", async () => {
    const { update } = setup({ read: { data: { status: "delivered" } } })

    await expect(updateOrderStatus(ORDER_ID, "preparing")).rejects.toThrow("ya se entregó")
    expect(update).not.toHaveBeenCalled()
    expect(notifyFoodosCustomer).not.toHaveBeenCalled()
  })

  it("rechaza resucitar un pedido cancelado", async () => {
    const { update } = setup({ read: { data: { status: "cancelled" } } })

    await expect(updateOrderStatus(ORDER_ID, "confirmed")).rejects.toThrow("ya no se puede mover")
    expect(update).not.toHaveBeenCalled()
  })

  it("rechaza saltarse un paso hacia atrás", async () => {
    const { update } = setup({ read: { data: { status: "preparing" } } })

    await expect(updateOrderStatus(ORDER_ID, "confirmed")).rejects.toThrow("sin saltarse un paso")
    expect(update).not.toHaveBeenCalled()
  })

  it("propaga el error de lectura y no escribe", async () => {
    const { update } = setup({ read: { error: { message: "sin conexión" } } })

    await expect(updateOrderStatus(ORDER_ID, "preparing")).rejects.toThrow("sin conexión")
    expect(update).not.toHaveBeenCalled()
  })

  // El incremento del cupón (`increment_foodos_coupon_usage`) no tenía pareja en
  // este camino: cancelar desde el panel dejaba `usage_count` inflado y un cupón
  // de "primeros 50 usos" se agotaba con pedidos que nunca se sirvieron.
  it("al cancelar libera el cupón que el alta consumió", async () => {
    const { rpc } = setup({
      read: {
        data: {
          status: "pending",
          restaurant_id: "rest-1",
          coupon_code: "PROMO10",
        },
      },
    })

    await updateOrderStatus(ORDER_ID, "cancelled")

    expect(rpc).toHaveBeenCalledWith("decrement_foodos_coupon_usage", {
      p_restaurant_id: "rest-1",
      p_code: "PROMO10",
    })
  })

  it("no toca el cupón si el pedido no usó ninguno", async () => {
    const { rpc } = setup({
      read: { data: { status: "pending", restaurant_id: "rest-1", coupon_code: null } },
    })

    await updateOrderStatus(ORDER_ID, "cancelled")

    expect(rpc).not.toHaveBeenCalled()
  })

  it("no toca el cupón cuando el paso no es una cancelación", async () => {
    const { rpc } = setup({
      read: { data: { status: "pending", restaurant_id: "rest-1", coupon_code: "PROMO10" } },
    })

    await updateOrderStatus(ORDER_ID, "confirmed")

    expect(rpc).not.toHaveBeenCalled()
  })

  it("un fallo al liberar el cupón no deshace la cancelación", async () => {
    // Best-effort, igual que en la ruta del comensal: el pedido ya está
    // cancelado y deshacerlo sería peor que un contador que se corrige a mano.
    const { rpc } = setup({
      read: { data: { status: "pending", restaurant_id: "rest-1", coupon_code: "PROMO10" } },
      rpc: { error: { message: "function does not exist" } },
    })

    await expect(updateOrderStatus(ORDER_ID, "cancelled")).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalled()
    // Sin esto, un cupón que se queda inflado para siempre no deja rastro:
    // "no se pudo liberar" tiene que ser visible en los logs.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("cupón"),
      expect.objectContaining({ orderId: ORDER_ID, code: "PROMO10" })
    )
  })

  it("no avisa de nada si el cupón se libera bien", async () => {
    setup({
      read: { data: { status: "pending", restaurant_id: "rest-1", coupon_code: "PROMO10" } },
    })

    await updateOrderStatus(ORDER_ID, "cancelled")

    expect(logger.warn).not.toHaveBeenCalled()
  })
})

describe("markOrderPaid", () => {
  it("marca pagado y avisa al comensal", async () => {
    const { update } = setup()

    await markOrderPaid(ORDER_ID)

    expect(update).toHaveBeenCalledWith({ payment_status: "paid" })
    expect(revalidatePath).toHaveBeenCalledWith("/panel/foodos/pedidos")
    expect(notifyFoodosCustomer).toHaveBeenCalledWith(ORDER_ID, "payment:paid")
  })

  it("propaga el error y no avisa", async () => {
    setup({ write: { error: { message: "RLS denegó" } } })

    await expect(markOrderPaid(ORDER_ID)).rejects.toThrow("RLS denegó")
    expect(notifyFoodosCustomer).not.toHaveBeenCalled()
  })
})
