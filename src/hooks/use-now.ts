"use client"

import { useSyncExternalStore } from "react"

/**
 * Reloj compartido con UN solo intervalo global (30s por defecto).
 * Cada suscriptor se re-renderiza solo a sí mismo cuando el reloj avanza,
 * en vez de elevar el tick al árbol completo.
 */

const TICK_MS = 30_000

const listeners = new Set<() => void>()
let interval: ReturnType<typeof setInterval> | null = null
let current = Date.now()

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  if (!interval) {
    interval = setInterval(() => {
      current = Date.now()
      listeners.forEach((l) => l())
    }, TICK_MS)
  }
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0 && interval) {
      clearInterval(interval)
      interval = null
    }
  }
}

const getSnapshot = () => current
const getServerSnapshot = () => current

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
