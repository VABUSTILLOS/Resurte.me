import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { DELETE, POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"

const URL = "http://localhost/api/admin/orders/1/proof"

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

type StoreOptions = {
  order?: Record<string, unknown> | null
  readError?: unknown
  updateError?: unknown
  uploadError?: unknown
  removeError?: unknown
}

/**
 * Cliente de servicio mínimo: `from(...).select(...).eq(...).maybeSingle()`,
 * `from(...).update(...).eq(...)` y `storage.from(...).upload/remove`.
 */
function serviceWith(opts: StoreOptions = {}) {
  // Los espías declaran `...args` para que `mock.calls[0][0]` tenga tipo.
  const remove = vi.fn((..._args: unknown[]) =>
    Promise.resolve({ error: opts.removeError ?? null })
  )
  const upload = vi.fn((..._args: unknown[]) =>
    Promise.resolve({ error: opts.uploadError ?? null })
  )
  const updateEq = vi.fn((..._args: unknown[]) =>
    Promise.resolve({ error: opts.updateError ?? null })
  )
  const update = vi.fn((..._args: unknown[]) => ({ eq: updateEq }))
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: opts.order ?? null, error: opts.readError ?? null })
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select, update }))
  const storage = { from: vi.fn(() => ({ upload, remove })) }
  vi.mocked(createServiceClient).mockResolvedValue({ from, storage } as never)
  return { upload, remove, update, updateEq }
}

function photoForm() {
  const form = new FormData()
  form.append("file", new File([new Uint8Array(1024)], "foto.jpg", { type: "image/jpeg" }))
  return form
}

function postRequest(form: FormData) {
  return new NextRequest(URL, { method: "POST", body: form })
}

function params(id = "1") {
  return { params: Promise.resolve({ id }) }
}

