import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(), getCurrentUser: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/foodos-notifications", () => ({ notifyFoodosCustomer: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => void) => fn(),
}))

import { markOrderPaid, updateOrderStatus } from "./actions"
import { requireAuth } from "@/lib/auth"
import { notifyFoodosCustomer } from "@/lib/foodos-notifications"
import { revalidatePath } from "next/cache"

const ORDER_ID = "11111111-2222-3333-4444-abcdef"

interface Result {
  data?: unknown
  error?: unknown
}

/** Builder encadenable con resultado distinto para lecturas y escrituras. */
function setup(results: { read?: Result; write?: Result } = {}) {
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

  const from = vi.fn(() => builder)
  vi.mocked(requireAuth).mockResolvedValue({ supabase: { from } } as never)
  return { builder, update, from }
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
    setup({ read: { data: { status: "pending" } }, write: { error: { message: "RLS denegó" } } })

    await expect(updateOrderStatus(ORDER_ID, "preparing")).rejects.toThrow("RLS denegó")
    expect(notifyFoodosCustomer).not.toHaveBeenCalled()
  })

  it("propaga el error de lectura y no escribe", async () => {
    const { update } = setup({ read: { error: { message: "sin conexión" } } })

    await expect(updateOrderStatus(ORDER_ID, "preparing")).rejects.toThrow("sin conexión")
    expect(update).not.toHaveBeenCalled()
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
