"use client"

import { useCallback, useSyncExternalStore } from "react"

// Cache parsed values keyed by storage key so getSnapshot returns a
// referentially stable snapshot between renders (required by
// useSyncExternalStore to avoid infinite re-renders).
const snapshotCache = new Map<string, { raw: string | null; value: unknown }>()

/**
 * Persistent state hook backed by localStorage.
 * Keys are automatically scoped by restaurant collection slug so
 * different restaurant types get isolated storage.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  collectionSlug?: string | null,
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const storageKey = collectionSlug
    ? `resurte-${key}-${collectionSlug}`
    : `resurte-${key}`

  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener("storage", onStoreChange)
    return () => window.removeEventListener("storage", onStoreChange)
  }, [])

  const getSnapshot = useCallback((): T => {
    try {
      const raw = localStorage.getItem(storageKey)
      const cached = snapshotCache.get(storageKey)
      if (cached && cached.raw === raw) return cached.value as T
      const value = raw != null ? (JSON.parse(raw) as T) : initialValue
      snapshotCache.set(storageKey, { raw, value })
      return value
    } catch {
      return initialValue
    }
  }, [storageKey, initialValue])

  // On the server (SSR/SSG) there is no localStorage, so the snapshot is
  // the initial value — keeps hydration output in sync.
  const getServerSnapshot = useCallback((): T => initialValue, [initialValue])

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setState = useCallback(
    (value: T | ((prev: T) => T)) => {
      const next = value instanceof Function ? value(state) : value
      try {
        const raw = JSON.stringify(next)
        localStorage.setItem(storageKey, raw)
        snapshotCache.set(storageKey, { raw, value: next })
        // The native storage event only fires in other tabs; dispatch one
        // locally so this tab re-renders with the new snapshot.
        window.dispatchEvent(new Event("storage"))
      } catch {
        // Storage full — silently degrade
      }
    },
    [storageKey, state],
  )

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey)
      snapshotCache.set(storageKey, { raw: null, value: initialValue })
      window.dispatchEvent(new Event("storage"))
    } catch {
      // Ignore
    }
  }, [storageKey, initialValue])

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

export function useSharedDishes(collectionSlug?: string | null) {
  return useLocalStorage<SharedDish[]>("shared-dishes", [], collectionSlug)
}
