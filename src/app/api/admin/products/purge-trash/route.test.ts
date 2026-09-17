import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/catalog-cache", () => ({ revalidateCatalogCache: vi.fn() }))
vi.mock("@/lib/catalog", () => ({ resetCatalogCache: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/trash", () => ({
  PURGE_MAX_PER_RUN: 500,
  TRASH_RETENTION_DAYS: 30,
  purgeTrashProducts: vi.fn(),
}))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { purgeTrashProducts } from "@/lib/trash"

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
}

function service() {
  const from = vi.fn()
  vi.mocked(createServiceClient).mockResolvedValue({ from } as never)
  return { from }
}

function purgeResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    scanned: 3,
    purged: 2,
    purgedIds: [1, 2],
    keptWithOrders: [3],
    keptNotDue: [],
    hasMore: false,
    ...overrides,
  }
}

function purgeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/admin/products/purge-trash", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

describe("/api/admin/products/purge-trash", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("devuelve 403 y no toca Supabase si el admin es rechazado", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never)

    const response = await POST(purgeRequest({ all: true }))

    expect(response.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(purgeTrashProducts).not.toHaveBeenCalled()
  })

  it("devuelve 400 cuando no se envía productIds ni all: true", async () => {
    asAdmin()

    const response = await POST(purgeRequest({}))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toMatch(/productIds/)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("devuelve 400 cuando productIds excede PURGE_MAX_PER_RUN", async () => {
    asAdmin()

    const ids = Array.from({ length: 501 }, (_, i) => i + 1)
    const response = await POST(purgeRequest({ productIds: ids }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toMatch(/500/)
    expect(purgeTrashProducts).not.toHaveBeenCalled()
  })

  it("purga toda la papelera, invalida caché y registra auditoría", async () => {
    asAdmin()
    service()
    vi.mocked(purgeTrashProducts).mockResolvedValue(purgeResult() as never)

    const response = await POST(purgeRequest({ all: true }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toMatchObject({ success: true, purged: 2, keptWithOrders: [3] })
    expect(purgeTrashProducts).toHaveBeenCalledWith(expect.anything(), {
      productIds: undefined,
      ignoreRetention: false,
      maxPerRun: 500,
    })
    expect(revalidateCatalogCache).toHaveBeenCalledTimes(1)
    expect(resetCatalogCache).toHaveBeenCalledTimes(1)
    expect(logAdminAction).toHaveBeenCalledWith(expect.anything(), {
      actorId: "admin-1",
      actorEmail: null,
      action: "product_purge",
      entity: "products",
      entityId: null,
      detail: { purged: 2, keptWithOrders: 1, keptNotDue: 0 },
    })
    expect(createServiceClient).toHaveBeenCalledTimes(1)
  })

  it("no invalida caché ni audita cuando no se purgó nada", async () => {
    asAdmin()
    service()
    vi.mocked(purgeTrashProducts).mockResolvedValue(
      purgeResult({ purged: 0, purgedIds: [], keptWithOrders: [], keptNotDue: [1, 2] }) as never
    )

    const response = await POST(purgeRequest({ productIds: [1, 2] }))

    expect(response.status).toBe(200)
    expect(revalidateCatalogCache).not.toHaveBeenCalled()
    expect(resetCatalogCache).not.toHaveBeenCalled()
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("deduplica ids no enteros y propaga ignoreRetention", async () => {
    asAdmin()
    service()
    vi.mocked(purgeTrashProducts).mockResolvedValue(purgeResult({ purged: 0 }) as never)

    await POST(purgeRequest({ productIds: [5, 5, "7", 3.5, 8], ignoreRetention: true }))

    expect(purgeTrashProducts).toHaveBeenCalledWith(expect.anything(), {
      productIds: [5, 8],
      ignoreRetention: true,
      maxPerRun: 500,
    })
  })

  it("devuelve 500 cuando la purga lanza un error", async () => {
    asAdmin()
    service()
    vi.mocked(purgeTrashProducts).mockRejectedValue(new Error("permission denied"))

    const response = await POST(purgeRequest({ all: true }))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe("permission denied")
    expect(revalidateCatalogCache).not.toHaveBeenCalled()
  })
})
