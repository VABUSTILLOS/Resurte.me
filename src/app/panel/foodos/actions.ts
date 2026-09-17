"use server"

// ============================================================
// Server Actions de FoodOS: CRUD de restaurante, menú, combos,
// reglas, clientes, automatizaciones y pedidos.
// Todas usan requireAuth() y respetan RLS (owner-only).
// ============================================================

import { requireAuth, getCurrentUser } from "@/lib/auth"
import { requireFoodosFeature } from "@/lib/foodos-tier"
import { reportServerError } from "@/lib/error-log"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { formatMoney, slugify } from "@/lib/foodos"
import { tallyAbTest } from "@/lib/messaging/channel"
import type { CampaignCopyOutput, CampaignTone } from "@/lib/foodos-ai/copy"
import { notifyFoodosCustomer } from "@/lib/foodos-notifications"
import {
  EMPTY_WALLET_STATS,
  ensureWalletPass,
  getWalletStats,
  listWalletPasses,
  refreshWalletPass,
  setWalletPassActive,
  type WalletPassRow,
  type WalletStats,
} from "@/lib/foodos-wallet/passes"
import {
  deleteSeoPage,
  listSeoPages,
  loadSeoProfile,
  saveSeoProfile,
  setSeoPageStatus,
  upsertSeoPage,
  type SeoPageKind,
  type SeoPageRow,
} from "@/lib/foodos-seo-pages"
import { generateAboutText, generateDishCopy, generateFaq } from "@/lib/foodos-ai/seo"
import {
  googleBusinessChecklist,
  googleBusinessProgress,
  menuPath,
  manifestPath,
  restaurantPath,
  slugifySeo,
  type GoogleBusinessProgress,
  type GoogleBusinessStep,
} from "@/lib/foodos-seo"
import { revalidatePath, revalidateTag } from "next/cache"
import { after } from "next/server"
import type { LocalMenuItem } from "@/lib/pos/reconcile"
import type { PosMenuSnapshotItem } from "@/lib/pos/adapter"
import type { PosConnectionView, PosKpis, PosSyncEntry } from "@/lib/pos/registry"
import type { CateringKpis, CateringPackage } from "@/lib/foodos-catering"
import type { CateringRequestRow } from "@/lib/foodos-catering-data"
import type {
  FoodosRestaurant,
  FoodosRestaurantStatus,
  FoodosBranch,
  FoodosMenuCategory,
  FoodosMenuItem,
  FoodosCombo,
  FoodosUpsellRule,
  FoodosRuleTriggerType,
  FoodosAutomation,
  FoodosOrder,
  FoodosOrderStatus,
  FoodosCustomer,
  FoodosCustomerSegment,
  FoodosCampaign,
  FoodosCampaignStatus,
  FoodosMarketingChannel,
  FoodosCampaignVariant,
  FoodosItemOptionGroup,
  FoodosItemOptionValue,
  FoodosBranchHours,
  FoodosCoupon,
  FoodosBranchMenuOverride,
  FoodosLoyaltyProgram,
  FoodosReview,
  FoodosWebhook,
  FoodosWebhookDelivery,
  FoodosWhatsAppConnection,
  FoodosWhatsAppMessage,
  FoodosWhatsAppStatus,
} from "@/types/foodos"

// ------------------------------------------------------------
// Restaurante
// ------------------------------------------------------------

/**
 * Carga el restaurante del usuario y TODAS sus listas dependientes en una
 * sola llamada de server action (una sola round-trip HTTP). Las queries se
 * ejecutan en paralelo del lado del servidor, evitando el N+1 de esperar
 * `getMyRestaurant()` y luego disparar N server actions más por página.
 *
 * Cada página del panel consume solo las listas que necesita.
 */
export async function getFoodosPanelData() {
  const { supabase, user } = await requireAuth()
  const { data: restaurant, error: rErr } = await supabase
    .from("foodos_restaurants")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()
  if (rErr) throw new Error(rErr.message)

  const r = restaurant as FoodosRestaurant | null
  if (!r) {
    return {
      restaurant: null,
      branches: [],
      orders: [],
      customers: [],
      categories: [],
      items: [],
      combos: [],
      rules: [],
      automations: [],
      campaigns: [],
      optionGroups: [],
      optionValues: [],
    }
  }

  const [branches, orders, customers, categories, items, combos, rules, automations, campaigns, optionGroups, optionValues] =
    await Promise.all([
      supabase.from("foodos_branches").select("*").eq("restaurant_id", r.id).order("name"),
      supabase.from("foodos_orders").select("*").eq("restaurant_id", r.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("foodos_customers").select("*").eq("restaurant_id", r.id).order("total_spend", { ascending: false }).limit(500),
      supabase.from("foodos_menu_categories").select("*").eq("restaurant_id", r.id).order("sort_order"),
      supabase.from("foodos_menu_items").select("*").eq("restaurant_id", r.id).order("sort_order"),
      supabase.from("foodos_combos").select("*").eq("restaurant_id", r.id).order("created_at"),
      supabase.from("foodos_upsell_rules").select("*").eq("restaurant_id", r.id).order("created_at"),
      supabase.from("foodos_automations").select("*").eq("restaurant_id", r.id).order("created_at"),
      supabase.from("foodos_campaigns").select("*").eq("restaurant_id", r.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("foodos_item_option_groups").select("*").eq("restaurant_id", r.id).order("sort_order"),
      supabase.from("foodos_item_option_values").select("*").eq("restaurant_id", r.id).order("sort_order"),
    ])

  for (const q of [branches, orders, customers, categories, items, combos, rules, automations, campaigns, optionGroups, optionValues]) {
    if (q.error) throw new Error(q.error.message)
  }

  return {
    restaurant: r,
    branches: (branches.data as FoodosBranch[]) ?? [],
    orders: (orders.data as FoodosOrder[]) ?? [],
    customers: (customers.data as FoodosCustomer[]) ?? [],
    categories: (categories.data as FoodosMenuCategory[]) ?? [],
    items: (items.data as FoodosMenuItem[]) ?? [],
    combos: (combos.data as FoodosCombo[]) ?? [],
    rules: (rules.data as FoodosUpsellRule[]) ?? [],
    automations: (automations.data as FoodosAutomation[]) ?? [],
    campaigns: (campaigns.data as FoodosCampaign[]) ?? [],
    optionGroups: (optionGroups.data as FoodosItemOptionGroup[]) ?? [],
    optionValues: (optionValues.data as FoodosItemOptionValue[]) ?? [],
  }
}

export async function upsertRestaurant(input: {
  id?: string
  name: string
  slug: string
  logo_url?: string | null
  description?: string | null
  status?: FoodosRestaurantStatus
  currency?: string
  collection_id?: number | null
  theme_color?: string | null
  meta_pixel_id?: string | null
  tiktok_pixel_id?: string | null
  transfer_clabe?: string | null
  transfer_bank?: string | null
  transfer_beneficiary?: string | null
}): Promise<FoodosRestaurant> {
  const { supabase, user } = await requireAuth()

  const slug = slugify(input.slug || input.name)
  if (!slug) throw new Error("Escribe un nombre o slug válido")

  // Unicidad global del slug (no se ve por RLS → usa service client)
  const service = await createServiceClient()
  const { data: slugOwner, error: slugError } = await service
    .from("foodos_restaurants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle()
  if (slugError) throw new Error(slugError.message)
  if (slugOwner && slugOwner.id !== input.id) {
    throw new Error(`El slug "${slug}" ya está en uso por otro restaurante`)
  }

  const payload = {
    name: input.name,
    slug,
    logo_url: input.logo_url || null,
    description: input.description || null,
    status: input.status ?? "draft",
    currency: input.currency || "MXN",
    collection_id: input.collection_id ?? null,
    theme_color: input.theme_color || null,
    meta_pixel_id: input.meta_pixel_id || null,
    tiktok_pixel_id: input.tiktok_pixel_id || null,
    transfer_clabe: input.transfer_clabe || null,
    transfer_bank: input.transfer_bank || null,
    transfer_beneficiary: input.transfer_beneficiary || null,
  }

  let result
  if (input.id) {
    result = await supabase
      .from("foodos_restaurants")
      .update(payload)
      .eq("id", input.id)
      .eq("user_id", user.id)
      .select("*")
      .single()
  } else {
    result = await supabase
      .from("foodos_restaurants")
      .insert({ ...payload, user_id: user.id })
      .select("*")
      .single()
  }

  if (result.error) throw new Error(result.error.message)
  revalidatePath("/panel/foodos/restaurante")
  revalidatePath(`/r/${slug}`)
  return result.data as FoodosRestaurant
}

export async function setRestaurantStatus(
  id: string,
  status: FoodosRestaurantStatus
): Promise<void> {
  const { supabase, user } = await requireAuth()
  const { error } = await supabase
    .from("foodos_restaurants")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/restaurante")
  revalidatePath("/panel/foodos/tablero")
}

// ------------------------------------------------------------
// Sucursales
// ------------------------------------------------------------

export async function listBranches(
  restaurantId: string
): Promise<FoodosBranch[]> {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_branches")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("name")
  if (error) throw new Error(error.message)
  return (data as FoodosBranch[]) ?? []
}

export async function upsertBranch(input: {
  id?: string
  restaurant_id: string
  name: string
  city?: string | null
  address?: string | null
  phone?: string | null
  pickup_active: boolean
  delivery_active: boolean
  dine_in_active?: boolean
  scheduled_orders_active?: boolean
  lead_minutes?: number
  delivery_fee: number
  min_order: number
}): Promise<void> {
  const { supabase, user } = await requireAuth()

  // Verificar que el restaurante es del usuario
  const { data: owned } = await supabase
    .from("foodos_restaurants")
    .select("id")
    .eq("id", input.restaurant_id)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!owned) throw new Error("Restaurante no encontrado")

  const payload = {
    restaurant_id: input.restaurant_id,
    name: input.name,
    city: input.city || null,
    address: input.address || null,
    phone: input.phone || null,
    pickup_active: input.pickup_active,
    delivery_active: input.delivery_active,
    dine_in_active: input.dine_in_active ?? false,
    scheduled_orders_active: input.scheduled_orders_active ?? false,
    lead_minutes: Math.max(0, Number(input.lead_minutes) || 30),
    delivery_fee: Number(input.delivery_fee) || 0,
    min_order: Number(input.min_order) || 0,
  }

  const { error } = input.id
    ? await supabase.from("foodos_branches").update(payload).eq("id", input.id)
    : await supabase.from("foodos_branches").insert(payload)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/restaurante")
}

export async function deleteBranch(id: string): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase.from("foodos_branches").delete().eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/restaurante")
}

// ------------------------------------------------------------
// Horarios de sucursal
// ------------------------------------------------------------

export async function listBranchHours(
  branchId: string
): Promise<FoodosBranchHours[]> {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_branch_hours")
    .select("*")
    .eq("branch_id", branchId)
    .order("day_of_week")
  if (error) throw new Error(error.message)
  return (data as FoodosBranchHours[]) ?? []
}

/** Reemplaza el horario semanal completo de una sucursal (7 días). */
export async function upsertBranchHours(
  branchId: string,
  days: Array<{
    day_of_week: number
    open_time: string | null
    close_time: string | null
    is_closed: boolean
  }>
): Promise<void> {
  const { supabase } = await requireAuth()
  const rows = days
    .filter((d) => d.day_of_week >= 0 && d.day_of_week <= 6)
    .map((d) => ({
      branch_id: branchId,
      day_of_week: d.day_of_week,
      open_time: d.is_closed ? null : d.open_time,
      close_time: d.is_closed ? null : d.close_time,
      is_closed: d.is_closed,
    }))
  const { error } = await supabase
    .from("foodos_branch_hours")
    .upsert(rows, { onConflict: "branch_id,day_of_week" })
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/restaurante")
}

// ------------------------------------------------------------
// Menú
// ------------------------------------------------------------

export async function listCategories(
  restaurantId: string
): Promise<FoodosMenuCategory[]> {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_menu_categories")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("sort_order")
  if (error) throw new Error(error.message)
  return (data as FoodosMenuCategory[]) ?? []
}

export async function listMenuItems(
  restaurantId: string
): Promise<FoodosMenuItem[]> {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_menu_items")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("sort_order")
  if (error) throw new Error(error.message)
  return (data as FoodosMenuItem[]) ?? []
}

export async function upsertCategory(input: {
  id?: string
  restaurant_id: string
  name: string
  sort_order: number
}): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = input.id
    ? await supabase
        .from("foodos_menu_categories")
        .update({ name: input.name, sort_order: input.sort_order })
        .eq("id", input.id)
    : await supabase
        .from("foodos_menu_categories")
        .insert({
          restaurant_id: input.restaurant_id,
          name: input.name,
          sort_order: input.sort_order,
        })
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/menu")
  revalidatePath("/panel/foodos/combos")
}

export async function deleteCategory(id: string): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_menu_categories")
    .delete()
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/menu")
}

export async function upsertMenuItem(input: {
  id?: string
  restaurant_id: string
  category_id?: string | null
  name: string
  description?: string | null
  price: number
  cost?: number
  image_url?: string | null
  is_featured?: boolean
  is_available?: boolean
  tags?: string[]
  sort_order?: number
}): Promise<void> {
  const { supabase } = await requireAuth()
  const payload = {
    restaurant_id: input.restaurant_id,
    category_id: input.category_id ?? null,
    name: input.name,
    description: input.description || null,
    price: Number(input.price) || 0,
    cost: Number(input.cost) || 0,
    image_url: input.image_url || null,
    is_featured: input.is_featured ?? false,
    is_available: input.is_available ?? true,
    tags: input.tags ?? [],
    sort_order: input.sort_order ?? 0,
  }
  const { error } = input.id
    ? await supabase.from("foodos_menu_items").update(payload).eq("id", input.id)
    : await supabase.from("foodos_menu_items").insert(payload)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/menu")
  revalidatePath("/panel/foodos/combos")
}

