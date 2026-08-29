"use client"

import { useCallback, useEffect } from "react"
import { readStored, storageKeyFor, writeStored } from "@/lib/storage"
import { ensureGuestToken } from "@/lib/guest-address"
import { uid } from "@/lib/ids"
import { useLocalStorage } from "@/hooks/use-local-storage"
import {
  applyRemoteEntry,
  markSaving,
  markSaved,
  markSyncError,
  registerSyncKey,
  registerRetryHandler,
} from "@/lib/panel-sync"

/**
 * Estado persistente POR FILA para las listas del panel de alto volumen
 * (ventas, mermas, movimientos de inventario) — tabla `panel_rows`,
 * ruta `/api/panel/rows`, migración 00057. Misma tupla que
 * `useSyncedStorage`/`useLocalStorage`: [valor, set, clear].
 *
 * A diferencia de useSyncedStorage (replace-all, cap 256 KB), aquí cada
 * entidad viaja como fila con `client_id` idempotente y en `set` solo
 * se suben/borran las filas que cambiaron (diff por id). La migración
 * desde panel_entries es transparente en el servidor.
 *
 * Los elementos deben ser objetos; a los que no traen `id` se les
 * asigna uno estable al primer set (StockMovement no tenía id).
 */

const PUSH_DEBOUNCE_MS = 800

interface RowsMeta {
  key: string
  collection: string
  collectionSlug: string | null
}

const pushTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pulledKeys = new Set<string>()
const pullingKeys = new Set<string>()
const rowsMeta = new Map<string, RowsMeta>()
// storageKey → (client_id → JSON de la fila) tal como está en el servidor.
// La diff de cada set se calcula contra este mapa y se actualiza al
// confirmarse el push.
const syncedRows = new Map<string, Map<string, string>>()

const DATE_RE = /^\d{4}-\d{2}-\d{2}/

function extractEntryDate(row: unknown): string | null {
  if (typeof row !== "object" || row === null) return null
  const r = row as Record<string, unknown>
  const raw = typeof r.date === "string" ? r.date : typeof r.fecha === "string" ? r.fecha : null
  return raw && DATE_RE.test(raw) ? raw.slice(0, 10) : null
}

function withId<T extends { id?: string }>(row: T): T & { id: string } {
  if (typeof row.id === "string" && row.id) return row as T & { id: string }
  return { ...row, id: uid("row") }
}

function rowsCache(storageKey: string): Map<string, string> {
  let cache = syncedRows.get(storageKey)
  if (!cache) {
    cache = new Map()
    syncedRows.set(storageKey, cache)
  }
  return cache
}

