"use client"

import { useSyncExternalStore } from "react"
import { createClient } from "@/lib/supabase/client"
import { sanitizeStoredBumps, type LocalBumpsSnapshot } from "@/lib/bumps-sync"
import type { SelectedBump } from "@/components/checkout/BumpCards"

/** Evento global que notifica la selección de bumps entre consumidores de la
 *  misma pestaña (drawer móvil, /cart, /{ciudad}/carrito y MobileCartBar). */
const BUMPS_CHANGED_EVENT = "resurte:bumps-changed"

/** Clave de localStorage con la selección persistida en este dispositivo. */
const BUMPS_STORAGE_KEY = "resurte_bumps"

/** Clave legacy (sessionStorage) que transportaba los bumps entre /cart y
 *  /checkout. Se migra a localStorage en la primera lectura y se descarta. */
const LEGACY_BUMPS_STORAGE_KEY = "resurte:selected-bumps"

/** Debounce del push al servidor (mismo ritmo que el carrito). */
const PUSH_DEBOUNCE_MS = 1500

/** Snapshot constante para SSR e hidratación (evita el mismatch #418: el HTML
 *  del servidor siempre se genera sin bumps y se re-renderiza tras el mount). */
const EMPTY_BUMPS: SelectedBump[] = []

// ---------------------------------------------------------------------------
// Store (module-level)
// ---------------------------------------------------------------------------

let snapshot: SelectedBump[] = EMPTY_BUMPS
/** epoch ms del último cambio local; null = sin cambios en este dispositivo. */
let localUpdatedAt: number | null = null
let hydratedFromStorage = false
let clientListenersReady = false
const listeners = new Set<() => void>()

let pushTimer: ReturnType<typeof setTimeout> | null = null
/** JSON del último estado empujado al servidor (dedupe de pushes). */
let lastPushed: string | null = null

/** Sesión detectada: sin ella no se empuja ni se hidrata nada. */
let hasSession = false
let hydrationState: "idle" | "inflight" | "done" = "idle"
let authSubscribed = false

function notify() {
  for (const listener of listeners) listener()
  try {
    window.dispatchEvent(
      new CustomEvent(BUMPS_CHANGED_EVENT, { detail: { bumps: snapshot } })
    )
  } catch {
    // no-op: el evento es solo un canal de notificación adicional
  }
}

// ---------------------------------------------------------------------------
// Persistencia local
// ---------------------------------------------------------------------------

function writeLocalSnapshot(bumps: SelectedBump[], updatedAt: number) {
  try {
    window.localStorage.setItem(BUMPS_STORAGE_KEY, JSON.stringify({ bumps, updatedAt }))
  } catch {
    // no-op: la selección vive solo en memoria
  }
}

function readLocalSnapshot(): LocalBumpsSnapshot {
  if (typeof window === "undefined") return { bumps: [], updatedAt: null }

  try {
    const raw = window.localStorage.getItem(BUMPS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { bumps?: unknown; updatedAt?: unknown }
      const bumps = sanitizeStoredBumps(parsed?.bumps)
      if (bumps) {
        return {
          bumps,
          updatedAt:
            typeof parsed?.updatedAt === "number" && Number.isFinite(parsed.updatedAt)
              ? parsed.updatedAt
              : null,
        }
      }
    }
  } catch {
    // almacenamiento no disponible o JSON corrupto → se intenta el legacy
  }

  // Migración desde sessionStorage: la selección de la pestaña actual pasa a
  // ser la de este dispositivo, marcada como reciente para que gane el merge
  // (si estaba vacía no hay nada que migrar).
  try {
    const legacyRaw = window.sessionStorage.getItem(LEGACY_BUMPS_STORAGE_KEY)
    const legacy = legacyRaw ? sanitizeStoredBumps(JSON.parse(legacyRaw)) : null
    if (legacy && legacy.length > 0) {
      const updatedAt = Date.now()
      writeLocalSnapshot(legacy, updatedAt)
      window.sessionStorage.removeItem(LEGACY_BUMPS_STORAGE_KEY)
      return { bumps: legacy, updatedAt }
    }
  } catch {
    // no-op: sin legacy utilizable
  }

  return { bumps: [], updatedAt: null }
}

// ---------------------------------------------------------------------------
// Sincronización con el servidor
// ---------------------------------------------------------------------------

async function pushBumps(bumps: SelectedBump[], keepalive = false): Promise<void> {
  // `lastPushed` guarda el JSON del ARREGLO (no del body): es lo que comparan
  // `schedulePush`/`flushBumps` contra `JSON.stringify(snapshot)` para no
  // re-empujar una selección que el servidor ya tiene.
  lastPushed = JSON.stringify(bumps)
  try {
    await fetch("/api/cart/bumps/selection", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bumps }),
      keepalive,
    })
  } catch {
    // No es fatal: el próximo cambio reintenta. La selección sigue local.
  }
}

function schedulePush() {
  if (!hasSession) return
  if (JSON.stringify(snapshot) === lastPushed) return
  if (pushTimer !== null) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void pushBumps(snapshot)
  }, PUSH_DEBOUNCE_MS)
}

/**
 * Vuelca la selección pendiente sin esperar el debounce. Se usa en
 * `pagehide`/`visibilitychange` (con `keepalive`) para no perder el último
 * cambio si el usuario cierra la pestaña o se va del sitio.
 */
export function flushBumps(): void {
  if (pushTimer !== null) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
  if (!hasSession) return
  if (JSON.stringify(snapshot) === lastPushed) return
  void pushBumps(snapshot, true)
}

