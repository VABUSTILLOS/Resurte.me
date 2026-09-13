import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/foodos-notifications", () => ({ notifyFoodosCustomer: vi.fn() }))
// after() sólo existe dentro de un request scope de Next; en tests se ejecuta inline.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => void) => fn(),
}))

import {
  approvePaymentProof,
  countPendingPaymentProofs,
  getPaymentProofUrl,
  listPendingPaymentProofs,
  rejectPaymentProof,
} from "./payment-proofs"
import { requireAuth } from "@/lib/auth"
import { createServiceClient } from "@/lib/supabase/service"
import { notifyFoodosCustomer } from "@/lib/foodos-notifications"
import { revalidatePath } from "next/cache"

const USER = { id: "user-1" }
const PROOF = {
  id: 9,
  order_id: "ord-1",
  restaurant_id: "rest-1",
  method: "transfer",
  amount: "250.00",
  proof_path: "rest-1/ord-1/comprobante.png",
  reference: "ref-99",
  status: "pending",
  reviewed_by: null,
  reviewed_at: null,
  notes: null,
  created_at: "2026-09-12T18:00:00Z",
}

type Result = { data?: unknown; error?: unknown; count?: number | null }

/** Builder encadenable que registra la última operación de escritura. */
function tableBuilder(result: Result) {
  const builder: Record<string, unknown> = {}
  let columns: string | null = null
  const resolve = () => ({
    data: project(result.data, columns),
    error: result.error ?? null,
    count: result.count ?? null,
  })
  for (const m of ["eq", "in", "order", "limit"]) builder[m] = vi.fn().mockReturnValue(builder)
  builder.select = vi.fn((cols: string) => {
    columns = cols
    return builder
  })
  builder.update = vi.fn().mockReturnValue(builder)
  builder.maybeSingle = vi.fn(() => Promise.resolve(resolve()))
  builder.then = (onFulfilled: (value: unknown) => unknown) => onFulfilled(resolve())
  return builder as Record<string, ReturnType<typeof vi.fn>>
}

function project(data: unknown, columns: string | null) {
  if (!columns || columns === "*" || columns.includes("(")) return data
  const keys = columns.split(",").map((c) => c.trim())
  const pick = (row: unknown) => {
    if (row === null || typeof row !== "object") return row
    const out: Record<string, unknown> = {}
    for (const k of keys) {
      if (k in (row as Record<string, unknown>)) out[k] = (row as Record<string, unknown>)[k]
    }
    return out
  }
  return Array.isArray(data) ? data.map(pick) : pick(data)
}

