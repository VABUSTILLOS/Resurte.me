import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"])

/**
 * POST /api/admin/products/upload-image (multipart/form-data, campo "file")
 *
 * Sube la imagen al bucket público `productos` (migración 00076) y devuelve
 * su URL pública para guardarla en products.image_url desde
 * /admin/productos. Solo admin.
 */
export async function POST(request: NextRequest) {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) return adminDenied

    const form = await request.formData().catch(() => null)
    const file = form?.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Archivo requerido (campo file)" }, { status: 400 })
    }
    if (!ACCEPTED.has(file.type)) {
      return NextResponse.json(
        { error: "Formato no soportado (JPG, PNG, WebP o AVIF)" },
        { status: 400 }
      )
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "La imagen supera los 5 MB" }, { status: 400 })
    }

    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1]
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`

    const supabase = await createServiceClient()
    const { error: uploadError } = await supabase.storage
      .from("productos")
      .upload(path, file, { contentType: file.type, cacheControl: "31536000" })

    if (uploadError) {
      logger.error("[UPLOAD-IMAGE] storage error:", uploadError)
      // La tabla/bucket puede no existir aún (migración 00076 sin aplicar)
      return NextResponse.json(
        { error: "No se pudo subir la imagen", detail: uploadError.message },
        { status: 500 }
      )
    }

    const { data } = supabase.storage.from("productos").getPublicUrl(path)
    return NextResponse.json({ url: data.publicUrl, path })
  } catch (err) {
    logger.error("[UPLOAD-IMAGE] unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
