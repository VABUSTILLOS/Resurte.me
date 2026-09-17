/**
 * "Operar como restaurante" (P14): impersonación de soporte.
 *
 * El panel de FoodOS decide **todo** a partir de un restaurante: qué pedidos
 * listar, qué nivel aplicar, qué filas puede escribir. Ese restaurante se
 * resolvía siempre como `foodos_restaurants.user_id = auth.uid()`, así que un
 * admin solo podía operar el suyo. Este módulo introduce el único punto donde
 * se decide "sobre qué restaurante se opera", para que el admin pueda abrir la
 * herramienta con los datos de cualquier restaurante y dar soporte real.
 *
 * Tres reglas gobiernan el seam, en este orden:
 *
 * 1. **La cookie nunca es una credencial.** Solo *pide* un restaurante; la
 *    autorización se revalida en servidor en cada llamada contra el rol real
 *    (`isCurrentUserAdmin()`). Un restaurantero con la cookie puesta opera su
 *    propio restaurante, no el pedido.
 * 2. **Falla cerrado.** Cookie ilegible, restaurante inexistente, service role
 *    sin configurar o usuario sin sesión degradan al camino normal (el
 *    restaurante propio) en vez de lanzar o de conceder de más.
 * 3. **Al impersonar se lee y escribe con service role.** RLS de `foodos_*`
 *    es `auth.uid() = user_id`, así que el cliente de cookies devolvería 0
 *    filas para el restaurante ajeno. Con service role la comprobación de
 *    admin de este módulo es la **única** barrera: por eso se revalida
 *    siempre y por eso las escrituras tienen que acotar por `ownerUserId`
 *    (ver `getOperatingContext().ownerUserId`), nunca por `auth.uid()`.
 *
 * **Dos clases de columna `user_id`, y solo una se migra.** Las que deciden
 * *visibilidad o propiedad* (`foodos_restaurants.user_id`, y las columnas
 * `user_id` de tablas cuyo RLS va por `auth.uid() = user_id`) se acotan por
 * `ownerUserId`: son las que dejarían datos invisibles para el dueño o
 * permitirían tocar filas ajenas. Las que registran *quién hizo la acción*
 * (`foodos_pos_shifts.opened_by`/`closed_by`, `foodos_pos_shift_movements.user_id`,
 * `foodos_orders.cashier_user_id`, `foodos_order_payments.reviewed_by`) se
 * dejan con el usuario de sesión: su RLS no depende de ellas y quien
 * realmente ejecutó la acción es el admin. Poner ahí `ownerUserId` sería
 * falsear el rastro, no arreglar un agujero.
 *
 * La cookie se escribe **solo** desde `startOperatingAs` (server action) y es
 * `httpOnly`: el navegador no puede forjarla ni leerla.
 */

import { cookies } from "next/headers"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireAuth } from "@/lib/auth"
import { createServiceClient } from "@/lib/supabase/service"
import { isCurrentUserAdmin } from "@/lib/foodos-admin"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"

export const OPERATING_COOKIE = "resurte_foodos_operating"

/**
 * Una sesión de soporte es un rato, no un turno de trabajo. Caduca sola para
 * que un admin no quede operando sobre un restaurante ajeno al día siguiente.
 */
const MAX_AGE_SECONDS = 60 * 60 * 4

/** Forma de un id de restaurante. Un valor que no encaje se descarta antes de ir a la base. */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface OperatingUser {
  id: string
  email?: string | null
}

export interface OperatingContext {
  /** Restaurante sobre el que se opera. `null` si no hay ninguno. */
  restaurantId: string | null
  /**
   * Dueño real del restaurante. Es el valor que deben usar los filtros y
   * updates (`.eq("user_id", ownerUserId)`) en lugar de `auth.uid()`.
   */
  ownerUserId: string | null
  /** Cliente a usar para leer y escribir ese restaurante. */
  client: SupabaseClient
  /** `true` solo si un admin opera sobre un restaurante que no es suyo. */
  impersonating: boolean
  /** Quién está operando (el admin, no el dueño). */
  actorUserId: string
  actorEmail: string | null
}

/**
 * Fila mínima de `foodos_restaurants` que necesita la resolución. Se declara
 * estructural (y no con el tipo generado) para poder inyectar un doble en los
 * tests sin arrastrar toda la base.
 */
export interface OperatingRestaurant {
  id: string
  user_id: string
}

/**
 * Dependencias del seam, inyectables para poder probarlo sin request ni base
 * de datos. En producción son siempre las de `defaultDeps`.
 */
export interface OperatingDeps {
  /** Lee el restaurante pedido desde la cookie (server-side). */
  readRequestedId: () => Promise<string | null>
  /** Revalida el rol de admin contra el servidor. */
  isAdmin: () => Promise<boolean>
  /** Cliente con el que leer el restaurante pedido (salta RLS). */
  createAdminClient: () => Promise<SupabaseClient>
}

