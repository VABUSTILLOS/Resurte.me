// ============================================================
// Punto de venta — capa de servidor (Fase 7, nivel Diamante).
// ============================================================
// Decisiones que se ven en este archivo:
//
// 1. Leer nunca lanza. El panel degrada a "sin conexión" y la lista de
//    proveedores se arma siempre completa, para que el dueño vea los seis
//    aunque ninguno esté conectado.
//
// 2. Guardar **no borra secretos por omisión**. El panel solo conoce el valor
//    enmascarado; si el dueño reenvía el formulario sin volver a teclear su
//    clave, se conserva la guardada. Sobrescribirla con "••••1234" dejaría la
//    conexión inservible sin que nadie lo note.
//
// 3. La bitácora es best-effort. Un fallo al registrar no puede hacer fracasar
//    la sincronización que se estaba registrando.
// ============================================================

import { randomBytes } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import { logger } from "@/lib/logger"
import {
  POS_DESCRIPTORS,
  POS_PROVIDERS,
  checkPosCredentials,
  emptyPosConnectionView,
  isPosProvider,
  normalizePosCredentials,
  posConnectionView,
  summarizePos,
  type PosConnectionStatus,
  type PosConnectionView,
  type PosCredentials,
  type PosKpis,
  type PosProvider,
  type PosSyncEntry,
  type PosSyncKind,
  type PosSyncStatus,
} from "./registry"

type Client = SupabaseClient

const MAX_DETAIL = 500
const MAX_LOG_ROWS = 50

const CONNECTION_COLUMNS =
  "id, provider, status, credentials, external_location_id, webhook_secret, last_sync_at, last_error"

export interface PosConnectionFactsRow {
  provider: PosProvider
  status: PosConnectionStatus
  credentials: PosCredentials
  externalLocationId: string | null
  hasWebhookSecret: boolean
  lastSyncAt: string | null
  lastError: string | null
}

export type PosMutationResult = { ok: true } | { ok: false; error: string }

export interface PosContext {
  views: PosConnectionView[]
  log: PosSyncEntry[]
  kpis: PosKpis
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function asStatus(value: unknown): PosConnectionStatus {
  return value === "connected" || value === "error" ? value : "disconnected"
}

/** Solo se aceptan cadenas: `credentials` es JSONB y podría traer cualquier cosa. */
function asCredentials(value: unknown): PosCredentials {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const out: PosCredentials = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const cleaned = text(raw)
    if (cleaned) out[key] = cleaned
  }
  return out
}

function rowToFacts(data: unknown): PosConnectionFactsRow | null {
  if (!data || typeof data !== "object") return null
  const row = data as Record<string, unknown>
  if (!isPosProvider(row.provider)) return null
  return {
    provider: row.provider,
    status: asStatus(row.status),
    credentials: asCredentials(row.credentials),
    externalLocationId: text(row.external_location_id),
    hasWebhookSecret: text(row.webhook_secret) !== null,
    lastSyncAt: text(row.last_sync_at),
    lastError: text(row.last_error),
  }
}

function rowToSyncEntry(data: unknown): PosSyncEntry | null {
  if (!data || typeof data !== "object") return null
  const row = data as Record<string, unknown>
  const id = text(row.id)
  const provider = row.provider
  const kind = row.kind
  const status = row.status
  if (!id || !isPosProvider(provider)) return null
  const validKind: PosSyncKind[] = ["menu", "order", "health"]
  const validStatus: PosSyncStatus[] = ["ok", "failed", "skipped"]
  if (typeof kind !== "string" || !validKind.includes(kind as PosSyncKind)) return null
  if (typeof status !== "string" || !validStatus.includes(status as PosSyncStatus)) return null
  const items = typeof row.items_count === "number" ? row.items_count : Number(row.items_count)
  return {
    id,
    provider,
    kind: kind as PosSyncKind,
    status: status as PosSyncStatus,
    itemsCount: Number.isFinite(items) && items > 0 ? Math.trunc(items) : 0,
    detail: text(row.detail),
    createdAt: text(row.created_at) ?? new Date(0).toISOString(),
  }
}

// ------------------------------------------------------------
// Lectura
// ------------------------------------------------------------

/**
 * Los seis proveedores, conectados o no.
 *
 * Se completa la lista a propósito: el panel necesita mostrar los que faltan
 * por conectar, no solo los que ya existen.
 */
