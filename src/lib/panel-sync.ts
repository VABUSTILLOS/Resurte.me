"use client"

import { readStored, writeStored } from "@/lib/storage"
import { ensureGuestToken } from "@/lib/guest-address"

/**
 * Estado global de sincronización de las herramientas del panel
 * (localStorage ↔ `panel_entries` vía /api/panel/entries).
 *
 * Store module-level con suscriptores (compatible con
 * `useSyncExternalStore`): cada clave reporta saving/saved/error y el
 * indicador del layout del panel muestra el agregado:
 *   error  > saving > saved > idle
 *
 * También concentra:
 *  - `retryPendingSyncs()`: reintenta los pushes fallidos con el valor
 *    actual de localStorage.
 *  - Prevención de loops para Realtime: `notePushed`/`matchesLastPush`
 *    ignoran eventos que reflejan nuestros propios pushes.
 *  - `applyRemoteEntry`: aplica un cambio remoto (Realtime/polling) al
 *    localStorage y notifica a los hooks montados vía evento "storage".
 */

type PanelSyncState = "idle" | "saving" | "saved" | "error"

export interface PanelSyncSnapshot {
  status: PanelSyncState
  lastSavedAt: number | null
}

interface KeyMeta {
  key: string
  collection: string
  collectionSlug: string | null
}

const statuses = new Map<string, "saving" | "saved" | "error">()
const keyMeta = new Map<string, KeyMeta>()
const lastPushed = new Map<string, { json: string; at: number }>()
const listeners = new Set<() => void>()
// Claves con sync propio (p. ej. panel_rows): su retry no es un PUT a
// /api/panel/entries sino la función registrada por su hook.
const retryHandlers = new Map<string, () => void>()

let lastSavedAt: number | null = null
let cachedSnapshot: PanelSyncSnapshot = { status: "idle", lastSavedAt: null }

// Ventana en la que un evento Realtime cuyo valor es idéntico a nuestro
// último push se considera eco propio y se ignora.
const SELF_PUSH_ECHO_MS = 10_000

function computeSnapshot(): PanelSyncSnapshot {
  let status: PanelSyncState = "idle"
  for (const s of statuses.values()) {
    if (s === "error") {
      status = "error"
      break
    }
    if (s === "saving") status = "saving"
    else if (s === "saved" && status === "idle") status = "saved"
  }
  return { status, lastSavedAt }
}

function notify() {
  const next = computeSnapshot()
  if (next.status === cachedSnapshot.status && next.lastSavedAt === cachedSnapshot.lastSavedAt) return
  cachedSnapshot = next
  listeners.forEach((l) => l())
}

export function subscribePanelSync(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPanelSyncSnapshot(): PanelSyncSnapshot {
  return cachedSnapshot
}

export function registerSyncKey(id: string, meta: KeyMeta) {
  keyMeta.set(id, meta)
}

export function markSaving(id: string) {
  statuses.set(id, "saving")
  notify()
}

export function markSaved(id: string) {
  statuses.set(id, "saved")
  lastSavedAt = Date.now()
  notify()
}

export function markSyncError(id: string) {
  statuses.set(id, "error")
  notify()
}

/** Registra un retry propio para una clave (uso: hooks con sync no-PUT). */
export function registerRetryHandler(id: string, handler: () => void) {
  retryHandlers.set(id, handler)
}

/** Solo para tests: limpia todo el estado del store. */
export function _resetPanelSyncForTests() {
  statuses.clear()
  keyMeta.clear()
  lastPushed.clear()
  retryHandlers.clear()
  lastSavedAt = null
  cachedSnapshot = { status: "idle", lastSavedAt: null }
}

export function notePushed(id: string, value: unknown) {
  lastPushed.set(id, { json: JSON.stringify(value), at: Date.now() })
}

/** true si el valor entrante es el eco de nuestro propio push reciente. */
export function matchesLastPush(id: string, value: unknown): boolean {
  const p = lastPushed.get(id)
  return !!p && Date.now() - p.at < SELF_PUSH_ECHO_MS && p.json === JSON.stringify(value)
}

/** Reintenta el push de todas las claves en error con su valor local actual. */
export function retryPendingSyncs() {
  const token = ensureGuestToken()
  if (!token) return
  for (const [id, s] of statuses) {
    if (s !== "error") continue
    const handler = retryHandlers.get(id)
    if (handler) {
      handler()
      continue
    }
    const meta = keyMeta.get(id)
    if (!meta) continue
    const value = readStored(meta.key, undefined, meta.collectionSlug)
    markSaving(id)
    notePushed(id, value)
    fetch("/api/panel/entries", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ tool: meta.key, collection_slug: meta.collection, value }),
    })
      .then((res) => {
        if (res.ok) markSaved(id)
        else markSyncError(id)
      })
      .catch(() => markSyncError(id))
  }
}

/**
 * Aplica un cambio remoto al localStorage local y despierta a los hooks
 * montados (dispatamos el evento "storage" al que useLocalStorage se
 * suscribe). Devuelve false si era eco de un push propio.
 */
export function applyRemoteEntry(tool: string, collection: string, value: unknown): boolean {
  const id = `${tool}:${collection}`
  if (matchesLastPush(id, value)) return false
  const meta = keyMeta.get(id)
  const collectionSlug = meta ? meta.collectionSlug : collection === "default" ? null : collection
  try {
    writeStored(tool, value, collectionSlug)
    window.dispatchEvent(new Event("storage"))
    return true
  } catch {
    return false
  }
}
