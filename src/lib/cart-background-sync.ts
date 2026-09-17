/**
 * Fase W10 — background sync del carrito.
 *
 * El carrito local (localStorage) siempre es la fuente visible, pero cuando el
 * usuario tiene sesión también se sube a `user_carts` con un push debounced
 * (`src/contexts/cart-context.tsx`). Si ese push falla porque no hay red, el
 * snapshot se queda sin subir hasta que el usuario vuelva a tocar el carrito.
 *
 * Aquí vive la parte pura de la solución: qué snapshot encolar, cuándo es
 * legítimo encolarlo (fallo de red, no un 4xx que se repetiría para siempre),
 * cuánto tiempo se puede reintentar y cómo validar lo que devuelve IndexedDB.
 * La parte con efectos (IndexedDB en el cliente y el handler `sync` del service
 * worker) está en `src/lib/cart-sync-queue.ts` y `public/sw.js`.
 *
 * IMPORTANTE: `public/sw.js` no puede importar módulos de `src/`, así que
 * duplica el tag, el nombre de la base y el store. `cart-background-sync.test.ts`
 * lee ese archivo y falla si los valores se desincronizan.
 */

import type { AppliedCoupon, CartItem } from "@/types"

/** Tag de Background Sync. Debe coincidir con `public/sw.js`. */
export const CART_SYNC_TAG = "resurte-cart-sync"

/** Base IndexedDB del cliente. Debe coincidir con `public/sw.js`. */
export const CART_SYNC_DB_NAME = "resurte-offline"

/** Object store donde vive el snapshot pendiente. Debe coincidir con `public/sw.js`. */
export const CART_SYNC_STORE = "cart-sync"

/** Clave del único registro pendiente (el último snapshot gana). */
export const CART_SYNC_KEY = "pending"

/** Endpoint que consume el service worker. Debe coincidir con `public/sw.js`. */
export const CART_SYNC_URL = "/api/cart"

/**
 * Tope de vida de un snapshot encolado. Pasado este tiempo el carrito ya no
 * representa la intención del usuario (pudo comprar en otro dispositivo o
 * vaciarlo), así que se descarta en vez de resucitarlo.
 */
export const CART_SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000

export interface CartSyncPayload {
  items: CartItem[]
  coupon: AppliedCoupon | null
}

export interface QueuedCartSync {
  payload: CartSyncPayload
  /** epoch ms en que se encoló; sirve para descartar snapshots viejos */
  queuedAt: number
}

/** Motivo por el que un push no llegó al servidor. */
export interface CartPushFailure {
  /** `fetch` lanzó (sin red, DNS, abortado) */
  threw?: boolean
  /** Código HTTP cuando sí hubo respuesta */
  status?: number
}

export function buildCartSyncEntry(
  items: CartItem[],
  coupon: AppliedCoupon | null,
  now: number
): QueuedCartSync {
  return { payload: { items, coupon }, queuedAt: now }
}

/**
 * Encolar solo tiene sentido cuando el fallo es de transporte o del servidor.
 * Un 4xx (sesión expirada, payload inválido) se repetiría idéntico para
 * siempre, así que no se encola.
 */
export function shouldQueueCartSync(failure: CartPushFailure): boolean {
  if (failure.threw === true) return true
  const status = failure.status
  if (typeof status !== "number") return false
  return status >= 500
}

/** Un snapshot encolado sigue siendo útil si es reciente y no está vacío. */
export function isCartSyncEntryUsable(entry: QueuedCartSync | null, now: number): boolean {
  if (!entry) return false
  if (entry.payload.items.length === 0) return false
  if (!Number.isFinite(entry.queuedAt)) return false
  if (now - entry.queuedAt > CART_SYNC_MAX_AGE_MS) return false
  return true
}

/**
 * ¿Vale la pena que el service worker mande este snapshot? Se descarta lo
 * caducado y lo vacío; el carrito vacío no se sube porque borrar el del
 * servidor es una decisión del usuario, no un efecto de la reconexión.
 */
export function shouldFlushCartSync(entry: QueuedCartSync | null, now: number): boolean {
  return isCartSyncEntryUsable(entry, now)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseCoupon(value: unknown): AppliedCoupon | null {
  if (!isRecord(value)) return null
  const { code, discount_type, discount_value, min_order } = value
  if (typeof code !== "string" || code.length === 0) return null
  if (discount_type !== "percentage" && discount_type !== "fixed_amount") return null
  if (typeof discount_value !== "number" || !Number.isFinite(discount_value)) return null
  return {
    code,
    discount_type,
    discount_value,
    min_order: typeof min_order === "number" && Number.isFinite(min_order) ? min_order : 0,
  }
}

/**
 * Valida lo que sale de IndexedDB. IndexedDB acepta cualquier cosa y el store
 * puede sobrevivir a un cambio de esquema, así que un registro corrupto se
 * trata como ausente en vez de romper el flush.
 */
export function parseCartSyncEntry(raw: unknown): QueuedCartSync | null {
  if (!isRecord(raw)) return null
  const queuedAt = raw.queuedAt
  if (typeof queuedAt !== "number" || !Number.isFinite(queuedAt)) return null
  const payload = raw.payload
  if (!isRecord(payload)) return null
  const items = payload.items
  if (!Array.isArray(items)) return null
  return {
    queuedAt,
    payload: {
      items: items as CartItem[],
      coupon: parseCoupon(payload.coupon),
    },
  }
}

export function serializeCartSyncEntry(entry: QueuedCartSync): string {
  return JSON.stringify(entry)
}

/** Cuerpo exacto del `PUT /api/cart`; el service worker manda lo mismo. */
export function cartSyncBody(payload: CartSyncPayload): string {
  return JSON.stringify({ items: payload.items, coupon: payload.coupon })
}

/**
 * Resultado de intentar registrar el Background Sync. Safari/iOS no implementa
 * la API, así que "unsupported" no es un error: ahí el respaldo es el evento
 * `online` del cliente (ver `src/lib/cart-sync-queue.ts`).
 */
export type CartSyncRegistrationResult = "registered" | "unsupported" | "failed"
