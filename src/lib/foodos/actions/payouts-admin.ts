"use server"

/**
 * Libro de dispersiones FoodOS para el admin (C.2 del plan de mejoras).
 *
 * `STRIPE_CONNECT_ENABLED` no existe en producción, así que
 * `buildDestinationChargeParams()` devuelve `{}` y el 100 % del dinero con
 * tarjeta que cobran los micrositios FoodOS cae en la cuenta de Resurte.me con
 * `DEFAULT_PLATFORM_FEE_PERCENT = 0`. Eso hay que transferirlo a cada
 * restaurante a mano.
 *
 * Antes de 00157 no existía dónde anotar que ya se había hecho: la obligación
 * no era calculable («¿cuánto le debo a este restaurante?»), no era liquidable
 * (no había forma de registrar la transferencia) y la comisión retenida no
 * quedaba en ningún lado.
 *
 * La lectura son tres piezas:
 *
 *   1. `foodos_payout_balances()` — el saldo pendiente por restaurante. Es la
 *      **única** definición de «cuánto se le debe»: la calcula la base para que
 *      la pantalla, el CSV y cualquier reporte no puedan divergir.
 *   2. `foodos_payouts` — las dispersiones ya hechas (append-only).
 *   3. El estado de Connect de cada restaurante, para saber quién cobra en su
 *      propio nombre y quién está en custodia de la plataforma.
 *
 * El saldo no se recalcula aquí. Solo se lee.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logger } from "@/lib/logger"
import {
  DEFAULT_PLATFORM_FEE_PERCENT,
  connectStatusFromRestaurant,
  isConnectRoutingEnabled,
} from "@/lib/stripe-connect"
import {
  custodyMode,
  formatPayoutPeriodLabel,
  summarizePayoutBalances,
  type CustodyMode,
  type PayoutBalanceRow,
  type PayoutRow,
  type PayoutSummary,
} from "@/lib/foodos-payouts"
import type { FoodosConnectState } from "@/types/foodos"

/** Tope de filas del historial; el CSV completo se arma con lo visible. */
const PAYOUT_HISTORY_LIMIT = 200

export interface PayoutRestaurantOption {
  id: string
  name: string
  slug: string
}

/**
 * Una dispersión ya registrada, con lo que la pantalla necesita además de la
 * fila cruda: el nombre del restaurante, el periodo legible y quién la capturó.
 * La forma de `foodos_payouts` la define el módulo puro (`PayoutRow`), no este
 * archivo, para que la base y la pantalla no puedan divergir.
 */
export interface PayoutHistoryRow extends PayoutRow {
  restaurantName: string
  restaurantSlug: string
  periodLabel: string
  actorEmail: string | null
}

export interface PayoutRestaurantRow extends PayoutBalanceRow {
  custody: CustodyMode
  connectState: FoodosConnectState
  detailsSubmitted: boolean
  requirementsDue: number
  onboardedAt: string | null
}

export interface PayoutReport {
  /** Connect enrutando hoy. Si es false, todo el dinero está en custodia. */
  routingEnabled: boolean
  /**
   * Comisión de plataforma por defecto, en porcentaje. Es la que aplica
   * `DEFAULT_PLATFORM_FEE_PERCENT` a un restaurante nuevo; cada restaurante
   * puede tener la suya en `platform_fee_percent`.
   */
  defaultFeePercent: number
  summary: PayoutSummary
  restaurants: PayoutRestaurantRow[]
  history: PayoutHistoryRow[]
  options: PayoutRestaurantOption[]
  /** El historial se cortó en el tope: avisar antes de que el CSV mienta. */
  historyTruncated: boolean
}

type RestaurantRow = {
  id: string
  name: string
  slug: string
  stripe_account_id: string | null
  stripe_charges_enabled: boolean
  stripe_payouts_enabled: boolean
  stripe_details_submitted: boolean
  stripe_requirements_due: string[]
  stripe_onboarded_at: string | null
  platform_fee_percent: number
}

const CONNECT_COLUMNS =
  "id, name, slug, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_requirements_due, stripe_onboarded_at, platform_fee_percent"

