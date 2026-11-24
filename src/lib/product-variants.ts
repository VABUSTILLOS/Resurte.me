// ============================================================
// Presentaciones (variantes) de producto — migración 00232
// ============================================================
// Un producto puede tener presentaciones (bolsa 1 kg vs 5 kg,
// tamaño, sabor), cada una con su propio precio, existencia y SKU,
// agrupadas en UNA sola ficha. Este módulo es la fuente única de
// las reglas puras (precio efectivo, slug estable, validación,
// estado agregado del padre) y de las lecturas de BD del canal de
// venta; lo consumen la ficha, el feed de Meta, el checkout web,
// la conversión de pedidos de WhatsApp y el panel admin.
//
// Decisiones (ver también la migración 00232):
// - La cantidad mínima/máxima por pedido (00229) es POR PRODUCTO:
//   las líneas de todas las presentaciones suman para el límite.
// - La variante no tiene ventana de oferta: su precio efectivo es
//   `sale_price ?? price`, directo.
// - El `slug` de la variante se fija al crearla y nunca se
//   regenera al renombrar: de él cuelga su retailer_id en el feed
//   de Meta (`<id del producto>--<slug>`), y moverlo crearía otro
//   artículo en WhatsApp.
// - El `stock_status` del producto padre de un producto CON
//   variantes es un agregado: agotado solo si TODAS sus variantes
//   activas están agotadas. Lo mantienen las RPC de inventario
//   (00232) y `refreshParentStockStatus` desde el panel.
//
// Degradación: si la migración 00232 aún no se aplica, toda lectura
// devuelve «sin variantes» (42P01) y la tienda vende como antes.

import { slugify } from "@/lib/foodos"
import { logger } from "@/lib/logger"
import { isMissingRelationError } from "@/lib/sale-window"
import { deriveStockStatus, type StockStatus } from "@/lib/stock"
import type { createServiceClient } from "@/lib/supabase/service"
import type { ProductVariant } from "@/types"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export const PRODUCT_VARIANT_SELECT =
  "id, product_id, name, slug, sku, price, sale_price, stock_quantity, stock_status, is_active, position, created_at, updated_at"

/** Precio que paga el cliente por esta presentación. */
export function variantEffectivePrice(v: { price: number; sale_price: number | null }): number {
  return v.sale_price ?? v.price
}

/** Agrupa variantes por producto, conservando el orden de entrada. */
export function groupVariantsByProduct(
  variants: readonly ProductVariant[]
): Map<number, ProductVariant[]> {
  const out = new Map<number, ProductVariant[]>()
  for ( const v of variants) {
    const list = out.get(v.product_id)
    if (list) list.push(v)
    else out.set(v.product_id, [v])
  }
  return out
}

/** Solo las variantes activas de un producto, en orden de exhibición. */
export function activeVariantsOf(
  variants: readonly ProductVariant[],
  productId: number
): ProductVariant[] {
  return variants
    .filter((v) => v.product_id === productId && v.is_active)
    .sort((a, b) => a.position - b.position || a.id - b.id)
}

// ============================================================
// Slug estable de la variante
// ============================================================

/** Base del slug desde el nombre («Bolsa 5 kg» → «bolsa-5-kg»). */
export function variantSlugBase(name: string): string {
  const base = slugify(name)
  return base.length > 0 ? base : "presentacion"
}

/**
 * Slug único dentro del producto: si la base ya existe se sufija
 * -2, -3… (dos presentaciones pueden llamarse igual al capturarlas;
 * el slug es identidad, el nombre es exhibición).
 */
export function uniqueVariantSlug(base: string, existing: ReadonlySet<string>): string {
  if (!existing.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!existing.has(candidate)) return candidate
  }
}

// ============================================================
// Estado agregado del producto padre
// ============================================================

/**
 * `stock_status` que le corresponde al producto padre:
 * - Con variantes activas: agotado solo si TODAS están agotadas
 *   (una sin control de inventario nunca está agotada).
 * - Sin variantes activas (todas desactivadas): vuelve a mandar la
 *   existencia propia del producto, como si no tuviera variantes.
 */
