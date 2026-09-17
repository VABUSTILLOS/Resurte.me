// ============================================================
// Wallet — capa de servidor (Fase 5, nivel Diamante).
// ============================================================
// Decisiones que se ven en este archivo:
//
// 1. El pase es una FOTOGRAFÍA. `ensureWalletPass` copia el saldo y la
//    recompensa del momento; el trigger de la migración 00126 mantiene al día
//    las tarjetas ya instaladas cuando se acreditan puntos. Aquí nunca se lee
//    el saldo "en vivo" para pintar la tarjeta: se lee la fotografía.
//
// 2. `serial` es DETERMINISTA (`walletSerial`), pero `token` se conserva entre
//    emisiones. Si el token cambiara, el QR que el comensal ya tiene guardado
//    dejaría de abrir su tarjeta.
//
// 3. Emitir la fila `web` es gratis y siempre posible; las filas `apple` y
//    `google` solo se crean cuando el comensal realmente instala el pase, para
//    no ensuciar la tabla con pases que nadie tiene.
//
// 4. Nada lanza por un fallo de red o de base: devuelve un resultado. Un
//    pedido entregado no se cae porque la tarjeta no se pueda emitir.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  buildWalletCard,
  isWalletPlatform,
  walletSerial,
  type WalletCard,
  type WalletCardLabels,
  type WalletPlatform,
} from "@/lib/foodos-wallet/card"
import { renderWalletIcon } from "@/lib/foodos-wallet/png"
import { logger } from "@/lib/logger"

type Client = SupabaseClient

/** Mínimo de caracteres de un token para considerarlo no adivinable. */
const MIN_TOKEN_LENGTH = 16

function text(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://resurte.me").replace(/\/$/, "")
}

/** URL pública de la tarjeta. Es lo que codifica el QR del pase. */
export function walletCardUrl(slug: string, token: string): string {
  return `${siteOrigin()}/r/${slug}/tarjeta/${token}`
}

/** Token de capacidad: 32 hex. No es un secreto criptográfico, es in-adivinable. */
function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "")
}

// ------------------------------------------------------------
// Contexto
// ------------------------------------------------------------

interface RestaurantRow {
  id: string
  name: string
  slug: string
  logo_url: string | null
  theme_color: string | null
}

interface ProgramRow {
  point_value: number
  wallet_enabled: boolean
  reward_points: number | null
  reward_label: string | null
}

interface CustomerRow {
  id: string
  name: string | null
  phone: string
  loyalty_points: number
  store_credit: number
}

interface PassRow {
  id: string
  platform: WalletPlatform
  serial: string
  token: string
  points: number
  points_value: number
  reward_label: string | null
  reward_threshold: number | null
  is_active: boolean
  snapshot_at: string
  pushed_at: string | null
  push_count: number
}

/** Contexto completo de una tarjeta: pase, restaurante, comensal y programa. */
export interface WalletCardContext {
  pass: PassRow
  restaurant: RestaurantRow
  customer: CustomerRow
  program: ProgramRow | null
  card: WalletCard
  cardUrl: string
}

