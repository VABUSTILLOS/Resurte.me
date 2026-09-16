import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { notifyCashbackCredited } from "./notifications"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

const ORDER_ID = 7

/**
 * Service client simulado por tabla:
 *  - orders.maybeSingle            → fila de la orden (user_id)
 *  - wallet_transactions.maybeSingle → abono real del monedero
 *  - notifications.insert          → fila persistida (la captura `inserts`)
 */
function serviceWith(opts: {
  orderRow?: unknown
  creditRow?: unknown
  orderError?: { message: string } | null
  creditError?: { message: string } | null
  insertError?: { code?: string; message: string } | null
}) {
  const inserts: Record<string, unknown>[] = []
  const from = vi.fn((table: string) => {
    const b: Record<string, unknown> = {}
    for (const m of ["select", "eq", "gt", "order", "limit"]) {
      b[m] = vi.fn().mockReturnValue(b)
    }
    if (table === "orders") {
      b.maybeSingle = vi
        .fn()
        .mockResolvedValue({ data: opts.orderRow ?? null, error: opts.orderError ?? null })
    } else if (table === "wallet_transactions") {
      b.maybeSingle = vi
        .fn()
        .mockResolvedValue({ data: opts.creditRow ?? null, error: opts.creditError ?? null })
    } else if (table === "notifications") {
      b.insert = vi.fn().mockImplementation((row: Record<string, unknown>) => {
        inserts.push(row)
        return Promise.resolve({ error: opts.insertError ?? null })
      })
    }
    return b
  })
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from, inserts }
}

describe("notifyCashbackCredited", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("notifica con el monto real del monedero y el pedido como referencia", async () => {
    const { inserts } = serviceWith({
      orderRow: { user_id: "u-1" },
      creditRow: { amount: "12.50" },
    })

    await notifyCashbackCredited(ORDER_ID)

    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({
      user_id: "u-1",
      type: "cashback_credited",
      order_id: ORDER_ID,
      action_url: "/recompensas?tab=wallet",
    })
    expect(String(inserts[0]?.title)).toContain("12.50")
  })

  it("no notifica órdenes anónimas (sin user_id)", async () => {
    const { inserts } = serviceWith({
      orderRow: { user_id: null },
      creditRow: { amount: 12.5 },
    })

    await notifyCashbackCredited(ORDER_ID)

    expect(inserts).toHaveLength(0)
  })

  it("no notifica si la orden no existe", async () => {
    const { inserts } = serviceWith({ orderRow: null, creditRow: { amount: 12.5 } })

    await notifyCashbackCredited(ORDER_ID)

    expect(inserts).toHaveLength(0)
  })

  it("no notifica cuando el monedero no registró abono real", async () => {
    const { inserts } = serviceWith({ orderRow: { user_id: "u-1" }, creditRow: null })

    await notifyCashbackCredited(ORDER_ID)

    expect(inserts).toHaveLength(0)
  })

  it("ignora abonos de cero o negativos (canjes)", async () => {
    const { inserts } = serviceWith({ orderRow: { user_id: "u-1" }, creditRow: { amount: 0 } })

    await notifyCashbackCredited(ORDER_ID)

    expect(inserts).toHaveLength(0)
  })

  it("nunca lanza si falla la lectura del monedero", async () => {
    const { inserts } = serviceWith({
      orderRow: { user_id: "u-1" },
      creditError: { message: "boom" },
    })

    await expect(notifyCashbackCredited(ORDER_ID)).resolves.toBeUndefined()
    expect(inserts).toHaveLength(0)
    expect(logger.warn).toHaveBeenCalled()
  })

  it("nunca lanza si falla el insert de la notificación", async () => {
    serviceWith({
      orderRow: { user_id: "u-1" },
      creditRow: { amount: 12.5 },
      insertError: { message: "db caída" },
    })

    await expect(notifyCashbackCredited(ORDER_ID)).resolves.toBeUndefined()
  })

  it("trata el 23505 (evento ya notificado) como éxito silencioso", async () => {
    serviceWith({
      orderRow: { user_id: "u-1" },
      creditRow: { amount: 12.5 },
      insertError: { code: "23505", message: "duplicate key" },
    })

    await notifyCashbackCredited(ORDER_ID)

    expect(logger.warn).not.toHaveBeenCalled()
  })
})