export async function deleteMenuItem(id: string): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_menu_items")
    .delete()
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/menu")
}

export async function bulkUpsertMenuItems(
  restaurantId: string,
  items: Array<{
    name: string
    category_id?: string | null
    description?: string | null
    price: number
    cost?: number
    tags?: string[]
  }>
): Promise<{ added: number }> {
  const { supabase } = await requireAuth()
  const rows = items.map((i) => ({
    restaurant_id: restaurantId,
    category_id: i.category_id ?? null,
    name: i.name,
    description: i.description || null,
    price: Number(i.price) || 0,
    cost: Number(i.cost) || 0,
    tags: i.tags ?? [],
    is_available: true,
  }))
  const { error } = await supabase.from("foodos_menu_items").insert(rows)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/menu")
  return { added: rows.length }
}

// ------------------------------------------------------------
// Modificadores de platillos (grupos de opciones + valores)
// ------------------------------------------------------------

export async function listOptionGroups(
  restaurantId: string
): Promise<FoodosItemOptionGroup[]> {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_item_option_groups")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("sort_order")
  if (error) throw new Error(error.message)
  return (data as FoodosItemOptionGroup[]) ?? []
}

export async function listOptionValues(
  restaurantId: string
): Promise<FoodosItemOptionValue[]> {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_item_option_values")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("sort_order")
  if (error) throw new Error(error.message)
  return (data as FoodosItemOptionValue[]) ?? []
}

export async function upsertOptionGroup(input: {
  id?: string
  restaurant_id: string
  item_id: string
  name: string
  is_required?: boolean
  min_select?: number
  max_select?: number
  sort_order?: number
}): Promise<void> {
  const { supabase } = await requireAuth()
  const payload = {
    restaurant_id: input.restaurant_id,
    item_id: input.item_id,
    name: input.name,
    is_required: input.is_required ?? false,
    min_select: Math.max(0, Number(input.min_select) || 0),
    max_select: Math.max(1, Number(input.max_select) || 1),
    sort_order: Number(input.sort_order) || 0,
  }
  const { error } = input.id
    ? await supabase
        .from("foodos_item_option_groups")
        .update(payload)
        .eq("id", input.id)
    : await supabase.from("foodos_item_option_groups").insert(payload)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/menu")
}

export async function deleteOptionGroup(id: string): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_item_option_groups")
    .delete()
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/menu")
}

export async function upsertOptionValue(input: {
  id?: string
  group_id: string
  restaurant_id: string
  name: string
  price_delta?: number
  is_available?: boolean
  sort_order?: number
}): Promise<void> {
  const { supabase } = await requireAuth()
  const payload = {
    group_id: input.group_id,
    restaurant_id: input.restaurant_id,
    name: input.name,
    price_delta: Number(input.price_delta) || 0,
    is_available: input.is_available ?? true,
    sort_order: Number(input.sort_order) || 0,
  }
  const { error } = input.id
    ? await supabase
        .from("foodos_item_option_values")
        .update(payload)
        .eq("id", input.id)
    : await supabase.from("foodos_item_option_values").insert(payload)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/menu")
}

export async function deleteOptionValue(id: string): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_item_option_values")
    .delete()
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/menu")
}

// ------------------------------------------------------------
// Combos y reglas de cross-sell
// ------------------------------------------------------------

export async function listCombos(restaurantId: string): Promise<FoodosCombo[]> {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_combos")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at")
  if (error) throw new Error(error.message)
  return (data as FoodosCombo[]) ?? []
}

export async function upsertCombo(input: {
  id?: string
  restaurant_id: string
  name: string
  price: number
  discount_pct: number
  item_ids: string[]
  is_active?: boolean
  highlight?: boolean
}): Promise<void> {
  const { supabase } = await requireAuth()
  const payload = {
    restaurant_id: input.restaurant_id,
    name: input.name,
    price: Number(input.price) || 0,
    discount_pct: Number(input.discount_pct) || 0,
    item_ids: input.item_ids ?? [],
    is_active: input.is_active ?? true,
    highlight: input.highlight ?? false,
  }
  const { error } = input.id
    ? await supabase.from("foodos_combos").update(payload).eq("id", input.id)
    : await supabase.from("foodos_combos").insert(payload)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/combos")
}

export async function deleteCombo(id: string): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase.from("foodos_combos").delete().eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/combos")
}

export async function listUpsellRules(
  restaurantId: string
): Promise<FoodosUpsellRule[]> {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_upsell_rules")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at")
  if (error) throw new Error(error.message)
  return (data as FoodosUpsellRule[]) ?? []
}

export async function upsertUpsellRule(input: {
  id?: string
  restaurant_id: string
  name: string
  trigger_type: FoodosRuleTriggerType
  trigger_value: FoodosUpsellRule["trigger_value"]
  suggested_items: string[]
  offer_text?: string | null
  boost_amount?: number
  is_active?: boolean
}): Promise<void> {
  const { supabase } = await requireAuth()
  const payload = {
    restaurant_id: input.restaurant_id,
    name: input.name,
    trigger_type: input.trigger_type,
    trigger_value: input.trigger_value,
    suggested_items: input.suggested_items ?? [],
    offer_text: input.offer_text || null,
    boost_amount: Number(input.boost_amount) || 0,
    is_active: input.is_active ?? true,
  }
  const { error } = input.id
    ? await supabase.from("foodos_upsell_rules").update(payload).eq("id", input.id)
    : await supabase.from("foodos_upsell_rules").insert(payload)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/combos")
}

export async function deleteUpsellRule(id: string): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_upsell_rules")
    .delete()
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/combos")
}

// ------------------------------------------------------------
// Pedidos
// ------------------------------------------------------------

/**
 * Resumen ligero de pedidos reales de la app para compararlos con las
 * ventas de mostrador registradas en /panel/ventas. Retorna null para
 * invitados o usuarios sin restaurante FoodOS (no redirige).
 */
export async function getOrdersSummary(): Promise<{
  todayCount: number
  todayRevenue: number
  weekCount: number
  weekRevenue: number
  pendingCount: number
} | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const supabase = await createClient()
  const { data: restaurant } = await supabase
    .from("foodos_restaurants")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!restaurant) return null

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: orders, error } = await supabase
    .from("foodos_orders")
    .select("total, status, created_at")
    .eq("restaurant_id", restaurant.id)
    .gte("created_at", startOfWeek)
  if (error) throw new Error(error.message)

  const cancelled: FoodosOrderStatus = "cancelled"
  const valid = (orders ?? []).filter((o) => o.status !== cancelled)
  const today = valid.filter((o) => o.created_at >= startOfDay)
  return {
    todayCount: today.length,
    todayRevenue: today.reduce((s, o) => s + o.total, 0),
    weekCount: valid.length,
    weekRevenue: valid.reduce((s, o) => s + o.total, 0),
    pendingCount: (orders ?? []).filter((o) => o.status === "pending").length,
  }
}

export async function listOrders(restaurantId: string) {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_orders")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Pedidos pagados del restaurante del usuario para sincronizarlos como
 * ventas del panel (ventas-entries). El mapeo y la deduplicación viven en
 * src/lib/panel/foodos-sync.ts (función pura) y el hook
 * useFoodosVentasSync los inserta como SaleEntry con id estable
 * `foodos-<orderId>-<itemId>`.
 */
export async function listOrdersForSync(): Promise<FoodosOrder[]> {
  const user = await getCurrentUser()
  if (!user) return []
  const supabase = await createClient()
  const { data: restaurant } = await supabase
    .from("foodos_restaurants")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!restaurant) return []

  const { data, error } = await supabase
    .from("foodos_orders")
    .select("id, items, total, discount, subtotal, delivery_fee, channel, fulfillment, status, payment_status, payment_method, customer_name, created_at")
    .eq("restaurant_id", restaurant.id)
    .eq("payment_status", "paid")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return (data as FoodosOrder[]) ?? []
}

export async function updateOrderStatus(
  orderId: string,
  status: FoodosOrderStatus
): Promise<void> {
  const { supabase } = await requireAuth()

  const { data: current, error: readError } = await supabase
    .from("foodos_orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle()
  if (readError) throw new Error(readError.message)

  // Sin cambio real no se reescribe ni se reavisa. Los botones de estado
  // del panel y el tablero de cocina pueden dispararse dos veces con el
  // mismo valor; el UPDATE es idempotente pero el aviso al comensal no.
  if ((current as { status: string } | null)?.status === status) return

  const { error } = await supabase
    .from("foodos_orders")
    .update({ status })
    .eq("id", orderId)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/pedidos")

  // after(): el aviso se manda después de responder para no dejar al
  // dueño esperando al mensajero, pero dentro de la vida de la función
  // (fire-and-forget se cancelaría al resolver la respuesta).
  after(() => {
    void notifyFoodosCustomer(orderId, `status:${status}`)
  })
}

// ------------------------------------------------------------
// Gate de nivel (FoodOS entitlements)
//
// Las escrituras son la frontera real de seguridad y siempre lanzan. Las
// lecturas degradan a vacío para que la pantalla pueda mostrar su propio
// estado bloqueado en lugar de romperse con un error de servidor.
// ------------------------------------------------------------

/** `true` si el restaurante tiene la capacidad; usado por las lecturas. */
async function canUseMarketingIa(): Promise<boolean> {
  try {
    await requireFoodosFeature("marketing_ia")
    return true
  } catch {
    return false
  }
}

// ------------------------------------------------------------
// Automatizaciones (recurrencia WhatsApp)
// ------------------------------------------------------------

export async function listAutomations(
  restaurantId: string
): Promise<FoodosAutomation[]> {
  if (!(await canUseMarketingIa())) return []
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_automations")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at")
  if (error) throw new Error(error.message)
  return (data as FoodosAutomation[]) ?? []
}

export async function upsertAutomation(input: {
  id?: string
  restaurant_id: string
  type: FoodosAutomation["type"]
  name: string
  trigger_config?: FoodosAutomation["trigger_config"]
  message?: string | null
  /** Segundo mensaje del experimento A/B. Sin él, `ab_test` no tiene efecto. */
  message_b?: string | null
  ab_test?: boolean
  /** Audiencia RFM o segmento simple; ver `effectiveAudience()`. */
  audience?: string | null
  channel?: FoodosMarketingChannel
  incentive_config?: FoodosAutomation["incentive_config"]
  is_active?: boolean
}): Promise<void> {
  await requireFoodosFeature("marketing_ia")
  const { supabase } = await requireAuth()
  const messageB = input.message_b?.trim() || null
  const payload = {
    restaurant_id: input.restaurant_id,
    type: input.type,
    name: input.name,
    trigger_config: input.trigger_config ?? {},
    message: input.message || null,
    message_b: messageB,
    // Un A/B sin segundo mensaje no es un experimento: se normaliza a false.
    ab_test: Boolean(input.ab_test && messageB),
    audience: input.audience?.trim() || null,
    channel: input.channel ?? "whatsapp",
    incentive_config: input.incentive_config ?? {},
    is_active: input.is_active ?? true,
  }
  const { error } = input.id
    ? await supabase.from("foodos_automations").update(payload).eq("id", input.id)
    : await supabase.from("foodos_automations").insert(payload)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/clientes")
}

export async function toggleAutomation(
  id: string,
  isActive: boolean
): Promise<void> {
  await requireFoodosFeature("marketing_ia")
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_automations")
    .update({ is_active: isActive })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/clientes")
}

// ------------------------------------------------------------
// Clientes (CRM)
// ------------------------------------------------------------

export async function updateCustomerProfile(input: {
  id: string
  /** `YYYY-MM-DD`; `null` borra la fecha. */
  birthday?: string | null
  sms_opt_in?: boolean
}): Promise<void> {
  await requireFoodosFeature("marketing_ia")
  const { supabase, user } = await requireAuth()
  // Defensa en profundidad: el RLS ya protege, pero verificamos la
  // propiedad del restaurante antes de escribir.
  const { data: owned } = await supabase
    .from("foodos_customers")
    .select("id, foodos_restaurants!inner(user_id)")
    .eq("id", input.id)
    .eq("foodos_restaurants.user_id", user.id)
    .maybeSingle()
  if (!owned) throw new Error("Cliente no encontrado")

  const patch: { birthday?: string | null; sms_opt_in?: boolean } = {}
  if (input.birthday !== undefined) {
    const birthday = input.birthday?.trim() || null
    if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
      throw new Error("Fecha de cumpleaños inválida")
    }
    patch.birthday = birthday
  }
  if (input.sms_opt_in !== undefined) patch.sms_opt_in = Boolean(input.sms_opt_in)
  if (Object.keys(patch).length === 0) return

  const { error } = await supabase
    .from("foodos_customers")
    .update(patch)
    .eq("id", input.id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/clientes")
}

export async function listCampaigns(restaurantId: string) {
  if (!(await canUseMarketingIa())) return []
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_campaigns")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return (data as FoodosCampaign[]) ?? []
}

