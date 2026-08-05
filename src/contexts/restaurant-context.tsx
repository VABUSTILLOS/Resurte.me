"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import type { RestaurantCollection } from "@/types"

interface RestaurantContextType {
  selectedCollection: RestaurantCollection | null
  setSelectedCollection: (c: RestaurantCollection | null) => void
  collections: RestaurantCollection[]
  setCollections: (c: RestaurantCollection[]) => void
}

const RestaurantContext = createContext<RestaurantContextType | null>(null)

const STORAGE_KEY = "resurte-restaurant-type"

export function RestaurantProvider({ children }: { children: ReactNode }) {
  const [collections, setCollections] = useState<RestaurantCollection[]>([])
  const [selectedCollection, setSelectedCollectionState] = useState<RestaurantCollection | null>(null)

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as RestaurantCollection
        setSelectedCollectionState(parsed)
      }
    } catch { /* ignore */ }
  }, [])

  const setSelectedCollection = useCallback((c: RestaurantCollection | null) => {
    setSelectedCollectionState(c)
    if (c) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
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