export async function getFoodosPayoutReport(): Promise<PayoutReport> {
  const { response } = await requireAdmin()
  if (response) throw new Error("Acceso restringido a administradores")

  const supabase = await createServiceClient()
  const routingEnabled = isConnectRoutingEnabled()

  const [balancesResult, restaurantsResult, payoutsResult] = await Promise.all([
    supabase.rpc("foodos_payout_balances"),
    supabase.from("foodos_restaurants").select(CONNECT_COLUMNS).order("name"),
    supabase
      .from("foodos_payouts")
      .select("id, restaurant_id, period_start, period_end, settled_amount, fee_amount, reference, notes, paid_at, created_by")
      .order("paid_at", { ascending: false })
      .limit(PAYOUT_HISTORY_LIMIT),
  ])

  if (balancesResult.error) {
    logger.error("[FOODOS-PAYOUTS] balances error:", balancesResult.error)
    throw new Error("Error al cargar los saldos")
  }
  if (restaurantsResult.error) {
    logger.error("[FOODOS-PAYOUTS] restaurants error:", restaurantsResult.error)
    throw new Error("Error al cargar los restaurantes")
  }
  if (payoutsResult.error) {
    logger.error("[FOODOS-PAYOUTS] payouts error:", payoutsResult.error)
    throw new Error("Error al cargar las dispersiones")
  }

  const restaurants = (restaurantsResult.data ?? []) as unknown as RestaurantRow[]
  const restaurantById = new Map(restaurants.map((r) => [r.id, r]))

  const balancesRaw = (balancesResult.data ?? []) as Array<Record<string, unknown>>
  const balances: PayoutBalanceRow[] = balancesRaw.map((row) => {
    return {
      restaurantId: String(row.restaurant_id ?? ""),
      restaurantName: String(row.restaurant_name ?? ""),
      restaurantSlug: String(row.restaurant_slug ?? ""),
      platformFeePercent: Number(row.platform_fee_percent ?? 0),
      stripeAccountId: (row.stripe_account_id as string | null) ?? null,
      connectChargeable: row.connect_chargeable === true,
      grossCollected: Number(row.gross_collected ?? 0),
      custodyOrderCount: Number(row.custody_order_count ?? 0),
      settledTotal: Number(row.settled_total ?? 0),
      feeTotal: Number(row.fee_total ?? 0),
      outstanding: Number(row.outstanding ?? 0),
      payoutCount: Number(row.payout_count ?? 0),
      lastPayoutAt: (row.last_payout_at as string | null) ?? null,
    }
  })

  // El estado de Connect se deriva de la fila cruda, no del saldo: una cuenta
  // puede estar `active` y aun así recibir cero, porque el enrutado depende de
  // la bandera. Por eso `custodyMode` recibe las dos cosas.
  const enriched: PayoutRestaurantRow[] = balances.map((row) => {
    const restaurant = restaurantById.get(row.restaurantId)
    if (!restaurant) {
      return {
        ...row,
        custody: custodyMode("not_connected", routingEnabled),
        connectState: "not_connected",
        detailsSubmitted: false,
        requirementsDue: 0,
        onboardedAt: null,
      }
    }
    const status = connectStatusFromRestaurant(restaurant)
    const custody = custodyMode(status.state, routingEnabled)
    return {
      ...row,
      platformFeePercent: status.platformFeePercent,
      stripeAccountId: status.accountId,
      connectChargeable: status.chargeable,
      custody,
      connectState: status.state,
      detailsSubmitted: status.detailsSubmitted,
      requirementsDue: status.requirementsDue.length,
      onboardedAt: status.onboardedAt,
    }
  })

  const payouts = (payoutsResult.data ?? []) as unknown as Array<Record<string, unknown>>
  const actorIds = Array.from(
    new Set(payouts.map((p) => p.created_by).filter((id): id is string => typeof id === "string"))
  )
  const actorEmailById = new Map<string, string | null>()
  if (actorIds.length > 0) {
    // El correo vive en auth.users, no en profiles: `profiles` no tiene esa
    // columna. Es el mismo camino que usa el resto del admin.
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    if (usersError) {
      logger.warn("[FOODOS-PAYOUTS] actor emails error:", { error: usersError.message })
    }
    for (const user of users?.users ?? []) {
      actorEmailById.set(user.id, user.email ?? null)
    }
  }

  const history: PayoutHistoryRow[] = payouts.map((row) => {
    const restaurantId = String(row.restaurant_id ?? "")
    const restaurant = restaurantById.get(restaurantId)
    const periodStart = (row.period_start as string | null) ?? null
    const periodEnd = (row.period_end as string | null) ?? null
    const createdBy = typeof row.created_by === "string" ? row.created_by : null
    return {
      id: Number(row.id ?? 0),
      restaurantId,
      restaurantName: restaurant?.name ?? "—",
      restaurantSlug: restaurant?.slug ?? "",
      periodLabel: formatPayoutPeriodLabel(periodStart, periodEnd),
      periodStart,
      periodEnd,
      settledAmount: Number(row.settled_amount ?? 0),
      feeAmount: Number(row.fee_amount ?? 0),
      reference: String(row.reference ?? ""),
      notes: (row.notes as string | null) ?? null,
      paidAt: String(row.paid_at ?? ""),
      actorEmail: createdBy ? actorEmailById.get(createdBy) ?? null : null,
    }
  })

  const options: PayoutRestaurantOption[] = restaurants.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
  }))

  return {
    routingEnabled,
    defaultFeePercent: DEFAULT_PLATFORM_FEE_PERCENT,
    summary: summarizePayoutBalances(enriched),
    restaurants: enriched,
    history,
    options,
    historyTruncated: history.length >= PAYOUT_HISTORY_LIMIT,
  }
}
