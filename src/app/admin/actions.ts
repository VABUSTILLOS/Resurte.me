"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"

interface AdminOrderItem {
  id: number
  order_id: number
  product_id: number
  quantity: number
  unit_price: number
  product_name: string | null
  product_image: string | null
}

export interface AdminOrder {
  id: number
  user_id: string
  customer_name: string | null
  status: string
  subtotal: number
  delivery_fee: number
  discount?: number
  coupon_code?: string | null
  total: number
  payment_method: string | null
  payment_status: string
  source: string
  created_at: string
  address: {
    street: string
    number: string
    interior: string | null
    neighborhood: string
    city: string
    state: string
    zip_code: string
    references: string | null
  } | null
  items: AdminOrderItem[]
}

/**
 * Server action para el panel admin de pedidos.
 * Requiere sesión de admin (requireAdmin) y usa service_role para leer
 * TODOS los pedidos (el RLS del client SDK solo devolvería los propios).
 *
 * Paginación por cursor: pasa `before` (ISO created_at del último pedido
 * visible) para obtener la página anterior; devuelve `hasMore` para saber
 * si existen pedidos más viejos.
 */
export async function getAdminOrders(
  limit = 100,
  before?: string
): Promise<{ orders: AdminOrder[]; hasMore: boolean }> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()

  let query = supabase
    .from("orders")
    .select("*, profiles(full_name), addresses(*)")
    .order("created_at", { ascending: false })

  if (before) {
    // Pedidos creados ANTES del cursor (página anterior, de más viejo a más nuevo se
    // recorre hacia abajo: el cursor es la fila más antigua ya visible).
    query = query.lt("created_at", before)
  }

  // Traer limit+1 para saber si hay más páginas
  const { data: orders, error } = await query.limit(limit + 1)

  if (error) {
    console.error("[ADMIN-ORDERS] Error fetching orders:", error)
    throw new Error("Error al cargar los pedidos")
  }

  const hasMore = (orders?.length ?? 0) > limit
  const pageOrders = (orders ?? []).slice(0, limit)

  // Cargar items y nombres de producto para todos los pedidos
  const orderIds = pageOrders.map((o) => o.id)
  const { data: items } = await supabase
    .from("order_items")
    .select("id, order_id, product_id, quantity, unit_price")
    .in("order_id", orderIds.length ? orderIds : [-1])

  const productIds = Array.from(
    new Set((items ?? []).map((i) => i.product_id))
  )
  const { data: products } = await supabase
    .from("products")
    .select("id, name, image_url")
    .in("id", productIds.length ? productIds : [-1])

  const productMap = new Map((products ?? []).map((p) => [p.id, p]))

  const itemsByOrder = new Map<number, AdminOrderItem[]>()
  for (const item of items ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? []
    list.push({
      id: item.id,
      order_id: item.order_id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
      product_name: productMap.get(item.product_id)?.name ?? null,
      product_image: productMap.get(item.product_id)?.image_url ?? null,
    })
    itemsByOrder.set(item.order_id, list)
  }

  return {
    orders: pageOrders.map((o) => ({
      id: o.id,
      user_id: o.user_id,
      customer_name: o.profiles?.full_name ?? null,
      status: o.status,
      subtotal: Number(o.subtotal),
      delivery_fee: Number(o.delivery_fee),
      discount: o.discount != null ? Number(o.discount) : undefined,
      coupon_code: o.coupon_code ?? null,
      total: Number(o.total),
      payment_method: o.payment_method,
      payment_status: o.payment_status,
      source: o.source,
      created_at: o.created_at,
      address: o.addresses
        ? {
            street: o.addresses.street,
            number: o.addresses.number,
            interior: o.addresses.interior ?? null,
            neighborhood: o.addresses.neighborhood,
            city: o.addresses.city,
            state: o.addresses.state,
            zip_code: o.addresses.zip_code,
            references: o.addresses.references ?? null,
          }
        : null,
      items: itemsByOrder.get(o.id) ?? [],
    })),
    hasMore,
  }
}

/** Número de tiendas activas (para el dashboard admin). */
export async function getActiveStoresCount(): Promise<number> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const { count, error } = await supabase
    .from("stores")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true)

  if (error) {
    console.error("[ADMIN-DASHBOARD] Error fetching stores:", error)
    throw new Error("Error al cargar las tiendas")
  }
  return count ?? 0
}

// ============================================================
// CATÁLOGO WHATSAPP (sustituye los antiguos MOCK_PRODUCTS)
// ============================================================

export interface AdminWhatsappProduct {
  id: number
  name: string
  brand: string | null
  category_id: number | null
  image_url: string | null
  price: number | null
  sale_price: number | null
  unit: string | null
  show_in_whatsapp: boolean
  whatsapp_product_id: string | null
}

export interface AdminWhatsappCategory {
  id: number
  name: string
  icon: string | null
  slug: string
}

/** Productos y categorías reales para el panel de catálogo de WhatsApp. */
export async function getAdminWhatsappCatalog(): Promise<{
  products: AdminWhatsappProduct[]
  categories: AdminWhatsappCategory[]
}> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()

  const [productsRes, categoriesRes] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, brand, category_id, image_url, price, sale_price, unit, show_in_whatsapp, whatsapp_product_id"
      )
      .order("name"),
    supabase.from("categories").select("id, name, icon, slug").order("id"),
  ])

  if (productsRes.error) {
    console.error("[ADMIN-WHATSAPP] Error fetching products:", productsRes.error)
    throw new Error("Error al cargar los productos")
  }
  if (categoriesRes.error) {
    console.error("[ADMIN-WHATSAPP] Error fetching categories:", categoriesRes.error)
    throw new Error("Error al cargar las categorías")
  }

  return {
    products: (productsRes.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand ?? null,
      category_id: p.category_id ?? null,
      image_url: p.image_url ?? null,
      price: p.price != null ? Number(p.price) : null,
      sale_price: p.sale_price != null ? Number(p.sale_price) : null,
      unit: p.unit ?? null,
      show_in_whatsapp: p.show_in_whatsapp ?? false,
      whatsapp_product_id: p.whatsapp_product_id ?? null,
    })),
    categories: (categoriesRes.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon ?? null,
      slug: c.slug,
    })),
  }
}

/** Actualiza show_in_whatsapp de un producto en la BD. */
export async function setProductWhatsappVisibility(
  productId: number,
  showInWhatsapp: boolean
): Promise<void> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) {
    throw new Error("Acceso restringido a administradores")
  }

  const supabase = await createServiceClient()
  const { error } = await supabase
    .from("products")
    .update({ show_in_whatsapp: showInWhatsapp, updated_at: new Date().toISOString() })
    .eq("id", productId)

  if (error) {
    console.error("[ADMIN-WHATSAPP] Error updating product:", error)
    throw new Error("Error al actualizar el producto")
  }
}
