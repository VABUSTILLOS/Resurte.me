/**
 * Stripe Connect Express por restaurante.
 *
 * Hasta 00085 todos los pagos con tarjeta de FoodOS entraban a la cuenta
 * Stripe de Resurte.me y había que dispersarlos a mano (custodia de fondos
 * de terceros). Con Connect cada restaurante tiene su propia cuenta Express
 * y el cargo se hace como *destination charge*:
 *
 *   transfer_data.destination = <cuenta del restaurante>
 *   application_fee_amount    = comisión que retiene la plataforma
 *
 * Stripe liquida al restaurante; la plataforma nunca toca los fondos.
 *
 * Dos decisiones de diseño deliberadas:
 *
 * 1. **Nada de esto es obligatorio para cobrar.** Si un restaurante no tiene
 *    cuenta o no terminó su verificación, `buildDestinationChargeParams()`
 *    devuelve `{}` y el cargo se crea como antes, contra la cuenta de la
 *    plataforma. Así el despliegue no rompe a los restaurantes que ya cobran
 *    y la migración puede ser restaurante por restaurante. El panel avisa
 *    cuando un restaurante sigue en ese modo.
 *
 * 2. **Interruptor de plataforma.** `STRIPE_CONNECT_ENABLED` debe ser
 *    exactamente `"true"` o `"1"` para enrutar fondos a cuentas conectadas;
 *    por defecto está **apagado**. Connect requiere activarse antes en el
 *    Dashboard de Stripe, y si algo sale mal el operador apaga la variable y
 *    todo vuelve al cobro contra la plataforma sin desplegar código.
 */

import { getStripe } from "@/lib/stripe"
import { logger } from "@/lib/logger"
import type { ServiceClient } from "@/lib/stripe-webhook-handlers"
import type { FoodosConnectState, FoodosRestaurant } from "@/types/foodos"

/** País de las cuentas Express. Configurable por si se abre otro mercado. */
export const CONNECT_COUNTRY = process.env.STRIPE_CONNECT_COUNTRY || "MX"

/** Comisión por defecto de la plataforma (0 = paridad con Take App). */
export const DEFAULT_PLATFORM_FEE_PERCENT = 0

/** Subconjunto de `Stripe.Account` que consumimos. */
export interface ConnectAccountLike {
  id: string
  charges_enabled?: boolean
  payouts_enabled?: boolean
  details_submitted?: boolean
  requirements?: {
    currently_due?: string[] | null
    disabled_reason?: string | null
  } | null
}

/** Datos de Connect ya normalizados, independientes de la forma de Stripe. */
export interface ConnectSnapshot {
  accountId: string
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  requirementsDue: string[]
  disabledReason: string | null
}

export interface ConnectStatus {
  /**
   * Cuenta conectada del restaurante, o `null` si todavía no tiene una.
   * No extiende `ConnectSnapshot` justo por esto: el snapshot siempre tiene
   * cuenta, el estado de un restaurante puede no tenerla.
   */
  accountId: string | null
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  requirementsDue: string[]
  disabledReason: string | null
  state: FoodosConnectState
  onboardedAt: string | null
  platformFeePercent: number
  /**
   * ¿Puede este restaurante recibir fondos directo a su cuenta?
   * Es verdad de la cuenta, no de la plataforma: no considera el
   * interruptor `STRIPE_CONNECT_ENABLED` (eso lo decide
   * `buildDestinationChargeParams`).
   */
  chargeable: boolean
}

/** Parámetros de destination charge para `paymentIntents.create`. */
export interface DestinationChargeParams {
  transfer_data?: { destination: string }
  application_fee_amount?: number
}

/**
 * Interruptor de plataforma. Apagado salvo valor explícito: Connect debe
 * activarse antes en el Dashboard de Stripe, así que encenderlo por defecto
 * sólo generaría errores de configuración.
 */
export function isConnectRoutingEnabled(): boolean {
  const raw = process.env.STRIPE_CONNECT_ENABLED
  return raw === "true" || raw === "1"
}