/** `cookies()` lanza fuera de una request (crons, scripts): ahí no hay nada que pedir. */
async function readOperatingRestaurantId(): Promise<string | null> {
  try {
    const store = await cookies()
    const raw = store.get(OPERATING_COOKIE)?.value
    if (!raw) return null
    const id = decodeURIComponent(raw)
    // Un id que no es UUID no puede ser un restaurante: se descarta antes de
    // llegar a la base en lugar de mandarlo a un filtro.
    return UUID_RE.test(id) ? id : null
  } catch {
    return null
  }
}

/** Fija la cookie de impersonación. Solo debe llamarse tras revalidar el rol. */
export async function setOperatingRestaurant(restaurantId: string): Promise<void> {
  const store = await cookies()
  store.set(OPERATING_COOKIE, restaurantId, {
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  })
}

/** Borra la cookie de impersonación. Idempotente. */
export async function clearOperatingRestaurant(): Promise<void> {
  const store = await cookies()
  store.set(OPERATING_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true })
}

/**
 * Decide sobre qué restaurante se opera. **Puro y determinista**: aquí vive la
 * regla de autorización, para poder probarla con casos hostiles sin base de
 * datos. `getOperatingContext` solo aporta la cookie y las filas.
 */
export function decideOperatingTarget(input: {
  /** Id pedido por la cookie, ya saneado. */
  requestedId: string | null
  isAdmin: boolean
  /** Restaurante propio del usuario, si tiene. */
  ownRestaurantId: string | null
  /** Dueño del restaurante propio (el propio usuario). */
  ownUserId: string
  /** Restaurante pedido resuelto con service role; `null` si no existe. */
  requested: OperatingRestaurant | null
}): {
  restaurantId: string | null
  ownerUserId: string | null
  impersonating: boolean
} {
  const { requestedId, isAdmin, ownRestaurantId, ownUserId, requested } = input

  // Pedido explícito de un admin sobre un restaurante que existe y no es suyo.
  // Es el único camino que impersona; todo lo demás cae al restaurante propio.
  if (requestedId && isAdmin && requested && requested.id !== ownRestaurantId) {
    return {
      restaurantId: requested.id,
      ownerUserId: requested.user_id,
      impersonating: true,
    }
  }

  return {
    restaurantId: ownRestaurantId,
    ownerUserId: ownRestaurantId ? ownUserId : null,
    impersonating: false,
  }
}

/** Resuelve el restaurante propio del usuario (RLS: 0 filas si no tiene). */
async function loadOwnRestaurantId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("foodos_restaurants")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) {
    logger.warn("foodos.operating.ownRestaurant", { error: error.message })
    return null
  }
  return (data as { id?: string } | null)?.id ?? null
}

/** Resuelve el restaurante pedido con service role (RLS lo ocultaría). */
async function loadRequestedRestaurant(
  client: SupabaseClient,
  restaurantId: string
): Promise<OperatingRestaurant | null> {
  const { data, error } = await client
    .from("foodos_restaurants")
    .select("id, user_id")
    .eq("id", restaurantId)
    .maybeSingle()
  if (error) {
    logger.warn("foodos.operating.requestedRestaurant", { error: error.message })
    return null
  }
  return (data as OperatingRestaurant | null) ?? null
}

const defaultDeps: OperatingDeps = {
  readRequestedId: readOperatingRestaurantId,
  isAdmin: isCurrentUserAdmin,
  createAdminClient: createServiceClient,
}

/**
 * Contexto de operación de la request: sobre qué restaurante se opera, con qué
 * cliente, y si eso implica impersonación.
 *
 * `supabase` es el cliente de cookies del llamador (ya lo tiene: acaba de leer
 * la sesión). Solo se crea un cliente de service role cuando hay una
 * impersonación **ya autorizada**.
 */
export async function getOperatingContext(
  supabase: SupabaseClient,
  user: OperatingUser,
  deps: OperatingDeps = defaultDeps
): Promise<OperatingContext> {
  const base = {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
  }

  const ownRestaurantId = await loadOwnRestaurantId(supabase, user.id)
  const requestedId = await deps.readRequestedId()

  // Sin petición explícita no hace falta consultar el rol: camino normal.
  if (!requestedId) {
    return {
      ...base,
      restaurantId: ownRestaurantId,
      ownerUserId: ownRestaurantId ? user.id : null,
      client: supabase,
      impersonating: false,
    }
  }

  let requested: OperatingRestaurant | null = null
  let isAdmin = false
  try {
    isAdmin = await deps.isAdmin()
  } catch (err) {
    logger.warn("foodos.operating.adminCheck", { error: String(err) })
  }

  if (isAdmin) {
    try {
      requested = await loadRequestedRestaurant(
        await deps.createAdminClient(),
        requestedId
      )
    } catch (err) {
      // Sin service role no hay forma de leer el restaurante ajeno: degradar.
      logger.warn("foodos.operating.serviceClient", { error: String(err) })
    }
  }

  const decision = decideOperatingTarget({
    requestedId,
    isAdmin,
    ownRestaurantId,
    ownUserId: user.id,
    requested,
  })

  if (!decision.impersonating) {
    return { ...base, ...decision, client: supabase }
  }

  try {
    return { ...base, ...decision, client: await deps.createAdminClient() }
  } catch (err) {
    logger.warn("foodos.operating.impersonationClient", { error: String(err) })
    return {
      ...base,
      restaurantId: ownRestaurantId,
      ownerUserId: ownRestaurantId ? user.id : null,
      client: supabase,
      impersonating: false,
    }
  }
}

