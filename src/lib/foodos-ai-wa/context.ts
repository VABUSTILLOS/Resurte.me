/**
 * Carga de contexto para el Mesero IA: menú disponible, ajustes del
 * restaurante y sesión de conversación.
 *
 * Todo pasa por el service client (el webhook no tiene sesión de usuario), así
 * que cada consulta se envuelve y degrada a un valor seguro en vez de lanzar:
 * un fallo de lectura no debe tumbar la respuesta al comensal.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import type { FoodosMenuCategory, FoodosMenuItem } from "@/types/foodos"
import {
  EMPTY_DRAFT,
  NEW_SESSION,
  type MeseroConfig,
  type MeseroDraft,
  type MeseroMenu,
  type MeseroQuestion,
  type MeseroSession,
  type MeseroState,
} from "./state-machine"
import type { MeseroTone } from "./polish"

const DEFAULT_MAX_ITEMS = 20
const DEFAULT_DAILY_REPLY_CAP = 200

export interface MeseroSettings {
  restaurantId: string
  isEnabled: boolean
  tone: MeseroTone
  greeting: string | null
  handoffEnabled: boolean
  maxItems: number
  dailyReplyCap: number
  businessHoursOnly: boolean
}

export interface MeseroContext {
  restaurantId: string
  restaurantName: string
  restaurantSlug: string
  currency: string
  timezone: string
  menu: MeseroMenu
  settings: MeseroSettings
}

export function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://resurte.me"
  )
}

/** Símbolo de moneda a partir del código ISO del restaurante. */
function currencySymbol(code: string | null | undefined): string {
  switch ((code ?? "MXN").toUpperCase()) {
    case "MXN":
      return "$"
    case "USD":
      return "US$"
    case "EUR":
      return "€"
    case "COP":
      return "COL$"
    case "ARS":
      return "AR$"
    default:
      return "$"
  }
}

/**
 * Menú, ajustes y datos del restaurante en una sola pasada. Devuelve `null`
 * si el restaurante no existe o si el Mesero IA no está habilitado, para que
 * el webhook siga con el flujo normal (catálogo / sin respuesta).
 */
export async function loadMeseroContext(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<MeseroContext | null> {
  const [restaurantRes, itemsRes, categoriesRes, settingsRes] = await Promise.all([
    supabase
      .from("foodos_restaurants")
      .select("id, name, slug, currency, timezone")
      .eq("id", restaurantId)
      .maybeSingle(),
    supabase
      .from("foodos_menu_items")
      .select("id, name, price, is_available, category_id")
      .eq("restaurant_id", restaurantId),
    supabase
      .from("foodos_menu_categories")
      .select("id, name, sort_order")
      .eq("restaurant_id", restaurantId),
    supabase.from("foodos_ai_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle(),
  ])

  const restaurant = restaurantRes.data
  if (!restaurant) return null

  const settings = settingsRes.data
  if (!settings?.is_enabled) return null

  const categories = (categoriesRes.data ?? []) as Pick<
    FoodosMenuCategory,
    "id" | "name" | "sort_order"
  >[]
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))

  const items = ((itemsRes.data ?? []) as Pick<
    FoodosMenuItem,
    "id" | "name" | "price" | "is_available" | "category_id"
  >[])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "es"))

  const currency = currencySymbol(restaurant.currency)

  return {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    restaurantSlug: restaurant.slug,
    currency,
    timezone: restaurant.timezone ?? "America/Mexico_City",
    menu: {
      restaurantName: restaurant.name,
      orderLink: `${siteOrigin()}/r/${restaurant.slug}`,
      currency,
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        price: Number(item.price) || 0,
        isAvailable: item.is_available !== false,
        categoryName: item.category_id ? (categoryName.get(item.category_id) ?? null) : null,
      })),
    },
    settings: {
      restaurantId,
      isEnabled: true,
      tone: (settings.tone ?? "amable") as MeseroTone,
      greeting: settings.greeting ?? null,
      handoffEnabled: settings.handoff_enabled !== false,
      maxItems: Number(settings.max_items) > 0 ? Number(settings.max_items) : DEFAULT_MAX_ITEMS,
      dailyReplyCap:
        Number(settings.daily_reply_cap) >= 0
          ? Number(settings.daily_reply_cap)
          : DEFAULT_DAILY_REPLY_CAP,
      businessHoursOnly: settings.business_hours_only === true,
    },
  }
}

export function meseroConfig(settings: MeseroSettings): MeseroConfig {
  return { maxItems: settings.maxItems, handoffEnabled: settings.handoffEnabled }
}

export interface LoadedSession {
  id: string | null
  session: MeseroSession
  /** Si tiene valor, un humano tomó la conversación y la IA debe callarse. */
  handoffAt: string | null
  repliesToday: number
  repliesDay: string
}

function asDraft(raw: unknown): MeseroDraft {
  if (!raw || typeof raw !== "object") return EMPTY_DRAFT
  const d = raw as Partial<MeseroDraft>
  return {
    items: Array.isArray(d.items) ? d.items : [],
    fulfillment: d.fulfillment ?? null,
    address: d.address ?? null,
    name: d.name ?? null,
    tableNumber: d.tableNumber ?? null,
    note: d.note ?? null,
  }
}

/** Sesión existente del comensal, o una nueva sin persistir (`id: null`). */
export async function loadSession(
  supabase: SupabaseClient,
  restaurantId: string,
  customerPhone: string
): Promise<LoadedSession> {
  const { data, error } = await supabase
    .from("foodos_ai_sessions")
    .select("id, state, draft, pending_question, handoff_at, replies_today, replies_day")
    .eq("restaurant_id", restaurantId)
    .eq("customer_phone", customerPhone)
    .maybeSingle()

  if (error) {
    logger.warn("[Mesero IA] No se pudo leer la sesión", { code: error.code })
    return { id: null, session: NEW_SESSION, handoffAt: null, repliesToday: 0, repliesDay: "" }
  }

  if (!data) {
    return { id: null, session: NEW_SESSION, handoffAt: null, repliesToday: 0, repliesDay: "" }
  }

  return {
    id: data.id,
    session: {
      state: (data.state ?? "greeting") as MeseroState,
      draft: asDraft(data.draft),
      pendingQuestion: (data.pending_question ?? null) as MeseroQuestion | null,
    },
    handoffAt: data.handoff_at ?? null,
    repliesToday: Number(data.replies_today) || 0,
    repliesDay: data.replies_day ?? "",
  }
}