function setup(config: { tables: Record<string, Result>; signError?: unknown } = { tables: {} }) {
  const builders: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {}
  const from = vi.fn((table: string) => {
    const builder = tableBuilder(config.tables[table] ?? { data: null })
    builders[table] = builder
    return builder
  })
  const createSignedUrl = vi
    .fn()
    .mockResolvedValue({ data: { signedUrl: "https://signed/x" }, error: config.signError ?? null })
  const storage = { from: vi.fn(() => ({ createSignedUrl })) }
  const session = { from, storage }
  vi.mocked(requireAuth).mockResolvedValue({ supabase: session, user: USER } as never)
  vi.mocked(createServiceClient).mockResolvedValue({ storage } as never)
  return { builders, createSignedUrl, storage }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("listPendingPaymentProofs", () => {
  it("devuelve arreglo vacío sin consultar pedidos si no hay comprobantes", async () => {
    const { builders } = setup({ tables: { foodos_order_payments: { data: [] } } })
    await expect(listPendingPaymentProofs("rest-1")).resolves.toEqual([])
    expect(builders.foodos_orders).toBeUndefined()
  })

  it("adjunta el pedido a cada comprobante", async () => {
    setup({
      tables: {
        foodos_order_payments: { data: [PROOF] },
        foodos_orders: {
          data: [
            {
              id: "ord-1",
              customer_name: "Ana",
              customer_phone: "555",
              total: "250.00",
              payment_status: "pending",
              created_at: "2026-09-12T17:00:00Z",
            },
          ],
        },
      },
    })
    const rows = await listPendingPaymentProofs("rest-1")
    expect(rows).toHaveLength(1)
    expect(rows[0]!.order).toMatchObject({ id: "ord-1", customer_name: "Ana", total: 250 })
  })

  it("deja order en null si el pedido ya no existe", async () => {
    setup({
      tables: { foodos_order_payments: { data: [PROOF] }, foodos_orders: { data: [] } },
    })
    const rows = await listPendingPaymentProofs("rest-1")
    expect(rows[0]!.order).toBeNull()
  })

  it("propaga el error de la consulta", async () => {
    setup({
      tables: { foodos_order_payments: { data: null, error: { message: "boom" } } },
    })
    await expect(listPendingPaymentProofs("rest-1")).rejects.toThrow("boom")
  })
})

describe("countPendingPaymentProofs", () => {
  it("devuelve el conteo y 0 cuando viene null", async () => {
    setup({ tables: { foodos_order_payments: { count: 3 } } })
    await expect(countPendingPaymentProofs("rest-1")).resolves.toBe(3)

    setup({ tables: { foodos_order_payments: { count: null } } })
    await expect(countPendingPaymentProofs("rest-1")).resolves.toBe(0)
  })
})

describe("getPaymentProofUrl", () => {
  it("firma con la service key después de leer la fila con RLS", async () => {
    const { createSignedUrl, storage } = setup({
      tables: { foodos_order_payments: { data: { proof_path: PROOF.proof_path } } },
    })
    await expect(getPaymentProofUrl(9)).resolves.toBe("https://signed/x")
    expect(storage.from).toHaveBeenCalledWith("comprobantes")
    expect(createSignedUrl).toHaveBeenCalledWith(PROOF.proof_path, 3600)
  })

  it("null si RLS no deja ver el comprobante", async () => {
    const { createSignedUrl } = setup({ tables: { foodos_order_payments: { data: null } } })
    await expect(getPaymentProofUrl(9)).resolves.toBeNull()
    expect(createSignedUrl).not.toHaveBeenCalled()
  })

  it("null si falla la firma", async () => {
    setup({
      tables: { foodos_order_payments: { data: { proof_path: PROOF.proof_path } } },
      signError: { message: "no" },
    })
    await expect(getPaymentProofUrl(9)).resolves.toBeNull()
  })
})

describe("approvePaymentProof", () => {
  it("marca el comprobante y el pedido como pagados", async () => {
    const { builders } = setup({
      tables: { foodos_order_payments: { data: PROOF }, foodos_orders: { data: null } },
    })
    await approvePaymentProof(9)

    const proofUpdate = builders.foodos_order_payments!.update as ReturnType<typeof vi.fn>
    expect(proofUpdate.mock.calls[0]![0]).toMatchObject({
      status: "approved",
      reviewed_by: "user-1",
    })
    expect((proofUpdate.mock.calls[0]![0] as { reviewed_at: string }).reviewed_at).toBeTruthy()

    const orderUpdate = builders.foodos_orders!.update as ReturnType<typeof vi.fn>
    expect(orderUpdate).toHaveBeenCalledWith({ payment_status: "paid" })

    expect(revalidatePath).toHaveBeenCalledWith("/panel/foodos/pedidos")
    expect(revalidatePath).toHaveBeenCalledWith("/panel/foodos/tablero")
    expect(notifyFoodosCustomer).toHaveBeenCalledWith("ord-1", "payment:paid")
  })

  it("no permite revisar dos veces el mismo comprobante", async () => {
    const { builders } = setup({
      tables: { foodos_order_payments: { data: { ...PROOF, status: "approved" } } },
    })
    await expect(approvePaymentProof(9)).rejects.toThrow("ya fue revisado")
    expect(builders.foodos_orders).toBeUndefined()
  })

  it("falla si el comprobante no existe o no es del dueño", async () => {
    setup({ tables: { foodos_order_payments: { data: null } } })
    await expect(approvePaymentProof(9)).rejects.toThrow("no encontrado")
  })
})

describe("rejectPaymentProof", () => {
  it("rechaza con motivo y no toca el pedido", async () => {
    const { builders } = setup({
      tables: { foodos_order_payments: { data: { id: 9, status: "pending", order_id: "ord-1" } } },
    })
    await rejectPaymentProof(9, "  monto incorrecto  ")

    const update = builders.foodos_order_payments!.update as ReturnType<typeof vi.fn>
    expect(update.mock.calls[0]![0]).toMatchObject({
      status: "rejected",
      notes: "monto incorrecto",
      reviewed_by: "user-1",
    })
    // El pedido sigue pendiente: el cliente puede subir otro comprobante.
    expect(builders.foodos_orders).toBeUndefined()
    expect(notifyFoodosCustomer).toHaveBeenCalledWith("ord-1", "payment:proof_rejected", {
      reason: "monto incorrecto",
    })
  })

  it("guarda notes en null cuando el motivo viene vacío", async () => {
    const { builders } = setup({
      tables: { foodos_order_payments: { data: { id: 9, status: "pending", order_id: "ord-1" } } },
    })
    await rejectPaymentProof(9, "   ")
    const update = builders.foodos_order_payments!.update as ReturnType<typeof vi.fn>
    expect(update.mock.calls[0]![0]).toMatchObject({ notes: null })
    expect(notifyFoodosCustomer).toHaveBeenCalledWith("ord-1", "payment:proof_rejected", {
      reason: null,
    })
  })

  it("no avisa al comensal si el rechazo falla", async () => {
    setup({ tables: { foodos_order_payments: { data: { id: 9, status: "rejected" } } } })
    await expect(rejectPaymentProof(9, "x")).rejects.toThrow("ya fue revisado")
    expect(notifyFoodosCustomer).not.toHaveBeenCalled()
  })
})
