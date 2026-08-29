"use client"

import { useCallback, useEffect } from "react"
import { readStored, storageKeyFor } from "@/lib/storage"
import { ensureGuestToken } from "@/lib/guest-address"
import { useLocalStorage } from "@/hooks/use-local-storage"
import {
  applyRemoteEntry,
  markSaving,
  markSaved,
  markSyncError,
  notePushed,
  registerSyncKey,
} from "@/lib/panel-sync"

/**
 * Estado persistente con respaldo en Supabase (tabla `panel_entries`,
 * ruta `/api/panel/entries`, migración 00055). Drop-in de
 * `useLocalStorage`: misma tupla [valor, set, clear].
 *
 * localStorage sigue siendo el cache inmediato; este hook además:
 *  - Al montar (una vez por clave y sesión): descarga el valor del
 *    servidor. Si el servidor tiene datos, ganan (multi-dispositivo);
 *    si el servidor no tiene nada y hay datos locales, los sube
 *    (migración desde la era localStorage-only).
 *  - En cada set/clear: escribe localStorage de inmediato y programa un
 *    push debounced al servidor (misma identidad: sesión o guest_token).
 *
 * Sync best-effort: si falla la red o la BD, localStorage conserva el
 * estado y el próximo cambio reintenta.
 */

const PUSH_DEBOUNCE_MS = 800

const pushTimers = new Map<string, ReturnType<typeof setTimeout>>()
// Dedupe de pulls: cada (clave de storage) se descarga una sola vez por
// sesión aunque el hook se monte en varias páginas/componentes.
const pulledKeys = new Set<string>()

function schedulePush(tool: string, collection: string, token: string, value: unknown) {
  const id = `${tool}:${collection}`
  clearTimeout(pushTimers.get(id))
  markSaving(id)
  pushTimers.set(
    id,
    setTimeout(() => {
      pushTimers.delete(id)
      notePushed(id, value)
      fetch("/api/panel/entries", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-guest-token": token },
        body: JSON.stringify({ tool, collection_slug: collection, value }),
      })
        .then((res) => {
          if (res.ok) markSaved(id)
          else markSyncError(id)
        })
        .catch(() => {
          // Sync es best-effort; localStorage sigue siendo la fuente inmediata.
          markSyncError(id)
        })
    }, PUSH_DEBOUNCE_MS),
  )
}

/**
 * Re-descarga todas las claves registradas (fallback de multi-dispositivo
 * para guests sin Realtime y recuperación tras reconexión). Omite claves
 * con un pull en vuelo.
 */
const pullingKeys = new Set<string>()

export function refreshSyncedKeys() {
  const token = ensureGuestToken()
  if (!token) return
  pulledKeys.forEach((storageKey) => {
    if (pullingKeys.has(storageKey)) return
    const meta = syncKeyMeta.get(storageKey)
    if (!meta) return
    pullingKeys.add(storageKey)
    fetch(`/api/panel/entries?tool=${encodeURIComponent(meta.key)}&collection=${encodeURIComponent(meta.collection)}`, {
      headers: { "x-guest-token": token },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { found?: boolean; value?: unknown }) => {
        if (data.found) applyRemoteEntry(meta.key, meta.collection, data.value)
      })
      .catch(() => {
        // Offline: conservar estado local.
      })
      .finally(() => pullingKeys.delete(storageKey))
  })
}

// storageKey → info para re-pulls (refreshSyncedKeys) y para saber el
// collectionSlug al aplicar cambios remotos de claves no montadas.
const syncKeyMeta = new Map<string, { key: string; collection: string; collectionSlug: string | null }>()

export function useSyncedStorage<T>(
  key: string,
  initialValue: T,
  collectionSlug?: string | null,
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const [value, setLocal, clearLocal] = useLocalStorage<T>(key, initialValue, collectionSlug)
  const collection = collectionSlug || "default"
  const storageKey = storageKeyFor(key, collectionSlug)

  useEffect(() => {
    const id = `${key}:${collection}`
    registerSyncKey(id, { key, collection, collectionSlug: collectionSlug ?? null })
    syncKeyMeta.set(storageKey, { key, collection, collectionSlug: collectionSlug ?? null })
    if (pulledKeys.has(storageKey)) return
    pulledKeys.add(storageKey)
    const token = ensureGuestToken()
    if (!token) return
    let cancelled = false
    fetch(`/api/panel/entries?tool=${encodeURIComponent(key)}&collection=${encodeURIComponent(collection)}`, {
      headers: { "x-guest-token": token },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { found?: boolean; value?: unknown }) => {
        if (cancelled) return
        if (data.found) {
          // Setter crudo (useLocalStorage): no re-dispara el push.
          setLocal(data.value as T)
        } else {
          // Servidor vacío: subir los datos locales si difieren del default.
          const local = readStored<T>(key, initialValue, collectionSlug)
          if (JSON.stringify(local) !== JSON.stringify(initialValue)) {
            schedulePush(key, collection, token, local)
          }
        }
      })
      .catch(() => {
        // Offline o BD caída: localStorage sigue funcionando.
      })
    return () => {
      cancelled = true
    }
    // Solo al montar / cambiar de colección; value y setters se leen del storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  const setAndSync = useCallback(
    (next: T | ((prev: T) => T)) => {
      setLocal(next)
      const token = ensureGuestToken()
      if (!token) return
      const resolved = next instanceof Function ? next(readStored<T>(key, initialValue, collectionSlug)) : next
      schedulePush(key, collection, token, resolved)
    },
    [setLocal, key, collection, collectionSlug, initialValue],
  )

  const clearAndSync = useCallback(() => {
    clearLocal()
    const token = ensureGuestToken()
    if (token) schedulePush(key, collection, token, initialValue)
  }, [clearLocal, key, collection, initialValue])

  return [value, setAndSync, clearAndSync]
}
