// ============================================================
// Proveedor externo de reparto (Uber Direct) — adaptador.
// ============================================================
// La Flotilla funciona COMPLETA sin proveedor externo: repartidores propios,
// zonas y rastreo por estados. Este adaptador es una capacidad de PLATAFORMA
// (variables de entorno), no por restaurante, igual que el SMS de marketing:
// guardar credenciales de Uber por restaurante obligaría a cifrado por
// inquilino y a un flujo de alta que esta fase no necesita.
//
// Si no hay credenciales, `resolveDeliveryProvider()` devuelve `null` y todo
// sigue operando con flotilla propia. Nada se rompe por no tener Uber.
//
// DECISIÓN: el proveedor externo nunca fija la tarifa que se le cobra al
// comensal. Uber cotiza lo que le cuesta al restaurante; la tarifa del
// comensal sale de `resolveDeliveryFee` (núcleo puro).
// ============================================================

import { logger } from "@/lib/logger"

type Env = Record<string, string | undefined>

export interface DeliveryQuoteInput {
  pickupAddress: string
  dropoffAddress: string
}

export interface DeliveryQuote {
  /** Identificador de la cotización; caduca, así que no se persiste. */
  id: string | null
  /** Lo que cobra el proveedor, en la moneda de la cuenta. */
  fee: number | null
  /** Minutos estimados hasta la entrega. */
  etaMinutes: number | null
}

export interface DeliveryDispatchInput {
  pickupName: string
  pickupAddress: string
  pickupPhone: string
  dropoffName: string
  dropoffAddress: string
  dropoffPhone: string
  dropoffNotes?: string | null
  /** Referencia interna, para conciliar después. */
  externalRef: string
  /** Cotización previa, si la hay; abarata el despacho. */
  quoteId?: string | null
}

export type DeliveryDispatchResult =
  | {
      ok: true
      provider: string
      providerDeliveryId: string | null
      trackingUrl: string | null
      etaMinutes: number | null
      fee: number | null
    }
  | { ok: false; provider: string; error: string }

export type DeliveryCancelResult =
  | { ok: true; provider: string }
  | { ok: false; provider: string; error: string }

export interface DeliveryProvider {
  /** Se persiste en `foodos_deliveries.provider`. */
  readonly id: string
  quote(input: DeliveryQuoteInput): Promise<DeliveryQuote | null>
  dispatch(input: DeliveryDispatchInput): Promise<DeliveryDispatchResult>
  cancel(providerDeliveryId: string): Promise<DeliveryCancelResult>
}

export interface ProviderDeps {
  fetch: typeof fetch
  now: () => number
}

const defaultDeps: ProviderDeps = {
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
}

function envValue(env: Env, key: string): string {
  return (env[key] ?? "").trim()
}

interface UberDirectConfig {
  clientId: string
  clientSecret: string
  customerId: string
  baseUrl: string
  authUrl: string
  timeoutMs: number
}

/**
 * Credenciales de Uber Direct, o `null` si falta cualquiera.
 *
 * Fail-closed a propósito: con credenciales a medias el despacho fallaría en
 * cada entrega, y es mejor saber desde el arranque que no hay proveedor.
 */
export function uberDirectConfig(env: Env = process.env): UberDirectConfig | null {
  if (envValue(env, "UBER_DIRECT_ENABLED").toLowerCase() === "false") return null
  const clientId = envValue(env, "UBER_DIRECT_CLIENT_ID")
  const clientSecret = envValue(env, "UBER_DIRECT_CLIENT_SECRET")
  const customerId = envValue(env, "UBER_DIRECT_CUSTOMER_ID")
  if (!clientId || !clientSecret || !customerId) return null

  const sandbox = envValue(env, "UBER_DIRECT_SANDBOX").toLowerCase() === "true"
  const timeoutRaw = Number(envValue(env, "UBER_DIRECT_TIMEOUT_MS"))
  return {
    clientId,
    clientSecret,
    customerId,
    baseUrl: sandbox ? "https://sandbox-api.uber.com" : "https://api.uber.com",
    authUrl: "https://login.uber.com/oauth/v2/token",
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 12_000,
  }
}

export function isDeliveryProviderConfigured(env: Env = process.env): boolean {
  return uberDirectConfig(env) !== null
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null
  const t = Date.parse(value)
  return Number.isFinite(t) ? value : null
}

/** Minutos hasta `dropoff_eta`, redondeados hacia arriba. */
function minutesUntil(eta: unknown, now: number): number | null {
  const iso = toIsoOrNull(eta)
  if (!iso) return null
  const t = Date.parse(iso)
  const minutes = Math.ceil((t - now) / 60_000)
  return minutes > 0 ? minutes : 0
}

/**
 * Adaptador de Uber Direct con caché de token en memoria.
 *
 * El token se pide una vez por instancia y se reusa hasta poco antes de
 * caducar: pedir token en cada entrega añadiría una llamada de red al camino
 * crítico del despacho.
 */