function commit(
  bumps: SelectedBump[],
  updatedAt: number,
  opts: { persist?: boolean; push?: boolean } = {}
) {
  snapshot = bumps
  localUpdatedAt = updatedAt
  if (opts.persist !== false) writeLocalSnapshot(bumps, updatedAt)
  notify()
  if (opts.push !== false) schedulePush()
}

/** Reconcilia el snapshot local con el del servidor (merge last-write-wins). */
async function hydrateFromServer(): Promise<void> {
  if (!hasSession || hydrationState !== "idle") return
  hydrationState = "inflight"

  // Si el usuario cambia la selección mientras la petición está en vuelo, su
  // cambio es posterior y no debe ser pisado por la respuesta.
  const sentUpdatedAt = localUpdatedAt
  const sentBumps = snapshot

  try {
    const res = await fetch("/api/cart/bumps/hydrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bumps: sentBumps, updatedAt: sentUpdatedAt }),
    })
    if (!res.ok) return

    const data = (await res.json()) as {
      bumps?: unknown
      updated_at?: string | null
      source?: string
    }
    hydrationState = "done"

    if (data.source !== "server") return
    if (localUpdatedAt !== sentUpdatedAt || snapshot !== sentBumps) return

    const bumps = sanitizeStoredBumps(data.bumps ?? [])
    if (!bumps || bumps.length === 0) return

    const serverTs = data.updated_at ? Date.parse(data.updated_at) : NaN
    commit(bumps, Number.isNaN(serverTs) ? Date.now() : serverTs, { persist: true })
    lastPushed = JSON.stringify(bumps)
  } catch {
    // Sin red: se mantiene la selección local; el próximo cambio la empuja.
  } finally {
    if (hydrationState === "inflight") hydrationState = "idle"
  }
}

function initSession() {
  if (authSubscribed) return
  authSubscribed = true
  try {
    const supabase = createClient()
    if (!supabase) return
    supabase.auth.onAuthStateChange((event, session) => {
      hasSession = Boolean(session?.user)
      if (event === "SIGNED_OUT") {
        hydrationState = "idle"
        lastPushed = null
        return
      }
      if (hasSession) void hydrateFromServer()
    })
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        hasSession = Boolean(data.session?.user)
        if (hasSession) return hydrateFromServer()
      })
      .catch(() => {
        // sin sesión detectable: la selección queda local
      })
  } catch {
    // cliente no disponible: la selección queda local
  }
}

// ---------------------------------------------------------------------------
// Store API
// ---------------------------------------------------------------------------

function ensureClientListeners() {
  if (clientListenersReady || typeof window === "undefined") return
  clientListenersReady = true

  // Otra pestaña cambió la selección: se adopta sin re-empujar (la pestaña
  // origen ya lo hizo) para no entrar en ping-pong.
  window.addEventListener("storage", (e) => {
    if (e.key !== BUMPS_STORAGE_KEY) return
    const local = readLocalSnapshot()
    commit(local.bumps, local.updatedAt ?? Date.now(), { persist: false, push: false })
  })

  window.addEventListener("pagehide", flushBumps)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushBumps()
  })

  initSession()
}

function ensureHydratedFromStorage() {
  if (hydratedFromStorage || typeof window === "undefined") return
  hydratedFromStorage = true
  const local = readLocalSnapshot()
  localUpdatedAt = local.updatedAt
  if (local.bumps.length > 0) snapshot = local.bumps
}

/**
 * Actualiza la selección de bumps (replace-all). Acepta un array o un updater
 * sobre el estado actual, igual que un `setState` de React.
 */
export function setSelectedBumps(
  next: SelectedBump[] | ((prev: SelectedBump[]) => SelectedBump[])
) {
  ensureHydratedFromStorage()
  const value = typeof next === "function" ? next(snapshot) : next
  if (value === snapshot) return
  commit(value, Date.now())
}

function subscribe(listener: () => void) {
  ensureHydratedFromStorage()
  ensureClientListeners()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): SelectedBump[] {
  return snapshot
}

function getServerSnapshot(): SelectedBump[] {
  return EMPTY_BUMPS
}

/** Limpia el estado del store (solo para tests). */
export function resetBumpsStore() {
  snapshot = EMPTY_BUMPS
  localUpdatedAt = null
  hydratedFromStorage = false
  lastPushed = null
  hasSession = false
  hydrationState = "idle"
  if (pushTimer !== null) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
  listeners.clear()
}

/** Lee los bumps persistidos en este dispositivo.
 *  Retorna [] si no hay datos o el almacenamiento no está disponible. */
export function readStoredBumps(): SelectedBump[] {
  return readLocalSnapshot().bumps
}

/**
 * Selección compartida de order bumps (mecánica ThriveCart).
 *
 * Fuente única para /cart, /{ciudad}/carrito, el drawer del carrito, el
 * checkout y su drawer: todos leen el mismo store, así que agregar una oferta
 * en cualquier superficie se refleja en las demás sin re-montar.
 *
 * Persistencia (paridad con el carrito):
 *  1. localStorage (`resurte_bumps`) → sobrevive recargas y cerrar la pestaña.
 *  2. Con sesión, push debounced a `PUT /api/cart/bumps/selection` (más
 *     `keepalive` al salir de la página) → sobrevive cambiar de dispositivo.
 *
 * SSR/hidratación: `getServerSnapshot` devuelve siempre [] para que el HTML
 * del servidor no dependa de localStorage (sin mismatch #418); el snapshot
 * real se carga en el primer subscribe, tras el mount.
 */
export function useSelectedBumps() {
  const selectedBumps = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return { selectedBumps, setSelectedBumps }
}
