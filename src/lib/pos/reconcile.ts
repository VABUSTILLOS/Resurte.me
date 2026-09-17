/**
 * Reconciliación con el punto de venta (Fase 7, nivel Diamante).
 *
 * Núcleo **puro**: traduce el vocabulario de estados de cada proveedor al de
 * FoodOS y decide qué hacer con cada evento entrante. No escribe nada.
 *
 * Dos reglas que no se negocian:
 *
 * 1. **Un pedido no retrocede.** Si el POS avisa "en preparación" después de
 *    que FoodOS ya lo marcó "entregado", se ignora. Un webhook reentregado o
 *    desordenado no puede reabrir un pedido ya cerrado y volver a notificar al
 *    comensal.
 * 2. **Un pedido cancelado no resucita.** La cancelación gana sobre cualquier
 *    avance posterior; solo se admite si el pedido no está ya entregado.
 */

import type { FoodosOrderStatus } from "@/types/foodos"
import type { PosMenuSnapshotItem } from "./adapter"
import { POS_PROVIDERS, type PosProvider } from "./registry"

/** Orden de avance. `cancelled` queda fuera a propósito: es terminal. */
export const ORDER_RANK: Record<Exclude<FoodosOrderStatus, "cancelled">, number> = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  out_for_delivery: 3,
  delivered: 4,
}

/**
 * Vocabulario de estados de cada proveedor.
 *
 * Se listan las variantes que usan en la práctica, incluidas las de pago (Clip
 * y Mercado Pago solo saben de cobros, así que su "aprobado" equivale a un
 * pedido confirmado, no a uno entregado).
 */
export const EXTERNAL_STATUS_MAP: Record<PosProvider, Record<string, FoodosOrderStatus>> = {
  soft_restaurant: {
    open: "confirmed",
    sent: "confirmed",
    in_kitchen: "preparing",
    ready: "preparing",
    on_route: "out_for_delivery",
    closed: "delivered",
    void: "cancelled",
    cancelled: "cancelled",
  },
  parrot: {
    new: "confirmed",
    accepted: "confirmed",
    preparation: "preparing",
    prepared: "preparing",
    delivered: "delivered",
    canceled: "cancelled",
    cancelado: "cancelled",
  },
  ncr_aloha: {
    open: "confirmed",
    in_progress: "preparing",
    ready: "preparing",
    closed: "delivered",
    voided: "cancelled",
  },
  toast: {
    OPEN: "confirmed",
    PREPARING: "preparing",
    READY_FOR_PICKUP: "preparing",
    OUT_FOR_DELIVERY: "out_for_delivery",
    COMPLETED: "delivered",
    VOIDED: "cancelled",
  },
  clip: {
    approved: "confirmed",
    refunded: "cancelled",
    declined: "cancelled",
    charged_back: "cancelled",
  },
  mercado_pago: {
    approved: "confirmed",
    in_process: "confirmed",
    refunded: "cancelled",
    rejected: "cancelled",
    cancelled: "cancelled",
    charged_back: "cancelled",
  },
}

/**
 * Índice en minúsculas de cada vocabulario.
 *
 * Se construye una vez porque los proveedores no son consistentes ni entre
 * ellos ni consigo mismos: Toast manda `OPEN` en mayúsculas y Clip manda
 * `approved` en minúsculas. Buscar solo por la clave declarada dejaría fuera
 * la mitad de los avisos reales.
 */
const STATUS_INDEX: Record<PosProvider, Record<string, FoodosOrderStatus>> = Object.fromEntries(
  POS_PROVIDERS.map((provider) => [
    provider,
    Object.fromEntries(
      Object.entries(EXTERNAL_STATUS_MAP[provider]).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ])
    ),
  ])
) as Record<PosProvider, Record<string, FoodosOrderStatus>>

/**
 * Traduce un estado externo. Devuelve `null` si el proveedor no lo declara:
 * un estado desconocido se ignora, nunca se adivina.
 */
