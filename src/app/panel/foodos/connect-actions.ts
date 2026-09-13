"use server"

// ============================================================
// Server Actions de FoodOS: onboarding de cobros con Stripe
// Connect Express.
//
// Archivo separado de actions.ts a propósito (misma razón que
// payment-proofs.ts): es una unidad de trabajo distinta y así el
// archivo principal no crece más.
//
// Dos capas de defensa, y son distintas a propósito:
//
//  · **Lectura** con el cliente de sesión → RLS garantiza que sólo
//    el dueño ve su restaurante.
//  · **Escritura** de las columnas `stripe_*` con el service client
//    → 00085 las revoca a `authenticated`, porque la política RLS
//    de restaurantes es a nivel de fila y permitiría al dueño
//    apuntar `stripe_account_id` a la cuenta de un tercero y
//    desviar los pagos de sus propios comensales.
//
// Por eso toda escritura de Connect pasa por aquí y valida antes
// que el restaurante sea del usuario autenticado.
// ============================================================

import { requireAuth } from "@/lib/auth"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { revalidatePath } from "next/cache"
import {
  connectSnapshotFromAccount,
  connectStatusFromAccount,
  connectStatusFromRestaurant,
  createConnectDashboardLink,
  createConnectOnboardingLink,
  createExpressAccountForRestaurant,
  fetchConnectAccount,
  syncConnectAccount,
  type ConnectStatus,
} from "@/lib/stripe-connect"
import type { FoodosRestaurant } from "@/types/foodos"

/** URL pública del panel; se usa para los redirects que exige Stripe. */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://resurte.me").replace(
  /\/$/,
  ""
)

const CONNECT_RETURN_PATH = "/panel/foodos/restaurante?connect=done"
const CONNECT_REFRESH_PATH = "/panel/foodos/restaurante?connect=refresh"

/** Columnas de Connect; espejo del SELECT de `stripe-connect.ts`. */
const CONNECT_COLUMNS =
  "stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_requirements_due, stripe_onboarded_at, platform_fee_percent"

/**
 * Estado de Connect de un restaurante del usuario.
 *
 * Devuelve `null` si el restaurante no existe o no es suyo: la consulta
 * usa el cliente de sesión, así que RLS responde por nosotros.
 */
export async function getConnectStatus(
  restaurantId: string
): Promise<ConnectStatus | null> {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_restaurants")
    .select(CONNECT_COLUMNS)
    .eq("id", restaurantId)
    .maybeSingle()
  if (error || !data) return null
  return connectStatusFromRestaurant(
    data as Parameters<typeof connectStatusFromRestaurant>[0]
  )
}

/**
 * Verifica propiedad del restaurante y devuelve la fila con sus datos de
 * Connect. Usa el cliente de sesión (RLS) y falla cerrado.
 */
async function loadOwnedRestaurant(restaurantId: string) {
  const { supabase, user } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_restaurants")
    .select(`id, name, user_id, ${CONNECT_COLUMNS}`)
    .eq("id", restaurantId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("Restaurante no encontrado")
  const row = data as Pick<FoodosRestaurant, "id" | "name" | "user_id"> &
    Parameters<typeof connectStatusFromRestaurant>[0]
  return { supabase, user, row, status: connectStatusFromRestaurant(row) }
}

/**
 * Inicia (o retoma) el onboarding de cobros del restaurante.
 *
 * Crea la cuenta Express la primera vez y siempre devuelve un link de
 * onboarding fresco: los de Stripe caducan y el `refresh_url` vuelve a
 * llamar aquí. La cuenta se persiste **antes** de generar el link para que
 * un fallo al crear el link no deje cuentas huérfanas sin registrar.
 */
export async function startConnectOnboarding(
  restaurantId: string
): Promise<{ url: string }> {
  const { user, row, status } = await loadOwnedRestaurant(restaurantId)

  let accountId = status.accountId
  if (!accountId) {
    accountId = await createExpressAccountForRestaurant({
      restaurantId: row.id,
      restaurantName: row.name,
      email: user.email ?? null,
    })
    // Escritura sensible → service client (00085 revoca la columna a
    // `authenticated`). El `eq` por user_id reafirma la propiedad.
    const service = await createServiceClient()
    const { error } = await service
      .from("foodos_restaurants")
      .update({ stripe_account_id: accountId })
      .eq("id", row.id)
      .eq("user_id", user.id)
    if (error) {
      logger.error("foodos.connect.persist_account_failed", {
        restaurant: row.id,
        error: error.message,
      })
      throw new Error("No se pudo guardar la cuenta de cobros")
    }
  }

  const url = await createConnectOnboardingLink({
    accountId,
    returnUrl: `${SITE_URL}${CONNECT_RETURN_PATH}`,
    refreshUrl: `${SITE_URL}${CONNECT_REFRESH_PATH}`,
  })
  return { url }
}

/**
 * Relee el estado de la cuenta desde Stripe y lo persiste.
 *
 * Necesario además del webhook `account.updated`: el restaurante vuelve del
 * onboarding y espera ver el cambio ya; no depende de que el evento llegue.
 */
export async function refreshConnectStatus(
  restaurantId: string
): Promise<ConnectStatus | null> {
  const { status } = await loadOwnedRestaurant(restaurantId)
  if (!status.accountId) return status

  const account = await fetchConnectAccount(status.accountId)
  const service = await createServiceClient()
  // El sello de onboarding y el resto del estado se resuelven igual que en
  // el webhook, para que ambos caminos escriban lo mismo.
  await syncConnectAccount(service, connectSnapshotFromAccount(account))
  revalidatePath("/panel/foodos/restaurante")

  // Se devuelve el estado derivado de la respuesta de Stripe (y no de una
  // relectura) para que la UI refleje el cambio de inmediato.
  return connectStatusFromAccount(account, status.platformFeePercent)
}

/** Link de un solo uso al panel Express donde el dueño ve sus depósitos. */
export async function openConnectDashboard(
  restaurantId: string
): Promise<{ url: string }> {
  const { status } = await loadOwnedRestaurant(restaurantId)
  if (!status.accountId) {
    throw new Error("El restaurante todavía no tiene cuenta de cobros")
  }
  const url = await createConnectDashboardLink(status.accountId)
  return { url }
}
