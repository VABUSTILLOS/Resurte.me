/**
 * Adaptador de punto de venta (Fase 7, nivel Diamante).
 *
 * Define el contrato que cualquier integración de POS debe cumplir y provee el
 * adaptador por omisión. Hoy **todos** los proveedores resuelven a
 * `unimplementedPosAdapter()`: el contrato está completo y probado, el
 * adaptador real es lo único que falta.
 *
 * Reglas del contrato:
 *
 * - Ninguna operación lanza. Todo devuelve un resultado discriminado, porque
 *   quien llama es una sincronización de fondo que no puede tumbar el panel ni
 *   el webhook.
 * - `fetch` se inyecta. Un adaptador real se prueba sin red, y en producción se
 *   le pasa el global. Mismo patrón que la capa de IA y que Uber Direct.
 * - El adaptador **no escribe** en la base. Devuelve datos y la capa de
 *   servidor decide; así la validación de un menú externo es testeable sola.
 */

import {
  POS_DESCRIPTORS,
  checkPosCredentials,
  type PosCredentials,
  type PosProvider,
} from "./registry"

export interface PosDeps {
  fetchImpl?: typeof fetch
  env?: Record<string, string | undefined>
  now?: () => Date
}

// ------------------------------------------------------------
// Menú externo
// ------------------------------------------------------------

/** Un platillo tal como lo entrega el proveedor, ya normalizado. */
export interface PosMenuSnapshotItem {
  externalId: string
  name: string
  description: string | null
  price: number
  category: string | null
  tags: string[]
}

export type PosMenuPullResult =
  | { ok: true; items: PosMenuSnapshotItem[] }
  | { ok: false; code: PosErrorCode; error: string }

export type PosPushResult =
  | { ok: true; externalOrderId: string }
  | { ok: false; code: PosErrorCode; error: string }

export type PosErrorCode =
  | "not_implemented"
  | "needs_credentials"
  | "unreachable"
  | "rejected"

export type PosHealthStatus = "pending" | "needs_credentials" | "ready" | "unreachable"

export interface PosHealth {
  provider: PosProvider
  status: PosHealthStatus
  message: string
}

export interface PosOrderPayload {
  orderId: string
  status: string
  total: number
  items: Array<{ name: string; qty: number; price: number }>
  customerName: string | null
  customerPhone: string | null
  note: string | null
}

export interface PosAdapter {
  provider: PosProvider
  label: string
  validate(credentials: PosCredentials | null | undefined): { ok: boolean; missing: string[] }
  health(credentials: PosCredentials, deps?: PosDeps): Promise<PosHealth>
  pullMenu(credentials: PosCredentials, deps?: PosDeps): Promise<PosMenuPullResult>
  pushOrder(
    credentials: PosCredentials,
    order: PosOrderPayload,
    deps?: PosDeps
  ): Promise<PosPushResult>
}

// ------------------------------------------------------------
// Normalización del menú externo
// ------------------------------------------------------------

const MAX_NAME = 120
const MAX_DESCRIPTION = 400
const MAX_CATEGORY = 80
const MAX_TAGS = 8
const MAX_ITEMS = 500

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function toPrice(value: unknown): number {
  const num = typeof value === "number" ? value : Number(clean(value))
  if (!Number.isFinite(num) || num < 0) return 0
  return Math.round(num * 100) / 100
}

/**
 * Sanea lo que devolvió el proveedor antes de tocar el menú del restaurante.
 *
 * Un POS ajeno puede mandar nombres vacíos, precios negativos o mil doscientos
 * platillos. Se descarta lo inservible en vez de dejar que llegue a la base, y
 * se deduplica por nombre porque `foodos_menu_items` no tiene UNIQUE: sin esto
 * una segunda sincronización duplicaría el menú entero.
 */
export function normalizeMenuSnapshot(raw: unknown): PosMenuSnapshotItem[] {
  if (!Array.isArray(raw)) return []
  const out: PosMenuSnapshotItem[] = []
  const seen = new Set<string>()

  for (const entry of raw) {
    if (out.length >= MAX_ITEMS) break
    if (!entry || typeof entry !== "object") continue
    const item = entry as Record<string, unknown>
    const name = clean(item.name).slice(0, MAX_NAME)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const tags = Array.isArray(item.tags)
      ? item.tags
          .map((tag) => clean(tag))
          .filter(Boolean)
          .slice(0, MAX_TAGS)
      : []

    out.push({
      externalId: clean(item.externalId),
      name,
      description: clean(item.description).slice(0, MAX_DESCRIPTION) || null,
      price: toPrice(item.price),
      category: clean(item.category).slice(0, MAX_CATEGORY) || null,
      tags,
    })
  }

  return out
}

// ------------------------------------------------------------
// Adaptador por omisión: declara lo que falta, no finge
// ------------------------------------------------------------

/**
 * Adaptador de un proveedor sin implementar.
 *
 * `health` responde `pending` siempre, aunque haya credenciales: el dueño ve
 * "en preparación" y no "conectado". `pullMenu`/`pushOrder` devuelven
 * `not_implemented` con el motivo exacto del descriptor, para que el panel lo
 * muestre tal cual.
 */
export function unimplementedPosAdapter(provider: PosProvider): PosAdapter {
  const descriptor = POS_DESCRIPTORS[provider]

  return {
    provider,
    label: descriptor.label,
    validate(credentials) {
      const check = checkPosCredentials(provider, credentials)
      return { ok: check.ok, missing: check.missing }
    },
    async health(): Promise<PosHealth> {
      return {
        provider,
        status: "pending",
        message: descriptor.pendingNote,
      }
    },
    async pullMenu(): Promise<PosMenuPullResult> {
      return { ok: false, code: "not_implemented", error: descriptor.pendingNote }
    },
    async pushOrder(): Promise<PosPushResult> {
      return { ok: false, code: "not_implemented", error: descriptor.pendingNote }
    },
  }
}

export function resolvePosAdapter(provider: PosProvider): PosAdapter {
  // Punto único de extensión: cuando exista un adaptador real, se resuelve aquí
  // y el resto de la fase (validación, almacenamiento, webhook, panel) no cambia.
  return unimplementedPosAdapter(provider)
}