export async function insertCampaign(input: {
  restaurant_id: string
  automation_id?: string | null
  customer_id?: string | null
  scheduled_for?: string | null
  status?: string
  channel?: string
}): Promise<{ data: FoodosCampaign }> {
  await requireFoodosFeature("marketing_ia")
  const { supabase, user } = await requireAuth()
  // Defensa en profundidad: el RLS ya protege, pero verificamos la
  // propiedad del restaurante explícitamente antes de insertar.
  const { data: owned } = await supabase
    .from("foodos_restaurants")
    .select("id")
    .eq("id", input.restaurant_id)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!owned) throw new Error("Restaurante no encontrado")

  const { data, error } = await supabase
    .from("foodos_campaigns")
    .insert({
      restaurant_id: input.restaurant_id,
      automation_id: input.automation_id ?? null,
      customer_id: input.customer_id ?? null,
      scheduled_for: input.scheduled_for ?? null,
      status: input.status ?? "scheduled",
      channel: input.channel ?? "whatsapp",
    })
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/clientes")
  return { data: data as FoodosCampaign }
}

export async function runCampaignNow(
  campaignId: string
): Promise<{ sent: number; failed: number; skipped: number }> {
  await requireFoodosFeature("marketing_ia")
  // Verifica sesión y propiedad antes de delegar al motor (service client)
  const { supabase, user } = await requireAuth()
  const { data: campaign } = await supabase
    .from("foodos_campaigns")
    .select("id, foodos_restaurants!inner(user_id)")
    .eq("id", campaignId)
    .eq("foodos_restaurants.user_id", user.id)
    .maybeSingle()
  if (!campaign) throw new Error("Campaña no encontrada")

  const { runFoodosCampaign } = await import("@/lib/foodos-campaigns")
  try {
    const result = await runFoodosCampaign(campaignId)
    revalidatePath("/panel/foodos/clientes")
    return result
  } catch (err) {
    // No dejar la campaña colgada en "scheduled" si la ejecución explota
    const service = await createServiceClient()
    await service
      .from("foodos_campaigns")
      .update({
        status: "failed" satisfies FoodosCampaignStatus,
        error: err instanceof Error ? err.message : "Error al ejecutar",
      })
      .eq("id", campaignId)
    revalidatePath("/panel/foodos/clientes")
    throw err
  }
}

export async function deleteCampaign(id: string): Promise<void> {
  await requireFoodosFeature("marketing_ia")
  const { supabase, user } = await requireAuth()
  // Defensa en profundidad: el RLS ya protege, pero verificamos la
  // propiedad antes de borrar (mismo patrón que runCampaignNow).
  const { data: owned } = await supabase
    .from("foodos_campaigns")
    .select("id, foodos_restaurants!inner(user_id)")
    .eq("id", id)
    .eq("foodos_restaurants.user_id", user.id)
    .maybeSingle()
  if (!owned) throw new Error("Campaña no encontrada")

  const { error } = await supabase.from("foodos_campaigns").delete().eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/clientes")
}

// ------------------------------------------------------------
// Marketing IA (nivel Plata)
//
// Mismo contrato que el resto: las lecturas degradan, las escrituras lanzan.
// La IA solo redacta la plantilla; nunca fija precios, audiencias ni enlaces.
// ------------------------------------------------------------

export interface CampaignAbStats {
  variant: FoodosCampaignVariant
  sent: number
  failed: number
  total: number
}

export async function getCampaignAbStats(
  restaurantId: string,
  days = 30
): Promise<CampaignAbStats[]> {
  if (!(await canUseMarketingIa())) return []
  const { supabase } = await requireAuth()
  const window = Math.min(Math.max(Math.trunc(days) || 30, 1), 365)
  const since = new Date(Date.now() - window * 86_400_000).toISOString()

  const { data, error } = await supabase
    .from("foodos_campaigns")
    .select("variant, status")
    .eq("restaurant_id", restaurantId)
    .not("variant", "is", null)
    .gte("created_at", since)
    .limit(5000)
  if (error) throw new Error(error.message)

  const tally = tallyAbTest(
    (data ?? []) as { variant: FoodosCampaignVariant | null; status: string }[]
  )
  return (["a", "b"] as const).map((variant) => ({
    variant,
    sent: tally[variant].sent,
    failed: tally[variant].failed,
    total: tally[variant].sent + tally[variant].failed,
  }))
}

/**
 * Redacta una plantilla de campaña con IA a partir de una instrucción breve.
 * `source: "template"` significa que la IA no estaba disponible y el resultado
 * es la plantilla determinista: en ambos casos el texto es usable.
 */
export async function generateCampaignCopy(input: {
  restaurant_id: string
  brief: string
  offer?: string | null
  audienceLabel?: string | null
  tone?: CampaignTone
}): Promise<CampaignCopyOutput> {
  await requireFoodosFeature("marketing_ia")
  const { supabase, user } = await requireAuth()
  const { data: owned } = await supabase
    .from("foodos_restaurants")
    .select("id, name")
    .eq("id", input.restaurant_id)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!owned) throw new Error("Restaurante no encontrado")

  const brief = input.brief.trim()
  if (!brief) throw new Error("Describe qué quieres comunicar")

  const { generateCampaignCopy: generate } = await import("@/lib/foodos-ai/copy")
  return generate({
    restaurantName: String(owned.name ?? ""),
    brief: brief.slice(0, 600),
    offer: input.offer?.trim() || null,
    audienceLabel: input.audienceLabel?.trim() || null,
    tone: input.tone,
    restaurantId: input.restaurant_id,
  })
}

// ------------------------------------------------------------
// Cupones del restaurante
// ------------------------------------------------------------

export async function listCoupons(restaurantId: string): Promise<FoodosCoupon[]> {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_coupons")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data as FoodosCoupon[]) ?? []
}

export async function upsertCoupon(input: {
  id?: string
  restaurant_id: string
  code: string
  type: "percent" | "fixed"
  value: number
  min_order?: number
  max_uses?: number | null
  is_active?: boolean
  expires_at?: string | null
}): Promise<void> {
  const { supabase } = await requireAuth()
  const payload = {
    restaurant_id: input.restaurant_id,
    code: input.code.trim().toUpperCase(),
    type: input.type,
    value: Number(input.value) || 0,
    min_order: Number(input.min_order) || 0,
    max_uses: input.max_uses ?? null,
    is_active: input.is_active ?? true,
    expires_at: input.expires_at || null,
  }
  const { error } = input.id
    ? await supabase.from("foodos_coupons").update(payload).eq("id", input.id)
    : await supabase.from("foodos_coupons").insert(payload)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/cupones")
}

export async function deleteCoupon(id: string): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase.from("foodos_coupons").delete().eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/cupones")
}

// ------------------------------------------------------------
// Overrides de menú por sucursal
// ------------------------------------------------------------

export async function listBranchMenuOverrides(
  branchId: string
): Promise<FoodosBranchMenuOverride[]> {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_branch_menu_overrides")
    .select("*")
    .eq("branch_id", branchId)
  if (error) throw new Error(error.message)
  return (data as FoodosBranchMenuOverride[]) ?? []
}

/** Guarda (o borra, si ambos campos son null) el override de un ítem en una sucursal. */
export async function upsertBranchMenuOverride(input: {
  branch_id: string
  item_id: string
  price?: number | null
  is_available?: boolean | null
}): Promise<void> {
  const { supabase } = await requireAuth()
  const price = input.price ?? null
  const isAvailable = input.is_available ?? null
  if (price === null && isAvailable === null) {
    const { error } = await supabase
      .from("foodos_branch_menu_overrides")
      .delete()
      .eq("branch_id", input.branch_id)
      .eq("item_id", input.item_id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from("foodos_branch_menu_overrides")
      .upsert(
        { branch_id: input.branch_id, item_id: input.item_id, price, is_available: isAvailable },
        { onConflict: "branch_id,item_id" }
      )
    if (error) throw new Error(error.message)
  }
  revalidatePath("/panel/foodos/menu")
}

// ------------------------------------------------------------
// Pedidos: confirmar pago manual (transferencia/efectivo)
// ------------------------------------------------------------

export async function markOrderPaid(orderId: string): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_orders")
    .update({ payment_status: "paid" })
    .eq("id", orderId)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/pedidos")

  after(() => {
    void notifyFoodosCustomer(orderId, "payment:paid")
  })
}

// ------------------------------------------------------------
// Programa de lealtad + store credit
// ------------------------------------------------------------

export async function getLoyaltyProgram(
  restaurantId: string
): Promise<FoodosLoyaltyProgram | null> {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_loyalty_programs")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as FoodosLoyaltyProgram | null) ?? null
}

export async function upsertLoyaltyProgram(input: {
  restaurant_id: string
  points_per_100: number
  point_value: number
  is_active: boolean
}): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_loyalty_programs")
    .upsert(
      {
        restaurant_id: input.restaurant_id,
        points_per_100: Math.max(0, Number(input.points_per_100) || 0),
        point_value: Math.max(0, Number(input.point_value) || 0),
        is_active: input.is_active,
      },
      { onConflict: "restaurant_id" }
    )
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/clientes")
}

/** Ajuste manual de store credit (ej. compensación por mala experiencia). */
export async function adjustCustomerCredit(
  customerId: string,
  amount: number
): Promise<void> {
  const { supabase } = await requireAuth()
  const { data: customer, error: readErr } = await supabase
    .from("foodos_customers")
    .select("store_credit")
    .eq("id", customerId)
    .single()
  if (readErr) throw new Error(readErr.message)
  const next = Math.max(0, Number(customer.store_credit) + amount)
  const { error } = await supabase
    .from("foodos_customers")
    .update({ store_credit: next })
    .eq("id", customerId)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/clientes")
}

// ------------------------------------------------------------
// Reseñas (moderación)
// ------------------------------------------------------------

export async function listReviews(restaurantId: string): Promise<FoodosReview[]> {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_reviews")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return (data as FoodosReview[]) ?? []
}

export async function setReviewVisibility(id: string, isVisible: boolean): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_reviews")
    .update({ is_visible: isVisible })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/clientes")
}

// ------------------------------------------------------------
// Importación CSV del menú
// ------------------------------------------------------------

/**
 * Importa filas de CSV (categoria,nombre,descripcion,precio,costo,tags).
 * Crea las categorías faltantes por nombre y agrega los platillos.
 */
export async function importMenuCsv(
  restaurantId: string,
  rows: Array<{
    category_name?: string | null
    name: string
    description?: string | null
    price: number
    cost?: number
    tags?: string[]
  }>
): Promise<{ added: number; categories: number }> {
  const { supabase } = await requireAuth()

  // Categorías existentes por nombre (lowercase)
  const { data: cats, error: catErr } = await supabase
    .from("foodos_menu_categories")
    .select("id, name, sort_order")
    .eq("restaurant_id", restaurantId)
  if (catErr) throw new Error(catErr.message)

  const byName = new Map((cats ?? []).map((c) => [c.name.trim().toLowerCase(), c.id]))
  let sortOrder = (cats ?? []).length
  let createdCategories = 0

  // Crear categorías faltantes
  const wanted = [...new Set(rows.map((r) => r.category_name?.trim().toLowerCase()).filter(Boolean))] as string[]
  for (const name of wanted) {
    if (byName.has(name)) continue
    const displayName = rows.find((r) => r.category_name?.trim().toLowerCase() === name)?.category_name?.trim() ?? name
    const { data, error } = await supabase
      .from("foodos_menu_categories")
      .insert({ restaurant_id: restaurantId, name: displayName, sort_order: sortOrder++ })
      .select("id")
      .single()
    if (error) throw new Error(error.message)
    byName.set(name, data.id)
    createdCategories++
  }

  const itemRows = rows.map((r) => ({
    restaurant_id: restaurantId,
    category_id: r.category_name ? byName.get(r.category_name.trim().toLowerCase()) ?? null : null,
    name: r.name.trim(),
    description: r.description?.trim() || null,
    price: Number(r.price) || 0,
    cost: Number(r.cost) || 0,
    tags: r.tags ?? [],
    is_available: true,
  }))
  const { error } = await supabase.from("foodos_menu_items").insert(itemRows)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/menu")
  return { added: itemRows.length, categories: createdCategories }
}

// ------------------------------------------------------------
// Webhooks salientes (notificaciones de pedido a URL externa)
// ------------------------------------------------------------

export async function listWebhooks(restaurantId: string): Promise<FoodosWebhook[]> {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_webhooks")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at")
  if (error) throw new Error(error.message)
  return (data as FoodosWebhook[]) ?? []
}

export async function addWebhook(restaurantId: string, url: string): Promise<void> {
  const { supabase } = await requireAuth()
  const parsed = new URL(url) // lanza si no es URL válida
  if (parsed.protocol !== "https:") throw new Error("La URL del webhook debe ser HTTPS")
  const { error } = await supabase
    .from("foodos_webhooks")
    .insert({ restaurant_id: restaurantId, url })
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/restaurante")
}

export async function toggleWebhook(id: string, isActive: boolean): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_webhooks")
    .update({ is_active: isActive })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/restaurante")
}

export async function deleteWebhook(id: string): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase.from("foodos_webhooks").delete().eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/restaurante")
}

export async function listWebhookDeliveries(restaurantId: string): Promise<FoodosWebhookDelivery[]> {
  const { supabase } = await requireAuth()
  const { data: hooks, error: hErr } = await supabase
    .from("foodos_webhooks")
    .select("id")
    .eq("restaurant_id", restaurantId)
  if (hErr) throw new Error(hErr.message)
  const ids = (hooks ?? []).map((h) => h.id)
  if (!ids.length) return []
  const { data, error } = await supabase
    .from("foodos_webhook_deliveries")
    .select("*")
    .in("webhook_id", ids)
    .order("attempted_at", { ascending: false })
    .limit(10)
  if (error) throw new Error(error.message)
  return (data as FoodosWebhookDelivery[]) ?? []
}