describe("POST /api/admin/orders/[id]/proof", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 sin rol admin y no toca la base", async () => {
    asDenied()
    const res = await POST(postRequest(photoForm()), params())
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con id no numérico", async () => {
    asAdmin()
    const res = await POST(postRequest(photoForm()), params("abc"))
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 sin archivo", async () => {
    asAdmin()
    const res = await POST(postRequest(new FormData()), params())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("Adjunta la foto")
  })

  it("400 con un archivo que no es foto", async () => {
    asAdmin()
    const form = new FormData()
    form.append("file", new File([new Uint8Array(10)], "x.svg", { type: "image/svg+xml" }))
    const res = await POST(postRequest(form), params())
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("400 con una foto de más de 5 MB, sin subirla", async () => {
    asAdmin()
    const form = new FormData()
    form.append(
      "file",
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "grande.jpg", { type: "image/jpeg" })
    )
    const store = serviceWith()
    const res = await POST(postRequest(form), params())
    expect(res.status).toBe(400)
    expect(store.upload).not.toHaveBeenCalled()
  })

  it("404 si el pedido no existe", async () => {
    asAdmin()
    serviceWith({ order: null })
    const res = await POST(postRequest(photoForm()), params())
    expect(res.status).toBe(404)
  })

  it("500 si falla la lectura del pedido", async () => {
    asAdmin()
    serviceWith({ readError: { message: "boom" } })
    const res = await POST(postRequest(photoForm()), params())
    expect(res.status).toBe(500)
  })

  it("409 en un pedido cancelado, sin subir la foto", async () => {
    // Aceptar evidencia de entrega en un pedido cancelado crearía una
    // contradicción que después habría que depurar a mano.
    asAdmin()
    const store = serviceWith({ order: { id: 1, status: "cancelled", delivery_proof_path: null } })
    const res = await POST(postRequest(photoForm()), params())
    expect(res.status).toBe(409)
    expect(store.upload).not.toHaveBeenCalled()
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("sube bajo el prefijo del marketplace y guarda ruta, fecha y nota", async () => {
    asAdmin()
    const store = serviceWith({ order: { id: 1, status: "delivered", delivery_proof_path: null } })
    const form = photoForm()
    form.append("note", "  Recibió el encargado  ")
    const res = await POST(postRequest(form), params())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.path).toMatch(/^marketplace\/1\/[0-9a-f-]+\.jpg$/)
    expect(store.upload).toHaveBeenCalledWith(body.path, expect.anything(), {
      contentType: "image/jpeg",
    })
    const patch = (store.update.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>
    expect(patch.delivery_proof_path).toBe(body.path)
    expect(patch.delivery_proof_note).toBe("Recibió el encargado")
    expect(typeof patch.delivery_proof_at).toBe("string")
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "order_delivery_proof",
        entity: "orders",
        entityId: 1,
        detail: { path: body.path, replaced: false, has_note: true },
      })
    )
  })

  it("normaliza una nota vacía a null", async () => {
    asAdmin()
    const store = serviceWith({ order: { id: 1, status: "delivered", delivery_proof_path: null } })
    const form = photoForm()
    form.append("note", "   ")
    await POST(postRequest(form), params())
    const patch = (store.update.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>
    expect(patch.delivery_proof_note).toBe(null)
  })

  it("500 si falla la subida y no escribe en la base", async () => {
    asAdmin()
    const store = serviceWith({
      order: { id: 1, status: "delivered", delivery_proof_path: null },
      uploadError: { message: "storage down" },
    })
    const res = await POST(postRequest(photoForm()), params())
    expect(res.status).toBe(500)
    expect(store.update).not.toHaveBeenCalled()
  })

  it("si falla el update, borra el objeto recién subido y responde 500", async () => {
    // Al revés quedaría una foto huérfana en un bucket privado sin nadie que
    // la referencie; el pedido se queda con el comprobante anterior intacto.
    asAdmin()
    const store = serviceWith({
      order: { id: 1, status: "delivered", delivery_proof_path: "marketplace/1/viejo.jpg" },
      updateError: { message: "boom" },
    })
    const res = await POST(postRequest(photoForm()), params())
    expect(res.status).toBe(500)
    const removed = (store.remove.mock.calls[0]?.[0] ?? []) as string[]
    expect(removed).toHaveLength(1)
    expect(removed[0]).toMatch(/^marketplace\/1\/[0-9a-f-]+\.jpg$/)
    // El comprobante anterior NO se borra: sigue siendo la evidencia vigente.
    expect(removed[0]).not.toBe("marketplace/1/viejo.jpg")
  })

  it("al reemplazar borra el comprobante anterior", async () => {
    asAdmin()
    const store = serviceWith({
      order: { id: 1, status: "delivered", delivery_proof_path: "marketplace/1/viejo.jpg" },
    })
    const res = await POST(postRequest(photoForm()), params())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(store.remove).toHaveBeenCalledWith(["marketplace/1/viejo.jpg"])
    expect(body.path).not.toBe("marketplace/1/viejo.jpg")
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ detail: expect.objectContaining({ replaced: true }) })
    )
  })

  it("no borra un objeto ajeno al prefijo del marketplace", async () => {
    // La columna podría apuntar a una ruta de FoodOS si algo se cruza de
    // cables; borrar a ciegas destruiría evidencia de otra superficie.
    asAdmin()
    const store = serviceWith({
      order: { id: 1, status: "delivered", delivery_proof_path: "rest-9/pedido-3/foto.jpg" },
    })
    const res = await POST(postRequest(photoForm()), params())
    expect(res.status).toBe(200)
    expect(store.remove).not.toHaveBeenCalled()
  })

  it("una subida correcta no borra nada si el pedido no tenía comprobante", async () => {
    asAdmin()
    const store = serviceWith({ order: { id: 1, status: "pending", delivery_proof_path: null } })
    const res = await POST(postRequest(photoForm()), params())
    expect(res.status).toBe(200)
    expect(store.remove).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/admin/orders/[id]/proof", () => {
  beforeEach(() => vi.clearAllMocks())

  it("403 sin rol admin", async () => {
    asDenied()
    const res = await DELETE(new NextRequest(URL, { method: "DELETE" }), params())
    expect(res.status).toBe(403)
  })

  it("400 con id no numérico", async () => {
    asAdmin()
    const res = await DELETE(new NextRequest(URL, { method: "DELETE" }), params("1.5"))
    expect(res.status).toBe(400)
  })

  it("404 si el pedido no existe", async () => {
    asAdmin()
    serviceWith({ order: null })
    const res = await DELETE(new NextRequest(URL, { method: "DELETE" }), params())
    expect(res.status).toBe(404)
  })

  it("200 removed:false cuando el pedido no tiene comprobante", async () => {
    // El estado deseado ya se cumple: la interfaz no necesita distinguir
    // "ya estaba sin foto" de "no existe el pedido".
    asAdmin()
    const store = serviceWith({ order: { id: 1, delivery_proof_path: null } })
    const res = await DELETE(new NextRequest(URL, { method: "DELETE" }), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, removed: false })
    expect(store.update).not.toHaveBeenCalled()
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("limpia las tres columnas, borra el objeto y audita", async () => {
    asAdmin()
    const store = serviceWith({ order: { id: 1, delivery_proof_path: "marketplace/1/viejo.jpg" } })
    const res = await DELETE(new NextRequest(URL, { method: "DELETE" }), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, removed: true })
    expect(store.update.mock.calls[0]?.[0]).toEqual({
      delivery_proof_path: null,
      delivery_proof_at: null,
      delivery_proof_note: null,
    })
    expect(store.remove).toHaveBeenCalledWith(["marketplace/1/viejo.jpg"])
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "order_delivery_proof_removed",
        entityId: 1,
        detail: { path: "marketplace/1/viejo.jpg" },
      })
    )
  })

  it("500 si falla el update y deja el objeto en storage", async () => {
    asAdmin()
    const store = serviceWith({
      order: { id: 1, delivery_proof_path: "marketplace/1/viejo.jpg" },
      updateError: { message: "boom" },
    })
    const res = await DELETE(new NextRequest(URL, { method: "DELETE" }), params())
    expect(res.status).toBe(500)
    expect(store.remove).not.toHaveBeenCalled()
  })

  it("no borra el objeto cuando la ruta no es del marketplace", async () => {
    asAdmin()
    const store = serviceWith({ order: { id: 1, delivery_proof_path: "rest-9/pedido-3/foto.jpg" } })
    const res = await DELETE(new NextRequest(URL, { method: "DELETE" }), params())
    expect(res.status).toBe(200)
    expect(store.remove).not.toHaveBeenCalled()
  })
})
