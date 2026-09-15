import { NextResponse, type NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import type { ProductImportRow } from "@/lib/product-import"

export const runtime = "nodejs"

const MAX_ROWS = 500

/**
 * POST /api/admin/products/import
 *
 * Fase 16 — alta/actualización masiva de productos. Body: { rows } ya
 * parseadas y validadas en el cliente con parseProductImportCsv. La
 * coincidencia es por slug: existe → actualiza precio/oferta/marca/
 * categoría/stock/visibilidad; no existe → inserta.
 *
 * Respuesta: { created, updated, errors: [{ slug, message }] }
 */
export async function POST(request: NextRequest) {
  const { response: adminDenied, user: adminUser } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const body = (await request.json()) as { rows?: ProductImportRow[] }
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (rows.length === 0) {
      return NextResponse.json({ error: "Sin filas para importar" }, { status: 400 })
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Máximo ${MAX_ROWS} filas por importación` },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()

    // Resolver slugs de categoría a ids (una sola consulta)
    const categorySlugs = Array.from(
      new Set(rows.map((r) => r.category_slug).filter((s): s is string => !!s))
    )
    const { data: categories } = categorySlugs.length
      ? await supabase.from("categories").select("id, slug").in("slug", categorySlugs)
      : { data: [] as { id: number; slug: string }[] }
    const categoryIdBySlug = new Map((categories ?? []).map((c) => [c.slug, c.id]))

    // Productos existentes por slug (la columna no es UNIQUE: primer match)
    const slugs = rows.map((r) => r.slug)
    const { data: existing } = await supabase
      .from("products")
      .select("id, slug")
      .in("slug", slugs)
    const existingBySlug = new Map((existing ?? []).map((p) => [p.slug, p.id]))

    let created = 0
    let updated = 0
    const errors: { slug: string; message: string }[] = []

    for (const row of rows) {
      const payload = {
        name: row.name,
        price: row.price,
        sale_price: row.sale_price,
        brand: row.brand,
        category_id: row.category_slug ? (categoryIdBySlug.get(row.category_slug) ?? null) : null,
        stock_status: row.stock_status,
        is_visible: row.is_visible,
        updated_at: new Date().toISOString(),
      }
      const existingId = existingBySlug.get(row.slug)
      if (existingId) {
        const { error } = await supabase.from("products").update(payload).eq("id", existingId)
        if (error) errors.push({ slug: row.slug, message: error.message })
        else updated++
      } else {
        const { error } = await supabase.from("products").insert({ ...payload, slug: row.slug })
        if (error) errors.push({ slug: row.slug, message: error.message })
        else created++
      }
    }

    if (created > 0 || updated > 0) {
      revalidateCatalogCache()
      resetCatalogCache()
      // Fase 15 — bitácora
      await logAdminAction(supabase, {
        actorId: adminUser?.id ?? null,
        actorEmail: adminUser?.email ?? null,
        action: "product_update",
        entity: "products",
        detail: { import: true, created, updated, failed: errors.length },
      })
    }

    return NextResponse.json({ created, updated, errors })
  } catch (error) {
    logger.error("[ADMIN-IMPORT] error:", error)
    return NextResponse.json({ error: "Error al importar productos" }, { status: 500 })
  }
}
