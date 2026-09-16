/**
 * Sincronización de order bumps: merge local (localStorage) ↔ servidor
 * (`user_carts.bumps`) y validación de forma del payload persistido.
 *
 * Mismo criterio que `mergeCarts` (last-write-wins por timestamp), con una
 * diferencia clave: una selección local VACÍA con timestamp más reciente es un
 * estado válido e intencional (el usuario quitó todas las ofertas), así que se
 * sube al servidor en lugar de tratarse como "sin datos". Sin eso, quitar todos
 * los bumps en un dispositivo y entrar desde otro los resucitaría.
 *
 * Extraído del store para testabilidad (ver `bumps-sync.test.ts`).
 */

import { MAX_STORED_BUMPS } from "@/lib/checkout-config"
import type { SelectedBump } from "@/components/checkout/BumpCards"

/** Tope por línea (mismo rango que los items del carrito y los upsells). */
const MAX_BUMP_QUANTITY = 999

/** Tope de tamaño del payload serializado (anti-abuso, no regla de producto). */
const MAX_BUMPS_PAYLOAD_BYTES = 256 * 1024

export interface LocalBumpsSnapshot {
  bumps: SelectedBump[]
  /** epoch ms del último cambio local; null = legacy (sessionStorage) sin timestamp */
  updatedAt: number | null
}

export interface ServerBumpsSnapshot {
  bumps: SelectedBump[]
  /** ISO string del servidor; null si no hay fila o no hay timestamp */
  updated_at: string | null
}

export type BumpsMergeDecision =
  | { action: "use-server"; bumps: SelectedBump[] }
  | { action: "upload-local" }
  | { action: "none" }

export function mergeBumps(
  local: LocalBumpsSnapshot,
  server: ServerBumpsSnapshot | null
): BumpsMergeDecision {
  const localCount = local.bumps.length
  const serverBumps: SelectedBump[] = server && Array.isArray(server.bumps) ? server.bumps : []
  const serverCount = serverBumps.length

  if (localCount === 0 && serverCount === 0) return { action: "none" }

  // El local tiene timestamp: gana el más reciente, incluso si está vacío
  // (selección quitada a propósito).
  if (local.updatedAt !== null) {
    const serverTs = server?.updated_at ? Date.parse(server.updated_at) : NaN
    if (Number.isNaN(serverTs)) return { action: "upload-local" }
    if (serverTs > local.updatedAt) return { action: "use-server", bumps: serverBumps }
    return { action: "upload-local" }
  }

  // Local legacy (sessionStorage, sin timestamp): es el estado actual del
  // dispositivo, así que gana si tiene contenido; si está vacío, el servidor
  // es la única fuente posible.
  if (localCount > 0) return { action: "upload-local" }
  return serverCount > 0 ? { action: "use-server", bumps: serverBumps } : { action: "none" }
}

/**
 * Valida y normaliza la forma de los bumps persistidos.
 *
 * Devuelve `null` si el payload no es un arreglo o alguna entrada tiene campos
 * inválidos (→ 400 en la API). Los campos extra del `SelectedBump` (name,
 * imageUrl…) se conservan tal cual: solo se validan los que el checkout usa
 * para cobrar y mostrar.
 *
 * `quantity: 0` es válido a propósito: el "−" del checkout deja líneas en 0
 * (MIN_ITEM_QUANTITY) y `POST /api/orders` las filtra al crear el pedido.
 */
export function sanitizeStoredBumps(raw: unknown): SelectedBump[] | null {
  if (!Array.isArray(raw)) return null
  if (raw.length > MAX_STORED_BUMPS) return null

  const seen = new Set<number>()
  const bumps: SelectedBump[] = []
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null
    const bump = entry as Partial<SelectedBump>
    if (!Number.isInteger(bump.ruleId) || (bump.ruleId as number) <= 0) return null
    if (!Number.isInteger(bump.productId) || (bump.productId as number) <= 0) return null
    if (
      !Number.isInteger(bump.quantity) ||
      (bump.quantity as number) < 0 ||
      (bump.quantity as number) > MAX_BUMP_QUANTITY
    ) {
      return null
    }
    if (
      typeof bump.unitPrice !== "number" ||
      !Number.isFinite(bump.unitPrice) ||
      bump.unitPrice < 0
    ) {
      return null
    }
    if (bump.name !== undefined && typeof bump.name !== "string") return null
    if (bump.imageUrl !== undefined && typeof bump.imageUrl !== "string") return null
    // Una regla solo puede aparecer una vez (si no, se cobraría dos veces).
    // Gana la primera aparición para no alterar el orden elegido por el usuario.
    if (seen.has(bump.ruleId as number)) continue
    seen.add(bump.ruleId as number)
    bumps.push(entry as SelectedBump)
  }

  if (JSON.stringify(bumps).length > MAX_BUMPS_PAYLOAD_BYTES) return null
  return bumps
}
