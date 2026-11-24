import { beforeEach, describe, expect, it, vi } from "vitest"

// Se controla el perfil por teléfono y la API de Meta: esta suite
// prueba el LIGADO del comprobante, no la descarga ni la resolución
// de perfiles (cubiertas en sus propias suites).
const findProfileMock = vi.hoisted(() => vi.fn())
const downloadMock = vi.hoisted(() => vi.fn())
const sendTextMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/whatsapp-orders", () => ({
  findProfileByPhone: findProfileMock,
}))
vi.mock("@/lib/whatsapp", () => ({
  downloadWhatsAppMedia: downloadMock,
  sendTextMessage: sendTextMock,
}))

import {
  attachWhatsAppPaymentProof,
  findProofCandidateOrders,
  handleWhatsAppProofClarification,
  handleWhatsAppProofImage,
} from "@/lib/whatsapp-payment-proof"
import {
  isPaymentProofPath,
  paymentProofPath,
  validatePaymentProofFile,
} from "@/lib/payment-proof"
import { WHATSAPP_NUMBER } from "@/lib/business"

// ============================================================
// Supabase falso en memoria (orders + whatsapp_messages) + Storage
// ============================================================

type Row = Record<string, unknown>

interface FakeOptions {
  /** Simula la migración 00228 sin aplicar en el UPDATE del comprobante. */
  failProofColumns?: boolean
}

function createFakeSupabase(
  tables: { orders?: Row[]; whatsapp_messages?: Row[] },
  opts: FakeOptions = {}
) {
  const state = {
    orders: (tables.orders ?? []).map((r) => ({ ...r })),
    whatsapp_messages: (tables.whatsapp_messages ?? []).map((r) => ({ ...r })),
  }
  const uploads: { bucket: string; path: string }[] = []
  const removals: { bucket: string; paths: string[] }[] = []
  let nextMessageId = 1

  function makeQuery(table: "orders" | "whatsapp_messages") {
    const filters: ((r: Row) => boolean)[] = []
    let patch: Row | null = null
    let insertRow: Row | null = null
    let limitN: number | null = null
    let single = false

    const rows = () => state[table]

    const execute = async () => {
      if (insertRow) {
        const row = { id: nextMessageId++, created_at: new Date().toISOString(), ...insertRow }
        rows().push(row)
        return { data: null, error: null }
      }
      const matched = rows().filter((r) => filters.every((f) => f(r)))
      if (patch) {
        if (
          opts.failProofColumns &&
          table === "orders" &&
          ("payment_proof_path" in patch || "payment_proof_at" in patch)
        ) {
          return {
            data: null,
            error: { code: "42703", message: "column orders.payment_proof_path does not exist" },
          }
        }
        for (const r of matched) Object.assign(r, patch)
        return { data: matched.map((r) => ({ id: r.id })), error: null }
      }
      const out = limitN !== null ? matched.slice(0, limitN) : matched
      if (single) return { data: out[0] ?? null, error: null }
      return { data: out, error: null }
    }

    const q: Record<string, unknown> = {
      select: () => q,
      insert: (row: Row) => {
        insertRow = row
        return q
      },
      update: (p: Row) => {
        patch = p
        return q
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val)
        return q
      },
      not: (col: string, op: string, val: unknown) => {
        if (op === "in") {
          const list = String(val).slice(1, -1).split(",")
          filters.push((r) => !list.includes(String(r[col])))
        }
        return q
      },
      gte: (col: string, val: unknown) => {
        filters.push((r) => String(r[col]) >= String(val))
        return q
      },
      order: () => q,
      limit: (n: number) => {
        limitN = n
        return q
      },
      maybeSingle: () => {
        single = true
        return q
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        execute().then(resolve, reject),
    }
    return q
  }

  return {
    state,
    uploads,
    removals,
    from: (table: "orders" | "whatsapp_messages") => makeQuery(table),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => {
          uploads.push({ bucket, path })
          return { error: null }
        },
        remove: async (paths: string[]) => {
          removals.push({ bucket, paths })
          return { error: null }
        },
      }),
    },
  }
}

const PHONE = "5216141047021"
const recentIso = () => new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

function pendingOrder(over: Row = {}): Row {
  return {
    id: 501,
    total: 612,
    payment_method: "spei",
    payment_status: "pending",
    status: "pending",
    source: "whatsapp",
    customer_phone: PHONE,
    user_id: null,
    created_at: recentIso(),
    payment_proof_path: null,
    payment_proof_at: null,
    ...over,
  }
}

beforeEach(() => {
  findProfileMock.mockReset()
  findProfileMock.mockResolvedValue({ profile: null, error: null })
  downloadMock.mockReset()
  downloadMock.mockResolvedValue({
    data: Buffer.from("fake-jpeg-bytes"),
    mimeType: "image/jpeg",
    size: 15,
  })
  sendTextMock.mockReset()
  sendTextMock.mockResolvedValue({ messages: [{ id: "wamid.staff" }] })
})

