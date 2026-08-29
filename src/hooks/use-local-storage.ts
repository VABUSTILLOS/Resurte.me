"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"
import { clearStored, normalizeStored, readStored, storageKeyFor, writeStored } from "@/lib/storage"
import { ensureGuestToken } from "@/lib/guest-address"

// Cache parsed values keyed by storage key so getSnapshot returns a
// referentially stable snapshot between renders (required by
// useSyncExternalStore to avoid infinite re-renders).
const snapshotCache = new Map<string, { raw: string | null; value: unknown }>()

/**
 * Persistent state hook backed by localStorage.
 * Keys are automatically scoped by restaurant collection slug so
 * different restaurant types get isolated storage.
 * Keys registradas en src/lib/storage pasan por validación de forma y
 * migración de versión (self-healing); el resto conserva el parse legacy.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  collectionSlug?: string | null,
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const storageKey = storageKeyFor(key, collectionSlug)

  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener("storage", onStoreChange)
    return () => window.removeEventListener("storage", onStoreChange)
  }, [])

  const getSnapshot = useCallback((): T => {
    try {
      const raw = localStorage.getItem(storageKey)
      const cached = snapshotCache.get(storageKey)
      if (cached && cached.raw === raw) return cached.value as T
      const value = readStored<T>(key, initialValue, collectionSlug)
      snapshotCache.set(storageKey, { raw, value })
      return value
    } catch {
      return initialValue
    }
  }, [storageKey, key, initialValue, collectionSlug])

  // On the server (SSR/SSG) there is no localStorage, so the snapshot is
  // the initial value — keeps hydration output in sync.
  const getServerSnapshot = useCallback((): T => initialValue, [initialValue])

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Self-healing: reescribe data legacy/corrupta una vez tras montar.
  useEffect(() => {
    normalizeStored(key, collectionSlug)
  }, [key, collectionSlug])

  const setState = useCallback(
    (value: T | ((prev: T) => T)) => {
      const next = value instanceof Function ? value(state) : value
      try {
        writeStored(key, next, collectionSlug)
        snapshotCache.set(storageKey, { raw: localStorage.getItem(storageKey), value: next })
        // The native storage event only fires in other tabs; dispatch one
        // locally so this tab re-renders with the new snapshot.
        window.dispatchEvent(new Event("storage"))
      } catch {
        // Storage full — silently degrade
      }
    },
    [storageKey, key, collectionSlug, state],
  )

  const clear = useCallback(() => {
    try {
      clearStored(key, collectionSlug)
      snapshotCache.set(storageKey, { raw: null, value: initialValue })
      window.dispatchEvent(new Event("storage"))
    } catch {
      // Ignore
    }
  }, [storageKey, key, collectionSlug, initialValue])

  return [state, setState, clear]
}

/**
 * Cross-tool shared state: dishes created in Costeo are readable by
 * Planificador and Rentabilidad. Stored under a well-known key.
 */
export interface SharedDish {
  id: string
  name: string
  ingredients: { ingredientName: string; quantity: number; unit: string; unitPrice: number }[]
  foodCostPercent: number
  sellingPrice: number
  modificadores?: { id: string; nombre: string; precio: number }[]
}

const SHARED_DISHES_KEY = "shared-dishes"

/**
 * Push de la lista completa al servidor con debounce por colección.
 * Best-effort: si falla (offline, rate limit) localStorage conserva el
 * estado y el próximo cambio reintenta.
 */
const dishesPushTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleDishesPush(collection: string, token: string, dishes: SharedDish[]) {
  clearTimeout(dishesPushTimers.get(collection))
  dishesPushTimers.set(
    collection,
    setTimeout(() => {
      dishesPushTimers.delete(collection)
      fetch("/api/panel/dishes", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-guest-token": token },
        body: JSON.stringify({ collection_slug: collection, dishes }),
      }).catch(() => {
        // Sync es best-effort; localStorage sigue siendo la fuente inmediata.
      })
    }, 800),
  )
}

/**
 * Platillos compartidos del panel con persistencia en BD (panel_dishes).
 *
 * localStorage sigue siendo el cache inmediato; este hook además:
 *  - Al montar: descarga los platillos del dueño. Si el servidor tiene
 *    datos, estos ganan (multi-dispositivo); si está vacío y hay datos
 *    locales, los sube (migración desde la era localStorage-only).
 *  - En cada set: escribe localStorage de inmediato y programa un push
 *    debounced al servidor (misma identidad: sesión o guest_token).
 */
export function useSharedDishes(
  collectionSlug?: string | null,
): [SharedDish[], (value: SharedDish[] | ((prev: SharedDish[]) => SharedDish[])) => void, () => void] {
  const [dishes, setDishes, clearDishes] = useLocalStorage<SharedDish[]>(SHARED_DISHES_KEY, [], collectionSlug)
  const collection = collectionSlug || "default"

  useEffect(() => {
    const token = ensureGuestToken()
    if (!token) return
    let cancelled = false
    fetch(`/api/panel/dishes?collection=${encodeURIComponent(collection)}`, {
      headers: { "x-guest-token": token },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { dishes?: SharedDish[] }) => {
        if (cancelled || !Array.isArray(data.dishes)) return
        if (data.dishes.length > 0) {
          // Setter crudo: no debe re-diparar el push.
          setDishes(data.dishes)
        } else {
          const local = readStored<SharedDish[]>(SHARED_DISHES_KEY, [], collectionSlug)
          if (local.length > 0) scheduleDishesPush(collection, token, local)
        }
      })
      .catch(() => {
        // Offline o BD caída: localStorage sigue funcionando.
      })
    return () => {
      cancelled = true
    }
    // Solo al montar / cambiar de colección; dishes y setters se leen del storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection])

  const setAndSync = useCallback(
    (value: SharedDish[] | ((prev: SharedDish[]) => SharedDish[])) => {
      setDishes(value)
      const token = ensureGuestToken()
      if (!token) return
      const next =
        value instanceof Function
          ? value(readStored<SharedDish[]>(SHARED_DISHES_KEY, [], collectionSlug))
          : value
      scheduleDishesPush(collection, token, next)
    },
    [setDishes, collection, collectionSlug],
  )

  const clearAndSync = useCallback(() => {
    clearDishes()
    const token = ensureGuestToken()
    if (token) scheduleDishesPush(collection, token, [])
  }, [clearDishes, collection])

  return [dishes, setAndSync, clearAndSync]
}