/**
 * `requireAuth()` + el seam, en una sola llamada.
 *
 * Existe para que una acción del panel cambie **un nombre de función** y ya
 * opere sobre el restaurante correcto: devuelve la misma forma que
 * `requireAuth()` (`{ supabase, user }`) más el contexto, y `supabase` ya es el
 * cliente que corresponde — el de cookies en el camino normal, y el de service
 * role mientras un admin impersona (RLS devolvería 0 filas del restaurante
 * ajeno, y con el cliente de cookies las escrituras fallarían en silencio).
 *
 * `user` es **siempre quien tiene la sesión** (el admin al impersonar), nunca el
 * dueño: para el dueño efectivo está `ownerUserId`, que es el valor que deben
 * usar los `.eq("user_id", …)` y `assertOwnRestaurant`.
 *
 * Sin impersonación devuelve el mismo objeto de cliente que `requireAuth()`, así
 * que el camino normal no cambia en nada.
 */
export async function requireFoodosAuth(): Promise<{
  supabase: SupabaseClient
  user: OperatingUser
  ctx: OperatingContext
  /** Dueño efectivo del restaurante operado; `""` si no hay ninguno. */
  ownerUserId: string
}> {
  const { supabase, user } = await requireAuth()
  const ctx = await getOperatingContext(supabase, user)
  if (ctx.impersonating) await auditOperatingAction(ctx)
  return { supabase: ctx.client, user, ctx, ownerUserId: ctx.ownerUserId ?? "" }
}

/**
 * Rastro de la sesión de soporte: un registro por acción impersonada.
 *
 * Se emite **aquí**, en el único punto por el que pasan todas las acciones del
 * panel, en vez de en cada escritura. El seam no puede distinguir una lectura
 * de una escritura, y para auditar soporte la lectura es justo lo sensible: un
 * admin abriendo los pedidos o los cobros de un restaurante ajeno es
 * exactamente lo que hay que poder reconstruir. El precio es que las lecturas
 * también quedan registradas, que es lo deseable.
 *
 * `getOperatingContext` **no** audita: lo llaman también los layouts en cada
 * render, y eso llenaría la bitácora de visitas de página en vez de acciones.
 *
 * Best-effort por diseño: `logAdminAction` nunca lanza, así que la bitácora no
 * puede tumbar la acción que registra.
 */
async function auditOperatingAction(ctx: OperatingContext): Promise<void> {
  try {
    await logAdminAction(ctx.client, {
      actorId: ctx.actorUserId,
      actorEmail: ctx.actorEmail,
      action: "foodos_operating_action",
      entity: "foodos_restaurant",
      entityId: ctx.restaurantId,
      detail: { impersonating: true },
    })
  } catch (error) {
    // `logAdminAction` ya se traga sus propios errores; este catch existe para
    // que el seam no dependa de esa promesa interna. Registrar no puede ser
    // nunca la razón por la que falla la acción que se está registrando.
    logger.warn("foodos.operating.audit", {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Nombre del restaurante operado, para el banner y para el selector. `null`
 * cuando no hay impersonación: en el camino normal el dueño ya sabe cuál es el
 * suyo y no hace falta otra consulta.
 */
export async function loadOperatingRestaurantName(
  ctx: OperatingContext
): Promise<string | null> {
  if (!ctx.impersonating || !ctx.restaurantId) return null
  const { data, error } = await ctx.client
    .from("foodos_restaurants")
    .select("name")
    .eq("id", ctx.restaurantId)
    .maybeSingle()
  if (error) {
    logger.warn("foodos.operating.restaurantName", { error: error.message })
    return null
  }
  return (data as { name?: string } | null)?.name ?? null
}

/**
 * Estado que necesita el selector de restaurantes: cuál se está operando y cuál
 * es el propio.
 *
 * El restaurante propio no se puede impersonar (`decideOperatingTarget` lo
 * rechaza), así que el selector necesita saberlo para no ofrecer un botón que
 * no haría nada. Se resuelve con el cliente de cookies —el propio está sujeto a
 * RLS y es del usuario de la sesión— y sin service role.
 */
export async function getOperatingPickerState(): Promise<{
  /** Restaurante impersonado, o `null` si la sesión es normal. */
  operatingRestaurantId: string | null
  /** Restaurante propio del usuario de la sesión, o `null` si no tiene. */
  ownRestaurantId: string | null
}> {
  const { supabase, user } = await requireAuth()
  const ctx = await getOperatingContext(supabase, user)
  const ownRestaurantId = ctx.impersonating
    ? await loadOwnRestaurantId(supabase, user.id)
    : ctx.restaurantId
  return {
    operatingRestaurantId: ctx.impersonating ? ctx.restaurantId : null,
    ownRestaurantId,
  }
}