export function mapPosOrderStatus(
  provider: PosProvider,
  external: unknown
): FoodosOrderStatus | null {
  const value = typeof external === "string" ? external.trim() : ""
  if (!value) return null
  return STATUS_INDEX[provider][value.toLowerCase()] ?? null
}

export type ReconcileAction = "ignore" | "advance" | "cancel"

export interface ReconcilePlan {
  action: ReconcileAction
  /** Estado al que hay que mover el pedido. Ausente si la acción es `ignore`. */
  next?: FoodosOrderStatus
  /** Motivo legible. Se guarda en la bitácora y se muestra en el panel. */
  reason: string
}

/**
 * Decide qué hacer con un estado externo dado el estado local.
 *
 * Función total: cualquier combinación produce un plan. Quien llama nunca tiene
 * que decidir por su cuenta si "esto se aplica".
 */
export function planOrderReconcile(
  current: FoodosOrderStatus,
  incoming: FoodosOrderStatus | null
): ReconcilePlan {
  if (!incoming) {
    return { action: "ignore", reason: "El proveedor reportó un estado que no reconocemos" }
  }
  if (incoming === current) {
    return { action: "ignore", reason: "El pedido ya estaba en ese estado" }
  }
  if (current === "cancelled") {
    return { action: "ignore", reason: "El pedido está cancelado y no se reabre" }
  }
  if (incoming === "cancelled") {
    if (current === "delivered") {
      return { action: "ignore", reason: "Un pedido entregado no se puede cancelar" }
    }
    return { action: "cancel", next: "cancelled", reason: "El proveedor canceló el pedido" }
  }
  if (current === "delivered") {
    return { action: "ignore", reason: "El pedido ya se entregó" }
  }
  if (ORDER_RANK[incoming] <= ORDER_RANK[current]) {
    return { action: "ignore", reason: "Un pedido no retrocede de estado" }
  }
  return { action: "advance", next: incoming, reason: `El proveedor reportó ${incoming}` }
}

// ------------------------------------------------------------
// Reconciliación de menú
// ------------------------------------------------------------

export interface LocalMenuItem {
  id: string
  name: string
  price: number
  description: string | null
}

export interface MenuSyncPlan {
  created: PosMenuSnapshotItem[]
  updated: Array<{ id: string; item: PosMenuSnapshotItem }>
  unchanged: string[]
  /**
   * Platillos que existen en FoodOS y no en la instantánea del proveedor.
   * **Nunca se borran solos**: puede ser que el proveedor no exporte las
   * categorías completas, o que el dueño haya agregado algo a mano. Se
   * informan para que él decida.
   */
  onlyLocally: string[]
}

const money = (value: number) => Math.round(value * 100) / 100

/**
 * Compara el menú local con la instantánea del proveedor.
 *
 * La coincidencia es por nombre normalizado (minúsculas y espacios colapsados):
 * es lo único estable entre dos sistemas que no comparten identificadores.
 */
export function planMenuSync(
  local: LocalMenuItem[],
  snapshot: PosMenuSnapshotItem[]
): MenuSyncPlan {
  const byName = new Map<string, LocalMenuItem>()
  for (const item of local) {
    const key = item.name.trim().toLowerCase().replace(/\s+/g, " ")
    if (!key || byName.has(key)) continue
    byName.set(key, item)
  }

  const plan: MenuSyncPlan = { created: [], updated: [], unchanged: [], onlyLocally: [] }
  const matched = new Set<string>()

  for (const item of snapshot) {
    const key = item.name.trim().toLowerCase().replace(/\s+/g, " ")
    const existing = byName.get(key)
    if (!existing) {
      plan.created.push(item)
      continue
    }
    matched.add(key)
    const priceChanged = money(existing.price) !== money(item.price)
    const descriptionChanged = (existing.description ?? "") !== (item.description ?? "")
    if (priceChanged || descriptionChanged) {
      plan.updated.push({ id: existing.id, item })
    } else {
      plan.unchanged.push(existing.id)
    }
  }

  for (const [key, item] of byName) {
    if (!matched.has(key)) plan.onlyLocally.push(item.id)
  }

  return plan
}
