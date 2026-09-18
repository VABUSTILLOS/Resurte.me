import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/audit-log", () => ({ logAdminAction: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
// La ruta invalida la caché de la superficie pública: sin este mock, importar
// `next/cache` fuera del runtime de Next revienta el archivo entero.
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"
import { revalidateTag } from "next/cache"

const URL = "http://localhost/api/admin/foodos/restaurantes"
const RESTAURANT = "2ca52320-70df-4427-a06f-edd4da7d5061"

type Result = { data?: unknown; error?: unknown }

function serviceWith(rpcResult: Result = { data: null, error: null }) {
  const rpc = vi.fn(() => Promise.resolve(rpcResult))
  vi.mocked(createServiceClient).mockResolvedValue({ rpc } as never)
  return { rpc }
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

function validBody(over: Record<string, unknown> = {}) {
  return { restaurantId: RESTAURANT, decision: "approve", reason: "", ...over }
}

const ROW = { id: RESTAURANT, name: "Mr Fresh", status: "active" }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/admin/foodos/restaurantes", () => {
  it("rechaza sin sesión de admin y no toca la base", async () => {
    asDenied()
    const res = await POST(postRequest(validBody()))
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un cuerpo que no es JSON", async () => {
    asAdmin()
    const res = await POST(postRequest("{no-es-json"))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Cuerpo inválido" })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un cuerpo JSON que no es objeto", async () => {
    asAdmin()
    for (const body of ['"texto"', "42", "null"]) {
      const res = await POST(postRequest(body))
      expect(res.status).toBe(400)
    }
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un restaurante ausente o demasiado corto", async () => {
    asAdmin()
    for (const restaurantId of [undefined, "", "   ", "abc"]) {
      const res = await POST(postRequest(validBody({ restaurantId })))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "Falta el restaurante." })
    }
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza una decisión inventada", async () => {
    asAdmin()
    for (const decision of ["aprobar", "APPROVE", "", null, 7]) {
      const res = await POST(postRequest(validBody({ decision })))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: "Decisión inválida." })
    }
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("exige motivo para pedir cambios, con el mensaje que le sirve al admin", async () => {
    asAdmin()
    for (const reason of [undefined, "", "   "]) {
      const res = await POST(postRequest(validBody({ decision: "reject", reason })))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({
        error: "Escribe qué tiene que cambiar el dueño para poder publicarlo.",
      })
    }
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("rechaza un motivo más largo que el tope", async () => {
    asAdmin()
    const res = await POST(
      postRequest(validBody({ decision: "reject", reason: "x".repeat(501) }))
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: "El motivo no puede pasar de 500 caracteres.",
    })
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("aprueba llamando a la RPC con el actor y el motivo en null", async () => {
    asAdmin()
    const { rpc } = serviceWith({ data: ROW, error: null })
    const res = await POST(postRequest(validBody({ reason: "   " })))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ restaurant: ROW })
    expect(rpc).toHaveBeenCalledWith("foodos_restaurant_review", {
      p_restaurant_id: RESTAURANT,
      p_decision: "approve",
      p_reason: null,
      p_actor: "admin-1",
    })
  })

  it("manda el motivo recortado al pedir cambios", async () => {
    asAdmin()
    const { rpc } = serviceWith({ data: { ...ROW, status: "draft" }, error: null })
    const res = await POST(
      postRequest(validBody({ decision: "reject", reason: "  falta el logo  " }))
    )

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith(
      "foodos_restaurant_review",
      expect.objectContaining({ p_decision: "reject", p_reason: "falta el logo" })
    )
  })

  it("pausa sin exigir motivo", async () => {
    asAdmin()
    const { rpc } = serviceWith({ data: { ...ROW, status: "paused" }, error: null })
    const res = await POST(postRequest(validBody({ decision: "pause" })))

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith(
      "foodos_restaurant_review",
      expect.objectContaining({ p_decision: "pause", p_reason: null })
    )
  })

  it("invalida la caché pública y de SEO tras decidir", async () => {
    asAdmin()
    serviceWith({ data: ROW, error: null })
    await POST(postRequest(validBody()))

    expect(revalidateTag).toHaveBeenCalledWith("foodos-public", "max")
    expect(revalidateTag).toHaveBeenCalledWith("foodos-seo", "max")
  })

  it("no invalida la caché si la decisión no llegó a aplicarse", async () => {
    asAdmin()
    serviceWith({ data: null, error: { code: "P0001", message: "Sólo un administrador…" } })
    await POST(postRequest(validBody()))

    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it("traduce el rechazo de la base a 403 con su mensaje", async () => {
    asAdmin()
    const message = "Sólo un administrador puede revisar un restaurante."
    serviceWith({ data: null, error: { code: "42501", message } })
    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: message })
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it("traduce la precondición de menú a 400 con el mensaje de la base", async () => {
    asAdmin()
    const message = "El restaurante necesita al menos 1 platillo en el menú para publicarse."
    serviceWith({ data: null, error: { code: "23514", message } })
    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: message })
  })

  it("devuelve 404 si el restaurante no existe", async () => {
    asAdmin()
    serviceWith({
      data: null,
      error: { code: "23503", message: `El restaurante ${RESTAURANT} no existe` },
    })
    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(404)
  })

  it("traduce el P0002 de la RPC (fila ausente) a 404, no a 500", async () => {
    asAdmin()
    const message = `El restaurante ${RESTAURANT} no existe.`
    serviceWith({ data: null, error: { code: "P0002", message } })
    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: message })
  })

  it("oculta el detalle de un error inesperado", async () => {
    asAdmin()
    serviceWith({
      data: null,
      error: { code: "42P01", message: 'relation "public.foodos_restaurants" does not exist' },
    })
    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Error al revisar el restaurante" })
    expect(logAdminAction).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it("registra la auditoría con la decisión y el motivo", async () => {
    asAdmin()
    serviceWith({ data: { ...ROW, status: "draft" }, error: null })
    await POST(postRequest(validBody({ decision: "reject", reason: "falta el logo" })))

    expect(logAdminAction).toHaveBeenCalledTimes(1)
    const [, entry] = vi.mocked(logAdminAction).mock.calls[0] as [unknown, Record<string, unknown>]
    expect(entry.action).toBe("foodos_restaurant_review")
    expect(entry.entity).toBe("foodos_restaurants")
    expect(entry.entityId).toBe(RESTAURANT)
    expect(entry.detail).toEqual({ decision: "reject", reason: "falta el logo" })
  })
})
