import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/admin-auth"
import { clientIp, rateLimitResponse, rateLimited } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { DELIVERY_PROOF_BUCKET, DELIVERY_PROOF_URL_TTL_SECONDS } from "@/lib/delivery-proof"

export const runtime = "nodejs"

/**
 * GET /api/orders/[id]/proof[?t=<restore_token>]
 *
 * Devuelve una URL FIRMADA (1 h) del comprobante de entrega, o `url: null` si
 * el pedido todavía no tiene uno.
 *
 * Tres formas de autorizar, y ninguna más:
 *
 *  1. `?t=<restore_token>` — el mismo capability URL que usa el seguimiento
 *     (`/api/orders/[id]/track`, migración 00063). Es lo que permite que un
 *     cliente invitado, que compró sin cuenta, pueda ver la prueba de su
 *     propia entrega. Sin esto, la mitad de los pedidos del marketplace no
 *     tendrían acceso al comprobante.
 *  2. Sesión del dueño del pedido.
 *  3. Sesión de un admin.
 *
 * Nunca se expone la ruta del objeto: solo la URL firmada. El bucket
 * `entregas` es privado y sin políticas de lectura, así que una ruta filtrada
 * no sirve de nada — pero devolverla igualmente permitiría enumerar la
 * estructura del bucket.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Solo enteros positivos: Number() aceptaría "1e3", negativos, etc.
    if (!/^\d+$/.test(id)) {
      return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
    }
    const orderId = Number(id)
    const token = request.nextUrl.searchParams.get("t")

    const supabase = await createServiceClient()

    // Ruta alcanzable sin sesión por la vía del token: se limita por IP para
    // que un enlace filtrado no permita amplificar consultas ni firmas.
    const rate = await rateLimited(supabase, `order_proof:${clientIp(request)}`, 30, 60)
    if (!rate.allowed) return rateLimitResponse(rate)

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, user_id, restore_token, delivery_proof_path, delivery_proof_at, delivery_proof_note")
      .eq("id", orderId)
      .maybeSingle()

    if (error) {
      logger.error("[ORDER-PROOF] no se pudo leer el pedido:", error)
      return NextResponse.json({ error: "No se pudo consultar el pedido" }, { status: 500 })
    }
    if (!order) {
      // Genérico: no se filtra la existencia del pedido a quien no lo acreditó.
      return NextResponse.json({ error: "Enlace inválido o expirado" }, { status: 404 })
    }

    let authorized = false
    if (token) {
      authorized = typeof order.restore_token === "string" && order.restore_token === token
    } else {
      const session = await createClient()
      const {
        data: { user },
      } = await session.auth.getUser()
      if (user) {
        authorized =
          (order.user_id != null && order.user_id === user.id) || (await isAdminUser(user))
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: "Enlace inválido o expirado" }, { status: 404 })
    }

    const path = (order.delivery_proof_path as string | null) ?? null
    if (!path) {
      return NextResponse.json(
        { url: null, at: null, note: null },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(DELIVERY_PROOF_BUCKET)
      .createSignedUrl(path, DELIVERY_PROOF_URL_TTL_SECONDS)

    if (signError || !signed?.signedUrl) {
      logger.error("[ORDER-PROOF] no se pudo firmar la URL:", signError)
      return NextResponse.json({ error: "No se pudo abrir el comprobante" }, { status: 500 })
    }

    return NextResponse.json(
      {
        url: signed.signedUrl,
        at: order.delivery_proof_at,
        note: order.delivery_proof_note,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    logger.error("[ORDER-PROOF] GET falló", err)
    return NextResponse.json({ error: "No se pudo consultar el comprobante" }, { status: 500 })
  }
}