// ------------------------------------------------------------
// WhatsApp Business del restaurante (conexión + curaduría)
// ------------------------------------------------------------

/** Conexión sin el token (nunca sale al cliente). */
export async function getWhatsAppConnection(
  restaurantId: string
): Promise<FoodosWhatsAppConnection | null> {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_whatsapp_connections")
    .select("id, restaurant_id, phone_number_id, waba_id, display_phone, status, status_detail, verified_at, created_at")
    .eq("restaurant_id", restaurantId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as FoodosWhatsAppConnection | null) ?? null
}

/** Guarda credenciales (cifradas) y las verifica contra Graph API. */
export async function saveWhatsAppConnection(input: {
  restaurant_id: string
  phone_number_id: string
  waba_id: string
  access_token: string
}): Promise<{ status: FoodosWhatsAppStatus; detail: string | null }> {
  const { supabase } = await requireAuth()
  const { encryptToken, verifyWhatsAppConnection } = await import("@/lib/foodos-whatsapp")

  const config = {
    accessToken: input.access_token.trim(),
    phoneNumberId: input.phone_number_id.trim(),
    wabaId: input.waba_id.trim(),
  }
  const check = await verifyWhatsAppConnection(config)

  const { error } = await supabase
    .from("foodos_whatsapp_connections")
    .upsert(
      {
        restaurant_id: input.restaurant_id,
        phone_number_id: config.phoneNumberId,
        waba_id: config.wabaId,
        access_token_enc: encryptToken(config.accessToken),
        display_phone: check.displayPhone,
        status: check.ok ? "connected" : "error",
        status_detail: check.detail,
        verified_at: new Date().toISOString(),
      },
      { onConflict: "restaurant_id" }
    )
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/whatsapp")
  return { status: check.ok ? "connected" : "error", detail: check.detail }
}

export async function deleteWhatsAppConnection(restaurantId: string): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_whatsapp_connections")
    .delete()
    .eq("restaurant_id", restaurantId)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/whatsapp")
}

/** Curaduría: visibilidad individual en el catálogo de WhatsApp. */
export async function setItemWhatsAppVisible(
  itemId: string,
  visible: boolean,
  position?: number | null
): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_menu_items")
    .update({ whatsapp_visible: visible, whatsapp_position: position ?? null })
    .eq("id", itemId)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/whatsapp")
}

/** Reordena el catálogo: array ordenado de item_ids (posiciones 1..N). */
export async function reorderWhatsAppCatalog(
  restaurantId: string,
  orderedItemIds: string[]
): Promise<void> {
  const { supabase } = await requireAuth()
  for (let i = 0; i < orderedItemIds.length; i++) {
    const { error } = await supabase
      .from("foodos_menu_items")
      .update({ whatsapp_visible: true, whatsapp_position: i + 1 })
      .eq("id", orderedItemIds[i])
      .eq("restaurant_id", restaurantId)
    if (error) throw new Error(error.message)
  }
  revalidatePath("/panel/foodos/whatsapp")
}

/**
 * Sincroniza el catálogo curado (selección + orden) al catálogo nativo de
 * WhatsApp Commerce del restaurante. Meta muestra primero los más recientes,
 * así que se suben en orden inverso al deseado (best-effort; el orden
 * garantizado es vía mensajes product_list).
 */
export async function syncWhatsAppCatalog(
  restaurantId: string
): Promise<{ added: number; removed: number }> {
  const { supabase } = await requireAuth()

  // Verificar propiedad y conexión
  const { data: conn } = await supabase
    .from("foodos_whatsapp_connections")
    .select("status")
    .eq("restaurant_id", restaurantId)
    .maybeSingle()
  if (!conn) throw new Error("Primero conecta tu WhatsApp Business")
  if (conn.status !== "connected") throw new Error("La conexión de WhatsApp tiene un error; revísala")

  const { data: items, error: itemsErr } = await supabase
    .from("foodos_menu_items")
    .select("*")
    .eq("restaurant_id", restaurantId)
  if (itemsErr) throw new Error(itemsErr.message)

  const { getRestaurantWhatsAppConfig, buildCatalogProducts } = await import("@/lib/foodos-whatsapp")
  const { createServiceClient } = await import("@/lib/supabase/service")
  const { syncCatalog } = await import("@/lib/whatsapp")

  const service = await createServiceClient()
  const config = await getRestaurantWhatsAppConfig(service, restaurantId)
  if (!config) throw new Error("No se pudieron leer las credenciales")

  // Orden inverso: Meta lista primero lo último agregado.
  const products = buildCatalogProducts((items as FoodosMenuItem[]) ?? []).reverse()
  return syncCatalog(products, config)
}

/**
 * Envía el catálogo ORDENADO (product_list) a un cliente por WhatsApp.
 * El orden de las secciones es exactamente el de la curaduría.
 */
export async function sendCatalogToCustomer(
  restaurantId: string,
  toPhone: string
): Promise<void> {
  const { supabase } = await requireAuth()
  const { data: conn } = await supabase
    .from("foodos_whatsapp_connections")
    .select("status")
    .eq("restaurant_id", restaurantId)
    .maybeSingle()
  if (conn?.status !== "connected") throw new Error("Conecta tu WhatsApp Business primero")

  const [itemsRes, catsRes] = await Promise.all([
    supabase.from("foodos_menu_items").select("*").eq("restaurant_id", restaurantId),
    supabase.from("foodos_menu_categories").select("*").eq("restaurant_id", restaurantId),
  ])
  if (itemsRes.error) throw new Error(itemsRes.error.message)

  const wa = await import("@/lib/foodos-whatsapp")
  const sections = wa.buildProductListSections(
    (itemsRes.data as FoodosMenuItem[]) ?? [],
    (catsRes.data as FoodosMenuCategory[]) ?? []
  )
  if (sections.length === 0) throw new Error("Tu catálogo de WhatsApp está vacío")

  const { createServiceClient } = await import("@/lib/supabase/service")
  const service = await createServiceClient()
  const config = await wa.getRestaurantWhatsAppConfig(service, restaurantId)
  if (!config) throw new Error("No se pudieron leer las credenciales")

  const digits = toPhone.replace(/\D/g, "")
  if (digits.length < 10) throw new Error("Teléfono inválido")
  await wa.sendCatalogProductList({
    config,
    to: digits,
    sections,
    headerText: "Nuestro menú",
  })

  await supabase.from("foodos_whatsapp_messages").insert({
    restaurant_id: restaurantId,
    direction: "outbound",
    customer_phone: digits,
    type: "product_list",
    content: `Catálogo (${sections.reduce((s, x) => s + x.product_items.length, 0)} platillos)`,
    status: "sent",
  })
}

/** Activa/desactiva la auto-respuesta con el catálogo al recibir mensajes. */
export async function setAutoReplyCatalog(
  restaurantId: string,
  enabled: boolean,
  text?: string | null
): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_whatsapp_connections")
    .update({ auto_reply_catalog: enabled, auto_reply_text: text ?? null })
    .eq("restaurant_id", restaurantId)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/whatsapp")
}

/**
 * Broadcast a un segmento del CRM con una plantilla aprobada en la WABA
 * del restaurante. Registra la campaña en foodos_campaigns.
 */
export async function broadcastWhatsAppSegment(input: {
  restaurant_id: string
  segment: FoodosCustomerSegment | "all"
  template_name: string
  language_code?: string
}): Promise<{ sent: number; failed: number }> {
  const { supabase } = await requireAuth()
  const { data: conn } = await supabase
    .from("foodos_whatsapp_connections")
    .select("status")
    .eq("restaurant_id", input.restaurant_id)
    .maybeSingle()
  if (conn?.status !== "connected") throw new Error("Conecta tu WhatsApp Business primero")

  let query = supabase
    .from("foodos_customers")
    .select("id, phone")
    .eq("restaurant_id", input.restaurant_id)
  if (input.segment !== "all") query = query.eq("segment", input.segment)
  const { data: customers, error } = await query.limit(500)
  if (error) throw new Error(error.message)
  if (!customers?.length) throw new Error("No hay clientes en ese segmento")

  const wa = await import("@/lib/foodos-whatsapp")
  const { createServiceClient } = await import("@/lib/supabase/service")
  const { sendBroadcast } = await import("@/lib/whatsapp")
  const service = await createServiceClient()
  const config = await wa.getRestaurantWhatsAppConfig(service, input.restaurant_id)
  if (!config) throw new Error("No se pudieron leer las credenciales")

  const result = await sendBroadcast(
    {
      recipients: customers.map((c) => c.phone),
      templateName: input.template_name.trim(),
      languageCode: input.language_code || "es_MX",
    },
    config
  )

  // Historial en foodos_campaigns (una fila por cliente)
  await supabase.from("foodos_campaigns").insert(
    customers.map((c) => ({
      restaurant_id: input.restaurant_id,
      customer_id: c.id,
      status: "sent",
      channel: "whatsapp",
    }))
  )

  revalidatePath("/panel/foodos/clientes")
  return result
}

// ------------------------------------------------------------
// Inbox de WhatsApp del restaurante
// ------------------------------------------------------------

export async function listWaMessages(
  restaurantId: string,
  limit = 500
): Promise<FoodosWhatsAppMessage[]> {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_whatsapp_messages")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data as FoodosWhatsAppMessage[]) ?? []
}

export async function markWaConversationRead(
  restaurantId: string,
  customerPhone: string
): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_whatsapp_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId)
    .eq("customer_phone", customerPhone)
    .eq("direction", "inbound")
    .is("read_at", null)
  if (error) throw new Error(error.message)
}

/** Responde texto a un cliente (ventana de 24h de WhatsApp). */
export async function sendWaReply(
  restaurantId: string,
  customerPhone: string,
  text: string
): Promise<void> {
  const { supabase } = await requireAuth()
  const trimmed = text.trim()
  if (!trimmed) return

  const wa = await import("@/lib/foodos-whatsapp")
  const { createServiceClient } = await import("@/lib/supabase/service")
  const { sendTextMessage } = await import("@/lib/whatsapp")
  const service = await createServiceClient()
  const config = await wa.getRestaurantWhatsAppConfig(service, restaurantId)
  if (!config) throw new Error("Conecta tu WhatsApp Business primero")

  const digits = customerPhone.replace(/\D/g, "")
  await sendTextMessage({ to: digits, text: trimmed.slice(0, 4000) }, config)

  await supabase.from("foodos_whatsapp_messages").insert({
    restaurant_id: restaurantId,
    direction: "outbound",
    customer_phone: digits,
    type: "text",
    content: trimmed.slice(0, 4000),
    status: "sent",
  })
}

// ------------------------------------------------------------
// Mesero IA (nivel Diamante)
//
// Mismo contrato que Marketing IA: las escrituras lanzan
// (`requireFoodosFeature`), las lecturas degradan a vacío para que la
// pantalla muestre su estado bloqueado en lugar de un error de servidor.
// ------------------------------------------------------------

export interface MeseroSettings {
  restaurant_id: string
  is_enabled: boolean
  tone: "amable" | "formal" | "rapido" | "divertido"
  greeting: string | null
  handoff_enabled: boolean
  max_items: number
  daily_reply_cap: number
  business_hours_only: boolean
}

export interface MeseroSessionRow {
  id: string
  customer_phone: string
  state: string
  pending_question: string | null
  order_id: string | null
  handoff_at: string | null
  message_count: number
  replies_today: number
  last_message_at: string | null
  created_at: string
}

export interface MeseroMessageRow {
  id: string
  session_id: string
  direction: "inbound" | "outbound" | "human"
  content: string
  source: "llm" | "template" | null
  created_at: string
}

export interface MeseroStats {
  conversations: number
  handoffs: number
  orders: number
  conversion: number
  avgTicket: number
}

/** `true` si el restaurante tiene la capacidad; usado por las lecturas. */
async function canUseMeseroIa(): Promise<boolean> {
  try {
    await requireFoodosFeature("mesero_ia")
    return true
  } catch {
    return false
  }
}

export async function getMeseroSettings(
  restaurantId: string
): Promise<MeseroSettings | null> {
  if (!(await canUseMeseroIa())) return null
  const { supabase } = await requireAuth()
  const { data } = await supabase
    .from("foodos_ai_settings")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle()
  return (data as MeseroSettings | null) ?? null
}

export async function upsertMeseroSettings(input: {
  restaurant_id: string
  is_enabled: boolean
  tone: "amable" | "formal" | "rapido" | "divertido"
  greeting: string | null
  handoff_enabled: boolean
  max_items: number
  daily_reply_cap: number
  business_hours_only: boolean
}): Promise<void> {
  await requireFoodosFeature("mesero_ia")
  const { supabase } = await requireAuth()

  const maxItems = Math.min(Math.max(Math.round(Number(input.max_items) || 20), 1), 50)
  const dailyCap = Math.min(Math.max(Math.round(Number(input.daily_reply_cap) || 0), 0), 2000)

  const { error } = await supabase.from("foodos_ai_settings").upsert(
    {
      restaurant_id: input.restaurant_id,
      is_enabled: Boolean(input.is_enabled),
      tone: input.tone,
      greeting: input.greeting?.trim() ? input.greeting.trim().slice(0, 500) : null,
      handoff_enabled: Boolean(input.handoff_enabled),
      max_items: maxItems,
      daily_reply_cap: dailyCap,
      business_hours_only: Boolean(input.business_hours_only),
    },
    { onConflict: "restaurant_id" }
  )
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/mesero-ia")
}