export function deriveParentStockStatus(
  activeVariants: readonly { stock_status: StockStatus }[],
  own: { stock_quantity: number | null; low_stock_threshold?: number | null }
): StockStatus {
  if (activeVariants.length > 0) {
    return activeVariants.every((v) => v.stock_status === "out_of_stock")
      ? "out_of_stock"
      : "in_stock"
  }
  return deriveStockStatus(own.stock_quantity, own.low_stock_threshold)
}

// ============================================================
// Validación de captura (panel admin)
// ============================================================

export interface ProductVariantInput {
  name?: string
  price?: number
  sale_price?: number | null
  stock_quantity?: number | null
  stock_status?: StockStatus
  sku?: string | null
  is_active?: boolean
  position?: number
}

export type ValidateVariantResult =
  | { ok: true; value: ProductVariantInput }
  | { ok: false; error: string; field: string }

const STOCK_STATUSES: readonly StockStatus[] = ["in_stock", "low_stock", "out_of_stock"]

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

/**
 * Valida el body de alta/edición de una variante. `partial: false`
 * (alta) exige nombre y precio; `partial: true` (edición) solo
 * valida lo que viene. Regla espejo del formulario de producto:
 * el precio de oferta mayor o igual al precio NO se bloquea aquí
 * (el panel lo avisa, como en productos); lo imposible sí.
 */
export function validateProductVariantInput(
  body: Record<string, unknown>,
  opts: { partial: boolean }
): ValidateVariantResult {
  const value: ProductVariantInput = {}

  if (!opts.partial || body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (name.length === 0) {
      return { ok: false, error: "La presentación necesita un nombre", field: "name" }
    }
    if (name.length > 120) {
      return { ok: false, error: "El nombre de la presentación es demasiado largo", field: "name" }
    }
    value.name = name
  }

  if (!opts.partial || body.price !== undefined) {
    if (!isFiniteNumber(body.price) || body.price <= 0) {
      return { ok: false, error: "El precio debe ser un número mayor a 0", field: "price" }
    }
    value.price = Math.round(body.price * 100) / 100
  }

  if (body.sale_price !== undefined) {
    if (body.sale_price === null) {
      value.sale_price = null
    } else if (!isFiniteNumber(body.sale_price) || body.sale_price < 0) {
      return { ok: false, error: "El precio de oferta no puede ser negativo", field: "sale_price" }
    } else {
      value.sale_price = Math.round(body.sale_price * 100) / 100
    }
  }

  if (body.stock_quantity !== undefined) {
    if (body.stock_quantity === null || body.stock_quantity === "") {
      value.stock_quantity = null
    } else if (!isFiniteNumber(body.stock_quantity) || !Number.isInteger(body.stock_quantity) || body.stock_quantity < 0) {
      return {
        ok: false,
        error: "La existencia debe ser un entero de 0 en adelante (o vacío = sin control)",
        field: "stock_quantity",
      }
    } else {
      value.stock_quantity = body.stock_quantity
    }
  }

  if (body.stock_status !== undefined) {
    if (!STOCK_STATUSES.includes(body.stock_status as StockStatus)) {
      return { ok: false, error: "Estado de existencia inválido", field: "stock_status" }
    }
    value.stock_status = body.stock_status as StockStatus
  }

  if (body.sku !== undefined) {
    if (body.sku === null || body.sku === "") {
      value.sku = null
    } else if (typeof body.sku !== "string" || body.sku.trim().length > 64) {
      return { ok: false, error: "El SKU es demasiado largo", field: "sku" }
    } else {
      value.sku = body.sku.trim()
    }
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") {
      return { ok: false, error: "is_active debe ser verdadero o falso", field: "is_active" }
    }
    value.is_active = body.is_active
  }

  if (body.position !== undefined) {
    if (!isFiniteNumber(body.position) || !Number.isInteger(body.position) || body.position < 0) {
      return { ok: false, error: "La posición debe ser un entero de 0 en adelante", field: "position" }
    }
    value.position = body.position
  }

  return { ok: true, value }
}

// ============================================================
// Lecturas de BD (solo servidor)
// ============================================================

/**
 * Variantes de UN producto (la ficha pide solo activas; el panel,
 * todas). Degrada a [] si la tabla aún no existe.
 */