/** Parámetros de `refunds.create` para un cargo enrutado a una cuenta conectada. */
export interface RefundParams {
  reverse_transfer?: boolean
  refund_application_fee?: boolean
}

/**
 * Reembolso de un *destination charge*: el dinero tiene que salir de donde
 * entró.
 *
 * Sin `reverse_transfer`, Stripe le devuelve el dinero al cliente **con fondos
 * de la plataforma** y el restaurante conserva lo que ya se le liquidó: la
 * plataforma paga el reembolso de su bolsillo y el restaurante se queda el
 * cobro de un pedido que ya no existe. Sin `refund_application_fee`, la
 * plataforma además se queda la comisión de ese mismo pedido.
 *
 * Con Connect apagado el cargo vive contra la cuenta de la plataforma y no hay
 * transferencia que revertir: se devuelve `{}` para no pedirle a Stripe un
 * parámetro que ese cargo no admite.
 */
export function buildRefundParams(params: {
  routed: boolean
  applicationFeeAmount?: number | null
}): RefundParams {
  if (!params.routed) return {}
  const fee = params.applicationFeeAmount
  return {
    reverse_transfer: true,
    // Stripe rechaza `refund_application_fee` si el cargo no llevaba comisión.
    ...(typeof fee === "number" && fee > 0 ? { refund_application_fee: true } : {}),
  }
}

/**
 * Comisión que retiene la plataforma, en centavos.
 *
 * Devuelve 0 —es decir, se omite `application_fee_amount`— cuando no hay
 * comisión, y también cuando el cálculo daría 0 o ≥ el total: Stripe rechaza
 * `application_fee_amount` fuera del rango `0 < fee < amount`, y una comisión
 * del 100 % dejaría al restaurante sin nada.
 */
export function computeApplicationFee(
  amountCents: number,
  feePercent: number
): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0
  if (!Number.isFinite(feePercent) || feePercent <= 0) return 0
  const fee = Math.round((amountCents * feePercent) / 100)
  if (fee <= 0 || fee >= amountCents) return 0
  return fee
}

/** Tope de la comisión que un admin puede fijar a un restaurante. */
export const MAX_PLATFORM_FEE_PERCENT = 99.99

/**
 * Valida la comisión que un admin teclea para un restaurante.
 *
 * El rango es `0 ≤ x < 100` y no `≤ 100` a propósito: con 100 %,
 * `computeApplicationFee` devuelve 0 y la plataforma no cobra nada **pero
 * tampoco cobra el restaurante**, que es lo contrario de lo que el admin
 * quiso decir. Rechazarlo aquí es más honesto que aceptarlo y aplicar otra
 * cosa en silencio.
 *
 * Se aceptan cadenas porque el valor llega de un `<input type="text">`; el
 * límite de dos decimales evita guardar `2.4999999` y que la comisión
 * aplicada no coincida con la mostrada.
 */
export function parsePlatformFeePercent(
  input: unknown
): { ok: true; value: number } | { ok: false; error: string } {
  // Solo `string` y `number`: `Number([3])` y `Number(true)` dan 3 y 1, así que
  // aceptar "cualquier cosa que Number() entienda" dejaría entrar un arreglo o
  // un booleano desde el JSON del cuerpo.
  if (typeof input !== "string" && typeof input !== "number") {
    return { ok: false, error: "Escribe una comisión entre 0 y 99.99" }
  }
  const raw = typeof input === "string" ? input.trim().replace(",", ".") : input
  if (raw === "") {
    return { ok: false, error: "Escribe una comisión entre 0 y 99.99" }
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    return { ok: false, error: "La comisión debe ser un número" }
  }
  if (value < 0) {
    return { ok: false, error: "La comisión no puede ser negativa" }
  }
  if (value > MAX_PLATFORM_FEE_PERCENT) {
    return {
      ok: false,
      error: `La comisión debe ser menor que 100 (máximo ${MAX_PLATFORM_FEE_PERCENT})`,
    }
  }
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-9) {
    return { ok: false, error: "La comisión admite como máximo dos decimales" }
  }
  return { ok: true, value }
}

