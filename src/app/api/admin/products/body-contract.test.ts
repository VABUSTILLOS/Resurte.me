import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))

import { requireAdmin } from "@/lib/admin-auth"
import { INVALID_BODY, MALFORMED_BODY } from "@/lib/api-body"
import { POST as reorderPOST } from "./reorder/route"
import { POST as checkImagesPOST } from "./check-images/route"
import { PATCH as cityAvailabilityPATCH } from "./city-availability/route"
import { POST as bulkPOST } from "./bulk/route"
import { PATCH as updatePATCH } from "./update/route"
import { DELETE as deleteDELETE, POST as deletePOST } from "./delete/route"
import { POST as mergePOST } from "./merge/route"
import { POST as duplicatePOST } from "./duplicate/route"
import { POST as importPOST } from "./import/route"
import { POST as createPOST } from "./create/route"
import { POST as purgeTrashPOST } from "./purge-trash/route"
import { PUT as storePricesPUT } from "./store-prices/route"
import { POST as bulkSeoPOST } from "./bulk-seo/route"

/**
 * B30 — contrato uniforme del panel de productos: un cuerpo que no es JSON
 * válido (o que no es un objeto) es un error del cliente, no del servidor.
 * Antes cada ruta hacía `await request.json()` dentro de un try cuyo catch
 * devolvía 500, así que un body roto se reportaba como fallo de servidor.
 *
 * Se prueba la superficie completa en un solo sitio para que el contrato no
 * se degrade ruta a ruta: cualquier endpoint nuevo que parsee el body a mano
 * tiene que aparecer aquí.
 */
type Handler = (request: Request) => Promise<Response>

const CASES: { name: string; method: string; url: string; handler: Handler }[] = [
  {
    name: "reorder",
    method: "POST",
    url: "/api/admin/products/reorder",
    handler: reorderPOST as unknown as Handler,
  },
  {
    name: "check-images",
    method: "POST",
    url: "/api/admin/products/check-images",
    handler: checkImagesPOST as unknown as Handler,
  },
  {
    name: "city-availability",
    method: "PATCH",
    url: "/api/admin/products/city-availability",
    handler: cityAvailabilityPATCH as unknown as Handler,
  },
  { name: "bulk", method: "POST", url: "/api/admin/products/bulk", handler: bulkPOST as unknown as Handler },
  {
    name: "update",
    method: "PATCH",
    url: "/api/admin/products/update",
    handler: updatePATCH as unknown as Handler,
  },
  {
    name: "delete (DELETE)",
    method: "DELETE",
    url: "/api/admin/products/delete",
    handler: deleteDELETE as unknown as Handler,
  },
  {
    name: "delete (POST restore)",
    method: "POST",
    url: "/api/admin/products/delete",
    handler: deletePOST as unknown as Handler,
  },
  { name: "merge", method: "POST", url: "/api/admin/products/merge", handler: mergePOST as unknown as Handler },
  {
    name: "duplicate",
    method: "POST",
    url: "/api/admin/products/duplicate",
    handler: duplicatePOST as unknown as Handler,
  },
  { name: "import", method: "POST", url: "/api/admin/products/import", handler: importPOST as unknown as Handler },
  { name: "create", method: "POST", url: "/api/admin/products/create", handler: createPOST as unknown as Handler },
  {
    name: "purge-trash",
    method: "POST",
    url: "/api/admin/products/purge-trash",
    handler: purgeTrashPOST as unknown as Handler,
  },
  {
    name: "store-prices",
    method: "PUT",
    url: "/api/admin/products/store-prices",
    handler: storePricesPUT as unknown as Handler,
  },
  {
    name: "bulk-seo",
    method: "POST",
    url: "/api/admin/products/bulk-seo",
    handler: bulkSeoPOST as unknown as Handler,
  },
]

function malformedRequest(method: string, url: string) {
  return new NextRequest(`http://localhost${url}`, { method, body: "{ not json" })
}

function nonObjectRequest(method: string, url: string) {
  return new NextRequest(`http://localhost${url}`, { method, body: '"solo un string"' })
}

describe("contrato de body del panel de productos (B30)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAdmin).mockResolvedValue({
      user: { id: "admin-1" },
      response: null,
    } as never)
  })

  for (const { name, method, url, handler } of CASES) {
    it(`${name}: 400 MALFORMED_BODY si el cuerpo no es JSON`, async () => {
      const response = await handler(malformedRequest(method, url))
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toBe(MALFORMED_BODY)
    })

    it(`${name}: 400 INVALID_BODY si el JSON no es un objeto`, async () => {
      const response = await handler(nonObjectRequest(method, url))
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toBe(INVALID_BODY)
    })
  }

  it("el guard de admin se evalúa antes de leer el body", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never)

    for (const { method, url, handler } of CASES) {
      const response = await handler(malformedRequest(method, url))
      expect(response.status).toBe(403)
    }
  })
})