export async function fetchProductVariants(
  supabase: ServiceClient,
  productId: number,
  opts?: { includeInactive?: boolean }
): Promise<ProductVariant[]> {
  let query = supabase
    .from("product_variants")
    .select(PRODUCT_VARIANT_SELECT)
    .eq("product_id", productId)
    .order("position", { ascending: true })
    .order("id", { ascending: true })
  if (!opts?.includeInactive) query = query.eq("is_active", true)
  const { data, error } = await query
  if (error) {
    if (!isMissingRelationError(error)) {
      logger.error("[product-variants] error leyendo variantes; se sigue sin variantes", error)
    }
    return []
  }
  return (data ?? []) as unknown as ProductVariant[]
}

/** Fila de variante tal como la necesita el canal de venta. */
export interface OrderVariantRow {
  id: number
  product_id: number
  name: string
  price: number
  sale_price: number | null
  stock_status: StockStatus
  stock_quantity: number | null
  is_active: boolean
}

export interface OrderVariantData {
  /** Variantes pedidas por id (las que el cliente/reparto nombró). */
  byId: Map<number, OrderVariantRow>
  /** Productos que tienen al menos una variante activa. */
  productIdsWithVariants: Set<number>
  /** false = la tabla no existe o no se pudo leer: no hay variantes. */
  tableAvailable: boolean
}

/**
 * Lectura única para validar un pedido (web y WhatsApp): las
 * variantes nombradas por id y el conjunto de productos que se
 * venden por presentación. Nunca lanza.
 */
export async function fetchOrderVariantData(
  supabase: ServiceClient,
  args: { variantIds: readonly number[]; productIds: readonly number[] }
): Promise<OrderVariantData> {
  const byId = new Map<number, OrderVariantRow>()
  const productIdsWithVariants = new Set<number>()
  const variantIds = [...new Set(args.variantIds)]
  const productIds = [...new Set(args.productIds)]
  if (variantIds.length === 0 && productIds.length === 0) {
    return { byId, productIdsWithVariants, tableAvailable: true }
  }
  try {
    if (variantIds.length > 0) {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, product_id, name, price, sale_price, stock_status, stock_quantity, is_active")
        .in("id", variantIds)
      if (error) throw error
      for (const row of (data ?? []) as unknown as OrderVariantRow[]) byId.set(row.id, row)
    }
    if (productIds.length > 0) {
      const { data, error } = await supabase
        .from("product_variants")
        .select("product_id")
        .in("product_id", productIds)
        .eq("is_active", true)
      if (error) throw error
      for (const row of (data ?? []) as Array<{ product_id: number }>) {
        productIdsWithVariants.add(Number(row.product_id))
      }
    }
    return { byId, productIdsWithVariants, tableAvailable: true }
  } catch (err) {
    if (!isMissingRelationError(err)) {
      logger.error("[product-variants] error leyendo variantes del pedido; se vende sin variantes", err)
    }
    return { byId, productIdsWithVariants, tableAvailable: false }
  }
}

/**
 * Re-deriva el `stock_status` del producto padre tras un cambio de
 * variantes hecho desde el panel (las ventas lo re-derivan en la
 * RPC). No toca productos sin variantes: ahí manda el formulario
 * de producto. Best-effort: nunca lanza.
 */
export async function refreshParentStockStatus(
  supabase: ServiceClient,
  productId: number
): Promise<void> {
  try {
    const [{ data: variantRows, error: vErr }, { data: product, error: pErr }] =
      await Promise.all([
        supabase.from("product_variants").select("is_active, stock_status").eq("product_id", productId),
        supabase
          .from("products")
          .select("stock_quantity, low_stock_threshold, stock_status")
          .eq("id", productId)
          .maybeSingle(),
      ])
    if (vErr || pErr || !product) return
    const variants = (variantRows ?? []) as Array<{ is_active: boolean; stock_status: StockStatus }>
    if (variants.length === 0) return
    const current = product as {
      stock_quantity: number | null
      low_stock_threshold: number | null
      stock_status: StockStatus
    }
    const next = deriveParentStockStatus(
      variants.filter((v) => v.is_active),
      current
    )
    if (next !== current.stock_status) {
      await supabase.from("products").update({ stock_status: next }).eq("id", productId)
    }
  } catch (err) {
    logger.error("[product-variants] no se pudo re-derivar el estado del producto padre", err)
  }
}
