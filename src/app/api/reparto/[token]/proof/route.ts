import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { clientIp, rateLimitResponse, rateLimited } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { loadCourierByToken } from "@/lib/flotilla/deliveries"

export const runtime = "nodejs"

const TOKEN_MIN_LENGTH = 16
const MAX_SIZE = 5 * 1024 * 1024
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"])

/**
 * POST /api/reparto/[token]/proof
 *
 * Sube la foto de entrega (opcional). Va a un bucket privado `entregas`
 * con la service key: no tiene políticas para anon y el panel la lee con
 * URL firmada de corta vida.
 *
 * La foto NO cierra la entrega ni sustituye al PIN: solo la respalda. Se
 * sube antes del POST de `delivered` para que un fallo de subida no deje
 * al repartidor sin poder cerrar el pedido.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    if (!token || token.length < TOKEN_MIN_LENGTH) {
      return NextResponse.json({ error: "Enlace no válido" }, { status: 404 })
    }

    const supabase = await createServiceClient()

    const rate = await rateLimited(supabase, `reparto_proof:${clientIp(request)}`, 20, 60)
    if (!rate.allowed) return rateLimitResponse(rate)

    const session = await loadCourierByToken(supabase, token)
    const restaurantId = session?.restaurant?.id
    if (!session || !restaurantId) {
      return NextResponse.json({ error: "Enlace no válido o revocado" }, { status: 404 })
    }

    const form = await request.formData().catch(() => null)
    const file = form?.get("file")
    const deliveryId = String(form?.get("delivery_id") ?? "").trim()
    if (!deliveryId) {
      return NextResponse.json({ error: "Falta la entrega" }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Adjunta la foto (campo file)" }, { status: 400 })
    }
    if (!ACCEPTED.has(file.type)) {
      return NextResponse.json({ error: "Formato no soportado (JPG, PNG o WebP)" }, { status: 400 })
    }
    if (file.size === 0 || file.size > MAX_SIZE) {
      return NextResponse.json({ error: "La foto debe pesar menos de 5 MB" }, { status: 400 })
    }

    const { data: owned } = await supabase
      .from("foodos_deliveries")
      .select("id, order_id")
      .eq("id", deliveryId)
      .eq("restaurant_id", restaurantId)
      .eq("courier_id", session.courier.id)
      .maybeSingle()
    if (!owned) {
      return NextResponse.json({ error: "Entrega no asignada a ti" }, { status: 404 })
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
    // Ruta con restaurante/pedido primero: agrupa por pedido y facilita
    // borrar huérfanos si alguna vez hay que limpiar.
    const orderId = String((owned as Record<string, unknown>).order_id ?? "sin-pedido")
    const path = `${restaurantId}/${orderId}/${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from("entregas")
      .upload(path, file, { contentType: file.type })
    if (uploadError) {
      logger.error("[REPARTO] storage error:", uploadError)
      return NextResponse.json({ error: "No se pudo subir la foto" }, { status: 500 })
    }

    const { error: updateError } = await supabase
      .from("foodos_deliveries")
      .update({ proof_photo_path: path })
      .eq("id", deliveryId)
      .eq("restaurant_id", restaurantId)
    if (updateError) {
      logger.error("[REPARTO] no se pudo guardar la ruta de la foto", updateError)
      return NextResponse.json({ error: "No se pudo guardar la foto" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, path })
  } catch (err) {
    logger.error("[REPARTO] proof falló", err)
    return NextResponse.json({ error: "No se pudo subir la foto" }, { status: 500 })
  }
}