/** Sesiones ordenadas por actividad reciente. */
export async function listMeseroSessions(
  restaurantId: string,
  limit = 50
): Promise<MeseroSessionRow[]> {
  if (!(await canUseMeseroIa())) return []
  const { supabase } = await requireAuth()
  const { data } = await supabase
    .from("foodos_ai_sessions")
    .select(
      "id, customer_phone, state, pending_question, order_id, handoff_at, message_count, replies_today, last_message_at, created_at"
    )
    .eq("restaurant_id", restaurantId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(Math.min(Math.max(limit, 1), 200))
  return (data ?? []) as MeseroSessionRow[]
}

export async function listMeseroMessages(
  sessionId: string,
  limit = 100
): Promise<MeseroMessageRow[]> {
  if (!(await canUseMeseroIa())) return []
  const { supabase } = await requireAuth()
  const { data } = await supabase
    .from("foodos_ai_messages")
    .select("id, session_id, direction, content, source, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 300))
  return (data ?? []) as MeseroMessageRow[]
}

/** El humano toma la conversación: la IA deja de responder. */
export async function takeOverMeseroSession(sessionId: string): Promise<void> {
  await requireFoodosFeature("mesero_ia")
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_ai_sessions")
    .update({ handoff_at: new Date().toISOString(), state: "handoff", pending_question: null })
    .eq("id", sessionId)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/mesero-ia")
}

/** La IA retoma la conversación desde cero (borrador limpio). */
export async function resumeMeseroSession(sessionId: string): Promise<void> {
  await requireFoodosFeature("mesero_ia")
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_ai_sessions")
    .update({
      handoff_at: null,
      state: "browsing",
      pending_question: null,
      draft: {},
    })
    .eq("id", sessionId)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/mesero-ia")
}

/** Métricas de las últimas N horas de conversación. */
export async function getMeseroStats(
  restaurantId: string,
  days = 30
): Promise<MeseroStats> {
  const empty: MeseroStats = {
    conversations: 0,
    handoffs: 0,
    orders: 0,
    conversion: 0,
    avgTicket: 0,
  }
  if (!(await canUseMeseroIa())) return empty
  const { supabase } = await requireAuth()

  const since = new Date(Date.now() - Math.min(Math.max(days, 1), 365) * 86_400_000).toISOString()
  const { data: sessions } = await supabase
    .from("foodos_ai_sessions")
    .select("id, order_id, handoff_at")
    .eq("restaurant_id", restaurantId)
    .gte("last_message_at", since)

  const rows = sessions ?? []
  const orderIds = rows.map((r) => r.order_id).filter((id): id is string => Boolean(id))

  let avgTicket = 0
  if (orderIds.length) {
    const { data: orders } = await supabase
      .from("foodos_orders")
      .select("total")
      .in("id", orderIds)
    const totals = (orders ?? []).map((o) => Number(o.total) || 0)
    if (totals.length) {
      avgTicket = totals.reduce((s, t) => s + t, 0) / totals.length
    }
  }

  const conversations = rows.length
  const orders = orderIds.length
  return {
    conversations,
    handoffs: rows.filter((r) => r.handoff_at).length,
    orders,
    conversion: conversations ? orders / conversations : 0,
    avgTicket,
  }
}

// ============================================================
// Flotilla (nivel Oro)
// ============================================================
// Mismo contrato que el resto del panel: las ESCRITURAS exigen el nivel y
// lanzan si falta; las LECTURAS degradan a un valor vacío para que la página
// pueda pintar el candado en vez de reventar.
// ============================================================

export interface FlotillaCourierRow {
  id: string
  name: string
  phone: string | null
  vehicle: "moto" | "bici" | "auto" | "a_pie"
  capacity: number
  shift_start: string | null
  shift_end: string | null
  is_active: boolean
  notes: string | null
  load: number
  /** El enlace móvil del repartidor está activo (tiene token). */
  has_link: boolean
}

export interface FlotillaZoneRow {
  id: string
  name: string
  branch_id: string | null
  center_lat: number | null
  center_lng: number | null
  radius_km: number | null
  fee: number
  min_order: number
  eta_minutes: number
  payout_mode: "fixed" | "per_km" | "percent"
  payout_value: number
  color: string | null
  sort_order: number
  is_active: boolean
}

export interface FlotillaDeliveryRow {
  id: string
  order_id: string
  courier_id: string | null
  courier_name: string | null
  status: "pending" | "assigned" | "picked_up" | "delivered" | "failed" | "cancelled"
  provider: "in_house" | "uber_direct"
  provider_tracking_url: string | null
  zone_name: string | null
  dropoff_address: string
  dropoff_notes: string | null
  customer_name: string | null
  order_total: number
  fee: number
  courier_payout: number
  distance_km: number | null
  eta_minutes: number | null
  created_at: string
  assigned_at: string | null
  picked_up_at: string | null
}

export interface FlotillaStats {
  active: number
  unassigned: number
  deliveredToday: number
  failedToday: number
  avgDeliveryMinutes: number | null
  feesToday: number
  payoutsToday: number
  couriers: number
  zones: number
}

/** URL pública del sitio; se usa para armar los enlaces que comparte el panel. */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://resurte.me").replace(/\/$/, "")

const EMPTY_FLOTILLA_STATS: FlotillaStats = {
  active: 0,
  unassigned: 0,
  deliveredToday: 0,
  failedToday: 0,
  avgDeliveryMinutes: null,
  feesToday: 0,
  payoutsToday: 0,
  couriers: 0,
  zones: 0,
}

/** `true` si el restaurante tiene la capacidad; usado por las lecturas. */
async function canUseFlotilla(): Promise<boolean> {
  try {
    await requireFoodosFeature("flotilla")
    return true
  } catch {
    return false
  }
}

/** Verifica propiedad antes de escribir: la RLS no da mensajes útiles. */
async function assertOwnRestaurant(
  supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"],
  userId: string,
  restaurantId: string
): Promise<void> {
  const { data } = await supabase
    .from("foodos_restaurants")
    .select("id")
    .eq("id", restaurantId)
    .eq("user_id", userId)
    .maybeSingle()
  if (!data) throw new Error("Restaurante no encontrado")
}

export async function listFlotillaCouriers(
  restaurantId: string
): Promise<FlotillaCourierRow[]> {
  if (!(await canUseFlotilla())) return []
  const { supabase } = await requireAuth()
  const { listCouriersWithLoad } = await import("@/lib/flotilla/deliveries")
  return listCouriersWithLoad(supabase, restaurantId)
}

export async function listFlotillaZones(
  restaurantId: string
): Promise<FlotillaZoneRow[]> {
  if (!(await canUseFlotilla())) return []
  const { supabase } = await requireAuth()
  const { data } = await supabase
    .from("foodos_delivery_zones")
    .select(
      "id, name, branch_id, center_lat, center_lng, radius_km, fee, min_order, eta_minutes, payout_mode, payout_value, color, sort_order, is_active"
    )
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: true })
  return (data ?? []) as FlotillaZoneRow[]
}

export async function listFlotillaDeliveries(
  restaurantId: string,
  limit = 50
): Promise<FlotillaDeliveryRow[]> {
  if (!(await canUseFlotilla())) return []
  const { supabase } = await requireAuth()
  const { listActiveDeliveries } = await import("@/lib/flotilla/deliveries")
  const rows = await listActiveDeliveries(supabase, restaurantId, limit)
  if (!rows.length) return []

  const courierIds = [
    ...new Set(rows.map((r) => r.courier_id).filter((id): id is string => typeof id === "string")),
  ]
  const orderIds = rows.map((r) => String(r.order_id ?? "")).filter(Boolean)

  const [couriersRes, ordersRes] = await Promise.all([
    courierIds.length
      ? supabase.from("foodos_couriers").select("id, name").in("id", courierIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    orderIds.length
      ? supabase.from("foodos_orders").select("id, customer_name, total").in("id", orderIds)
      : Promise.resolve({ data: [] as { id: string; customer_name: string | null; total: number }[] }),
  ])

  const courierNames = new Map(
    (couriersRes.data ?? []).map((c) => [String(c.id), String(c.name ?? "")])
  )
  const orders = new Map(
    (ordersRes.data ?? []).map((o) => [
      String(o.id),
      { name: (o.customer_name as string | null) ?? null, total: Number(o.total) || 0 },
    ])
  )

  return rows.map((row) => {
    const courierId = typeof row.courier_id === "string" ? row.courier_id : null
    const orderId = String(row.order_id ?? "")
    const order = orders.get(orderId)
    return {
      id: String(row.id ?? ""),
      order_id: orderId,
      courier_id: courierId,
      courier_name: courierId ? courierNames.get(courierId) ?? null : null,
      status: String(row.status ?? "pending") as FlotillaDeliveryRow["status"],
      provider: String(row.provider ?? "in_house") as FlotillaDeliveryRow["provider"],
      provider_tracking_url:
        typeof row.provider_tracking_url === "string" ? row.provider_tracking_url : null,
      zone_name: typeof row.zone_name === "string" ? row.zone_name : null,
      dropoff_address: String(row.dropoff_address ?? ""),
      dropoff_notes: typeof row.dropoff_notes === "string" ? row.dropoff_notes : null,
      customer_name: order?.name ?? null,
      order_total: order?.total ?? 0,
      fee: Number(row.fee) || 0,
      courier_payout: Number(row.courier_payout) || 0,
      distance_km: row.distance_km === null || row.distance_km === undefined ? null : Number(row.distance_km),
      eta_minutes: row.eta_minutes === null || row.eta_minutes === undefined ? null : Number(row.eta_minutes),
      created_at: String(row.created_at ?? ""),
      assigned_at: typeof row.assigned_at === "string" ? row.assigned_at : null,
      picked_up_at: typeof row.picked_up_at === "string" ? row.picked_up_at : null,
    }
  })
}

export async function getFlotillaStats(restaurantId: string): Promise<FlotillaStats> {
  if (!(await canUseFlotilla())) return EMPTY_FLOTILLA_STATS
  const { supabase } = await requireAuth()

  const [{ getFlotillaSummary }, { count: couriers }, { count: zones }, restaurantRes] =
    await Promise.all([
      import("@/lib/flotilla/deliveries"),
      supabase
        .from("foodos_couriers")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true),
      supabase
        .from("foodos_delivery_zones")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true),
      supabase
        .from("foodos_restaurants")
        .select("timezone")
        .eq("id", restaurantId)
        .maybeSingle(),
    ])

  const timezone =
    typeof restaurantRes.data?.timezone === "string" ? restaurantRes.data.timezone : null
  const summary = await getFlotillaSummary(supabase, restaurantId, { timezone })
  if (!summary) return EMPTY_FLOTILLA_STATS

  return {
    ...summary,
    couriers: couriers ?? 0,
    zones: zones ?? 0,
  }
}

export async function upsertFlotillaCourier(input: {
  id?: string | null
  restaurant_id: string
  name: string
  phone?: string | null
  vehicle?: "moto" | "bici" | "auto" | "a_pie"
  capacity?: number
  shift_start?: string | null
  shift_end?: string | null
  is_active?: boolean
  notes?: string | null
}): Promise<void> {
  await requireFoodosFeature("flotilla")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const name = input.name?.trim()
  if (!name) throw new Error("El repartidor necesita un nombre")

  const payload = {
    restaurant_id: input.restaurant_id,
    name,
    phone: input.phone?.trim() || null,
    vehicle: input.vehicle ?? "moto",
    capacity: Math.min(Math.max(Number(input.capacity) || 1, 1), 10),
    shift_start: input.shift_start || null,
    shift_end: input.shift_end || null,
    is_active: input.is_active ?? true,
    notes: input.notes?.trim() || null,
  }

  const { error } = input.id
    ? await supabase.from("foodos_couriers").update(payload).eq("id", input.id)
    : await supabase.from("foodos_couriers").insert(payload)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/flotilla")
}

export async function toggleFlotillaCourier(id: string, isActive: boolean): Promise<void> {
  await requireFoodosFeature("flotilla")
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_couriers")
    .update({ is_active: isActive })
    .eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/flotilla")
}

export async function deleteFlotillaCourier(id: string): Promise<void> {
  await requireFoodosFeature("flotilla")
  const { supabase } = await requireAuth()
  // Las entregas históricas conservan `courier_id` a NULL (FK ON DELETE SET NULL):
  // borrar a un repartidor no debe borrar su historial.
  const { error } = await supabase.from("foodos_couriers").delete().eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/flotilla")
}

export async function upsertFlotillaZone(input: {
  id?: string | null
  restaurant_id: string
  name: string
  branch_id?: string | null
  center_lat?: number | null
  center_lng?: number | null
  radius_km?: number | null
  fee: number
  min_order?: number
  eta_minutes?: number
  payout_mode?: "fixed" | "per_km" | "percent"
  payout_value?: number
  color?: string | null
  sort_order?: number
  is_active?: boolean
}): Promise<void> {
  await requireFoodosFeature("flotilla")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const name = input.name?.trim()
  if (!name) throw new Error("La zona necesita un nombre")

  const radius = Number(input.radius_km)
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error("El radio de la zona debe ser mayor a cero")
  }
  const lat = Number(input.center_lat)
  const lng = Number(input.center_lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("La zona necesita coordenadas válidas")
  }

  const payload = {
    restaurant_id: input.restaurant_id,
    name,
    branch_id: input.branch_id || null,
    center_lat: lat,
    center_lng: lng,
    radius_km: radius,
    fee: Math.max(0, Number(input.fee) || 0),
    min_order: Math.max(0, Number(input.min_order) || 0),
    eta_minutes: Math.min(Math.max(Number(input.eta_minutes) || 35, 5), 240),
    payout_mode: input.payout_mode ?? "fixed",
    payout_value: Math.max(0, Number(input.payout_value) || 0),
    color: input.color?.trim() || null,
    sort_order: Number(input.sort_order) || 0,
    is_active: input.is_active ?? true,
  }

  const { error } = input.id
    ? await supabase.from("foodos_delivery_zones").update(payload).eq("id", input.id)
    : await supabase.from("foodos_delivery_zones").insert(payload)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/flotilla")
}