export async function loadPosConnections(
  supabase: Client,
  restaurantId: string,
  opts: { origin?: string; restaurantId?: string } = {}
): Promise<PosConnectionView[]> {
  try {
    const { data, error } = await supabase
      .from("foodos_pos_connections")
      .select(CONNECTION_COLUMNS)
      .eq("restaurant_id", restaurantId)
    if (error) throw error

    const facts = new Map<PosProvider, PosConnectionFactsRow>()
    for (const entry of (data as unknown[]) ?? []) {
      const row = rowToFacts(entry)
      if (row) facts.set(row.provider, row)
    }

    return POS_PROVIDERS.map((provider) => {
      const row = facts.get(provider)
      return row
        ? posConnectionView(row, opts)
        : emptyPosConnectionView(provider, opts)
    })
  } catch (error) {
    logger.warn("foodos.pos.connections.load_failed", { restaurantId, error: String(error) })
    return POS_PROVIDERS.map((provider) => emptyPosConnectionView(provider, opts))
  }
}

export async function getPosConnection(
  supabase: Client,
  restaurantId: string,
  provider: PosProvider
): Promise<PosConnectionFactsRow | null> {
  try {
    const { data, error } = await supabase
      .from("foodos_pos_connections")
      .select(CONNECTION_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .eq("provider", provider)
      .maybeSingle()
    if (error) throw error
    return rowToFacts(data)
  } catch (error) {
    logger.warn("foodos.pos.connection.load_failed", { restaurantId, provider, error: String(error) })
    return null
  }
}

/** El secreto con el que se verifica la firma del webhook entrante. */
export async function getPosWebhookSecret(
  supabase: Client,
  provider: PosProvider,
  restaurantId: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("foodos_pos_connections")
      .select("webhook_secret, status")
      .eq("restaurant_id", restaurantId)
      .eq("provider", provider)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const row = data as Record<string, unknown>
    // Una conexión desconectada no acepta webhooks aunque conserve el secreto.
    if (asStatus(row.status) !== "connected") return null
    return text(row.webhook_secret)
  } catch (error) {
    logger.warn("foodos.pos.webhook_secret.load_failed", { provider, error: String(error) })
    return null
  }
}

