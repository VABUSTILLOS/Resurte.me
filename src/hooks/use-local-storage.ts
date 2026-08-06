"use client"

import { useState, useEffect, useCallback } from "react"

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

  const [state, setState] = useState<T>(initialValue)

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        setState(JSON.parse(stored))
      }
    } catch {
      // Ignore corrupt entries
    }
  }, [storageKey])

  // Persist to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // Storage full — silently degrade
    }
  }, [storageKey, state])

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey)
      setState(initialValue)
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
}

export function useSharedDishes(collectionSlug?: string | null) {
  return useLocalStorage<SharedDish[]>("shared-dishes", [], collectionSlug)
}