describe("findProofCandidateOrders", () => {
  it("encuentra el pedido pendiente del teléfono", async () => {
    const fake = createFakeSupabase({ orders: [pendingOrder()] })
    const candidates = await findProofCandidateOrders(fake as never, PHONE)
    expect(candidates).toEqual([{ id: 501, total: 612, paymentMethod: "spei" }])
  })

  it("excluye pagados, cancelados y entregados", async () => {
    const fake = createFakeSupabase({
      orders: [
        pendingOrder({ id: 1, payment_status: "paid" }),
        pendingOrder({ id: 2, status: "cancelled" }),
        pendingOrder({ id: 3, status: "delivered" }),
        pendingOrder({ id: 4, customer_phone: "5210000000000" }),
      ],
    })
    expect(await findProofCandidateOrders(fake as never, PHONE)).toEqual([])
  })

  it("un pedido WEB del mismo perfil también es candidato", async () => {
    findProfileMock.mockResolvedValue({ profile: { id: "user-9" }, error: null })
    const fake = createFakeSupabase({
      orders: [pendingOrder({ source: "web", customer_phone: null, user_id: "user-9" })],
    })
    const candidates = await findProofCandidateOrders(fake as never, PHONE)
    expect(candidates.map((c) => c.id)).toEqual([501])
  })
})

describe("handleWhatsAppProofImage", () => {
  it("con un solo candidato: descarga, sube al bucket de comprobantes y liga al pedido", async () => {
    const fake = createFakeSupabase({ orders: [pendingOrder()] })
    const result = await handleWhatsAppProofImage(fake as never, { from: PHONE, mediaId: "media-1" })

    expect(result).toEqual({ kind: "attached", orderId: 501, total: 612 })
    expect(downloadMock).toHaveBeenCalledWith("media-1")

    // Mismo almacenamiento que la ruta web de comprobantes.
    expect(fake.uploads).toHaveLength(1)
    expect(fake.uploads[0]?.bucket).toBe("entregas")
    expect(fake.uploads[0]?.path).toMatch(/^marketplace-pagos\/501\/.+\.jpg$/)

    const row = fake.state.orders[0]
    expect(row?.payment_proof_path).toBe(fake.uploads[0]?.path)
    expect(typeof row?.payment_proof_at).toBe("string")
    // Guardar el comprobante NO marca el pedido como pagado.
    expect(row?.payment_status).toBe("pending")

    // Registro para staff: bitácora ligada al pedido + aviso.
    const log = fake.state.whatsapp_messages.find((m) => m.message_type === "workflow:payment_proof")
    expect(log?.order_id).toBe(501)
    expect(sendTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: WHATSAPP_NUMBER })
    )
  })

  it("sin candidatos no descarga nada ni responde", async () => {
    const fake = createFakeSupabase({ orders: [] })
    const result = await handleWhatsAppProofImage(fake as never, { from: PHONE, mediaId: "media-1" })
    expect(result.kind).toBe("none")
    expect(downloadMock).not.toHaveBeenCalled()
  })

  it("con varios candidatos pregunta antes de ligar (no descarga todavía)", async () => {
    const fake = createFakeSupabase({
      orders: [pendingOrder(), pendingOrder({ id: 502, total: 300 })],
    })
    const result = await handleWhatsAppProofImage(fake as never, { from: PHONE, mediaId: "media-9" })

    expect(result.kind).toBe("clarify")
    if (result.kind === "clarify") {
      expect(result.candidates.map((c) => c.id)).toEqual([501, 502])
    }
    expect(downloadMock).not.toHaveBeenCalled()
    const clarify = fake.state.whatsapp_messages.find(
      (m) => m.message_type === "workflow:proof_clarify"
    )
    expect(clarify).toBeTruthy()
    const parsed = JSON.parse(String(clarify?.content)) as { media_id: string; order_ids: number[] }
    expect(parsed.media_id).toBe("media-9")
    expect(parsed.order_ids).toEqual([501, 502])
  })

  it("un archivo que no es imagen válida no se sube", async () => {
    downloadMock.mockResolvedValue({
      data: Buffer.from("gif"),
      mimeType: "image/gif",
      size: 3,
    })
    const fake = createFakeSupabase({ orders: [pendingOrder()] })
    const result = await handleWhatsAppProofImage(fake as never, { from: PHONE, mediaId: "media-2" })
    expect(result.kind).toBe("invalid_file")
    expect(fake.uploads).toHaveLength(0)
    expect(fake.state.orders[0]?.payment_proof_path).toBeNull()
  })
})

