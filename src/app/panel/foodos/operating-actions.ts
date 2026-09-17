"use server"

// ============================================================
// Server Actions de FoodOS: "operar como restaurante" (P14).
//
// Sesión de soporte del equipo de plataforma: un admin abre las
// herramientas del panel con los datos de OTRO restaurante. Vive en
// archivo propio porque es una unidad de trabajo distinta —no toca
// datos de negocio, toca el modo en que el panel resuelve de quién
// son los datos— y porque así `foodos-operating.ts` se queda como
// librería sin `"use server"`, que es lo que la hace testeable.
//
// La cookie que fijan estas acciones NO es una credencial: sólo
// *pide* un restaurante. `getOperatingContext` revalida el rol de
// admin en cada llamada, así que revocar el rol corta la sesión de
// soporte de inmediato aunque la cookie siga viva.
// ============================================================

import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth"
import { createServiceClient } from "@/lib/supabase/service"
import { isCurrentUserAdmin } from "@/lib/foodos-admin"
import { logAdminAction } from "@/lib/audit-log"
import {
  UUID_RE,
  clearOperatingRestaurant,
  getOperatingContext,
  setOperatingRestaurant,
} from "@/lib/foodos-operating"
import { logger } from "@/lib/logger"

/**
 * Códigos de error, no mensajes: el texto vive en el diccionario
 * (`foodos.operating.*`) y lo pone la UI, que sí sabe el idioma activo.
 */
export type OperatingErrorCode = "noAccess" | "notFound" | "invalid" | "error"

export type StartOperatingResult =
  | { ok: true; name: string }
  | { ok: false; code: OperatingErrorCode }

export type StopOperatingResult = { ok: true } | { ok: false; code: OperatingErrorCode }

/**
 * Abre la sesión de soporte sobre `restaurantId`.
 *
 * El orden importa: se valida el rol ANTES de escribir la cookie y se
 * confirma que el restaurante existe ANTES de fijarla, para no dejar una
 * cookie apuntando a la nada si el id viene mal.
 */
export async function startOperatingAs(
  restaurantId: string
): Promise<StartOperatingResult> {
  const { user } = await requireAuth()

  if (!(await isCurrentUserAdmin())) return { ok: false, code: "noAccess" }
  if (!UUID_RE.test(restaurantId)) return { ok: false, code: "invalid" }

  let service
  try {
    service = await createServiceClient()
  } catch (error) {
    logger.warn("foodos.operating.start.serviceClient", {
      error: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, code: "error" }
  }

  const { data, error } = await service
    .from("foodos_restaurants")
    .select("id, name")
    .eq("id", restaurantId)
    .maybeSingle()

  if (error) {
    logger.warn("foodos.operating.start.lookup", { error: error.message })
    return { ok: false, code: "error" }
  }

  const restaurant = data as { id: string; name: string } | null
  if (!restaurant) return { ok: false, code: "notFound" }

  await setOperatingRestaurant(restaurant.id)
  await logAdminAction(service, {
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "foodos_operating_start",
    entity: "foodos_restaurant",
    entityId: restaurant.id,
    detail: { name: restaurant.name },
  })

  revalidatePath("/panel", "layout")
  return { ok: true, name: restaurant.name }
}

/**
 * Cierra la sesión de soporte y vuelve al restaurante propio.
 *
 * El registro de la salida se emite con el contexto **anterior** a borrar la
 * cookie: es el único momento en que todavía se sabe de qué restaurante se
 * estaba saliendo. Si no había sesión abierta no se registra nada — cerrar algo
 * que no estaba abierto no es un evento de auditoría.
 */
export async function stopOperatingAs(): Promise<StopOperatingResult> {
  const { supabase, user } = await requireAuth()

  let ctx
  try {
    ctx = await getOperatingContext(supabase, user)
  } catch (error) {
    logger.warn("foodos.operating.stop.context", {
      error: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, code: "error" }
  }

  await clearOperatingRestaurant()

  if (ctx.impersonating && ctx.restaurantId) {
    await logAdminAction(ctx.client, {
      actorId: ctx.actorUserId,
      actorEmail: ctx.actorEmail,
      action: "foodos_operating_stop",
      entity: "foodos_restaurant",
      entityId: ctx.restaurantId,
      detail: {},
    })
  }

  revalidatePath("/panel", "layout")
  return { ok: true }
}
