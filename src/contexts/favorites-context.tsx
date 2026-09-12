"use client"

/**
 * FavoritesProvider / useFavorites — lista de resurtido (♥) del comprador.
 *
 * Invitados: localStorage ("resurte_favorites"). Con sesión: se fusiona por
 * unión con user_favorites (migración 00069) y los toggles se reflejan en
 * ambos lados. La página /[ciudad]/favoritos resuelve los ids a productos
 * vía /api/favorites/resolve.
 *
 * Provider único en el root layout: todas las ProductCard comparten el
 * mismo estado (una sola sesión/fetch por sesión, no uno por tarjeta).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { createClient } from "@/lib/supabase/client"

const STORAGE_KEY = "resurte_favorites"

function readLocal(): number[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n) && n > 0) : []
  } catch {
    return []
  }
}

function writeLocal(ids: number[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // storage no disponible
  }
}

interface FavoritesContextValue {
  ids: number[]
  loaded: boolean
  count: number
  toggle: (productId: number) => void
  isFavorite: (productId: number) => boolean
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<number[]>([])
  const [loaded, setLoaded] = useState(false)

  // Carga inicial: local + (si hay sesión) merge por unión con el servidor.
  useEffect(() => {
    let cancelled = false
    const local = readLocal()
    setIds(local)
    setLoaded(true)

    const supabase = createClient()
    if (!supabase) return

    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.user) return

        const res = await fetch("/api/favorites", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { product_ids?: number[] }
        const serverIds = (data.product_ids ?? []).filter((n) => Number.isInteger(n))
        if (cancelled) return

        const merged = Array.from(new Set([...serverIds, ...local]))
        setIds(merged)
        writeLocal(merged)

        // Subir al servidor los ids que solo existían localmente.
        const missing = local.filter((id) => !serverIds.includes(id))
        for (const id of missing) {
          void fetch("/api/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_id: id }),
          }).catch(() => {})
        }
      } catch {
        // offline: local basta
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const toggle = useCallback((productId: number) => {
    setIds((prev) => {
      const next = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
      writeLocal(next)
      return next
    })
    // Best-effort server sync (no-op para invitados: 401 silencioso).
    void fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId }),
    }).catch(() => {})
  }, [])

  const isFavorite = useCallback((productId: number) => ids.includes(productId), [ids])

  return (
    <FavoritesContext.Provider value={{ ids, loaded, count: ids.length, toggle, isFavorite }}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error("useFavorites must be used within a FavoritesProvider")
  return ctx
}
