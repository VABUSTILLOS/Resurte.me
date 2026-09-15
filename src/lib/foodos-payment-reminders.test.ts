import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/foodos-notifications", () => ({ notifyFoodosCustomer: vi.fn() }))

import {
  checkAndSendFoodosPaymentReminders,
  FOODOS_UNPAID_CANCEL_HOURS,
} from "./foodos-payment-reminders"
import { notifyFoodosCustomer } from "@/lib/foodos-notifications"
import { createServiceClient } from "@/lib/supabase/service"

interface Spec {
  data?: unknown
  error?: unknown
}

interface TableSpec {
  select?: Spec
  update?: Spec
}

interface Recorded {
  calls: Array<[string, ...unknown[]]>
  updates: unknown[]
}

/**
 * Cliente Supabase falso para el barrido. Cada tabla recibe su resultado
 * de lectura (`select`) y de escritura (`update`); el builder recuerda si
 * se llamó a `update` para que el `await` resuelva el resultado correcto
 * — el módulo lee con `.select()` y escribe con `.update().eq().select()`.
 */
function setup(tables: Record<string, TableSpec> = {}) {
  const recorded: Record<string, Recorded> = {}

  const from = vi.fn((table: string) => {
    const spec = tables[table] ?? {}
    const log: Recorded = (recorded[table] ??= { calls: [], updates: [] })
    let mode: "select" | "update" = "select"
    const builder: Record<string, unknown> = {}

    for (const m of ["eq", "in", "neq", "lt", "gt", "order", "limit"]) {
      builder[m] = vi.fn((...args: unknown[]) => {
        log.calls.push([m, ...args])
        return builder
      })
    }
    builder.select = vi.fn((cols: string) => {
      log.calls.push(["select", cols])
      return builder
    })
    builder.update = vi.fn((payload: unknown) => {
      mode = "update"
      log.updates.push(payload)
      log.calls.push(["update", payload])
      return builder
    })
    builder.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: spec.select?.data ?? null, error: spec.select?.error ?? null })
    )
    builder.then = (onFulfilled: (v: unknown) => unknown) => {
      const result = mode === "update" ? spec.update : spec.select
      return onFulfilled({
        data: result?.data ?? null,
        error: result?.error ?? null,
      })
    }

    return builder
  })

  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from, recorded }
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function order(overrides: Partial<{ id: string; ageHours: number; payment_status: string; status: string }> = {}) {
  return {
    id: overrides.id ?? "11111111-2222-3333-4444-abcdef",
    created_at: hoursAgo(overrides.ageHours ?? 2),
    payment_status: overrides.payment_status ?? "pending",
    status: overrides.status ?? "pending",
  }
}

function base(overrides: Record<string, TableSpec> = {}, orders: unknown[] = [order()]) {
  return setup({
    foodos_orders: { select: { data: orders }, update: { data: [{ id: "11111111-2222-3333-4444-abcdef" }] } },
    foodos_order_notifications: { select: { data: [] } },
    foodos_order_payments: { select: { data: [] } },
    ...overrides,
  })
}

function notifiedEvents(): string[] {
  return vi.mocked(notifyFoodosCustomer).mock.calls.map((c) => c[1] as string)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("checkAndSendFoodosPaymentReminders — recordatorios", () => {
  it("no recuerda nada si no hay pedidos sin pagar", async () => {
    base({}, [])
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result).toEqual({ checked: 0, reminded: 0, cancelled: 0, errors: [] })
    expect(notifyFoodosCustomer).not.toHaveBeenCalled()
  })

  it("manda el recordatorio de 1 h a un pedido reciente sin pagar", async () => {
    base({}, [order({ ageHours: 2 })])
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result.checked).toBe(1)
    expect(result.reminded).toBe(1)
    expect(notifiedEvents()).toEqual(["payment:reminder_1h"])
  })

  it("no repite el recordatorio de 1 h ya enviado", async () => {
    base({ foodos_order_notifications: { select: { data: [{ order_id: order().id, event: "payment:reminder_1h" }] } } }, [
      order({ ageHours: 2 }),
    ])
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result.reminded).toBe(0)
    expect(notifyFoodosCustomer).not.toHaveBeenCalled()
  })

  it("escala al recordatorio de 24 h cuando el de 1 h ya salió", async () => {
    base(
      {
        foodos_order_notifications: {
          select: { data: [{ order_id: order().id, event: "payment:reminder_1h" }] },
        },
      },
      [order({ ageHours: 30 })]
    )
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result.reminded).toBe(1)
    expect(notifiedEvents()).toEqual(["payment:reminder_24h"])
  })

  it("manda un solo recordatorio por corrida aunque apliquen dos umbrales", async () => {
    base({}, [order({ ageHours: 40 })])
    await checkAndSendFoodosPaymentReminders()

    // El de 24 h (el más avanzado); el de 1 h no se manda de golpe.
    expect(notifiedEvents()).toEqual(["payment:reminder_24h"])
  })

  it("no recuerda si ya se enviaron ambos umbrales", async () => {
    base(
      {
        foodos_order_notifications: {
          select: {
            data: [
              { order_id: order().id, event: "payment:reminder_1h" },
              { order_id: order().id, event: "payment:reminder_24h" },
            ],
          },
        },
      },
      [order({ ageHours: 50 })]
    )
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result.reminded).toBe(0)
  })

  it("ignora pedidos en estado no terminal pero con comprobante en revisión", async () => {
    base({ foodos_order_payments: { select: { data: [{ order_id: order().id }] } } }, [
      order({ ageHours: 30 }),
    ])
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result.reminded).toBe(0)
    expect(notifyFoodosCustomer).not.toHaveBeenCalled()
  })
})