function deriveConnectState(snapshot: {
  accountId: string | null
  chargesEnabled: boolean
  payoutsEnabled: boolean
  disabledReason: string | null
}): FoodosConnectState {
  if (!snapshot.accountId) return "not_connected"
  if (snapshot.disabledReason) return "restricted"
  if (snapshot.chargesEnabled && snapshot.payoutsEnabled) return "active"
  return "pending"
}

/** Normaliza un `Stripe.Account` a `ConnectSnapshot`. */
export function connectSnapshotFromAccount(
  account: ConnectAccountLike
): ConnectSnapshot {
  return {
    accountId: account.id,
    chargesEnabled: account.charges_enabled === true,
    payoutsEnabled: account.payouts_enabled === true,
    detailsSubmitted: account.details_submitted === true,
    requirementsDue: (account.requirements?.currently_due ?? []).filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0
    ),
    disabledReason: account.requirements?.disabled_reason ?? null,
  }
}

/** Arma el estado de Connect a partir de una fila de `foodos_restaurants`. */
export function connectStatusFromRestaurant(
  row: Pick<
    FoodosRestaurant,
    | "stripe_account_id"
    | "stripe_charges_enabled"
    | "stripe_payouts_enabled"
    | "stripe_details_submitted"
    | "stripe_requirements_due"
    | "stripe_onboarded_at"
    | "platform_fee_percent"
  >
): ConnectStatus {
  const accountId = row.stripe_account_id ?? null
  const chargesEnabled = row.stripe_charges_enabled === true
  const payoutsEnabled = row.stripe_payouts_enabled === true
  const requirementsDue = (row.stripe_requirements_due ?? []).filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0
  )
  return {
    accountId,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted: row.stripe_details_submitted === true,
    requirementsDue,
    // La fila no guarda `disabled_reason`; sólo el webhook lo ve. Si hay
    // requisitos vencidos, `charges_enabled` ya viene en false.
    disabledReason: null,
    state: deriveConnectState({ accountId, chargesEnabled, payoutsEnabled, disabledReason: null }),
    onboardedAt: row.stripe_onboarded_at ?? null,
    platformFeePercent: Number(row.platform_fee_percent ?? DEFAULT_PLATFORM_FEE_PERCENT),
    chargeable: accountId !== null && chargesEnabled && payoutsEnabled,
  }
}

/** Arma el estado de Connect a partir de un `Stripe.Account`. */
export function connectStatusFromAccount(
  account: ConnectAccountLike,
  platformFeePercent: number
): ConnectStatus {
  const snapshot = connectSnapshotFromAccount(account)
  return {
    ...snapshot,
    state: deriveConnectState(snapshot),
    onboardedAt: null,
    platformFeePercent,
    chargeable:
      snapshot.chargesEnabled && snapshot.payoutsEnabled && !snapshot.disabledReason,
  }
}

/**
 * Parámetros de destination charge, o `{}` si el cargo debe ir a la cuenta de
 * la plataforma (Connect apagado, restaurante sin cuenta o sin verificar).
 */
export function buildDestinationChargeParams(params: {
  status: Pick<ConnectStatus, "accountId" | "chargeable" | "platformFeePercent">
  amountCents: number
}): DestinationChargeParams {
  if (!isConnectRoutingEnabled()) return {}
  const { status } = params
  if (!status.chargeable || !status.accountId) return {}
  const result: DestinationChargeParams = {
    transfer_data: { destination: status.accountId },
  }
  const fee = computeApplicationFee(params.amountCents, status.platformFeePercent)
  if (fee > 0) result.application_fee_amount = fee
  return result
}

/** Estado de Connect de un restaurante, leído con el service client. */
export async function getRestaurantConnectStatus(
  supabase: ServiceClient,
  restaurantId: string
): Promise<ConnectStatus | null> {
  const { data, error } = await supabase
    .from("foodos_restaurants")
    .select(
      "stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted, stripe_requirements_due, stripe_onboarded_at, platform_fee_percent"
    )
    .eq("id", restaurantId)
    .maybeSingle()
  if (error || !data) {
    if (error) {
      logger.error("stripe.connect.status_read_failed", {
        restaurant: restaurantId,
        error: error.message,
      })
    }
    return null
  }
  return connectStatusFromRestaurant(
    data as Parameters<typeof connectStatusFromRestaurant>[0]
  )
}

