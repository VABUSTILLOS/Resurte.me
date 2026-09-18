/**
 * Claim compartido de avisos FoodOS (comensal y dueño)
 * ====================================================
 * `foodos_order_notifications` es la bitácora y, sobre todo, el candado de
 * idempotencia de los avisos de pedidos FoodOS. Vivía dentro de
 * `foodos-notifications.ts`, que es el canal del COMENSAL. Cuando se añadió el
 * canal del DUEÑO hacía falta el mismo candado, y duplicarlo habría garantizado
 * que los dos se separaran con el tiempo.
 *
 * La clave de deduplicación es `(order_id, audience, event, channel)`.
 *
 * POR QUÉ LA AUDIENCIA ES PARTE DE LA CLAVE
 *   El mismo pedido, el mismo evento y el mismo canal aplican a dos
 *   destinatarios distintos: el comensal ("recibimos tu pedido") y el dueño
 *   ("entró un pedido nuevo"). Sin `audience` en la clave, el segundo aviso
 *   chocaría con el primero, `23505` se leería como "ya se avisó" y el aviso al
 *   dueño se descartaría en silencio. Migración `00182`.
 *
 * FAIL-OPEN, DELIBERADAMENTE
 *   Un claim solo se considera "ya avisado" cuando la base de datos dice
 *   `23505` (violación del índice único). Cualquier otro error — incluido que la
 *   tabla no exista (`42P01`) — deja pasar el aviso: es preferible un aviso
 *   duplicado a un aviso perdido. Nada de aquí lanza nunca.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

/** A quién se avisa. Parte de la clave de deduplicación. */
export type FoodosNotificationAudience = "customer" | "owner"

/**
 * Canales registrables.
 *
 * `bell` es la campana persistente (`public.notifications`): una fila en la
 * base del propio destinatario. Es el único canal que no depende de un
 * proveedor externo, y por eso es el único que entrega hoy.
 */
export type FoodosNotificationChannel = "whatsapp" | "email" | "push" | "bell"

export type FoodosClaim = { proceed: true; id: number | null } | { proceed: false }

export interface FoodosClaimInput {
  orderId: string
  restaurantId: string
  audience: FoodosNotificationAudience
  event: string
  channel: FoodosNotificationChannel
  /** Destinatario concreto (teléfono, correo, o el id del usuario para push). */
  recipient: string
}

/**
 * Toma el claim de un aviso. `proceed: false` significa "ya se avisó".
 *
 * Nunca lanza: si el claim falla por cualquier motivo que no sea un duplicado,
 * devuelve `proceed: true` con `id: null` (sin bitácora, pero con aviso).
 */
export async function claimFoodosNotification(input: FoodosClaimInput): Promise<FoodosClaim> {
  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("foodos_order_notifications")
      .insert({
        order_id: input.orderId,
        restaurant_id: input.restaurantId,
        audience: input.audience,
        event: input.event,
        channel: input.channel,
        recipient: input.recipient,
        status: "pending",
      })
      .select("id")
      .maybeSingle()

    if (error) {
      if (error.code === "23505") return { proceed: false }
      logger.warn("foodos_notifications.claim", {
        audience: input.audience,
        event: input.event,
        channel: input.channel,
        message: error.message,
      })
      return { proceed: true, id: null }
    }
    const id = (data as { id: number } | null)?.id
    return { proceed: true, id: typeof id === "number" ? id : null }
  } catch (err) {
    logger.warn("foodos_notifications.claim_error", {
      audience: input.audience,
      event: input.event,
      channel: input.channel,
      err,
    })
    return { proceed: true, id: null }
  }
}

/**
 * Cierra el claim con el resultado real del envío.
 *
 * Un claim marcado `failed` deja de contar para el índice único (es parcial,
 * `WHERE status <> 'failed'`), así que un intento posterior sí reintenta.
 */
export async function settleFoodosNotification(
  id: number | null,
  status: "sent" | "failed",
  error?: string
): Promise<void> {
  if (id === null) return
  try {
    const supabase = await createServiceClient()
    await supabase
      .from("foodos_order_notifications")
      .update({ status, error: error ?? null, updated_at: new Date().toISOString() })
      .eq("id", id)
  } catch (err) {
    logger.error("foodos_notifications.settle", err)
  }
}