describe("handleWhatsAppProofClarification", () => {
  function clarifyRow(over: Row = {}): Row {
    return {
      id: 77,
      from_number: PHONE,
      message_type: "workflow:proof_clarify",
      content: JSON.stringify({ media_id: "media-9", order_ids: [501, 502], resolved: false }),
      direction: "outbound",
      ...over,
    }
  }

  it("la respuesta numerada liga la foto al pedido elegido y cierra la aclaración", async () => {
    const fake = createFakeSupabase({
      orders: [pendingOrder(), pendingOrder({ id: 502, total: 300 })],
      whatsapp_messages: [clarifyRow()],
    })
    const result = await handleWhatsAppProofClarification(fake as never, { from: PHONE, text: "2" })

    expect(result).toEqual({ kind: "attached", orderId: 502, total: 300 })
    expect(fake.state.orders[1]?.payment_proof_path).toBeTruthy()
    expect(fake.state.orders[0]?.payment_proof_path).toBeNull()

    const clarify = fake.state.whatsapp_messages.find(
      (m) => m.message_type === "workflow:proof_clarify"
    )
    const parsed = JSON.parse(String(clarify?.content)) as { resolved: boolean }
    expect(parsed.resolved).toBe(true)
  })

  it("un número fuera de la lista no liga nada", async () => {
    const fake = createFakeSupabase({
      orders: [pendingOrder(), pendingOrder({ id: 502 })],
      whatsapp_messages: [clarifyRow()],
    })
    const result = await handleWhatsAppProofClarification(fake as never, { from: PHONE, text: "9" })
    expect(result.kind).toBe("invalid_choice")
    expect(downloadMock).not.toHaveBeenCalled()
  })

  it("un texto que no es número pelado no es respuesta de aclaración", async () => {
    const fake = createFakeSupabase({
      orders: [pendingOrder()],
      whatsapp_messages: [clarifyRow()],
    })
    const result = await handleWhatsAppProofClarification(fake as never, {
      from: PHONE,
      text: "es el 2",
    })
    expect(result.kind).toBe("none")
  })

  it("sin aclaración abierta, un número suelto no hace nada", async () => {
    const fake = createFakeSupabase({ orders: [pendingOrder()] })
    const result = await handleWhatsAppProofClarification(fake as never, { from: PHONE, text: "1" })
    expect(result.kind).toBe("none")
  })
})

describe("attachWhatsAppPaymentProof — bordes", () => {
  it("un pedido ya pagado no recibe comprobante (ni se descarga la foto)", async () => {
    const fake = createFakeSupabase({ orders: [pendingOrder({ payment_status: "paid" })] })
    const result = await attachWhatsAppPaymentProof(fake as never, { orderId: 501, mediaId: "m" })
    expect(result.kind).toBe("order_not_pending")
    expect(downloadMock).not.toHaveBeenCalled()
    expect(fake.uploads).toHaveLength(0)
  })

  it("sin la migración 00228: el archivo se guarda y el evento queda registrado (degradación)", async () => {
    const fake = createFakeSupabase({ orders: [pendingOrder()] }, { failProofColumns: true })
    const result = await attachWhatsAppPaymentProof(fake as never, { orderId: 501, mediaId: "m" })

    expect(result.kind).toBe("stored_unlinked")
    expect(fake.uploads).toHaveLength(1)
    const log = fake.state.whatsapp_messages.find((m) => m.message_type === "workflow:payment_proof")
    expect(log).toBeTruthy()
    const parsed = JSON.parse(String(log?.content)) as { linked: boolean; path: string }
    expect(parsed.linked).toBe(false)
    expect(parsed.path).toBe(fake.uploads[0]?.path)
  })
})

describe("payment-proof (reglas puras, espejo del comprobante de entrega)", () => {
  it("acepta JPG/PNG/WebP dentro del tope y rechaza el resto", () => {
    expect(validatePaymentProofFile({ type: "image/jpeg", size: 1024 }).ok).toBe(true)
    expect(validatePaymentProofFile({ type: "image/png", size: 1024 }).ok).toBe(true)
    expect(validatePaymentProofFile({ type: "image/webp", size: 1024 }).ok).toBe(true)
    // Un SVG también es "image/*": la lista blanca es la que protege.
    expect(validatePaymentProofFile({ type: "image/svg+xml", size: 1024 }).ok).toBe(false)
    expect(validatePaymentProofFile({ type: "application/pdf", size: 1024 }).ok).toBe(false)
    expect(validatePaymentProofFile({ type: "image/jpeg", size: 0 }).ok).toBe(false)
    expect(validatePaymentProofFile({ type: "image/jpeg", size: 6 * 1024 * 1024 }).ok).toBe(false)
  })

  it("la ruta vive bajo el prefijo propio y no pisa comprobantes de entrega", () => {
    const path = paymentProofPath(501, "image/png", "uuid-1")
    expect(path).toBe("marketplace-pagos/501/uuid-1.png")
    expect(isPaymentProofPath(path)).toBe(true)
    expect(isPaymentProofPath("marketplace/501/uuid-1.png")).toBe(false)
  })
})
