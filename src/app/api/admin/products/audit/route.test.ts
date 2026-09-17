import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))

import { GET } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"

interface FakeResult {
  data?: unknown
  error?: unknown
}

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
}

/**
 * Cliente Supabase falso: un único builder "thenable" ligado a su propio
 * resultado, con la cadena de filtros registrada para poder afirmar sobre ella.
 */
function serviceWith(result: FakeResult) {
  const selects: { table: string; columns: string }[] = []
  const filters: { op: string; args: unknown[] }[] = []

  const builder: Record<string, unknown> = {}
  builder.select = vi.fn((columns?: string) => {
    selects.push({ table: "admin_audit_log", columns: columns ?? "" })
    return builder
  })
  for (const op of ["eq", "neq", "in", "is", "not", "like", "gte", "lte", "order", "limit", "range"]) {
    builder[op] = vi.fn((...args: unknown[]) => {
      filters.push({ op, args })
      return builder
    })
  }
  builder.then = (
    onFulfilled: (value: FakeResult) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected)

  const from = vi.fn(() => builder)
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from, selects, filters }
}

function auditRequest(query = "") {
  return new NextRequest(`http://localhost/api/admin/products/audit${query}`)
}

const ENTRIES = [
  { action: "product_update", actor_email: "admin@test.com", created_at: "2026-01-01T00:00:00Z" },
]

describe("/api/admin/products/audit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("devuelve 403 y no toca Supabase si el admin es rechazado", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never)

    const response = await GET(auditRequest("?productId=123"))

    expect(response.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("con productId filtra por entity_id y limita a 50 filas", async () => {
    asAdmin()
    const supabase = serviceWith({ data: ENTRIES, error: null })

    const response = await GET(auditRequest("?productId=123"))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ entries: ENTRIES })
    expect(supabase.selects).toEqual([
      { table: "admin_audit_log", columns: "action,actor_email,created_at,detail" },
    ])
    expect(supabase.filters).toEqual([
      { op: "eq", args: ["entity", "products"] },
      { op: "eq", args: ["entity_id", "123"] },
      { op: "order", args: ["created_at", { ascending: false }] },
      { op: "limit", args: [50] },
    ])
  })

  // Comportamiento actual: un productId ausente o inválido no es un 400, cae al
  // listado general de las últimas 30 acciones de products.
  it("sin productId devuelve las últimas 30 acciones de products con entity_id", async () => {
    asAdmin()
    const supabase = serviceWith({ data: ENTRIES, error: null })

    const response = await GET(auditRequest())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ entries: ENTRIES })
    expect(supabase.selects).toEqual([
      { table: "admin_audit_log", columns: "action,actor_email,created_at,detail,entity_id" },
    ])
    expect(supabase.filters).toEqual([
      { op: "eq", args: ["entity", "products"] },
      { op: "order", args: ["created_at", { ascending: false }] },
      { op: "limit", args: [30] },
    ])
  })

  it("devuelve una lista vacía cuando no hay filas", async () => {
    asAdmin()
    serviceWith({ data: null, error: null })

    const response = await GET(auditRequest("?productId=1"))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ entries: [] })
  })

  it("devuelve 500 con el mensaje de PostgREST cuando la consulta falla", async () => {
    asAdmin()
    serviceWith({ data: null, error: { message: "permission denied for table admin_audit_log" } })

    const response = await GET(auditRequest("?productId=1"))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe("permission denied for table admin_audit_log")
  })

  // Bug documentado: el route NO usa isMissingRelationError, así que si la
  // tabla aún no existe (PGRST205/42P01) responde 500 en lugar de degradar a
  // una lista vacía. No se corrige aquí: solo se fija el comportamiento actual.
  it("devuelve 500 cuando la tabla admin_audit_log no existe (sin degradación)", async () => {
    asAdmin()
    serviceWith({
      data: null,
      error: {
        code: "PGRST205",
        message: "Could not find the table 'public.admin_audit_log' in the schema cache",
      },
    })

    const response = await GET(auditRequest("?productId=1"))

    expect(response.status).toBe(500)
  })
})
