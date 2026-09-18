"use server"

/**
 * Cola de revisión FoodOS para el admin (E.3 del plan de mejoras).
 *
 * Antes de 00168 el estado del restaurante era un interruptor que el propio
 * dueño movía: `00023_foodos.sql` le da `FOR ALL USING (auth.uid() = user_id)` y
 * `00160` deja `status` en la lista blanca de columnas que puede escribir. Es
 * decir, la única puerta a `/r/[slug]` —`status = 'active'`— la abría el dueño,
 * sin revisión y sin que nadie se enterara. No era un descuido de permisos: era
 * un modelo de publicación que no existía.
 *
 * `00168` lo cambió por una máquina de estados (`draft → pending_review →
 * active`, más `paused` y el rechazo `pending_review → draft`) donde **sólo un
 * admin escribe `active`**. Esta pantalla es la otra mitad: sin ella, la
 * máquina de estados deja a los restaurantes en `pending_review` para siempre y
 * el cambio no sería una solución, sería una traba.
 *
 * La lectura es una sola pieza: `foodos_review_queue()`, que ya resuelve en la
 * base el correo del dueño (vive en `auth.users`; `profiles` no tiene esa
 * columna), los conteos de sucursales y platillos, y el orden de urgencia. La
 * pantalla no los recalcula: si los recalculara, la cola y la decisión podrían
 * discrepar sobre si un restaurante es publicable.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logger } from "@/lib/logger"
import {
  MIN_MENU_ITEMS_TO_PUBLISH,
  isFoodosStatus,
  type FoodosRestaurantStatus,
} from "@/lib/foodos-moderation"

export interface ReviewQueueRow {
  restaurantId: string
  name: string
  slug: string
  status: FoodosRestaurantStatus
  ownerEmail: string | null
  branches: number
  menuItems: number
  submittedAt: string | null
  reviewNote: string | null
  reviewedAt: string | null
  /**
   * Motivo por el que aprobar fallaría hoy, o `null` si aprobar funciona. Se
   * deriva del conteo que devuelve la base, con la misma regla y la misma
   * constante que usa el RPC: la pantalla avisa antes de que el admin pulse y
   * reciba un error.
   */
  blocker: string | null
}

export interface ReviewQueue {
  rows: ReviewQueueRow[]
  /** Cuántos esperan decisión. Es el número que importa para operar. */
  pendingCount: number
}

export async function getFoodosReviewQueue(): Promise<ReviewQueue> {
  const { response } = await requireAdmin()
  if (response) throw new Error("Acceso restringido a administradores")

  const supabase = await createServiceClient()
  const { data, error } = await supabase.rpc("foodos_review_queue")

  if (error) {
    logger.error("[FOODOS-REVIEW] queue error:", error)
    throw new Error("Error al cargar la cola de revisión")
  }

  const raw = (data ?? []) as Array<Record<string, unknown>>
  const rows: ReviewQueueRow[] = raw.map((row) => {
    const status = String(row.status ?? "")
    const menuItems = Number(row.menu_items ?? 0)
    return {
      restaurantId: String(row.restaurant_id ?? ""),
      name: String(row.name ?? ""),
      slug: String(row.slug ?? ""),
      // Un estado que no reconocemos se degrada a `draft`, que es el estado
      // desde el que todo se puede pedir. Es preferible a mentir sobre él.
      status: isFoodosStatus(status) ? status : "draft",
      ownerEmail: (row.owner_email as string | null) ?? null,
      branches: Number(row.branches ?? 0),
      menuItems,
      submittedAt: (row.submitted_at as string | null) ?? null,
      reviewNote: (row.review_note as string | null) ?? null,
      reviewedAt: (row.reviewed_at as string | null) ?? null,
      blocker:
        menuItems < MIN_MENU_ITEMS_TO_PUBLISH
          ? `Necesita al menos ${MIN_MENU_ITEMS_TO_PUBLISH} platillo en el menú.`
          : null,
    }
  })

  return {
    rows,
    pendingCount: rows.filter((row) => row.status === "pending_review").length,
  }
}
