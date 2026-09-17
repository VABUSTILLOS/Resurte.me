import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { GET, POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"

const URL = "http://localhost/api/admin/suppliers"

type Result = { data?: unknown; error?: unknown; count?: number | null }

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "delete",
  "upsert",
  "eq",
  "neq",
  "is",
  "ilike",
  "order",
  "limit",
  "range",
  "maybeSingle",
  "single",
  "head",
] as const

/**
 * Consulta encadenable: cualquier método devuelve el mismo thenable, así
 * `await from(t).select().eq().maybeSingle()` resuelve al resultado que se
 * encoló para esa tabla sin depender del orden exacto de la cadena.
 */
function makeQuery(result: Result, log: string[]) {
  const query: Record<string, unknown> = {
    then: (onFulfilled: unknown, onRejected: unknown) =>
      Promise.resolve(result).then(onFulfilled as never, onRejected as never),
    catch: (onRejected: unknown) => Promise.resolve(result).catch(onRejected as never),
    finally: (onFinally: unknown) => Promise.resolve(result).finally(onFinally as never),
  }
  for (const method of CHAIN_METHODS) {
    query[method] = (...args: unknown[]) => {
      log.push(`${method}(${JSON.stringify(args)})`)
      return query
    }
  }
  return query
}

function serviceWith(queues: Record<string, Result[]>, log: string[] = []) {
  const seen: Record<string, number> = {}
  const from = vi.fn((table: string) => {
    const index = seen[table] ?? 0
    seen[table] = index + 1
    return makeQuery((queues[table] ?? [])[index] ?? { data: null, error: null }, log)
  })
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from, log }
}

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: "admin-1", email: "admin@resurte.me" },
    response: null,
  } as never)
}

function asDenied() {
  vi.mocked(requireAdmin).mockResolvedValue({
    user: null,
    response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  } as never)
}

function postRequest(body: unknown) {
  return new NextRequest(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const VALID = { name: "Café del Valle", status: "prospecto", whatsapp: "5216145337486" }

describe("GET /api/admin/suppliers", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 sin rol admin y no toca la base", async () => {
    asDenied()
    const res = await GET(new NextRequest(URL))
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("agrupa los vínculos dentro de su proveedor", async () => {
    asAdmin()
    serviceWith({
      suppliers: [{ data: [{ id: 1, name: "Café del Valle", slug: "cafe-del-valle" }] }],
      product_suppliers: [
        {
          data: [
            { id: 9, supplier_id: 1, cost: 120, products: { name: "Harina", is_visible: false } },
            { id: 10, supplier_id: 1, cost: 90, products: { name: "Azúcar", is_visible: true } },
          ],
        },
      ],
    })
    const res = await GET(new NextRequest(URL))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suppliers).toHaveLength(1)
    expect(body.suppliers[0].products.map((p: { id: number }) => p.id)).toEqual([9, 10])
    expect(body.productMatches).toBeUndefined()
  })

  it("un proveedor sin vínculos devuelve products vacío, no undefined", async () => {
    asAdmin()
    serviceWith({
      suppliers: [{ data: [{ id: 1, name: "A", slug: "a" }, { id: 2, name: "B", slug: "b" }] }],
      product_suppliers: [{ data: [{ id: 9, supplier_id: 1, cost: 10, products: null }] }],
    })
    const res = await GET(new NextRequest(URL))
    const body = await res.json()
    expect(body.suppliers[1].products).toEqual([])
  })

  it("?productSearch agrega productMatches", async () => {
    asAdmin()
    serviceWith({
      suppliers: [{ data: [] }],
      product_suppliers: [{ data: [] }],
      products: [{ data: [{ id: 5, name: "Harina de trigo", sku: "H-1", unit: "kg", price: 30 }] }],
    })
    const res = await GET(new NextRequest(`${URL}?productSearch=harina`))
    const body = await res.json()
    expect(body.productMatches).toHaveLength(1)
    expect(body.productMatches[0].name).toBe("Harina de trigo")
  })

  it("?productSearch vacío no consulta productos", async () => {
    asAdmin()
    const { from } = serviceWith({
      suppliers: [{ data: [] }],
      product_suppliers: [{ data: [] }],
    })
    const res = await GET(new NextRequest(`${URL}?productSearch=%20`))
    const body = await res.json()
    expect(body.productMatches).toBeUndefined()
    expect(from).not.toHaveBeenCalledWith("products")
  })

  it("500 si falla la lectura de proveedores", async () => {
    asAdmin()
    serviceWith({ suppliers: [{ data: null, error: { message: "boom" } }] })
    const res = await GET(new NextRequest(URL))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe("boom")
  })

  it("500 si falla la lectura de vínculos", async () => {
    asAdmin()
    serviceWith({
      suppliers: [{ data: [] }],
      product_suppliers: [{ data: null, error: { message: "links roto" } }],
    })
    const res = await GET(new NextRequest(URL))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe("links roto")
  })
})

describe("POST /api/admin/suppliers", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 sin rol admin", async () => {
    asDenied()
    const res = await POST(postRequest(VALID))
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 si el cuerpo no es JSON", async () => {
    asAdmin()
    const res = await POST(postRequest("no-json"))
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 sin nombre y no llama a la base", async () => {
    asAdmin()
    const res = await POST(postRequest({ status: "activo" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("nombre")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con estatus fuera del CHECK", async () => {
    asAdmin()
    const res = await POST(postRequest({ ...VALID, status: "inventado" }))
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("crea el proveedor, deriva el slug y deja bitácora", async () => {
    asAdmin()
    const { log } = serviceWith({
      suppliers: [{ data: [] }, { data: { id: 7, name: "Café del Valle", slug: "cafe-del-valle", status: "prospecto" } }],
    })
    const res = await POST(postRequest(VALID))
    expect(res.status).toBe(201)
    expect((await res.json()).supplier.id).toBe(7)
    expect(log.some((entry) => entry.includes('"slug":"cafe-del-valle"'))).toBe(true)
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "supplier_create", entityId: 7 })
    )
  })

  it("desambigua el slug cuando ya existe", async () => {
    asAdmin()
    const { log } = serviceWith({
      suppliers: [
        { data: [{ slug: "cafe-del-valle" }, { slug: "cafe-del-valle-2" }] },
        { data: { id: 8, name: "Café del Valle", slug: "cafe-del-valle-3", status: "prospecto" } },
      ],
    })
    const res = await POST(postRequest(VALID))
    expect(res.status).toBe(201)
    expect(log.some((entry) => entry.includes('"slug":"cafe-del-valle-3"'))).toBe(true)
  })

  it("409 si la base reporta colisión de slug", async () => {
    asAdmin()
    serviceWith({
      suppliers: [{ data: [] }, { data: null, error: { code: "23505", message: "dup" } }],
    })
    const res = await POST(postRequest(VALID))
    expect(res.status).toBe(409)
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("400 si el CHECK de estatus revienta en Postgres", async () => {
    asAdmin()
    serviceWith({
      suppliers: [{ data: [] }, { data: null, error: { code: "23514", message: "check" } }],
    })
    const res = await POST(postRequest(VALID))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Estatus inválido")
  })

  it("500 en un error inesperado y no deja bitácora", async () => {
    asAdmin()
    serviceWith({
      suppliers: [{ data: [] }, { data: null, error: { code: "08006", message: "red" } }],
    })
    const res = await POST(postRequest(VALID))
    expect(res.status).toBe(500)
    expect(logAdminAction).not.toHaveBeenCalled()
  })
})
