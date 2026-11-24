import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { isMissingRelationError } from "@/lib/sale-window"
import { deriveStockStatus, type StockStatus } from "@/lib/stock"
import {
  PRODUCT_VARIANT_SELECT,
  fetchProductVariants,
  refreshParentStockStatus,
  uniqueVariantSlug,
  validateProductVariantInput,
  variantSlugBase,
} from "@/lib/product-variants"
import type { ProductVariant } from "@/types"
import { NextResponse, type NextRequest } from "next/server"

export const runtime = "nodejs"

/**
 * Presentaciones de un producto (00232) — CRUD del panel.
 *
 * GET    ?product_id=N   → todas las variantes del producto (también
 *                          las inactivas: el panel las gestiona).
 * POST   { product_id, name, price, ... } → alta. El `slug` se crea
 *                          una sola vez del nombre y nunca cambia
 *                          (de él cuelga el retailer_id del feed de
 *                          Meta); renombrar NO lo regenera.
 * PATCH  { id, ... }     → edición parcial.
 * DELETE ?id=N           → baja física SOLO si ningún pedido la
 *                          referencia; con pedidos, 409 y la salida
 *                          es desactivarla (el historial no se rompe).
 *
 * Existencia: si la variante lleva `stock_quantity` entero, su
 * `stock_status` se DERIVA con el umbral del producto padre (misma
 * regla que el formulario de producto); sin cantidad (null = sin
 * control) manda el estado manual. Tras cada escritura se re-deriva
 * el estado agregado del producto padre.
 *
 * Si la migración 00232 aún no se aplica, todo responde 400 con el
 * aviso: el panel lo muestra tal cual y el resto de la tienda no se
 * entera.
 */

const MIGRATION_MISSING_ERROR =
  "Las presentaciones aún no están disponibles: falta aplicar la migración 00232 en Supabase"

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

function positiveInt(raw: unknown): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

async function fetchProductRow(
  supabase: ServiceClient,
  productId: number
): Promise<{ id: number; low_stock_threshold: number | null } | null> {
  const { data } = await supabase
    .from("products")
    .select("id, low_stock_threshold")
    .eq("id", productId)
    .maybeSingle()
  return (data as { id: number; low_stock_threshold: number | null } | null) ?? null
}

/** Estado final de la variante según la regla cantidad→derivado. */
function resolveVariantStatus(
  quantity: number | null,
  manual: StockStatus | undefined,
  fallback: StockStatus,
  threshold: number | null
): StockStatus {
  if (quantity !== null) return deriveStockStatus(quantity, threshold)
  return manual ?? fallback
}

