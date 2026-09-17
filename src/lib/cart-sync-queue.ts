/**
 * Fase W10 — puente entre el carrito y el Background Sync.
 *
 * Este módulo es el único que toca IndexedDB desde el cliente. El service
 * worker (`public/sw.js`) lee el mismo store desde su propio contexto, así que
 * las constantes de nombre/tag viven en `cart-background-sync.ts` y una prueba
 * de contrato verifica que `public/sw.js` no se haya desincronizado.
 *
 * Todo es tolerante a fallos: si IndexedDB no está disponible (modo privado de
 * Safari, cuota agotada) el carrito sigue funcionando solo con localStorage.
 */

import {
  CART_SYNC_DB_NAME,
  CART_SYNC_KEY,
  CART_SYNC_STORE,
  CART_SYNC_TAG,
  buildCartSyncEntry,
  parseCartSyncEntry,
  serializeCartSyncEntry,
  shouldQueueCartSync,
  type CartPushFailure,
  type CartSyncRegistrationResult,
  type QueuedCartSync,
} from "@/lib/cart-background-sync"
import type { AppliedCoupon, CartItem } from "@/types"

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== "undefined"
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CART_SYNC_DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CART_SYNC_STORE)) db.createObjectStore(CART_SYNC_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("indexeddb-open-failed"))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest
): Promise<T | null> {
  if (!canUseIndexedDb()) return null
  let db: IDBDatabase
  try {
    db = await openDb()
  } catch {
    return null
  }
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(CART_SYNC_STORE, mode)
      const request = run(tx.objectStore(CART_SYNC_STORE))
      tx.oncomplete = () => resolve((request.result as T) ?? null)
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb-tx-failed"))
      tx.onabort = () => reject(tx.error ?? new Error("indexeddb-tx-aborted"))
    })
  } catch {
    return null
  } finally {
    db.close()
  }
}

/** Guarda el snapshot pendiente (el último gana) y pide un Background Sync. */
export async function queueCartSync(
  items: CartItem[],
  coupon: AppliedCoupon | null,
  now: number = Date.now()
): Promise<CartSyncRegistrationResult> {
  const entry = buildCartSyncEntry(items, coupon, now)
  await withStore("readwrite", (store) => store.put(serializeCartSyncEntry(entry), CART_SYNC_KEY))
  return registerCartBackgroundSync()
}

/** Lee el snapshot pendiente, validándolo contra un registro corrupto. */
export async function readCartSyncEntry(): Promise<QueuedCartSync | null> {
  const raw = await withStore<unknown>("readonly", (store) => store.get(CART_SYNC_KEY))
  if (typeof raw !== "string") return null
  try {
    return parseCartSyncEntry(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Borra el snapshot pendiente (se subió o ya no aplica). */
export async function clearCartSyncEntry(): Promise<void> {
  await withStore("readwrite", (store) => store.delete(CART_SYNC_KEY))
}

/**
 * Punto de entrada del push fallido: encola solo si el fallo es reintentable y
 * hay algo que subir.
 */
export async function handleCartPushFailure(
  items: CartItem[],
  coupon: AppliedCoupon | null,
  failure: CartPushFailure
): Promise<void> {
  if (items.length === 0) return
  if (!shouldQueueCartSync(failure)) return
  await queueCartSync(items, coupon)
}

/**
 * Registra el Background Sync si el navegador lo soporta. `serviceWorker.ready`
 * nunca resuelve si no hay SW registrado (dev, preview), así que se acota con
 * un timeout para no dejar promesas colgadas.
 */
export async function registerCartBackgroundSync(
  timeoutMs = 3000
): Promise<CartSyncRegistrationResult> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return "unsupported"
  try {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])
    if (!registration) return "failed"
    const sync = (registration as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> }
    }).sync
    if (!sync) return "unsupported"
    await sync.register(CART_SYNC_TAG)
    return "registered"
  } catch {
    return "failed"
  }
}
