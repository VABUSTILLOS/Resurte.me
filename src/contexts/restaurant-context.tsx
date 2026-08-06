"use client"

import { createContext, useContext, useState, useCallback, useSyncExternalStore, type ReactNode } from "react"
import type { RestaurantCollection } from "@/types"

interface RestaurantContextType {
  selectedCollection: RestaurantCollection | null
  setSelectedCollection: (c: RestaurantCollection | null) => void
  collections: RestaurantCollection[]
  setCollections: (c: RestaurantCollection[]) => void
}

const RestaurantContext = createContext<RestaurantContextType | null>(null)

const STORAGE_KEY = "resurte-restaurant-type"

// Cache the parsed value so getSnapshot returns a stable reference.
let cachedKey: string | null | undefined
let cachedCollection: RestaurantCollection | null = null

function getStoredCollection(): RestaurantCollection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw !== cachedKey) {
      cachedKey = raw
      try {
        cachedCollection = raw ? (JSON.parse(raw) as RestaurantCollection) : null
      } catch {
        cachedCollection = null
      }
    }
    return cachedCollection
  } catch {
    return null
  }
}

function subscribeToStorage(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange)
  return () => window.removeEventListener("storage", onStoreChange)
}

// Always null on the server so SSR and hydration stay in sync.
const getServerSnapshot = () => null

export function RestaurantProvider({ children }: { children: ReactNode }) {
  const [collections, setCollections] = useState<RestaurantCollection[]>([])
  const selectedCollection = useSyncExternalStore(
    subscribeToStorage,
    getStoredCollection,
    getServerSnapshot,
  )

  const setSelectedCollection = useCallback((c: RestaurantCollection | null) => {
    try {
      if (c) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch { /* ignore */ }
    // Mirror changes to other open tabs (and this provider's snapshot).
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }))
  }, [])

  return (
    <RestaurantContext.Provider value={{ selectedCollection, setSelectedCollection, collections, setCollections }}>
      {children}
    </RestaurantContext.Provider>
  )
}

export function useRestaurant() {
  const ctx = useContext(RestaurantContext)
  if (!ctx) throw new Error("useRestaurant must be used within RestaurantProvider")
  return ctx
}