export async function deleteFlotillaZone(id: string): Promise<void> {
  await requireFoodosFeature("flotilla")
  const { supabase } = await requireAuth()
  const { error } = await supabase.from("foodos_delivery_zones").delete().eq("id", id)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/flotilla")
}

export async function assignFlotillaCourier(input: {
  restaurant_id: string
  delivery_id: string
  courier_id: string
}): Promise<{ ok: boolean; error?: string }> {
  await requireFoodosFeature("flotilla")
  const { supabase } = await requireAuth()
  const { assignCourier } = await import("@/lib/flotilla/deliveries")
  const result = await assignCourier(supabase, {
    deliveryId: input.delivery_id,
    restaurantId: input.restaurant_id,
    courierId: input.courier_id,
  })
  revalidatePath("/panel/foodos/flotilla")
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

export async function advanceFlotillaDelivery(input: {
  restaurant_id: string
  delivery_id: string
  status: "assigned" | "picked_up" | "delivered" | "failed" | "cancelled"
  note?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  await requireFoodosFeature("flotilla")
  const { supabase } = await requireAuth()
  const { advanceDelivery } = await import("@/lib/flotilla/deliveries")
  const result = await advanceDelivery(supabase, {
    deliveryId: input.delivery_id,
    restaurantId: input.restaurant_id,
    status: input.status,
    note: input.note ?? null,
  })
  revalidatePath("/panel/foodos/flotilla")
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

/**
 * Despacha la entrega a un proveedor externo (Uber Direct).
 *
 * Es una acción EXPLÍCITA y nunca automática: cuesta dinero por entrega. Sin
 * credenciales configuradas devuelve un error legible y la Flotilla sigue
 * operando con repartidores propios.
 */
export async function dispatchFlotillaToProvider(input: {
  restaurant_id: string
  delivery_id: string
}): Promise<{ ok: boolean; error?: string; trackingUrl?: string | null }> {
  await requireFoodosFeature("flotilla")
  const { supabase } = await requireAuth()

  const { resolveDeliveryProvider } = await import("@/lib/flotilla/provider")
  const provider = resolveDeliveryProvider()
  if (!provider) {
    return { ok: false, error: "No hay proveedor de reparto configurado" }
  }

  const { data: delivery } = await supabase
    .from("foodos_deliveries")
    .select(
      "id, order_id, branch_id, status, dropoff_address, dropoff_notes, dropoff_lat, dropoff_lng, provider_delivery_id"
    )
    .eq("id", input.delivery_id)
    .eq("restaurant_id", input.restaurant_id)
    .maybeSingle()
  if (!delivery) return { ok: false, error: "Entrega no encontrada" }
  if (delivery.provider_delivery_id) {
    return { ok: false, error: "La entrega ya se despachó al proveedor" }
  }
  if (delivery.status === "delivered" || delivery.status === "cancelled") {
    return { ok: false, error: "La entrega ya está cerrada" }
  }

  const { data: order } = await supabase
    .from("foodos_orders")
    .select("id, customer_name, customer_phone")
    .eq("id", delivery.order_id)
    .maybeSingle()

  let pickupName = "Sucursal"
  let pickupAddress = ""
  let pickupPhone: string | null = null
  if (delivery.branch_id) {
    const { data: branch } = await supabase
      .from("foodos_branches")
      .select("name, address, phone")
      .eq("id", delivery.branch_id)
      .maybeSingle()
    if (branch) {
      pickupName = String(branch.name ?? pickupName)
      pickupAddress = String(branch.address ?? "")
      pickupPhone = typeof branch.phone === "string" ? branch.phone : null
    }
  }
  if (!pickupAddress) {
    return { ok: false, error: "La sucursal necesita una dirección de recolección" }
  }

  const result = await provider.dispatch({
    pickupName,
    pickupAddress,
    pickupPhone: pickupPhone ?? "",
    dropoffName: String(order?.customer_name ?? "Cliente"),
    dropoffAddress: String(delivery.dropoff_address ?? ""),
    dropoffPhone: String(order?.customer_phone ?? ""),
    dropoffNotes: typeof delivery.dropoff_notes === "string" ? delivery.dropoff_notes : undefined,
    externalRef: String(delivery.order_id),
  })
  if (!result.ok) {
    // Traza durable: el proveedor rechazó el despacho y la entrega se queda
    // sin repartidor. `logger.warn` se pierde en la consola del proceso.
    // El try/catch protege el error legible: la observabilidad nunca debe
    // convertir "no se pudo despachar" en una excepción.
    try {
      await reportServerError({
        message: "La Flotilla no pudo despachar la entrega al proveedor",
        severity: "warn",
        context: {
          restaurantId: input.restaurant_id,
          deliveryId: input.delivery_id,
          provider: "uber_direct",
        },
        url: "foodos:flotilla",
        error: result.error,
      })
    } catch {
      // Sin traza, pero con mensaje para el restaurante.
    }
    return { ok: false, error: result.error }
  }

  const { error } = await supabase
    .from("foodos_deliveries")
    .update({
      provider: "uber_direct",
      provider_delivery_id: result.providerDeliveryId,
      provider_tracking_url: result.trackingUrl,
      eta_minutes: result.etaMinutes ?? undefined,
    })
    .eq("id", input.delivery_id)
  if (error) throw new Error(error.message)

  await supabase.from("foodos_delivery_events").insert({
    delivery_id: input.delivery_id,
    restaurant_id: input.restaurant_id,
    status: String(delivery.status ?? "pending"),
    actor: "provider",
    note: "Despachado a proveedor externo",
  })

  revalidatePath("/panel/foodos/flotilla")
  return { ok: true, trackingUrl: result.trackingUrl }
}

/**
 * Asigna la entrega al repartidor que le toca (turno, cupo y menos carga).
 *
 * Si nadie está disponible devuelve un error legible en vez de dejar la
 * entrega muda: el restaurante asigna a mano o despacha al proveedor.
 */
export async function autoAssignFlotillaDelivery(input: {
  restaurant_id: string
  delivery_id: string
}): Promise<{ ok: boolean; courierName?: string | null; error?: string }> {
  await requireFoodosFeature("flotilla")
  const { supabase } = await requireAuth()
  const { autoAssignDelivery } = await import("@/lib/flotilla/deliveries")
  const result = await autoAssignDelivery(supabase, {
    deliveryId: input.delivery_id,
    restaurantId: input.restaurant_id,
  })
  revalidatePath("/panel/foodos/flotilla")
  return result.ok
    ? { ok: true, courierName: result.courierName }
    : { ok: false, error: result.error }
}

/**
 * Devuelve el enlace móvil del repartidor, generándolo si aún no existe.
 *
 * El token es una capacidad: quien lo tenga ve las entregas asignadas a
 * ese repartidor. Por eso se muestra solo en el panel y se puede revocar.
 */
export async function ensureFlotillaCourierLink(input: {
  restaurant_id: string
  courier_id: string
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireFoodosFeature("flotilla")
  const { supabase } = await requireAuth()
  const { ensureCourierToken } = await import("@/lib/flotilla/deliveries")
  const result = await ensureCourierToken(supabase, {
    courierId: input.courier_id,
    restaurantId: input.restaurant_id,
  })
  if (!result.ok) return { ok: false, error: result.error }
  revalidatePath("/panel/foodos/flotilla")
  return { ok: true, url: `${SITE_URL}/reparto/${result.token}` }
}

/** Rota el enlace del repartidor: el anterior deja de funcionar al instante. */
export async function revokeFlotillaCourierLink(input: {
  restaurant_id: string
  courier_id: string
}): Promise<{ ok: boolean; error?: string }> {
  await requireFoodosFeature("flotilla")
  const { supabase } = await requireAuth()
  const { revokeCourierToken } = await import("@/lib/flotilla/deliveries")
  const result = await revokeCourierToken(supabase, {
    courierId: input.courier_id,
    restaurantId: input.restaurant_id,
  })
  revalidatePath("/panel/foodos/flotilla")
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

// ============================================================
// Tarjeta de lealtad (nivel Diamante)
// ============================================================
// El saldo de la tarjeta es una FOTOGRAFÍA del CRM, no una consulta viva: se
// copia al pase para que el comensal lo vea sin sesión. La copia la mantiene
// al día el trigger `foodos_sync_wallet_passes` (migración 00126) cada vez que
// se acreditan puntos.
//
// Mismo contrato que el resto del panel: las ESCRITURAS exigen el nivel y
// lanzan; las LECTURAS degradan.
//
// La emisión escribe con service role: la RLS de `foodos_wallet_passes` solo
// deja insertar a admin. El permiso real lo da el gate de nivel más la
// verificación de propiedad, ambos ANTES de tocar la base.
// ============================================================

export interface WalletSettings {
  wallet_enabled: boolean
  reward_points: number | null
  reward_label: string | null
  points_per_100: number
  point_value: number
  is_active: boolean
}

/** `true` si el restaurante tiene la capacidad; usado por las lecturas. */
async function canUseWallet(): Promise<boolean> {
  try {
    await requireFoodosFeature("wallet_passes")
    return true
  } catch {
    return false
  }
}

export async function getWalletSettings(
  restaurantId: string
): Promise<WalletSettings | null> {
  if (!(await canUseWallet())) return null
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_loyalty_programs")
    .select(
      "wallet_enabled, reward_points, reward_label, points_per_100, point_value, is_active"
    )
    .eq("restaurant_id", restaurantId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as WalletSettings | null) ?? null
}

export async function listWalletPassRows(
  restaurantId: string
): Promise<WalletPassRow[]> {
  if (!(await canUseWallet())) return []
  const { supabase } = await requireAuth()
  return listWalletPasses(supabase, restaurantId)
}

export async function getWalletKpis(restaurantId: string): Promise<WalletStats> {
  if (!(await canUseWallet())) return { ...EMPTY_WALLET_STATS }
  const { supabase } = await requireAuth()
  return getWalletStats(supabase, restaurantId)
}

/**
 * Guarda el aspecto comercial de la tarjeta: si está encendida, qué
 * recompensa anuncia y a cuántos puntos.
 *
 * La recompensa es opcional: sin ella la tarjeta solo muestra el saldo. Un
 * umbral en cero se guarda como NULL para no anunciar una meta imposible, y
 * una recompensa sin nombre se rechaza porque el comensal vería un hueco.
 */
export async function upsertWalletSettings(input: {
  restaurant_id: string
  wallet_enabled: boolean
  reward_points?: number | null
  reward_label?: string | null
}): Promise<void> {
  await requireFoodosFeature("wallet_passes")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const raw = input.reward_points
  const threshold =
    raw === null || raw === undefined || !Number.isFinite(Number(raw)) || Number(raw) <= 0
      ? null
      : Math.floor(Number(raw))
  const label = input.reward_label?.trim() || null
  if (threshold !== null && !label) {
    throw new Error("La recompensa necesita un nombre")
  }

  const { error } = await supabase.from("foodos_loyalty_programs").upsert(
    {
      restaurant_id: input.restaurant_id,
      wallet_enabled: input.wallet_enabled,
      reward_points: threshold,
      reward_label: threshold === null ? null : label,
    },
    { onConflict: "restaurant_id" }
  )
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/wallet")
}

/**
 * Emite la tarjeta de un comensal.
 *
 * Idempotente: si ya existía, devuelve el MISMO token, para no invalidar el QR
 * que el comensal ya tiene guardado. Devuelve el token y no la URL porque el
 * slug del restaurante ya lo tiene la página que llama.
 */
export async function issueWalletPass(input: {
  restaurant_id: string
  customer_id: string
}): Promise<{ ok: boolean; token?: string; error?: string }> {
  await requireFoodosFeature("wallet_passes")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  let service: Awaited<ReturnType<typeof createServiceClient>>
  try {
    service = await createServiceClient()
  } catch {
    return { ok: false, error: "No se pudo emitir la tarjeta" }
  }

  const result = await ensureWalletPass(service, {
    restaurantId: input.restaurant_id,
    customerId: input.customer_id,
    platform: "web",
  })
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath("/panel/foodos/wallet")
  return { ok: true, token: result.pass.token }
}

/** Recalcula la fotografía del pase con el saldo actual del CRM. */
export async function refreshWalletPassRow(input: {
  restaurant_id: string
  pass_id: string
}): Promise<{ ok: boolean; error?: string }> {
  await requireFoodosFeature("wallet_passes")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)
  const updated = await refreshWalletPass(supabase, input.restaurant_id, input.pass_id)
  if (!updated) return { ok: false, error: "No se pudo actualizar la tarjeta" }
  revalidatePath("/panel/foodos/wallet")
  return { ok: true }
}

/**
 * Revoca o reactiva una tarjeta. Revocar invalida el enlace al instante: el
 * comensal deja de poder abrir su saldo.
 */
export async function setWalletPassEnabled(input: {
  restaurant_id: string
  pass_id: string
  is_active: boolean
}): Promise<{ ok: boolean; error?: string }> {
  await requireFoodosFeature("wallet_passes")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)
  const ok = await setWalletPassActive(
    supabase,
    input.restaurant_id,
    input.pass_id,
    input.is_active
  )
  if (!ok) return { ok: false, error: "No se pudo cambiar la tarjeta" }
  revalidatePath("/panel/foodos/wallet")
  return { ok: true }
}

// ============================================================
// Sitio web y SEO local (nivel Diamante)
//
// El "app de marca" y el sitio IA son la misma cosa vista desde dos lados: el
// manifest PWA por restaurante (instalar el micrositio como app) y las páginas
// públicas indexables (`/r/[slug]/carta` y `/r/[slug]/p/[slug]`).
//
// Invariante de la fase: **la IA nunca publica sola**. Todo lo generado nace en
// `draft` (`upsertSeoPage` fuerza el estado) y el dueño lo aprueba. Y la IA no
// inventa cifras ni enlaces: si el modelo alucina un precio o una sucursal, el
// generador lo descarta y cae a la plantilla determinista.
//
// El manifest y las páginas ya publicadas son públicos a propósito: el dueño
// aprobó ese contenido y gatearlos solo rompería la instalación de la app. Lo
// que está gateado es generar, editar y publicar.
// ============================================================

export interface SeoProfileFields {
  id: string
  name: string
  slug: string
  tagline: string | null
  about: string | null
  description: string | null
  seo_keywords: string[]
  google_business_url: string | null
  theme_color: string | null
  logo_url: string | null
  currency: string | null
}

export interface SeoDishOption {
  id: string
  name: string
  description: string | null
  tags: string[]
}

export interface SeoSiteData {
  profile: SeoProfileFields
  pages: SeoPageRow[]
  dishes: SeoDishOption[]
  checklist: GoogleBusinessStep[]
  progress: GoogleBusinessProgress
  /** URLs absolutas que el dueño puede copiar y compartir. */
  urls: { site: string; menu: string; manifest: string }
}

export interface SeoKpis {
  total: number
  published: number
  drafts: number
  progressRatio: number
  pendingSteps: number
}

/** `true` si el restaurante tiene la capacidad; usado por las lecturas. */
async function canUseSitioIa(): Promise<boolean> {
  try {
    await requireFoodosFeature("sitio_ia")
    return true
  } catch {
    return false
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => String(entry)).filter((entry) => entry.trim() !== "")
}

export async function getSitioData(restaurantId: string): Promise<SeoSiteData | null> {
  if (!(await canUseSitioIa())) return null
  const { supabase } = await requireAuth()

  const context = await loadSeoProfile(supabase, restaurantId)
  if (!context) return null

  const [pages, dishRows] = await Promise.all([
    listSeoPages(supabase, restaurantId),
    supabase
      .from("foodos_menu_items")
      .select("id, name, description, tags")
      .eq("restaurant_id", restaurantId)
      .eq("is_available", true)
      .order("sort_order")
      .limit(200),
  ])

  const dishes: SeoDishOption[] = ((dishRows.data as unknown[]) ?? [])
    .map((entry) => {
      const row = entry as Record<string, unknown>
      const name = typeof row.name === "string" ? row.name.trim() : ""
      return {
        id: String(row.id ?? ""),
        name,
        description: typeof row.description === "string" ? row.description : null,
        tags: asStringArray(row.tags),
      }
    })
    .filter((dish) => dish.id !== "" && dish.name !== "")

  const checklist = googleBusinessChecklist({
    profile: context.restaurant,
    branches: context.branches,
    hours: context.hours,
    reviewCount: context.rating?.count ?? 0,
  })

  const slug = context.restaurant.slug
  return {
    profile: {
      id: context.restaurant.id,
      name: context.restaurant.name,
      slug,
      tagline: context.restaurant.tagline ?? null,
      about: context.restaurant.about ?? null,
      description: context.restaurant.description ?? null,
      seo_keywords: context.restaurant.seo_keywords ?? [],
      google_business_url: context.restaurant.google_business_url ?? null,
      theme_color: context.restaurant.theme_color ?? null,
      logo_url: context.restaurant.logo_url ?? null,
      currency: context.restaurant.currency ?? null,
    },
    pages,
    dishes,
    checklist,
    progress: googleBusinessProgress(checklist),
    urls: {
      site: `${SITE_URL}${restaurantPath(slug)}`,
      menu: `${SITE_URL}${menuPath(slug)}`,
      manifest: `${SITE_URL}${manifestPath(slug)}`,
    },
  }
}

export async function getSeoKpis(restaurantId: string): Promise<SeoKpis> {
  const empty: SeoKpis = {
    total: 0,
    published: 0,
    drafts: 0,
    progressRatio: 0,
    pendingSteps: 0,
  }
  if (!(await canUseSitioIa())) return empty
  const { supabase } = await requireAuth()

  const [pages, context] = await Promise.all([
    listSeoPages(supabase, restaurantId),
    loadSeoProfile(supabase, restaurantId),
  ])
  if (!context) return empty

  const steps = googleBusinessChecklist({
    profile: context.restaurant,
    branches: context.branches,
    hours: context.hours,
    reviewCount: context.rating?.count ?? 0,
  })
  const progress = googleBusinessProgress(steps)

  return {
    total: pages.length,
    published: pages.filter((page) => page.status === "published").length,
    drafts: pages.filter((page) => page.status === "draft").length,
    progressRatio: progress.ratio,
    pendingSteps: progress.pending.length,
  }
}

/**
 * Guarda el perfil público: la frase corta que aparece bajo el nombre, la
 * descripción larga y las palabras clave que alimentan los datos estructurados.
 */
export async function saveSeoProfileAction(input: {
  restaurant_id: string
  tagline?: string | null
  about?: string | null
  seo_keywords?: string[] | null
  google_business_url?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  await requireFoodosFeature("sitio_ia")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const result = await saveSeoProfile(supabase, {
    restaurantId: input.restaurant_id,
    tagline: input.tagline,
    about: input.about,
    seoKeywords: input.seo_keywords,
    googleBusinessUrl: input.google_business_url,
  })
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath("/panel/foodos/sitio-ia")
  revalidateTag("foodos-seo", "max")
  return { ok: true }
}

/**
 * Genera una página y la deja en borrador.
 *
 * `about` y `dish` pasan por el modelo (que solo reescribe lo que le damos);
 * `faq` se arma siempre con datos reales del restaurante y sin modelo, porque
 * una respuesta inventada sobre envíos o pagos se convierte en un cliente
 * reclamando en el mostrador.
 */
export async function generateSeoPage(input: {
  restaurant_id: string
  kind: SeoPageKind
  notes?: string | null
  menu_item_id?: string | null
}): Promise<{ ok: boolean; error?: string; page?: SeoPageRow; source?: "llm" | "template" }> {
  await requireFoodosFeature("sitio_ia")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const context = await loadSeoProfile(supabase, input.restaurant_id)
  if (!context) return { ok: false, error: "Restaurante no encontrado" }

  const restaurantName = context.restaurant.name
  const city = context.branches.find((branch) => branch.city)?.city ?? null
  const notes = input.notes?.trim() ? input.notes.trim() : null

  if (input.kind === "about") {
    const output = await generateAboutText({
      restaurantName,
      notes: notes ?? context.restaurant.about,
      keywords: context.restaurant.seo_keywords,
      city,
      restaurantId: input.restaurant_id,
    })
    const saved = await upsertSeoPage(supabase, {
      restaurantId: input.restaurant_id,
      kind: "about",
      title: `Sobre ${restaurantName}`,
      summary: city ? `Quiénes somos en ${city}` : "Quiénes somos",
      body: output.text,
      source: output.source,
    })
    if (!saved.ok) return { ok: false, error: saved.error }
    revalidatePath("/panel/foodos/sitio-ia")
    return { ok: true, page: saved.page, source: output.source }
  }

  if (input.kind === "faq") {
    const output = generateFaq({ restaurantName, branches: context.branches, city })
    const saved = await upsertSeoPage(supabase, {
      restaurantId: input.restaurant_id,
      kind: "faq",
      title: "Preguntas frecuentes",
      summary: `Envíos, pagos y horarios de ${restaurantName}`,
      body: "",
      faq: output.items,
      source: output.source,
    })
    if (!saved.ok) return { ok: false, error: saved.error }
    revalidatePath("/panel/foodos/sitio-ia")
    return { ok: true, page: saved.page, source: output.source }
  }

  if (input.kind === "dish") {
    if (!input.menu_item_id) return { ok: false, error: "Elige un platillo del menú" }
    const { data: itemRow } = await supabase
      .from("foodos_menu_items")
      .select("id, name, description, price, tags")
      .eq("id", input.menu_item_id)
      .eq("restaurant_id", input.restaurant_id)
      .maybeSingle()
    if (!itemRow) return { ok: false, error: "Ese platillo ya no está en el menú" }

    const item = itemRow as Record<string, unknown>
    const dishName = typeof item.name === "string" ? item.name.trim() : ""
    if (!dishName) return { ok: false, error: "Ese platillo no tiene nombre" }

    const output = await generateDishCopy({
      restaurantName,
      dishName,
      notes: notes ?? (typeof item.description === "string" ? item.description : null),
      tags: asStringArray(item.tags),
      restaurantId: input.restaurant_id,
    })

    // El precio y la ciudad los pone el servidor con datos reales, no el
    // modelo: la IA nunca fija precios. Sin esto la página sería una sola
    // frase, que Google castiga como contenido pobre.
    const price = Number(item.price)
    const facts: string[] = []
    if (Number.isFinite(price) && price > 0) {
      facts.push(`Precio: ${formatMoney(price)}.`)
    }
    const delivery = context.branches.some((branch) => branch.delivery_active)
    const pickup = context.branches.some((branch) => branch.pickup_active)
    const ways = [delivery ? "a domicilio" : null, pickup ? "para recoger" : null].filter(Boolean)
    if (ways.length > 0) {
      facts.push(
        `Pídelo en línea ${ways.join(" o ")}${city ? ` en ${city}` : ""}, directo con ${restaurantName}.`
      )
    }

    const saved = await upsertSeoPage(supabase, {
      restaurantId: input.restaurant_id,
      kind: "dish",
      title: dishName,
      slug: slugifySeo(dishName),
      summary: output.text.slice(0, 155),
      body: [output.text, facts.join(" ")].filter(Boolean).join("\n\n"),
      source: output.source,
    })
    if (!saved.ok) return { ok: false, error: saved.error }
    revalidatePath("/panel/foodos/sitio-ia")
    return { ok: true, page: saved.page, source: output.source }
  }

  return { ok: false, error: "Tipo de página no soportado" }
}

/** Publica un borrador: es el acto de aprobación explícita del dueño. */
export async function publishSeoPage(input: {
  restaurant_id: string
  page_id: string
}): Promise<{ ok: boolean; error?: string }> {
  await requireFoodosFeature("sitio_ia")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const ok = await setSeoPageStatus(supabase, input.restaurant_id, input.page_id, "published")
  if (!ok) return { ok: false, error: "No se pudo publicar la página" }

  revalidatePath("/panel/foodos/sitio-ia")
  // El sitio público lee de un caché por tag: sin esto la página recién
  // publicada tardaría hasta 5 minutos en existir para el comensal.
  revalidateTag("foodos-seo", "max")
  revalidatePath("/r/[slug]/p/[pageSlug]", "page")
  revalidatePath("/sitemap.xml")
  return { ok: true }
}

export async function unpublishSeoPage(input: {
  restaurant_id: string
  page_id: string
}): Promise<{ ok: boolean; error?: string }> {
  await requireFoodosFeature("sitio_ia")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const ok = await setSeoPageStatus(supabase, input.restaurant_id, input.page_id, "draft")
  if (!ok) return { ok: false, error: "No se pudo ocultar la página" }

  revalidatePath("/panel/foodos/sitio-ia")
  revalidateTag("foodos-seo", "max")
  revalidatePath("/r/[slug]/p/[pageSlug]", "page")
  revalidatePath("/sitemap.xml")
  return { ok: true }
}

export async function deleteSeoPageRow(input: {
  restaurant_id: string
  page_id: string
}): Promise<{ ok: boolean; error?: string }> {
  await requireFoodosFeature("sitio_ia")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const ok = await deleteSeoPage(supabase, input.restaurant_id, input.page_id)
  if (!ok) return { ok: false, error: "No se pudo borrar la página" }

  revalidatePath("/panel/foodos/sitio-ia")
  revalidateTag("foodos-seo", "max")
  revalidatePath("/r/[slug]/p/[pageSlug]", "page")
  revalidatePath("/sitemap.xml")
  return { ok: true }
}

// ============================================================
// Punto de venta (nivel Diamante)
//
// Seis proveedores declarados, **ninguno implementado todavía**. El panel lo
// dice tal cual: cada conexión aparece como "pendiente" con la nota de qué
// falta. Fingir una sincronización produciría un menú desincronizado en
// silencio, que es peor que no tener integración.
//
// Mientras tanto el camino sin credenciales sigue siendo la importación CSV de
// `/panel/foodos/menu`, que ya existe y no depende de nadie.
//
// Los webhooks entrantes se verifican con `safeSecretEqual` contra el secreto
// de la conexión, y `getPosWebhookSecret` es fail-closed: si la conexión no está
// `connected` o la lectura falla, no hay secreto y el webhook se rechaza.
// ============================================================

export interface PosData {
  connections: PosConnectionView[]
  log: PosSyncEntry[]
  kpis: PosKpis
}

export interface PosSyncSummary {
  ok: boolean
  error?: string
  created: number
  updated: number
  unchanged: number
  /** Platillos que solo existen en FoodOS. Nunca se borran solos. */
  onlyLocally: number
  /** Se rellenó con la nota del adaptador cuando no está implementado. */
  skipped: boolean
}

/** `true` si el restaurante tiene la capacidad; usado por las lecturas. */
async function canUsePos(): Promise<boolean> {
  try {
    await requireFoodosFeature("pos_integraciones")
    return true
  } catch {
    return false
  }
}

export async function getPosData(restaurantId: string): Promise<PosData | null> {
  if (!(await canUsePos())) return null
  const { supabase } = await requireAuth()
  const { loadPosContext } = await import("@/lib/pos/connections")
  const context = await loadPosContext(supabase, restaurantId, {
    origin: SITE_URL,
    restaurantId,
  })
  return { connections: context.views, log: context.log, kpis: context.kpis }
}

export async function savePosConnectionAction(input: {
  restaurant_id: string
  provider: string
  credentials: Record<string, string>
}): Promise<{ ok: boolean; error?: string; missing?: string[] }> {
  await requireFoodosFeature("pos_integraciones")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const { isPosProvider } = await import("@/lib/pos/registry")
  if (!isPosProvider(input.provider)) return { ok: false, error: "Proveedor no reconocido" }

  const { upsertPosConnection } = await import("@/lib/pos/connections")
  const result = await upsertPosConnection(
    supabase,
    input.restaurant_id,
    input.provider,
    input.credentials
  )
  if (!result.ok) return { ok: false, error: result.error, missing: result.missing }

  revalidatePath("/panel/foodos/pos")
  return { ok: true }
}

export async function testPosConnectionAction(input: {
  restaurant_id: string
  provider: string
}): Promise<{ ok: boolean; status: string; message: string }> {
  await requireFoodosFeature("pos_integraciones")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const { checkPosCredentials, isPosProvider } = await import("@/lib/pos/registry")
  if (!isPosProvider(input.provider)) {
    return { ok: false, status: "pending", message: "Proveedor no reconocido" }
  }

  const { resolvePosAdapter } = await import("@/lib/pos/adapter")
  const { getPosConnection, logPosSync } = await import("@/lib/pos/connections")
  const adapter = resolvePosAdapter(input.provider)

  // Las credenciales guardadas en claro solo se leen aquí, en el servidor: el
  // panel siempre recibe la versión enmascarada.
  const facts = await getPosConnection(supabase, input.restaurant_id, input.provider)
  const credentials = facts?.credentials ?? {}
  const health = await adapter.health(credentials)
  const check = checkPosCredentials(input.provider, credentials)

  // Se registra aunque no esté implementado: si el dueño probó, la bitácora
  // debe decirlo. `pending` no es un fallo, es una carencia conocida.
  await logPosSync(supabase, input.restaurant_id, {
    provider: input.provider,
    kind: "health",
    status: health.status === "ready" ? "ok" : "skipped",
    detail: health.message,
  })

  revalidatePath("/panel/foodos/pos")
  return {
    ok: health.status === "ready",
    status: check.ok ? health.status : "needs_credentials",
    message: health.message,
  }
}

export async function runPosMenuSyncAction(input: {
  restaurant_id: string
  provider: string
}): Promise<PosSyncSummary> {
  await requireFoodosFeature("pos_integraciones")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const empty: PosSyncSummary = {
    ok: false,
    created: 0,
    updated: 0,
    unchanged: 0,
    onlyLocally: 0,
    skipped: false,
  }

  const { isPosProvider } = await import("@/lib/pos/registry")
  if (!isPosProvider(input.provider)) return { ...empty, error: "Proveedor no reconocido" }

  const { normalizeMenuSnapshot, resolvePosAdapter } = await import("@/lib/pos/adapter")
  const { getPosConnection, logPosSync } = await import("@/lib/pos/connections")
  const { planMenuSync } = await import("@/lib/pos/reconcile")

  const facts = await getPosConnection(supabase, input.restaurant_id, input.provider)
  const adapter = resolvePosAdapter(input.provider)
  const pulled = await adapter.pullMenu(facts?.credentials ?? {})
  if (!pulled.ok) {
    await logPosSync(supabase, input.restaurant_id, {
      provider: input.provider,
      kind: "menu",
      status: pulled.code === "not_implemented" ? "skipped" : "failed",
      detail: pulled.error,
    })
    revalidatePath("/panel/foodos/pos")
    return { ...empty, error: pulled.error, skipped: pulled.code === "not_implemented" }
  }

  const snapshot = normalizeMenuSnapshot(pulled.items)
  const { data: localRows } = await supabase
    .from("foodos_menu_items")
    .select("id, name, price, description")
    .eq("restaurant_id", input.restaurant_id)
    .limit(500)

  const local: LocalMenuItem[] = ((localRows as unknown[]) ?? []).map((entry) => {
    const row = entry as Record<string, unknown>
    return {
      id: String(row.id),
      name: String(row.name ?? ""),
      price: Number(row.price) || 0,
      description: typeof row.description === "string" ? row.description : null,
    }
  })

  const plan = planMenuSync(local, snapshot)

  // Se emparejan categorías por nombre, igual que la importación CSV: el
  // proveedor manda un nombre, no un id de FoodOS.
  const categoryNames = [
    ...new Set(snapshot.map((item) => item.category?.trim()).filter(Boolean)),
  ] as string[]
  const categoryIds = new Map<string, string>()
  if (categoryNames.length > 0) {
    const { data: existingCats } = await supabase
      .from("foodos_menu_categories")
      .select("id, name")
      .eq("restaurant_id", input.restaurant_id)
    for (const entry of (existingCats as unknown[]) ?? []) {
      const row = entry as Record<string, unknown>
      categoryIds.set(String(row.name ?? "").trim().toLowerCase(), String(row.id))
    }
    let nextOrder = categoryIds.size
    for (const name of categoryNames) {
      const key = name.toLowerCase()
      if (categoryIds.has(key)) continue
      const { data: created } = await supabase
        .from("foodos_menu_categories")
        .insert({ restaurant_id: input.restaurant_id, name, sort_order: nextOrder++ })
        .select("id")
        .maybeSingle()
      const id = (created as Record<string, unknown> | null)?.id
      if (id) categoryIds.set(key, String(id))
    }
  }

  const categoryIdFor = (item: PosMenuSnapshotItem): string | null => {
    const key = item.category?.trim().toLowerCase()
    return key ? categoryIds.get(key) ?? null : null
  }

  let created = 0
  if (plan.created.length > 0) {
    const rows = plan.created.map((item) => ({
      restaurant_id: input.restaurant_id,
      category_id: categoryIdFor(item),
      name: item.name,
      description: item.description,
      price: item.price,
      cost: 0,
      tags: item.tags,
      is_available: true,
    }))
    const { error } = await supabase.from("foodos_menu_items").insert(rows)
    if (error) {
      await logPosSync(supabase, input.restaurant_id, {
        provider: input.provider,
        kind: "menu",
        status: "failed",
        detail: "No se pudieron crear los platillos nuevos",
      })
      revalidatePath("/panel/foodos/pos")
      return { ...empty, error: "No se pudieron crear los platillos nuevos" }
    }
    created = rows.length
  }

  let updated = 0
  for (const change of plan.updated) {
    const { error } = await supabase
      .from("foodos_menu_items")
      .update({
        name: change.item.name,
        description: change.item.description,
        price: change.item.price,
        category_id: categoryIdFor(change.item),
        tags: change.item.tags,
      })
      .eq("id", change.id)
      .eq("restaurant_id", input.restaurant_id)
    if (!error) updated++
  }

  await logPosSync(supabase, input.restaurant_id, {
    provider: input.provider,
    kind: "menu",
    status: "ok",
    itemsCount: created + updated,
    detail: `${created} nuevos, ${updated} actualizados, ${plan.onlyLocally.length} solo en FoodOS`,
  })

  revalidatePath("/panel/foodos/pos")
  revalidatePath("/panel/foodos/menu")
  return {
    ok: true,
    created,
    updated,
    unchanged: plan.unchanged.length,
    onlyLocally: plan.onlyLocally.length,
    skipped: false,
  }
}

export async function disconnectPosConnectionAction(input: {
  restaurant_id: string
  provider: string
}): Promise<{ ok: boolean; error?: string }> {
  await requireFoodosFeature("pos_integraciones")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const { isPosProvider } = await import("@/lib/pos/registry")
  if (!isPosProvider(input.provider)) return { ok: false, error: "Proveedor no reconocido" }

  const { disconnectPosConnection } = await import("@/lib/pos/connections")
  const result = await disconnectPosConnection(supabase, input.restaurant_id, input.provider)
  if (!result.ok) return result

  revalidatePath("/panel/foodos/pos")
  return { ok: true }
}

export async function rotatePosWebhookSecretAction(input: {
  restaurant_id: string
  provider: string
}): Promise<{ ok: boolean; error?: string; secret?: string }> {
  await requireFoodosFeature("pos_integraciones")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const { isPosProvider } = await import("@/lib/pos/registry")
  if (!isPosProvider(input.provider)) return { ok: false, error: "Proveedor no reconocido" }

  const { rotatePosWebhookSecret } = await import("@/lib/pos/connections")
  const result = await rotatePosWebhookSecret(supabase, input.restaurant_id, input.provider)
  if (!result.ok) return result

  revalidatePath("/panel/foodos/pos")
  return { ok: true, secret: result.secret }
}

// ============================================================
// Catering por volumen (nivel Diamante)
//
// El total siempre lo calcula `quoteCatering` en el servidor a partir del
// paquete y el número de personas. El navegador manda cuántas personas van;
// nunca cuánto cuesta.
//
// Cotizar y confirmar son actos separados: la solicitud nace cotizada (el
// precio por persona es público) y el restaurante decide. Un evento confirmado
// no se declina — para eso está cancelar, que deja claro que hubo acuerdo.
// ============================================================

export interface CateringData {
  packages: CateringPackage[]
  requests: CateringRequestRow[]
  kpis: CateringKpis
}

/** `true` si el restaurante tiene la capacidad; usado por las lecturas. */
async function canUseCatering(): Promise<boolean> {
  try {
    await requireFoodosFeature("catering")
    return true
  } catch {
    return false
  }
}

export async function getCateringData(restaurantId: string): Promise<CateringData | null> {
  if (!(await canUseCatering())) return null
  const { supabase } = await requireAuth()
  const { loadCateringContext } = await import("@/lib/foodos-catering-data")
  const context = await loadCateringContext(supabase, restaurantId)
  return { packages: context.packages, requests: context.requests, kpis: context.kpis }
}

export async function saveCateringPackageAction(input: {
  restaurant_id: string
  package_id?: string | null
  name: string
  description?: string | null
  price_per_person: number
  min_people: number
  max_people?: number | null
  lead_time_hours?: number | null
  includes?: string[]
  is_active?: boolean
  sort_order?: number | null
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  await requireFoodosFeature("catering")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const { saveCateringPackage } = await import("@/lib/foodos-catering-data")
  const result = await saveCateringPackage(
    supabase,
    input.restaurant_id,
    input.package_id ?? null,
    {
      name: input.name,
      description: input.description,
      pricePerPerson: input.price_per_person,
      minPeople: input.min_people,
      maxPeople: input.max_people,
      leadTimeHours: input.lead_time_hours,
      includes: input.includes,
      isActive: input.is_active,
      sortOrder: input.sort_order,
    }
  )
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath("/panel/foodos/catering")
  revalidatePath("/r/[slug]/catering")
  return { ok: true, id: result.id }
}

export async function deleteCateringPackageAction(input: {
  restaurant_id: string
  package_id: string
}): Promise<{ ok: boolean; error?: string }> {
  await requireFoodosFeature("catering")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const { deleteCateringPackage } = await import("@/lib/foodos-catering-data")
  const result = await deleteCateringPackage(supabase, input.restaurant_id, input.package_id)
  if (!result.ok) return result

  revalidatePath("/panel/foodos/catering")
  revalidatePath("/r/[slug]/catering")
  return { ok: true }
}

export async function setCateringRequestStatusAction(input: {
  restaurant_id: string
  request_id: string
  status: string
}): Promise<{ ok: boolean; error?: string }> {
  await requireFoodosFeature("catering")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const { setCateringRequestStatus } = await import("@/lib/foodos-catering-data")
  const result = await setCateringRequestStatus(
    supabase,
    input.restaurant_id,
    input.request_id,
    input.status
  )
  if (!result.ok) return result

  revalidatePath("/panel/foodos/catering")
  return { ok: true }
}

export async function overrideCateringTotalAction(input: {
  restaurant_id: string
  request_id: string
  total: number
  deposit?: number | null
}): Promise<{ ok: boolean; error?: string }> {
  await requireFoodosFeature("catering")
  const { supabase, user } = await requireAuth()
  await assertOwnRestaurant(supabase, user.id, input.restaurant_id)

  const { overrideCateringTotal } = await import("@/lib/foodos-catering-data")
  const result = await overrideCateringTotal(
    supabase,
    input.restaurant_id,
    input.request_id,
    input.total,
    input.deposit ?? null
  )
  if (!result.ok) return result

  revalidatePath("/panel/foodos/catering")
  return { ok: true }
}