async function loadRestaurant(
  supabase: Client,
  restaurantId: string
): Promise<RestaurantRow | null> {
  const { data, error } = await supabase
    .from("foodos_restaurants")
    .select("id, name, slug, logo_url, theme_color")
    .eq("id", restaurantId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as Record<string, unknown>
  const slug = text(row.slug)
  const name = text(row.name)
  if (!slug || !name) return null
  return {
    id: String(row.id ?? ""),
    name,
    slug,
    logo_url: text(row.logo_url),
    theme_color: text(row.theme_color),
  }
}

async function loadProgram(supabase: Client, restaurantId: string): Promise<ProgramRow | null> {
  const { data, error } = await supabase
    .from("foodos_loyalty_programs")
    .select("point_value, wallet_enabled, reward_points, reward_label")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as Record<string, unknown>
  return {
    point_value: num(row.point_value) ?? 0,
    wallet_enabled: row.wallet_enabled !== false,
    reward_points: num(row.reward_points),
    reward_label: text(row.reward_label),
  }
}

function cardFrom(input: {
  pass: Pick<PassRow, "serial" | "points"> | { serial: string; points: number }
  restaurant: RestaurantRow
  customer: CustomerRow
  program: ProgramRow | null
  cardUrl: string
  labels?: Partial<WalletCardLabels>
}): WalletCard {
  return buildWalletCard({
    serial: input.pass.serial,
    cardUrl: input.cardUrl,
    restaurantName: input.restaurant.name,
    logoUrl: input.restaurant.logo_url,
    themeColor: input.restaurant.theme_color,
    customerName: input.customer.name,
    points: input.pass.points,
    pointValue: input.program?.point_value ?? 0,
    rewardLabel: input.program?.reward_label ?? null,
    rewardThreshold: input.program?.reward_points ?? null,
    labels: input.labels,
  })
}

// ------------------------------------------------------------
// Emisión
// ------------------------------------------------------------

export interface EnsureWalletPassInput {
  restaurantId: string
  customerId: string
  platform?: WalletPlatform
  /** Etiquetas ya traducidas para la tarjeta que se devuelve. */
  labels?: Partial<WalletCardLabels>
}

export type EnsureWalletPassResult =
  | { ok: true; pass: PassRow; card: WalletCard; created: boolean }
  | { ok: false; error: string }

/**
 * Emite (o refresca) el pase de un comensal en una plataforma.
 *
 * Idempotente: el mismo par (comensal, plataforma) siempre devuelve la misma
 * fila. El token se conserva para no invalidar el QR que el comensal ya tiene.
 */
export async function ensureWalletPass(
  supabase: Client,
  input: EnsureWalletPassInput
): Promise<EnsureWalletPassResult> {
  const platform: WalletPlatform = isWalletPlatform(input.platform) ? input.platform : "web"
  try {
    const restaurant = await loadRestaurant(supabase, input.restaurantId)
    if (!restaurant) return { ok: false, error: "Restaurante no encontrado" }

    const program = await loadProgram(supabase, input.restaurantId)
    if (!program) return { ok: false, error: "El programa de lealtad no está activo" }
    if (!program.wallet_enabled) {
      return { ok: false, error: "La tarjeta de lealtad está desactivada" }
    }

    const { data: customerData, error: customerError } = await supabase
      .from("foodos_customers")
      .select("id, name, phone, loyalty_points, store_credit")
      .eq("id", input.customerId)
      .eq("restaurant_id", input.restaurantId)
      .maybeSingle()
    if (customerError) throw customerError
    if (!customerData) return { ok: false, error: "Comensal no encontrado" }
    const customerRow = customerData as Record<string, unknown>
    const customer: CustomerRow = {
      id: String(customerRow.id ?? ""),
      name: text(customerRow.name),
      phone: text(customerRow.phone) ?? "",
      loyalty_points: num(customerRow.loyalty_points) ?? 0,
      store_credit: num(customerRow.store_credit) ?? 0,
    }

    const { data: existing, error: existingError } = await supabase
      .from("foodos_wallet_passes")
      .select("id, token, created_at")
      .eq("customer_id", input.customerId)
      .eq("platform", platform)
      .maybeSingle()
    if (existingError) throw existingError

    const existingRow = (existing ?? null) as Record<string, unknown> | null
    const token = text(existingRow?.token) ?? newToken()
    const created = !existingRow

    const payload = {
      restaurant_id: input.restaurantId,
      customer_id: input.customerId,
      platform,
      serial: walletSerial(input.restaurantId, input.customerId, platform),
      token,
      points: customer.loyalty_points,
      points_value: Math.round(customer.loyalty_points * program.point_value * 100) / 100,
      reward_label: program.reward_label,
      reward_threshold: program.reward_points,
      is_active: true,
      snapshot_at: new Date().toISOString(),
    }

    const { data: saved, error: saveError } = await supabase
      .from("foodos_wallet_passes")
      .upsert(payload, { onConflict: "customer_id,platform" })
      .select(
        "id, platform, serial, token, points, points_value, reward_label, reward_threshold, is_active, snapshot_at, pushed_at, push_count"
      )
      .maybeSingle()
    if (saveError) throw saveError
    if (!saved) return { ok: false, error: "No se pudo emitir la tarjeta" }

    const pass = saved as unknown as PassRow
    const cardUrl = walletCardUrl(restaurant.slug, pass.token)
    return {
      ok: true,
      pass,
      created,
      card: cardFrom({ pass, restaurant, customer, program, cardUrl, labels: input.labels }),
    }
  } catch (err) {
    logger.warn("[Wallet] No se pudo emitir el pase", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: "No se pudo emitir la tarjeta" }
  }
}

/**
 * Asegura la tarjeta `web` del comensal. Pensado para el pipeline de pedidos:
 * nunca lanza y nunca bloquea.
 */
export async function ensureWebWalletPass(
  supabase: Client,
  restaurantId: string,
  customerId: string
): Promise<void> {
  if (!restaurantId || !customerId) return
  try {
    const result = await ensureWalletPass(supabase, { restaurantId, customerId, platform: "web" })
    if (!result.ok) {
      logger.info("[Wallet] Tarjeta no emitida", { reason: result.error })
    }
  } catch (err) {
    logger.warn("[Wallet] Emisión best-effort falló", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ------------------------------------------------------------
// Lectura pública (capability token)
// ------------------------------------------------------------

/**
 * Resuelve la tarjeta a partir del token de capacidad. Devuelve `null` si el
 * token no existe, es demasiado corto o el pase está revocado.
 */
export async function loadWalletCardByToken(
  supabase: Client,
  token: string,
  labels?: Partial<WalletCardLabels>
): Promise<WalletCardContext | null> {
  const clean = (token ?? "").trim()
  if (clean.length < MIN_TOKEN_LENGTH) return null
  try {
    const { data, error } = await supabase
      .from("foodos_wallet_passes")
      .select(
        "id, restaurant_id, customer_id, platform, serial, token, points, points_value, reward_label, reward_threshold, is_active, snapshot_at, pushed_at, push_count"
      )
      .eq("token", clean)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const row = data as Record<string, unknown>
    if (row.is_active === false) return null
    if (!isWalletPlatform(row.platform)) return null

    const restaurantId = String(row.restaurant_id ?? "")
    const customerId = String(row.customer_id ?? "")
    const restaurant = await loadRestaurant(supabase, restaurantId)
    if (!restaurant) return null

    const { data: customerData, error: customerError } = await supabase
      .from("foodos_customers")
      .select("id, name, phone, loyalty_points, store_credit")
      .eq("id", customerId)
      .maybeSingle()
    if (customerError) throw customerError
    if (!customerData) return null
    const customerRow = customerData as Record<string, unknown>

    const pass: PassRow = {
      id: String(row.id ?? ""),
      platform: row.platform,
      serial: String(row.serial ?? ""),
      token: String(row.token ?? ""),
      points: num(row.points) ?? 0,
      points_value: num(row.points_value) ?? 0,
      reward_label: text(row.reward_label),
      reward_threshold: num(row.reward_threshold),
      is_active: row.is_active !== false,
      snapshot_at: String(row.snapshot_at ?? ""),
      pushed_at: text(row.pushed_at),
      push_count: num(row.push_count) ?? 0,
    }

    const customer: CustomerRow = {
      id: String(customerRow.id ?? ""),
      name: text(customerRow.name),
      phone: text(customerRow.phone) ?? "",
      loyalty_points: num(customerRow.loyalty_points) ?? 0,
      store_credit: num(customerRow.store_credit) ?? 0,
    }

    const program = await loadProgram(supabase, restaurantId)
    const cardUrl = walletCardUrl(restaurant.slug, pass.token)
    return {
      pass,
      restaurant,
      customer,
      program,
      cardUrl,
      card: cardFrom({ pass, restaurant, customer, program, cardUrl, labels }),
    }
  } catch (err) {
    logger.warn("[Wallet] No se pudo cargar la tarjeta", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Refresca la fotografía del pase con el saldo actual del comensal.
 * Devuelve `null` si el pase no existe.
 */
export async function refreshWalletPass(
  supabase: Client,
  restaurantId: string,
  passId: string
): Promise<PassRow | null> {
  try {
    const { data: passData, error: passError } = await supabase
      .from("foodos_wallet_passes")
      .select("id, customer_id")
      .eq("id", passId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle()
    if (passError) throw passError
    if (!passData) return null
    const customerId = String((passData as Record<string, unknown>).customer_id ?? "")

    const { data: customerData, error: customerError } = await supabase
      .from("foodos_customers")
      .select("loyalty_points")
      .eq("id", customerId)
      .maybeSingle()
    if (customerError) throw customerError
    if (!customerData) return null

    const program = await loadProgram(supabase, restaurantId)
    const points = num((customerData as Record<string, unknown>).loyalty_points) ?? 0
    const { data: saved, error: saveError } = await supabase
      .from("foodos_wallet_passes")
      .update({
        points,
        points_value: Math.round(points * (program?.point_value ?? 0) * 100) / 100,
        reward_label: program?.reward_label ?? null,
        reward_threshold: program?.reward_points ?? null,
        snapshot_at: new Date().toISOString(),
      })
      .eq("id", passId)
      .eq("restaurant_id", restaurantId)
      .select(
        "id, platform, serial, token, points, points_value, reward_label, reward_threshold, is_active, snapshot_at, pushed_at, push_count"
      )
      .maybeSingle()
    if (saveError) throw saveError
    return saved ? (saved as unknown as PassRow) : null
  } catch (err) {
    logger.warn("[Wallet] No se pudo refrescar el pase", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ------------------------------------------------------------
// Panel
// ------------------------------------------------------------

export interface WalletPassRow {
  id: string
  platform: WalletPlatform
  serial: string
  token: string
  points: number
  points_value: number
  reward_label: string | null
  reward_threshold: number | null
  is_active: boolean
  snapshot_at: string
  created_at: string
  customer_name: string | null
  customer_phone: string
  customer_points: number
  /** Enlace listo para compartir por WhatsApp. */
  url: string
}

function rowToWalletPass(row: Record<string, unknown>, slug: string): WalletPassRow {
  const customer = (row.foodos_customers ?? null) as Record<string, unknown> | null
  const token = String(row.token ?? "")
  return {
    id: String(row.id ?? ""),
    platform: isWalletPlatform(row.platform) ? row.platform : "web",
    serial: String(row.serial ?? ""),
    token,
    points: num(row.points) ?? 0,
    points_value: num(row.points_value) ?? 0,
    reward_label: text(row.reward_label),
    reward_threshold: num(row.reward_threshold),
    is_active: row.is_active !== false,
    snapshot_at: String(row.snapshot_at ?? ""),
    created_at: String(row.created_at ?? ""),
    customer_name: text(customer?.name),
    customer_phone: text(customer?.phone) ?? "",
    customer_points: num(customer?.loyalty_points) ?? 0,
    url: walletCardUrl(slug, token),
  }
}

/** Pases emitidos, con el nombre del comensal. Degrada a `[]`. */
export async function listWalletPasses(
  supabase: Client,
  restaurantId: string,
  limit = 100
): Promise<WalletPassRow[]> {
  try {
    const restaurant = await loadRestaurant(supabase, restaurantId)
    if (!restaurant) return []
    const size = Math.min(500, Math.max(1, Math.floor(limit)))
    const { data, error } = await supabase
      .from("foodos_wallet_passes")
      .select(
        "id, platform, serial, token, points, points_value, reward_label, reward_threshold, is_active, snapshot_at, created_at, foodos_customers(name, phone, loyalty_points)"
      )
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(size)
    if (error) throw error
    return ((data ?? []) as Record<string, unknown>[]).map((row) =>
      rowToWalletPass(row, restaurant.slug)
    )
  } catch (err) {
    logger.warn("[Wallet] No se pudieron cargar los pases", {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

export interface WalletStats {
  total: number
  active: number
  apple: number
  google: number
  web: number
  /** Pases instalados en un teléfono (Apple + Google). */
  installed: number
  /** Puntos anunciados en las tarjetas activas. */
  pointsOutstanding: number
  /** Valor en pesos de esos puntos. */
  valueOutstanding: number
}

export const EMPTY_WALLET_STATS: WalletStats = {
  total: 0,
  active: 0,
  apple: 0,
  google: 0,
  web: 0,
  installed: 0,
  pointsOutstanding: 0,
  valueOutstanding: 0,
}

/** KPIs de la tarjeta. Degrada a ceros. */
export async function getWalletStats(
  supabase: Client,
  restaurantId: string
): Promise<WalletStats> {
  try {
    const { data, error } = await supabase
      .from("foodos_wallet_passes")
      .select("platform, points, points_value, is_active")
      .eq("restaurant_id", restaurantId)
      .limit(5000)
    if (error) throw error
    const rows = (data ?? []) as Record<string, unknown>[]
    const stats: WalletStats = { ...EMPTY_WALLET_STATS }
    for (const row of rows) {
      stats.total += 1
      if (row.is_active === false) continue
      stats.active += 1
      if (row.platform === "apple") stats.apple += 1
      else if (row.platform === "google") stats.google += 1
      else stats.web += 1
      stats.pointsOutstanding += num(row.points) ?? 0
      stats.valueOutstanding = Math.round((stats.valueOutstanding + (num(row.points_value) ?? 0)) * 100) / 100
    }
    stats.installed = stats.apple + stats.google
    return stats
  } catch (err) {
    logger.warn("[Wallet] No se pudieron calcular los KPIs", {
      error: err instanceof Error ? err.message : String(err),
    })
    return { ...EMPTY_WALLET_STATS }
  }
}

/** Revoca (o reactiva) un pase. El token deja de resolver cuando se revoca. */
export async function setWalletPassActive(
  supabase: Client,
  restaurantId: string,
  passId: string,
  isActive: boolean
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("foodos_wallet_passes")
      .update({ is_active: isActive })
      .eq("id", passId)
      .eq("restaurant_id", restaurantId)
    if (error) throw error
    return true
  } catch (err) {
    logger.warn("[Wallet] No se pudo cambiar el estado del pase", {
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

// ------------------------------------------------------------
// Adaptadores de plataforma
// ------------------------------------------------------------

/**
 * Imágenes del pase de Apple. `icon.png` es obligatorio —Apple rechaza el pase
 * sin él— y se dibuja del color de marca; `logo.png` es opcional y solo decora.
 */
export function applePassImages(card: WalletCard, color?: string | null): Map<string, Uint8Array> {
  const brand = color ?? card.backgroundColor
  return new Map<string, Uint8Array>([
    ["icon.png", renderWalletIcon(58, { color: brand })],
    ["logo.png", renderWalletIcon(160, { color: brand })],
  ])
}
