import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/whatsapp", () => ({ sendTextMessage: vi.fn(async () => ({ messages: [{ id: "wamid.test" }] })) }))
vi.mock("@/lib/order-emails", () => ({
  sendOrderConfirmationEmail: vi.fn(),
  sendOrderStatusEmail: vi.fn(),
}))
vi.mock("@/lib/order-cancellation", () => ({ applyOrderCancellationEffects: vi.fn() }))
vi.mock("@/lib/whatsapp-automations-engine", () => ({
  getAutomationConfig: vi.fn(async () => null),
  // El barrido no debe salir por la puerta de "automatización apagada": estas
  // pruebas miden la elegibilidad de los pedidos, así que la config se fija
  // activa con los niveles por defecto.
  effectiveAutomationConfig: vi.fn(() => ({ is_active: true })),
  resolveReminderLevels: vi.fn(() => [1, 24, 48]),
  isReminderDue: vi.fn(() => true),
}))

import { checkAndSendPaymentReminders } from "./workflows"
import { createServiceClient } from "@/lib/supabase/service"
import { applyOrderCancellationEffects } from "@/lib/order-cancellation"
import { sendTextMessage } from "@/lib/whatsapp"
import { paymentRecoveryMethodFilter } from "@/lib/payment-recovery"

interface Spec {
  data?: unknown
  error?: unknown
}

interface Recorded {
  calls: Array<[string, ...unknown[]]>
  updates: unknown[]
}

/**
 * Cliente Supabase falso para el barrido de impagos, con el mismo patrón que
 * `foodos-payment-reminders.test.ts`: cada tabla recibe su resultado de lectura
 * y de escritura, y el builder recuerda las llamadas para poder afirmar qué
 * filtros se aplicaron a la consulta.
 */
function setup(tables: Record<string, Spec> = {}) {
  const recorded: Record<string, Recorded> = {}

  const from = vi.fn((table: string) => {
    const spec = tables[table] ?? {}
    const log: Recorded = (recorded[table] ??= { calls: [], updates: [] })
    let mode: "select" | "update" = "select"
    const builder: Record<string, unknown> = {}

    for (const m of ["eq", "neq", "or", "limit", "order", "gte", "lte", "not", "in"]) {
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
    builder.single = vi.fn(() =>
      Promise.resolve({ data: spec.data ?? null, error: spec.error ?? null })
    )
    builder.then = (onFulfilled: (v: unknown) => unknown) => {
      const result = mode === "update" ? spec : spec
      return onFulfilled({ data: result?.data ?? null, error: result?.error ?? null })
    }

    return builder
  })

  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from, recorded }
}

/** Llamadas registradas a una tabla; `[]` si nadie la tocó. */
function callsTo(recorded: Record<string, Recorded>, table: string): Array<[string, ...unknown[]]> {
  return recorded[table]?.calls ?? []
}

/** Argumento de la primera llamada a `method` en `table`; `undefined` si no hubo. */
function firstArg(recorded: Record<string, Recorded>, table: string, method: string): unknown {
  return callsTo(recorded, table).find(([m]) => m === method)?.[1]
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function order(
  overrides: Partial<{
    id: number
    ageHours: number
    payment_method: string
    status: string
    payment_status: string
  }> = {}
) {
  return {
    id: overrides.id ?? 1,
    created_at: hoursAgo(overrides.ageHours ?? 100),
    status: overrides.status ?? "pending",
    payment_status: overrides.payment_status ?? "pending",
    payment_method: overrides.payment_method ?? "card",
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("checkAndSendPaymentReminders — contra entrega no es un impago", () => {
  it("filtra contra entrega en la consulta, no solo en el bucle", async () => {
    // El `.limit(500)` existe: si la exclusión viviera solo en el bucle, los
    // pedidos contra entrega consumirían cupo del lote antes de descartarse.
    const { recorded } = setup({ orders: { data: [] } })
    await checkAndSendPaymentReminders()

    const orCalls = callsTo(recorded, "orders").filter(([m]) => m === "or")
    expect(orCalls).toHaveLength(1)
    expect(orCalls[0]?.[1]).toBe(paymentRecoveryMethodFilter())
  })

  it("pide `payment_method` en el select: sin ese dato el bucle no puede decidir", async () => {
    const { recorded } = setup({ orders: { data: [] } })
    await checkAndSendPaymentReminders()

    expect(String(firstArg(recorded, "orders", "select"))).toContain("payment_method")
  })

  it("NO cancela un pedido contra entrega de 100 h", async () => {
    // La regresión que este test existe para fijar. En producción los 4 pedidos
    // contra entrega se cancelaron a las 87, 83, 83 y 81 h de crearse.
    setup({ orders: { data: [order({ ageHours: 100, payment_method: "cash_on_delivery" })] } })
    const result = await checkAndSendPaymentReminders()

    expect(applyOrderCancellationEffects).not.toHaveBeenCalled()
    expect(result.cancelled).toBe(0)
  })

  it("NO le manda el recordatorio de pago a un cliente contra entrega", async () => {
    // A quien eligió pagar al recibir no se le pide que pague por adelantado.
    setup({ orders: { data: [order({ ageHours: 5, payment_method: "cash_on_delivery" })] } })
    const result = await checkAndSendPaymentReminders()

    expect(sendTextMessage).not.toHaveBeenCalled()
    expect(result.reminded).toBe(0)
  })

  it("SÍ cancela un impago real de 100 h: el arreglo no apagó el barrido", async () => {
    setup({ orders: { data: [order({ ageHours: 100, payment_method: "oxxo" })] } })
    const result = await checkAndSendPaymentReminders()

    expect(applyOrderCancellationEffects).toHaveBeenCalledTimes(1)
    expect(result.cancelled).toBe(1)
  })

  it("mezcla: de dos pedidos de 100 h, cancela el impago y respeta el contra entrega", async () => {
    setup({
      orders: {
        data: [
          order({ id: 1, ageHours: 100, payment_method: "cash_on_delivery" }),
          order({ id: 2, ageHours: 100, payment_method: "card" }),
        ],
      },
    })
    const result = await checkAndSendPaymentReminders()

    expect(result.cancelled).toBe(1)
    expect(applyOrderCancellationEffects).toHaveBeenCalledTimes(1)
  })
})
