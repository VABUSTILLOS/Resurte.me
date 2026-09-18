import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse, type NextRequest } from "next/server"
import { revalidateTag } from "next/cache"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { validateReviewInput } from "@/lib/foodos-moderation"
import { rpcErrorResponse } from "@/lib/rpc-error-response"

export const runtime = "nodejs"

/**
 * POST /api/admin/foodos/restaurantes — aprueba, rechaza o pausa un
 * restaurante FoodOS.
 *
 * Ésta es la única puerta a `status = 'active'`. Antes de 00168 el dueño movía
 * su propio interruptor (`00023_foodos.sql` le da `FOR ALL USING (auth.uid() =
 * user_id)` y `00160` deja `status` en la lista blanca de columnas), así que
 * publicarse era un acto unilateral y `submitted_at` no existía: nadie sabía
 * qué estaba esperando revisión ni desde cuándo. `00168` puso la regla en un
 * trigger y la decisión en `foodos_restaurant_review()`.
 *
 * La ruta no decide nada por su cuenta: valida la forma de la entrada y le pasa
 * la decisión al RPC, que es quien comprueba que el actor sea admin, que la
 * transición sea legal desde el estado actual, que `approve` sólo salga de
 * `pending_review`/`paused`, y que haya al menos un platillo. Duplicar esas
 * reglas aquí crearía dos verdades sobre cuándo se puede publicar.
 *
 * Solo POST: revisar es un acto, no un recurso editable. No hay GET — la cola
 * se lee con `getFoodosReviewQueue()`, que va por el cliente de servicio.
 *
 * Body: { restaurantId, decision: "approve" | "reject" | "pause", reason? }
 */
export async function POST(request: NextRequest) {
  const { user: adminUser, response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
    }

    const parsed = validateReviewInput({
      restaurantId: body.restaurantId,
      decision: body.decision,
      reason: body.reason,
    })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { data, error } = await supabase.rpc("foodos_restaurant_review", {
      p_restaurant_id: parsed.value.restaurantId,
      p_decision: parsed.value.decision,
      p_reason: parsed.value.reason,
      p_actor: adminUser?.id ?? null,
    })

    if (error) {
      logger.error("[ADMIN-FOODOS] review error:", error)
      return rpcErrorResponse(error, "Error al revisar el restaurante")
    }

    // La decisión cambia qué ve el público, así que la caché de la superficie
    // pública se invalida aquí y no sólo en la acción del panel: el restaurante
    // acaba de pasar de invisible a visible (o al revés) sin que su dueño haya
    // tocado nada.
    revalidateTag("foodos-public", "max")
    revalidateTag("foodos-seo", "max")

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "foodos_restaurant_review",
      entity: "foodos_restaurants",
      entityId: parsed.value.restaurantId,
      detail: {
        decision: parsed.value.decision,
        reason: parsed.value.reason,
      },
    })

    return NextResponse.json({ restaurant: data })
  } catch (error) {
    logger.error("[ADMIN-FOODOS] review error:", error)
    return NextResponse.json({ error: "Error al revisar el restaurante" }, { status: 500 })
  }
}
