"use client"

import { readStored, writeStored } from "@/lib/storage"
import { ensureGuestToken } from "@/lib/guest-address"

/**
 * Estado global de sincronización de las herramientas del panel
 * (localStorage ↔ `panel_entries` vía /api/panel/entries).
 *
 * Store module-level con suscriptores (compatible con
 * `useSyncExternalStore`): cada clave reporta saving/saved/conflict/error y el
 * indicador del layout del panel muestra el agregado:
 *   error  > saving > conflict > saved > idle
 *
 * También concentra:
 *  - `retryPendingSyncs()`: reintenta los pushes fallidos con el valor
 *    actual de localStorage.
 *  - Prevención de loops para Realtime: `notePushed`/`matchesLastPush`
 *    ignoran eventos que reflejan nuestros propios pushes.
 *  - `applyRemoteEntry`: aplica un cambio remoto (Realtime/polling) al
 *    localStorage y notifica a los hooks montados vía evento "storage".
 */

type PanelSyncState = "idle" | "saving" | "saved" | "conflict" | "error"

/**
 * Cómo se resolvió el último choque con otro dispositivo.
 *
 * `merged`: se combinaron ambos lados por identidad de elemento, no se
 * perdió nada. `kept-local`: no había identidad (o los tipos no coinciden),
 * así que se conservó lo local y **lo del otro dispositivo no está en
 * pantalla** — es el aviso que más importa.
 */
export type ConflictKind = "merged" | "kept-local"

export interface PanelSyncSnapshot {
  status: PanelSyncState
  lastSavedAt: number | null
  /** Solo tiene valor cuando `status === "conflict"`. */
  conflict: ConflictKind | null
}

interface KeyMeta {
  key: string
  collection: string
  collectionSlug: string | null
}

const statuses = new Map<string, "saving" | "saved" | "conflict" | "error">()
const conflictKinds = new Map<string, ConflictKind>()
// Versión (`updated_at`) conocida de cada entrada. Es el token que el
// servidor compara para detectar que este dispositivo escribe sobre una
// base obsoleta: si se omite, el push sobrescribe sin preguntar.
const entryVersions = new Map<string, string>()
const keyMeta = new Map<string, KeyMeta>()
const lastPushed = new Map<string, { json: string; at: number }>()
const listeners = new Set<() => void>()
// Claves con sync propio (p. ej. panel_rows): su retry no es un PUT a
// /api/panel/entries sino la función registrada por su hook.
const retryHandlers = new Map<string, () => void>()

let lastSavedAt: number | null = null
let cachedSnapshot: PanelSyncSnapshot = { status: "idle", lastSavedAt: null, conflict: null }

// Ventana en la que un evento Realtime cuyo valor es idéntico a nuestro
// último push se considera eco propio y se ignora.
const SELF_PUSH_ECHO_MS = 10_000

function computeSnapshot(): PanelSyncSnapshot {
  let status: PanelSyncState = "idle"
  let conflict: ConflictKind | null = null
  for (const [id, s] of statuses) {
    if (s === "error") {
      status = "error"
      break
    }
    if (s === "saving") {
      status = "saving"
    } else if (s === "conflict") {
      if (status === "idle" || status === "saved") status = "conflict"
      const kind = conflictKinds.get(id) ?? "merged"
      // `kept-local` gana: dice que falta información en pantalla.
      if (kind === "kept-local" || conflict === null) conflict = kind
    } else if (s === "saved" && status === "idle") {
      status = "saved"
    }
  }
  // El tipo solo tiene sentido mientras el agregado sea un conflicto.
  if (status !== "conflict") conflict = null
  return { status, lastSavedAt, conflict }
}

function notify() {
  const next = computeSnapshot()
  if (
    next.status === cachedSnapshot.status &&
    next.lastSavedAt === cachedSnapshot.lastSavedAt &&
    next.conflict === cachedSnapshot.conflict
  )
    return
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
  conflictKinds.delete(id)
  lastSavedAt = Date.now()
  notify()
}

export function markSyncError(id: string) {
  statuses.set(id, "error")
  conflictKinds.delete(id)
  notify()
}

/**
 * Otro dispositivo escribió sobre la misma clave y la base local ya era
 * obsoleta. `kind` dice qué se hizo con los dos valores.
 */
export function markConflict(id: string, kind: ConflictKind) {
  statuses.set(id, "conflict")
  conflictKinds.set(id, kind)
  notify()
}

/**
 * El usuario vio el aviso de choque y lo descartó. La clave sale del agregado
 * en vez de marcarse `saved`: no sabemos si su valor llegó al servidor, y
 * afirmarlo sería una mentira del indicador.
 */
export function clearConflicts() {
  let touched = false
  for (const [id, s] of statuses) {
    if (s !== "conflict") continue
    statuses.delete(id)
    conflictKinds.delete(id)
    touched = true
  }
  if (touched) notify()
}

/** Guarda la versión (`updated_at`) vigente de una entrada. */
export function noteEntryVersion(id: string, updatedAt: string) {
  entryVersions.set(id, updatedAt)
}

/**
 * Versión sobre la que este dispositivo construyó su valor. `null` cuando
 * todavía no la conoce (primer push de una clave que el servidor no tenía):
 * en ese caso el servidor no puede detectar una base obsoleta, que es
 * exactamente lo correcto, porque no hay nada que pueda haber cambiado.
 */
export function getEntryVersion(id: string): string | null {
  return entryVersions.get(id) ?? null
}

/** Registra un retry propio para una clave (uso: hooks con sync no-PUT). */
export function registerRetryHandler(id: string, handler: () => void) {
  retryHandlers.set(id, handler)
}

/** Solo para tests: limpia todo el estado del store. */
export function _resetPanelSyncForTests() {
  statuses.clear()
  conflictKinds.clear()
  entryVersions.clear()
  keyMeta.clear()
  lastPushed.clear()
  retryHandlers.clear()
  lastSavedAt = null
  cachedSnapshot = { status: "idle", lastSavedAt: null, conflict: null }
}

export function notePushed(id: string, value: unknown) {
  lastPushed.set(id, { json: JSON.stringify(value), at: Date.now() })
}

/** true si el valor entrante es el eco de nuestro propio push reciente. */
export function matchesLastPush(id: string, value: unknown): boolean {
  const p = lastPushed.get(id)
  return !!p && Date.now() - p.at < SELF_PUSH_ECHO_MS && p.json === JSON.stringify(value)
}

/**
 * Reintenta el push de todas las claves en error o en conflicto con su valor
 * local actual. Manda la versión conocida para que un 409 vuelva a detectarse
 * en vez de sobrescribir a ciegas.
 */
export function retryPendingSyncs() {
  const token = ensureGuestToken()
  if (!token) return
  for (const [id, s] of statuses) {
    if (s !== "error" && s !== "conflict") continue
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
      body: JSON.stringify({
        tool: meta.key,
        collection_slug: meta.collection,
        value,
        base_updated_at: getEntryVersion(id),
      }),
    })
      .then(async (res) => {
        const data =
          res.ok || res.status === 409
            ? ((await res.json().catch(() => null)) as { updated_at?: string | null } | null)
            : null
        // La versión se guarda en ambos casos: en un 409 es la del servidor y
        // es la base correcta para el siguiente intento.
        if (data?.updated_at) noteEntryVersion(id, data.updated_at)
        if (res.ok) markSaved(id)
        else if (res.status === 409) markConflict(id, "kept-local")
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