async function fetchRowsPage(
  key: string,
  collection: string,
  token: string,
  cursor: string | null,
): Promise<{ found: boolean; rows: unknown[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ tool: key, collection })
  if (cursor) params.set("cursor", cursor)
  const res = await fetch(`/api/panel/rows?${params.toString()}`, {
    headers: { "x-guest-token": token },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { found?: boolean; rows?: unknown[]; nextCursor?: string }
  return { found: !!data.found, rows: data.rows ?? [], nextCursor: data.nextCursor ?? null }
}

/** Descarga todas las páginas de la clave. null si la clave no existe en el servidor. */
async function pullAllRows(
  key: string,
  collection: string,
  token: string,
): Promise<{ id?: string }[] | null> {
  const all: { id?: string }[] = []
  let cursor: string | null = null
  for (;;) {
    const page = await fetchRowsPage(key, collection, token, cursor)
    if (!page.found) return null
    all.push(...(page.rows as { id?: string }[]))
    if (!page.nextCursor) return all
    cursor = page.nextCursor
  }
}

function syncRowsCacheFromArray(storageKey: string, rows: { id?: string }[]) {
  const cache = rowsCache(storageKey)
  cache.clear()
  for (const row of rows) {
    if (typeof row.id === "string" && row.id) cache.set(row.id, JSON.stringify(row))
  }
}

/** Sube al servidor las filas locales (migración inicial local → servidor). */
async function pushInitialRows(
  storageKey: string,
  key: string,
  collection: string,
  collectionSlug: string | null,
  token: string,
): Promise<void> {
  const id = `${key}:${collection}`
  const local = readStored<{ id?: string }[]>(key, [], collectionSlug)
  if (!Array.isArray(local) || local.length === 0) return
  const rows = local.map(withId)
  markSaving(id)
  try {
    const res = await fetch("/api/panel/rows", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({
        tool: key,
        collection_slug: collection,
        rows: rows.map((r) => ({ client_id: r.id, entry_date: extractEntryDate(r), data: r })),
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    // Persistir los ids asignados para que futuras diffs sean estables.
    writeStored(key, rows, collectionSlug)
    window.dispatchEvent(new Event("storage"))
    syncRowsCacheFromArray(storageKey, rows)
    markSaved(id)
  } catch {
    markSyncError(id)
  }
}

/** Envía al servidor la diff entre localStorage y syncedRows. */
async function pushDiff(storageKey: string, meta: RowsMeta, token: string): Promise<void> {
  const id = `${meta.key}:${meta.collection}`
  const local = readStored<{ id?: string }[]>(meta.key, [], meta.collectionSlug)
  const rows = Array.isArray(local) ? local.filter((r) => typeof r?.id === "string" && r.id) : []
  const cache = rowsCache(storageKey)

  const upserts: { client_id: string; entry_date: string | null; data: unknown }[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const rowId = row.id as string
    seen.add(rowId)
    const json = JSON.stringify(row)
    if (cache.get(rowId) !== json) {
      upserts.push({ client_id: rowId, entry_date: extractEntryDate(row), data: row })
    }
  }
  const deletes = [...cache.keys()].filter((cid) => !seen.has(cid))
  if (upserts.length === 0 && deletes.length === 0) {
    markSaved(id)
    return
  }

  try {
    const base = { "Content-Type": "application/json", "x-guest-token": token }
    if (upserts.length > 0) {
      const res = await fetch("/api/panel/rows", {
        method: "POST",
        headers: base,
        body: JSON.stringify({ tool: meta.key, collection_slug: meta.collection, rows: upserts }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    }
    if (deletes.length > 0) {
      const res = await fetch("/api/panel/rows", {
        method: "DELETE",
        headers: base,
        body: JSON.stringify({ tool: meta.key, collection_slug: meta.collection, client_ids: deletes }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    }
    for (const u of upserts) cache.set(u.client_id, JSON.stringify(u.data))
    for (const d of deletes) cache.delete(d)
    markSaved(id)
  } catch {
    // Best-effort: localStorage conserva el estado; el retry recalcula la diff.
    markSyncError(id)
  }
}

function scheduleRowsSync(storageKey: string, meta: RowsMeta, token: string) {
  const id = `${meta.key}:${meta.collection}`
  clearTimeout(pushTimers.get(id))
  markSaving(id)
  pushTimers.set(
    id,
    setTimeout(() => {
      pushTimers.delete(id)
      void pushDiff(storageKey, meta, token)
    }, PUSH_DEBOUNCE_MS),
  )
}

/** Re-descarga todas las claves por fila (fallback multi-dispositivo / reconexión). */
export function refreshSyncedRowKeys() {
  const token = ensureGuestToken()
  if (!token) return
  pulledKeys.forEach((storageKey) => {
    if (pullingKeys.has(storageKey)) return
    const meta = rowsMeta.get(storageKey)
    if (!meta) return
    pullingKeys.add(storageKey)
    pullAllRows(meta.key, meta.collection, token)
      .then((rows) => {
        if (rows === null) return
        syncRowsCacheFromArray(storageKey, rows)
        applyRemoteEntry(meta.key, meta.collection, rows)
      })
      .catch(() => {
        // Offline: conservar estado local.
      })
      .finally(() => pullingKeys.delete(storageKey))
  })
}

export function useSyncedRows<T extends { id?: string }>(
  key: string,
  initialValue: T[],
  collectionSlug?: string | null,
): [T[], (value: T[] | ((prev: T[]) => T[])) => void, () => void] {
  const [value, setLocal, clearLocal] = useLocalStorage<T[]>(key, initialValue, collectionSlug)
  const collection = collectionSlug || "default"
  const storageKey = storageKeyFor(key, collectionSlug)

  useEffect(() => {
    const id = `${key}:${collection}`
    registerSyncKey(id, { key, collection, collectionSlug: collectionSlug ?? null })
    rowsMeta.set(storageKey, { key, collection, collectionSlug: collectionSlug ?? null })
    registerRetryHandler(id, () => {
      const token = ensureGuestToken()
      const meta = rowsMeta.get(storageKey)
      if (token && meta) void pushDiff(storageKey, meta, token)
    })
    if (pulledKeys.has(storageKey)) return
    pulledKeys.add(storageKey)
    const token = ensureGuestToken()
    if (!token) return
    let cancelled = false
    pullAllRows(key, collection, token)
      .then((rows) => {
        if (cancelled) return
        if (rows !== null) {
          syncRowsCacheFromArray(storageKey, rows)
          setLocal(rows as T[])
        } else {
          // Servidor vacío: subir los datos locales si difieren del default.
          const local = readStored<T[]>(key, initialValue, collectionSlug)
          if (Array.isArray(local) && JSON.stringify(local) !== JSON.stringify(initialValue)) {
            void pushInitialRows(storageKey, key, collection, collectionSlug ?? null, token)
          }
        }
      })
      .catch(() => {
        // Offline o BD caída: localStorage sigue funcionando.
      })
    return () => {
      cancelled = true
    }
    // Solo al montar / cambiar de colección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  const setAndSync = useCallback(
    (next: T[] | ((prev: T[]) => T[])) => {
      const resolved = next instanceof Function ? next(readStored<T[]>(key, initialValue, collectionSlug)) : next
      const rows = (Array.isArray(resolved) ? resolved : []).map((r) => withId(r)) as T[]
      setLocal(rows)
      const token = ensureGuestToken()
      if (!token) return
      scheduleRowsSync(storageKey, { key, collection, collectionSlug: collectionSlug ?? null }, token)
    },
    [setLocal, key, collection, collectionSlug, initialValue, storageKey],
  )

  const clearAndSync = useCallback(() => {
    clearLocal()
    const token = ensureGuestToken()
    if (!token) return
    const id = `${key}:${collection}`
    const cache = rowsCache(storageKey)
    const ids = [...cache.keys()]
    markSaving(id)
    fetch("/api/panel/rows", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-guest-token": token },
      body: JSON.stringify({ tool: key, collection_slug: collection, client_ids: ids }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        cache.clear()
        markSaved(id)
      })
      .catch(() => markSyncError(id))
  }, [clearLocal, key, collection, storageKey])

  return [value, setAndSync, clearAndSync]
}