export function createUberDirectProvider(
  config: UberDirectConfig,
  deps: ProviderDeps = defaultDeps
): DeliveryProvider {
  let token: string | null = null
  let tokenExpiresAt = 0

  async function getToken(force = false): Promise<string | null> {
    const now = deps.now()
    if (!force && token && now < tokenExpiresAt) return token

    try {
      const res = await deps.fetch(config.authUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: "client_credentials",
          scope: "delivery",
        }),
        signal: AbortSignal.timeout(config.timeoutMs),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => "")
        logger.warn("[Flotilla] Uber Direct rechazó las credenciales", {
          status: res.status,
          detail: detail.slice(0, 300),
        })
        return null
      }
      const json = (await res.json().catch(() => null)) as {
        access_token?: string
        expires_in?: number
      } | null
      const accessToken = json?.access_token
      if (!accessToken) return null
      const ttl = toNumber(json?.expires_in) ?? 2_592_000
      token = accessToken
      // 60 s de margen para no usar un token que caduca en vuelo.
      tokenExpiresAt = deps.now() + Math.max(0, ttl - 60) * 1000
      return token
    } catch (err) {
      logger.warn("[Flotilla] No se pudo autenticar con Uber Direct", {
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  async function request(
    path: string,
    init: { method: string; body?: unknown },
    retryOnAuth = true
  ): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; error: string }> {
    const accessToken = await getToken()
    if (!accessToken) return { ok: false, error: "Sin token de Uber Direct" }

    try {
      const res = await deps.fetch(`${config.baseUrl}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(config.timeoutMs),
      })

      // El token pudo caducar antes de tiempo: se reintenta UNA vez.
      if (res.status === 401 && retryOnAuth) {
        token = null
        tokenExpiresAt = 0
        await getToken(true)
        return request(path, init, false)
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => "")
        logger.warn("[Flotilla] Uber Direct rechazó la petición", {
          status: res.status,
          detail: detail.slice(0, 300),
        })
        return { ok: false, error: `Uber Direct ${res.status}` }
      }

      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
      return { ok: true, json: json ?? {} }
    } catch (err) {
      logger.warn("[Flotilla] Falló la llamada a Uber Direct", {
        error: err instanceof Error ? err.message : String(err),
      })
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Error de red",
      }
    }
  }

  const customerPath = `/v1/customers/${encodeURIComponent(config.customerId)}`

  return {
    id: "uber_direct",

    async quote({ pickupAddress, dropoffAddress }): Promise<DeliveryQuote | null> {
      const result = await request(`${customerPath}/delivery_quotes`, {
        method: "POST",
        body: {
          pickup_address: pickupAddress,
          dropoff_address: dropoffAddress,
        },
      })
      if (!result.ok) return null
      return {
        id: typeof result.json.id === "string" ? result.json.id : null,
        fee: toNumber(result.json.fee),
        etaMinutes: minutesUntil(result.json.dropoff_eta, deps.now()),
      }
    },

    async dispatch(input): Promise<DeliveryDispatchResult> {
      const body: Record<string, unknown> = {
        pickup_name: input.pickupName,
        pickup_address: input.pickupAddress,
        pickup_phone_number: input.pickupPhone,
        dropoff_name: input.dropoffName,
        dropoff_address: input.dropoffAddress,
        dropoff_phone_number: input.dropoffPhone,
        external_id: input.externalRef,
      }
      if (input.dropoffNotes?.trim()) body.dropoff_notes = input.dropoffNotes.trim()
      if (input.quoteId) body.quote_id = input.quoteId

      const result = await request(`${customerPath}/deliveries`, { method: "POST", body })
      if (!result.ok) return { ok: false, provider: "uber_direct", error: result.error }

      return {
        ok: true,
        provider: "uber_direct",
        providerDeliveryId:
          typeof result.json.id === "string" ? result.json.id : null,
        trackingUrl:
          typeof result.json.tracking_url === "string" ? result.json.tracking_url : null,
        etaMinutes: minutesUntil(result.json.dropoff_eta, deps.now()),
        fee: toNumber(result.json.fee),
      }
    },

    async cancel(providerDeliveryId): Promise<DeliveryCancelResult> {
      const result = await request(
        `${customerPath}/deliveries/${encodeURIComponent(providerDeliveryId)}/cancel`,
        { method: "POST" }
      )
      if (!result.ok) return { ok: false, provider: "uber_direct", error: result.error }
      return { ok: true, provider: "uber_direct" }
    },
  }
}

/** Proveedor activo, o `null` si no está configurado o está deshabilitado. */
export function resolveDeliveryProvider(
  env: Env = process.env,
  deps: ProviderDeps = defaultDeps
): DeliveryProvider | null {
  const config = uberDirectConfig(env)
  return config ? createUberDirectProvider(config, deps) : null
}