export async function GET(request: NextRequest) {
  const { response: adminDenied } = await requireAdmin({ permission: "productos" })
  if (adminDenied) return adminDenied

  const productId = positiveInt(request.nextUrl.searchParams.get("product_id"))
  if (!productId) {
    return NextResponse.json({ error: "product_id inválido" }, { status: 400 })
  }

  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("product_variants")
      .select(PRODUCT_VARIANT_SELECT)
      .eq("product_id", productId)
      .order("position", { ascending: true })
      .order("id", { ascending: true })
    if (error) {
      if (isMissingRelationError(error)) {
        return NextResponse.json({ error: MIGRATION_MISSING_ERROR }, { status: 400 })
      }
      throw error
    }
    return NextResponse.json({ variants: (data ?? []) as unknown as ProductVariant[] })
  } catch (error) {
    logger.error("admin product variants GET error:", error)
    return NextResponse.json({ error: "Error al leer las presentaciones" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { user: adminUser, response: adminDenied } = await requireAdmin({
    permission: "productos",
  })
  if (adminDenied) return adminDenied

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 })

    const productId = positiveInt(body.product_id)
    if (!productId) {
      return NextResponse.json({ error: "product_id inválido" }, { status: 400 })
    }
    const parsed = validateProductVariantInput(body, { partial: false })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, field: parsed.field }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const product = await fetchProductRow(supabase, productId)
    if (!product) {
      return NextResponse.json({ error: "El producto no existe" }, { status: 404 })
    }

    const existing = await fetchProductVariants(supabase, productId, { includeInactive: true })
    const slug = uniqueVariantSlug(
      variantSlugBase(parsed.value.name ?? ""),
      new Set(existing.map((v) => v.slug))
    )
    const quantity = parsed.value.stock_quantity ?? null
    const row = {
      product_id: productId,
      name: parsed.value.name,
      slug,
      sku: parsed.value.sku ?? null,
      price: parsed.value.price,
      sale_price: parsed.value.sale_price ?? null,
      stock_quantity: quantity,
      stock_status: resolveVariantStatus(
        quantity,
        parsed.value.stock_status,
        "in_stock",
        product.low_stock_threshold
      ),
      is_active: parsed.value.is_active ?? true,
      position: parsed.value.position ?? existing.length,
    }

    const { data, error } = await supabase
      .from("product_variants")
      .insert(row)
      .select(PRODUCT_VARIANT_SELECT)
      .single()
    if (error) {
      if (isMissingRelationError(error)) {
        return NextResponse.json({ error: MIGRATION_MISSING_ERROR }, { status: 400 })
      }
      throw error
    }

    await refreshParentStockStatus(supabase, productId)
    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "product_variant_create",
      entity: "product_variants",
      entityId: (data as unknown as ProductVariant).id,
      detail: { product_id: productId, name: row.name, slug },
    })
    return NextResponse.json({ variant: data as unknown as ProductVariant }, { status: 201 })
  } catch (error) {
    logger.error("admin product variants POST error:", error)
    return NextResponse.json({ error: "Error al crear la presentación" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const { user: adminUser, response: adminDenied } = await requireAdmin({
    permission: "productos",
  })
  if (adminDenied) return adminDenied

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 })

    const id = positiveInt(body.id)
    if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 })
    const parsed = validateProductVariantInput(body, { partial: true })
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error, field: parsed.field }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { data: current, error: readError } = await supabase
      .from("product_variants")
      .select(PRODUCT_VARIANT_SELECT)
      .eq("id", id)
      .maybeSingle()
    if (readError) {
      if (isMissingRelationError(readError)) {
        return NextResponse.json({ error: MIGRATION_MISSING_ERROR }, { status: 400 })
      }
      throw readError
    }
    if (!current) {
      return NextResponse.json({ error: "La presentación no existe" }, { status: 404 })
    }
    const currentRow = current as unknown as ProductVariant
    const product = await fetchProductRow(supabase, currentRow.product_id)

    const patch: Record<string, unknown> = { ...parsed.value }
    // El slug NO se toca en edición: renombrar no lo regenera.
    delete patch.slug
    const effectiveQuantity =
      parsed.value.stock_quantity !== undefined
        ? parsed.value.stock_quantity
        : currentRow.stock_quantity
    patch.stock_status = resolveVariantStatus(
      effectiveQuantity,
      parsed.value.stock_status,
      currentRow.stock_status,
      product?.low_stock_threshold ?? null
    )

    const { data, error } = await supabase
      .from("product_variants")
      .update(patch)
      .eq("id", id)
      .select(PRODUCT_VARIANT_SELECT)
      .single()
    if (error) throw error

    await refreshParentStockStatus(supabase, currentRow.product_id)
    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "product_variant_update",
      entity: "product_variants",
      entityId: id,
      detail: { product_id: currentRow.product_id, fields: Object.keys(parsed.value) },
    })
    return NextResponse.json({ variant: data as unknown as ProductVariant })
  } catch (error) {
    logger.error("admin product variants PATCH error:", error)
    return NextResponse.json({ error: "Error al editar la presentación" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const { user: adminUser, response: adminDenied } = await requireAdmin({
    permission: "productos",
  })
  if (adminDenied) return adminDenied

  try {
    const id = positiveInt(request.nextUrl.searchParams.get("id"))
    if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 })

    const supabase = await createServiceClient()
    const { data: current, error: readError } = await supabase
      .from("product_variants")
      .select("id, product_id, name")
      .eq("id", id)
      .maybeSingle()
    if (readError) {
      if (isMissingRelationError(readError)) {
        return NextResponse.json({ error: MIGRATION_MISSING_ERROR }, { status: 400 })
      }
      throw readError
    }
    if (!current) {
      return NextResponse.json({ error: "La presentación no existe" }, { status: 404 })
    }
    const currentRow = current as unknown as { id: number; product_id: number; name: string }

    // Con pedidos que la referencian no se borra: el historial del
    // pedido perdería su presentación. La salida es desactivarla.
    const { data: references } = await supabase
      .from("order_items")
      .select("id")
      .eq("variant_id", id)
      .limit(1)
    if ((references ?? []).length > 0) {
      return NextResponse.json(
        {
          error:
            "Esta presentación ya aparece en pedidos y no se puede eliminar. Desactívala para que deje de venderse.",
        },
        { status: 409 }
      )
    }

    const { error } = await supabase.from("product_variants").delete().eq("id", id)
    if (error) throw error

    await refreshParentStockStatus(supabase, currentRow.product_id)
    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "product_variant_delete",
      entity: "product_variants",
      entityId: id,
      detail: { product_id: currentRow.product_id, name: currentRow.name },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error("admin product variants DELETE error:", error)
    return NextResponse.json({ error: "Error al eliminar la presentación" }, { status: 500 })
  }
}