describe("checkAndSendFoodosPaymentReminders — caducidad", () => {
  it("cancela un pedido pending tras el plazo y avisa", async () => {
    const { recorded } = base({}, [order({ ageHours: 80 })])
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result.cancelled).toBe(1)
    expect(result.reminded).toBe(0)
    expect(recorded.foodos_orders?.updates).toEqual([
      { status: "cancelled", payment_status: "expired" },
    ])
    expect(notifiedEvents()).toEqual(["payment:expired"])
  })

  it("no cancela antes del plazo", async () => {
    const { recorded } = base({}, [order({ ageHours: FOODOS_UNPAID_CANCEL_HOURS - 2 })])
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result.cancelled).toBe(0)
    expect(recorded.foodos_orders?.updates).toEqual([])
  })

  it("nunca cancela un pago en curso (voucher OXXO/SPEI vigente)", async () => {
    const { recorded } = base({}, [order({ ageHours: 80, payment_status: "processing" })])
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result.cancelled).toBe(0)
    expect(recorded.foodos_orders?.updates).toEqual([])
    expect(notifiedEvents()).toEqual(["payment:reminder_24h"])
  })

  it("nunca cancela un pedido que el restaurante ya aceptó", async () => {
    const { recorded } = base({}, [order({ ageHours: 80, status: "confirmed" })])
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result.cancelled).toBe(0)
    expect(recorded.foodos_orders?.updates).toEqual([])
  })

  it("nunca cancela si hay un comprobante esperando revisión", async () => {
    const { recorded } = base({ foodos_order_payments: { select: { data: [{ order_id: order().id }] } } }, [
      order({ ageHours: 80 }),
    ])
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result.cancelled).toBe(0)
    expect(recorded.foodos_orders?.updates).toEqual([])
  })

  it("no avisa de cancelación si el UPDATE no tocó ninguna fila", async () => {
    // El panel cambió el pedido entre la lectura y la escritura.
    const { recorded } = base({ foodos_orders: { select: { data: [order({ ageHours: 80 })] }, update: { data: [] } } })
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result.cancelled).toBe(0)
    expect(recorded.foodos_orders?.updates).toHaveLength(1)
    expect(notifyFoodosCustomer).not.toHaveBeenCalled()
  })

  it("reporta el error del UPDATE sin abortar el barrido", async () => {
    const { recorded } = base({
      foodos_orders: {
        select: { data: [order({ id: "a", ageHours: 80 }), order({ id: "b", ageHours: 80 })], },
        update: { error: { message: "boom" } },
      },
    })
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result.cancelled).toBe(0)
    expect(result.errors).toHaveLength(2)
    expect(recorded.foodos_orders?.updates).toHaveLength(2)
  })
})

describe("checkAndSendFoodosPaymentReminders — filtros y resiliencia", () => {
  it("filtra por estado de pago no terminal, pedido no cancelado y antigüedad", async () => {
    const { recorded } = base()
    await checkAndSendFoodosPaymentReminders()

    const calls = recorded.foodos_orders?.calls ?? []
    expect(calls).toContainEqual(["in", "payment_status", ["pending", "processing"]])
    expect(calls).toContainEqual(["neq", "status", "cancelled"])
    const lt = calls.find((c) => c[0] === "lt")
    expect(lt?.[1]).toBe("created_at")
    expect(typeof lt?.[2]).toBe("string")
  })

  it("devuelve el error de lectura sin lanzar", async () => {
    base({ foodos_orders: { select: { error: { message: "db down" } } } })
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result).toEqual({ checked: 0, reminded: 0, cancelled: 0, errors: ["db down"] })
    expect(notifyFoodosCustomer).not.toHaveBeenCalled()
  })

  it("sigue sin la bitácora si esa consulta falla (el notificador deduplica igual)", async () => {
    base({ foodos_order_notifications: { select: { error: { message: "no rls" } } } }, [
      order({ ageHours: 2 }),
    ])
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result.reminded).toBe(1)
  })

  it("sigue sin la tabla de comprobantes si esa consulta falla", async () => {
    base({ foodos_order_payments: { select: { error: { message: "no rls" } } } }, [
      order({ ageHours: 80 }),
    ])
    const result = await checkAndSendFoodosPaymentReminders()

    // Sin poder ver comprobantes, un pending viejo se cancela igual.
    expect(result.cancelled).toBe(1)
  })

  it("aísla el fallo de un aviso y continúa con el resto del lote", async () => {
    vi.mocked(notifyFoodosCustomer).mockRejectedValueOnce(new Error("messenger down"))
    base({}, [order({ id: "a", ageHours: 2 }), order({ id: "b", ageHours: 3 })])
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result.checked).toBe(2)
    expect(result.reminded).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(notifyFoodosCustomer).toHaveBeenCalledTimes(2)
  })

  it("procesa recordatorio y cancelación en la misma corrida", async () => {
    base({}, [order({ id: "joven", ageHours: 2 }), order({ id: "viejo", ageHours: 90 })])
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result.checked).toBe(2)
    expect(result.reminded).toBe(1)
    expect(result.cancelled).toBe(1)
    expect(notifiedEvents()).toEqual(["payment:reminder_1h", "payment:expired"])
  })

  it("nunca lanza aunque falle el cliente de BD", async () => {
    vi.mocked(createServiceClient).mockRejectedValueOnce(new Error("sin credenciales"))
    const result = await checkAndSendFoodosPaymentReminders()

    expect(result.errors).toEqual(["sin credenciales"])
  })
})
