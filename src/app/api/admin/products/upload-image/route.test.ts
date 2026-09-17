import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }))
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { POST } from "./route"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logger } from "@/lib/logger"

const URL_UPLOAD = "http://localhost/api/admin/products/upload-image"

function asAdmin() {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-1" }, response: null } as never)
}

/** Cliente falso: `storage.from` devuelve un bucket nuevo en cada llamada. */
function storageWith(uploadResult: { error: unknown } = { error: null }) {
  const upload = vi.fn().mockResolvedValue(uploadResult)
  const getPublicUrl = vi.fn((path: string) => ({
    data: { publicUrl: `https://cdn.test/productos/${path}` },
  }))
  const bucket = { upload, getPublicUrl }
  const storageFrom = vi.fn(() => bucket)

  vi.mocked(createServiceClient).mockResolvedValue({
    storage: { from: storageFrom },
  } as never)

  return { storageFrom, upload, getPublicUrl }
}

function imageFile(name = "foto.png", type = "image/png", size = 1024) {
  return new File([new Uint8Array(size)], name, { type })
}

function uploadRequest(fields: Record<string, string | File>) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return new NextRequest(URL_UPLOAD, { method: "POST", body: form })
}

describe("/api/admin/products/upload-image", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("devuelve 403 y no toca Supabase si el admin es rechazado", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never)

    const response = await POST(uploadRequest({ file: imageFile() }))

    expect(response.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("devuelve 400 cuando no llega el campo file", async () => {
    asAdmin()

    const sinArchivo = await POST(uploadRequest({ nombre: "solo texto" }))
    const noEsArchivo = await POST(uploadRequest({ file: "no soy un archivo" }))
    const sinMultipart = await POST(
      new NextRequest(URL_UPLOAD, { method: "POST", body: "no soy multipart" })
    )

    expect(sinArchivo.status).toBe(400)
    expect(noEsArchivo.status).toBe(400)
    expect(sinMultipart.status).toBe(400)
    expect((await sinArchivo.json()).error).toBe("Archivo requerido (campo file)")
    expect((await sinMultipart.json()).error).toBe("Archivo requerido (campo file)")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("devuelve 400 cuando el mime no es una imagen soportada", async () => {
    asAdmin()

    const response = await POST(uploadRequest({ file: imageFile("virus.exe", "application/x-msdownload") }))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("Formato no soportado (JPG, PNG, WebP o AVIF)")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("devuelve 400 cuando la imagen supera los 5 MB", async () => {
    asAdmin()

    const response = await POST(
      uploadRequest({ file: imageFile("grande.jpg", "image/jpeg", 5 * 1024 * 1024 + 1) })
    )

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("La imagen supera los 5 MB")
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it("sube al bucket productos y devuelve la url pública con la ruta por fecha", async () => {
    asAdmin()
    const { storageFrom, upload, getPublicUrl } = storageWith()

    const file = imageFile("foto.jpeg", "image/jpeg")
    const response = await POST(uploadRequest({ file }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.url).toBe(`https://cdn.test/productos/${json.path}`)
    // jpeg se normaliza a jpg para que la extensión sea la del archivo servido
    expect(json.path).toMatch(/^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.jpg$/)
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledWith(json.path, file, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
    })
    expect(getPublicUrl).toHaveBeenCalledWith(json.path)
    // una llamada para subir y otra para resolver la URL pública
    expect(storageFrom).toHaveBeenNthCalledWith(1, "productos")
    expect(storageFrom).toHaveBeenNthCalledWith(2, "productos")
    expect(logger.error).not.toHaveBeenCalled()
  })

  it("conserva la extensión de png, webp y avif", async () => {
    asAdmin()

    for (const [type, ext] of [
      ["image/png", "png"],
      ["image/webp", "webp"],
      ["image/avif", "avif"],
    ] as const) {
      vi.clearAllMocks()
      asAdmin()
      const { upload } = storageWith()

      const response = await POST(uploadRequest({ file: imageFile(`foto.${ext}`, type) }))
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.path.endsWith(`.${ext}`)).toBe(true)
      expect(upload.mock.calls[0]?.[2]).toEqual({ contentType: type, cacheControl: "31536000" })
    }
  })

  it("devuelve 500 con el detalle de Storage y lo registra cuando falla la subida", async () => {
    asAdmin()
    storageWith({ error: { message: "Bucket not found" } })

    const response = await POST(uploadRequest({ file: imageFile() }))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toEqual({
      error: "No se pudo subir la imagen",
      detail: "Bucket not found",
    })
    expect(logger.error).toHaveBeenCalledWith("[UPLOAD-IMAGE] storage error:", {
      message: "Bucket not found",
    })
  })
})
