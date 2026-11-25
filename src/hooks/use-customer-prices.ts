"use client"

import { useSyncExternalStore } from "react"
import { createClient } from "@/lib/supabase/client"

/**
 * Precios especiales del cliente con sesión (Ola 5, 00234).
 *
 * Store de módulo de SOLO LECTURA: la verdad vive en
 * `customer_product_prices` y llega por GET /api/customer-prices
 * (la sesión viaja en la cookie; el endpoint solo devuelve los
 * precios del dueño de la sesión). Sin sesión el mapa es vacío
 * y toda la tienda pinta el precio público de siempre.
 *
 * Lo consumen la tarjeta y la ficha (muestran «Tu precio» y lo
 * fijan en la línea al agregar) y el CartProvider (reaplica el
 * precio a las líneas ya cargadas cuando la sesión aparece,
 * cambia o desaparece). El servidor recalcula en el checkout:
 * este mapa solo pinta y propone.
 */

const EMPTY_PRICES: ReadonlyMap<number, number> = new Map()

let snapshot: ReadonlyMap<number, number> = EMPTY_PRICES
const listeners = new Set<() => void>()
let started = false
let sessionUserId: string | null = null
let loadSeq = 0

function notify() {
  for (const listener of listeners) listener()
}

function setSnapshot(next: ReadonlyMap<number, number>) {
  if (next.size === snapshot.size) {
    let same = true
    for (const [k, v] of next) {
      if (snapshot.get(k) !== v) {
        same = false
        break
      }
    }
    if (same) return
  }
  snapshot = next
  notify()
}

async function loadPrices() {
  const seq = ++loadSeq
  try {
    const res = await fetch("/api/customer-prices", { cache: "no-store" })
    if (!res.ok) return
    const data = (await res.json()) as {
      prices?: Array<{ product_id: number; price: number }>
    }
    if (seq !== loadSeq) return // llegó una carga más nueva
    const next = new Map<number, number>()
    for (const row of data.prices ?? []) {
      const price = Number(row.price)
      if (Number.isInteger(row.product_id) && Number.isFinite(price) && price > 0) {
        next.set(row.product_id, price)
      }
    }
    setSnapshot(next)
  } catch {
    // Sin red o sin endpoint: se vende al precio público.
  }
}

function ensureStarted() {
  if (started) return
  started = true
  const supabase = createClient()
  if (!supabase) return
  void supabase.auth.getSession().then(({ data }) => {
    sessionUserId = data.session?.user?.id ?? null
    if (sessionUserId) void loadPrices()
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    const nextUserId = session?.user?.id ?? null
    if (nextUserId === sessionUserId) return
    sessionUserId = nextUserId
    if (nextUserId) {
      void loadPrices()
    } else {
      loadSeq += 1 // invalida cualquier carga en vuelo del usuario anterior
      setSnapshot(EMPTY_PRICES)
    }
  })
}

function subscribe(listener: () => void): () => void {
  ensureStarted()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Mapa product_id → precio especial del cliente con sesión (vacío para invitados). */
export function useCustomerPrices(): ReadonlyMap<number, number> {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY_PRICES
  )
}

/** El precio especial de UN producto, o null si el cliente no tiene. */
export function useCustomerPrice(productId: number): number | null {
  const prices = useCustomerPrices()
  return prices.get(productId) ?? null
}
