"use client"

import { useState, useEffect, useCallback } from "react"
import { BUMPS_STORAGE_KEY, type SelectedBump } from "@/components/checkout/BumpCards"

/** Evento global que sincroniza la selección de bumps entre consumidores
 *  (drawer móvil, /cart, /{ciudad}/carrito y MobileCartBar) en la misma pestaña. */
export const BUMPS_CHANGED_EVENT = "resurte:bumps-changed"

/** Lee los bumps persistidos en sessionStorage (clave compartida con /cart).
 *  Retorna [] si no hay datos o el almacenamiento no está disponible. */
export function readStoredBumps(): SelectedBump[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.sessionStorage.getItem(BUMPS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SelectedBump[]) : []
  } catch {
    return []
  }
}

/**
 * Selección compartida de order bumps (mecánica ThriveCart).
 *
 * Persiste en sessionStorage (clave compartida con /cart y /{ciudad}/carrito)
 * y emite BUMPS_CHANGED_EVENT para que todos los consumidores de la misma
 * pestaña se sincronicen en tiempo real (p. ej. la MobileCartBar actualiza su
 * total sin re-montar). Retrocompatible: si no hay bumps, devuelve un array
 * vacío y el flujo estándar no cambia.
 */
export function useSelectedBumps() {
  const [selectedBumps, setSelectedBumps] = useState<SelectedBump[]>(readStoredBumps)

  const updateBumps = useCallback((next: SelectedBump[]) => {
    setSelectedBumps(next)
    try {
      window.sessionStorage.setItem(BUMPS_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // no-op: la selección vive solo en memoria
    }
    window.dispatchEvent(new CustomEvent(BUMPS_CHANGED_EVENT, { detail: { bumps: next } }))
  }, [])

  // Escucha cambios emitidos por otros consumidores (misma pestaña).
  useEffect(() => {
    const handler = (e: Event) => {
      const bumps = (e as CustomEvent<{ bumps: SelectedBump[] }>).detail?.bumps
      if (Array.isArray(bumps)) setSelectedBumps(bumps)
    }
    window.addEventListener(BUMPS_CHANGED_EVENT, handler)
    return () => window.removeEventListener(BUMPS_CHANGED_EVENT, handler)
  }, [])

  return { selectedBumps, setSelectedBumps: updateBumps }
}
