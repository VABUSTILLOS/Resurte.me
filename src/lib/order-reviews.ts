/**
 * Lógica compartida de las reseñas de pedidos (`public.order_reviews`).
 *
 * Vive fuera de la ruta para que el contrato con el esquema migrado
 * (`src/lib/order-reviews.schema.test.ts`) se valide sobre el payload real que
 * se escribe en Supabase, sin necesitar una base de datos.
 */

const MAX_COMMENT_LENGTH = 500

/** Trim + recorte a 500 caracteres; un comentario vacío se guarda como NULL. */
function normalizeComment(comment: unknown): string | null {
  if (typeof comment !== "string") return null
  const trimmed = comment.trim().slice(0, MAX_COMMENT_LENGTH)
  return trimmed || null
}

/**
 * Payload del upsert por `order_id`.
 * `updated_at` se fija explícitamente porque la tabla no tiene trigger de
 * actualización; `user_id` es NULL cuando la reseña viene de un invitado con
 * capability URL (`restore_token`).
 */
export function buildReviewUpsertPayload(input: {
  orderId: number
  userId: string | null
  rating: number
  comment: unknown
}) {
  return {
    order_id: input.orderId,
    user_id: input.userId,
    rating: input.rating,
    comment: normalizeComment(input.comment),
    updated_at: new Date().toISOString(),
  }
}