export async function listPosSyncLog(
  supabase: Client,
  restaurantId: string,
  limit = MAX_LOG_ROWS
): Promise<PosSyncEntry[]> {
  try {
    const { data, error } = await supabase
      .from("foodos_pos_sync_log")
      .select("id, provider, kind, status, items_count, detail, created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), MAX_LOG_ROWS))
    if (error) throw error
    return ((data as unknown[]) ?? [])
      .map(rowToSyncEntry)
      .filter((entry): entry is PosSyncEntry => entry !== null)
  } catch (error) {
    logger.warn("foodos.pos.sync_log.load_failed", { restaurantId, error: String(error) })
    return []
  }
}

/** Todo lo que necesita el panel, en una sola lectura. */
export async function loadPosContext(
  supabase: Client,
  restaurantId: string,
  opts: { origin?: string; restaurantId?: string; now?: Date } = {}
): Promise<PosContext> {
  const [views, log] = await Promise.all([
    loadPosConnections(supabase, restaurantId, opts),
    listPosSyncLog(supabase, restaurantId),
  ])
  return { views, log, kpis: summarizePos(views, log, opts.now ?? new Date()) }
}

// ------------------------------------------------------------
// Escritura
// ------------------------------------------------------------

/**
 * Guarda las credenciales de una conexión.
 *
 * Tres cosas que hace y conviene tener presentes:
 *
 * - Los campos secretos que llegan vacíos **conservan** el valor guardado, para
 *   que reenviar el formulario sin reescribir la clave no la borre.
 * - Un valor que llega ya enmascarado (el que el propio panel mostró) también
 *   conserva el guardado: nadie teclea "••••1234" a propósito.
 * - Al guardar credenciales completas se marca la conexión como `connected`;
 *   si faltan campos, queda `disconnected` y se devuelve el motivo. Nunca se
 *   deja "connected" una conexión incompleta.
 */
export async function upsertPosConnection(
  supabase: Client,
  restaurantId: string,
  provider: PosProvider,
  incoming: PosCredentials | null | undefined,
  opts: { externalLocationId?: string | null } = {}
): Promise<PosMutationResult & { missing?: string[] }> {
  const descriptor = POS_DESCRIPTORS[provider]
  const existing = await getPosConnection(supabase, restaurantId, provider)

  const declared = new Set(descriptor.credentials.map((f) => f.key))
  const merged: PosCredentials = { ...(existing?.credentials ?? {}) }

  for (const [key, raw] of Object.entries(incoming ?? {})) {
    if (!declared.has(key)) continue
    const value = text(raw)
    if (!value) continue
    // El panel reenvía lo que mostró: una máscara no es una credencial nueva.
    if (value.startsWith("••••")) continue
    merged[key] = value
  }

  const check = checkPosCredentials(provider, merged)
  const status: PosConnectionStatus = check.ok ? "connected" : "disconnected"

  try {
    const { error } = await supabase.from("foodos_pos_connections").upsert(
      {
        restaurant_id: restaurantId,
        provider,
        status,
        credentials: normalizePosCredentials(provider, merged),
        external_location_id: text(opts.externalLocationId) ?? existing?.externalLocationId ?? null,
        last_error: null,
      },
      { onConflict: "restaurant_id,provider" }
    )
    if (error) throw error
  } catch (error) {
    logger.error("foodos.pos.connection.save_failed", error, { restaurantId, provider })
    return { ok: false, error: "No se pudieron guardar las credenciales" }
  }

  if (!check.ok) {
    return { ok: false, error: "Faltan credenciales obligatorias", missing: check.missing }
  }
  return { ok: true }
}

/**
 * Marca el resultado de una operación.
 *
 * `last_error` se limpia al pasar a `connected`: dejar el error viejo haría que
 * el panel siguiera mostrando un problema ya resuelto.
 */
export async function setPosConnectionStatus(
  supabase: Client,
  restaurantId: string,
  provider: PosProvider,
  status: PosConnectionStatus,
  lastError: string | null = null
): Promise<PosMutationResult> {
  try {
    const { error } = await supabase
      .from("foodos_pos_connections")
      .update({
        status,
        last_error: lastError ? lastError.slice(0, MAX_DETAIL) : null,
        last_sync_at: new Date().toISOString(),
      })
      .eq("restaurant_id", restaurantId)
      .eq("provider", provider)
    if (error) throw error
    return { ok: true }
  } catch (error) {
    logger.error("foodos.pos.connection.status_failed", error, { restaurantId, provider })
    return { ok: false, error: "No se pudo actualizar la conexión" }
  }
}

/**
 * Desconecta sin borrar la fila.
 *
 * Se conservan las credenciales y el secreto de webhook para que reconectar no
 * obligue a volver a pedirle las claves al proveedor. Lo que sí se suelta es el
 * estado: `disconnected` deja de aceptar webhooks.
 */
export async function disconnectPosConnection(
  supabase: Client,
  restaurantId: string,
  provider: PosProvider
): Promise<PosMutationResult> {
  try {
    const { error } = await supabase
      .from("foodos_pos_connections")
      .update({ status: "disconnected", last_error: null })
      .eq("restaurant_id", restaurantId)
      .eq("provider", provider)
    if (error) throw error
    return { ok: true }
  } catch (error) {
    logger.error("foodos.pos.connection.disconnect_failed", error, { restaurantId, provider })
    return { ok: false, error: "No se pudo desconectar" }
  }
}

/**
 * Genera (o rota) el secreto de webhook.
 *
 * Solo aplica a proveedores que emiten webhooks; para el resto devuelve error
 * en vez de guardar un secreto que nadie va a usar.
 */
export async function rotatePosWebhookSecret(
  supabase: Client,
  restaurantId: string,
  provider: PosProvider
): Promise<{ ok: true; secret: string } | { ok: false; error: string }> {
  if (!POS_DESCRIPTORS[provider].capabilities.webhook) {
    return { ok: false, error: "Este proveedor no envía webhooks" }
  }
  const secret = randomBytes(24).toString("hex")
  try {
    const { error } = await supabase
      .from("foodos_pos_connections")
      .update({ webhook_secret: secret })
      .eq("restaurant_id", restaurantId)
      .eq("provider", provider)
    if (error) throw error
    return { ok: true, secret }
  } catch (error) {
    logger.error("foodos.pos.webhook_secret.rotate_failed", error, { restaurantId, provider })
    return { ok: false, error: "No se pudo generar el secreto" }
  }
}

/**
 * Registra una operación. Best-effort: si la bitácora falla, la operación que
 * se estaba registrando ya terminó y no se deshace.
 */
export async function logPosSync(
  supabase: Client,
  restaurantId: string,
  entry: {
    provider: PosProvider
    kind: PosSyncKind
    status: PosSyncStatus
    itemsCount?: number
    detail?: string | null
  }
): Promise<void> {
  try {
    const { error } = await supabase.from("foodos_pos_sync_log").insert({
      restaurant_id: restaurantId,
      provider: entry.provider,
      kind: entry.kind,
      status: entry.status,
      items_count: Math.max(0, Math.trunc(entry.itemsCount ?? 0)),
      detail: text(entry.detail)?.slice(0, MAX_DETAIL) ?? null,
    })
    if (error) throw error
  } catch (error) {
    logger.warn("foodos.pos.sync_log.write_failed", {
      restaurantId,
      provider: entry.provider,
      error: String(error),
    })
  }
}
