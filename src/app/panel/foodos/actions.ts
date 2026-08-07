"use server"

// ============================================================
// Server Actions de FoodOS: CRUD de restaurante, menú, combos,
// reglas, clientes, automatizaciones y pedidos.
// Todas usan requireAuth() y respetan RLS (owner-only).
// ============================================================

import { requireAuth } from "@/lib/auth"
import { createServiceClient } from "@/lib/supabase/service"
import { slugify } from "@/lib/foodos"
import { revalidatePath } from "next/cache"
import type {
  FoodosRestaurant,
  FoodosBranch,
  FoodosMenuCategory,
  FoodosMenuItem,
  FoodosCombo,
  FoodosUpsellRule,
  FoodosAutomation,
  FoodosOrderStatus,
  FoodosCustomer,
  FoodosCampaign,
} from "@/types/foodos"

// ------------------------------------------------------------
// Restaurante
// ------------------------------------------------------------

export async function getMyRestaurant(): Promise<FoodosRestaurant | null> {
  const { supabase, user } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_restaurants")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as FoodosRestaurant) ?? null
}

export async function upsertRestaurant(input: {
  id?: string
  name: string
  slug: string
  logo_url?: string | null
  description?: string | null
  status?: FoodosRestaurant["status"]
  currency?: string
  collection_id?: number | null
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
  status: FoodosRestaurant["status"]
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
  trigger_type: FoodosUpsellRule["trigger_type"]
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

export async function updateOrderStatus(
  orderId: string,
  status: FoodosOrderStatus
): Promise<void> {
  const { supabase } = await requireAuth()
  const { error } = await supabase
    .from("foodos_orders")
    .update({ status })
    .eq("id", orderId)
  if (error) throw new Error(error.message)
  revalidatePath("/panel/foodos/pedidos")
}

// ------------------------------------------------------------
// Automatizaciones (recurrencia WhatsApp)
// ------------------------------------------------------------

export async function listAutomations(
  restaurantId: string
): Promise<FoodosAutomation[]> {
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
  incentive_config?: FoodosAutomation["incentive_config"]
  is_active?: boolean
}): Promise<void> {
  const { supabase } = await requireAuth()
  const payload = {
    restaurant_id: input.restaurant_id,
    type: input.type,
    name: input.name,
    trigger_config: input.trigger_config ?? {},
    message: input.message || null,
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

export async function listCustomers(restaurantId: string) {
  const { supabase } = await requireAuth()
  const { data, error } = await supabase
    .from("foodos_customers")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("total_spend", { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return (data as FoodosCustomer[]) ?? []
}

export async function listCampaigns(restaurantId: string) {
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
        status: "failed",
        error: err instanceof Error ? err.message : "Error al ejecutar",
      })
      .eq("id", campaignId)
    revalidatePath("/panel/foodos/clientes")
    throw err
  }
}

export async function deleteCampaign(id: string): Promise<void> {
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