/** Crea la cuenta Express del restaurante y devuelve su `acct_...`. */
export async function createExpressAccountForRestaurant(params: {
  restaurantId: string
  restaurantName: string
  email?: string | null
}): Promise<string> {
  const stripe = getStripe()
  const account = await stripe.accounts.create({
    type: "express",
    country: CONNECT_COUNTRY,
    ...(params.email ? { email: params.email } : {}),
    business_profile: { name: params.restaurantName },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { foodos_restaurant_id: params.restaurantId },
  })
  return account.id
}

/** Link de onboarding alojado por Stripe (caduca; se regenera al volver). */
export async function createConnectOnboardingLink(params: {
  accountId: string
  returnUrl: string
  refreshUrl: string
}): Promise<string> {
  const stripe = getStripe()
  const link = await stripe.accountLinks.create({
    account: params.accountId,
    type: "account_onboarding",
    return_url: params.returnUrl,
    refresh_url: params.refreshUrl,
  })
  return link.url
}

/** Link de un solo uso al panel Express del restaurante. */
export async function createConnectDashboardLink(
  accountId: string
): Promise<string> {
  const stripe = getStripe()
  const link = await stripe.accounts.createLoginLink(accountId)
  return link.url
}

/** Consulta el estado vivo de la cuenta y lo devuelve ya normalizado. */
export async function fetchConnectAccount(
  accountId: string
): Promise<ConnectAccountLike> {
  const stripe = getStripe()
  const account = await stripe.accounts.retrieve(accountId)
  return account as ConnectAccountLike
}

/**
 * Escribe el estado de Connect en `foodos_restaurants`.
 *
 * Empareja por `stripe_account_id` y no por id de restaurante: el webhook
 * `account.updated` sólo trae el `acct_...`. Si la cuenta no está registrada,
 * el UPDATE toca 0 filas y sólo se deja rastro en el log.
 */
export async function syncConnectAccount(
  supabase: ServiceClient,
  snapshot: ConnectSnapshot
): Promise<void> {
  const { error } = await supabase
    .from("foodos_restaurants")
    .update({
      stripe_charges_enabled: snapshot.chargesEnabled,
      stripe_payouts_enabled: snapshot.payoutsEnabled,
      stripe_details_submitted: snapshot.detailsSubmitted,
      stripe_requirements_due: snapshot.requirementsDue,
    })
    .eq("stripe_account_id", snapshot.accountId)

  if (error) {
    logger.error("stripe.connect.sync_failed", {
      account: snapshot.accountId,
      error: error.message,
    })
    return
  }

  // Sello de "primera vez completamente verificado", sólo una vez: la
  // condición va en el WHERE para no reescribirlo en cada evento.
  if (snapshot.chargesEnabled && snapshot.payoutsEnabled && !snapshot.disabledReason) {
    const { error: stampError } = await supabase
      .from("foodos_restaurants")
      .update({ stripe_onboarded_at: new Date().toISOString() })
      .eq("stripe_account_id", snapshot.accountId)
      .is("stripe_onboarded_at", null)
    if (stampError) {
      logger.error("stripe.connect.onboarded_stamp_failed", {
        account: snapshot.accountId,
        error: stampError.message,
      })
    }
  }
}

/** Handler de `account.updated`: refleja el estado de la cuenta en la BD. */
export async function handleConnectAccountUpdated(
  supabase: ServiceClient,
  account: ConnectAccountLike
): Promise<void> {
  const snapshot = connectSnapshotFromAccount(account)
  logger.info("stripe.connect.account_updated", {
    account: snapshot.accountId,
    chargesEnabled: snapshot.chargesEnabled,
    payoutsEnabled: snapshot.payoutsEnabled,
    detailsSubmitted: snapshot.detailsSubmitted,
    requirementsDue: snapshot.requirementsDue.length,
    disabledReason: snapshot.disabledReason,
  })
  await syncConnectAccount(supabase, snapshot)
}
