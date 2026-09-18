import { NextResponse, type NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { readJsonBody } from "@/lib/api-body"
import { createServiceClient } from "@/lib/supabase/service"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { describeImportColumns, validateImportColumns } from "@/lib/product-import"
import type { ProductImportRow } from "@/lib/product-import"

export const runtime = "nodejs"

const MAX_ROWS = 500

export type ImportMode = "upsert" | "create_only" | "update_only"

export interface ImportPlanEntry {
  line: number
  slug: string
  name: string
  sku: string | null
  matchedBy: "sku" | "slug" | null
}

/**
 * POST /api/admin/products/import
 *
 * Fase 16 + Ronda 7 — alta/actualización masiva de productos. Body:
 * { rows, dryRun?, mode? } con filas ya parseadas con parseProductImportCsv.
 *
 * Coincidencia: primero por SKU (identificador estable) y luego por slug.
 * `mode` permite importar solo altas, solo actualizaciones o ambas.
 *
 * Las columnas opcionales vacías NO pisan el valor guardado (sku, barcode,
 * cantidad, umbral, oferta); `etiquetas` solo se reemplaza si la columna
 * viene en el CSV.
 */
export async function POST(request: NextRequest) {
  const { response: adminDenied, user: adminUser } = await requireAdmin({ permission: "productos" })
  if (adminDenied) return adminDenied

  try {
    const parsed = await readJsonBody<{
      rows?: ProductImportRow[]
      dryRun?: boolean
      mode?: ImportMode
      /** Encabezado del CSV tal como lo leyó el cliente, para validarlo aquí. */
      columns?: string[]
    }>(request)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

    const body = parsed.data
    const rows = Array.isArray(body.rows) ? body.rows : []

    // Guarda de entrada: un CSV con columnas desconocidas se importaría a medias
    // (los datos de esas columnas se pierden en silencio). Mejor 400 explicando
    // cuáles sobran que un resultado silenciosamente incompleto.
    if (Array.isArray(body.columns)) {
      const report = validateImportColumns(body.columns)
      const problem = describeImportColumns(report)
      if (problem) {
        return NextResponse.json({ error: `Encabezado del CSV: ${problem}` }, { status: 400 })
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "Sin filas para importar" }, { status: 400 })
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Máximo ${MAX_ROWS} filas por importación` },
        { status: 400 }
      )
    }
    const mode: ImportMode =
      body.mode === "create_only" || body.mode === "update_only" ? body.mode : "upsert"

    const supabase = await createServiceClient()

    // SKUs repetidos dentro del mismo archivo: abortar (las filas se pisarían).
    const seenSku = new Set<string>()
    const duplicated = new Set<string>()
    for (const row of rows) {
      if (!row.sku) continue
      if (seenSku.has(row.sku)) duplicated.add(row.sku)
      seenSku.add(row.sku)
    }
    if (duplicated.size) {
      return NextResponse.json(
        { error: `SKU repetido en el archivo: ${[...duplicated].join(", ")}` },
        { status: 400 }
      )
    }

    // Resolver slugs de categoría a ids (una sola consulta)
    const categorySlugs = Array.from(
      new Set(rows.map((r) => r.category_slug).filter((s): s is string => !!s))
    )
    const { data: categories } = categorySlugs.length
      ? await supabase.from("categories").select("id, slug").in("slug", categorySlugs)
      : { data: [] as { id: number; slug: string }[] }
    const categoryIdBySlug = new Map((categories ?? []).map((c) => [c.slug, c.id]))

    // Productos existentes por slug y por SKU (ninguna de las dos columnas es
    // UNIQUE: ante duplicados gana el primer match).
    const slugs = Array.from(new Set(rows.map((r) => r.slug)))
    const skus = Array.from(new Set(rows.map((r) => r.sku).filter((s): s is string => !!s)))
    const { data: existingBySlugRows } = await supabase
      .from("products")
      .select("id, slug")
      .in("slug", slugs)
    const existingBySlug = new Map((existingBySlugRows ?? []).map((p) => [p.slug, p.id]))

    let existingBySku = new Map<string, number>()
    if (skus.length) {
      const { data: existingBySkuRows } = await supabase
        .from("products")
        .select("id, sku")
        .in("sku", skus)
      existingBySku = new Map(
        (existingBySkuRows ?? [])
          .filter((p): p is { id: number; sku: string } => !!p.sku)
          .map((p) => [p.sku, p.id])
      )
    }

    const plan: ImportPlanEntry[] = rows.map((row, index) => {
      const skuId = row.sku ? existingBySku.get(row.sku) : undefined
      const slugId = existingBySlug.get(row.slug)
      const matchedBy: ImportPlanEntry["matchedBy"] = skuId ? "sku" : slugId ? "slug" : null
      return { line: index + 2, slug: row.slug, name: row.name, sku: row.sku, matchedBy }
    })

    const toCreate = plan.filter((p) => p.matchedBy === null)
    const toUpdate = plan.filter((p) => p.matchedBy !== null)
    const skipped =
      mode === "create_only"
        ? toUpdate.length
        : mode === "update_only"
          ? toCreate.length
          : 0

    // Dry-run: clasifica sin escribir (vista previa crear/actualizar).
    if (body.dryRun === true) {
      return NextResponse.json({
        dryRun: true,
        mode,
        created: mode === "update_only" ? 0 : toCreate.length,
        updated: mode === "create_only" ? 0 : toUpdate.length,
        skipped,
        toCreate,
        toUpdate,
        errors: [],
      })
    }

    let created = 0
    let updated = 0
    const errors: { slug: string; line: number; message: string }[] = []

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]
      const entry = plan[index]
      if (!row || !entry) continue
      const existingId =
        entry.matchedBy === "sku"
          ? existingBySku.get(row.sku ?? "")
          : entry.matchedBy === "slug"
            ? existingBySlug.get(row.slug)
            : undefined

      if (existingId && mode === "create_only") continue
      if (!existingId && mode === "update_only") continue

      const payload = {
        name: row.name,
        price: row.price,
        sale_price: row.sale_price,
        brand: row.brand,
        category_id: row.category_slug ? (categoryIdBySlug.get(row.category_slug) ?? null) : null,
        unit: row.unit,
        stock_status: row.stock_status,
        is_visible: row.is_visible,
        updated_at: new Date().toISOString(),
        // Solo pisa la imagen si la fila trae una (evita borrarla al
        // re-importar sin la columna).
        ...(row.image_url ? { image_url: row.image_url } : {}),
        // Columna vacía = no tocar el valor guardado.
        ...(row.sku ? { sku: row.sku } : {}),
        ...(row.barcode ? { barcode: row.barcode } : {}),
        ...(row.stock_quantity !== null ? { stock_quantity: row.stock_quantity } : {}),
        ...(row.low_stock_threshold !== null
          ? { low_stock_threshold: row.low_stock_threshold }
          : {}),
        ...(row.sale_starts_at ? { sale_starts_at: row.sale_starts_at } : {}),
        ...(row.sale_ends_at ? { sale_ends_at: row.sale_ends_at } : {}),
        // Etiquetas: reemplazo total, pero solo si la columna viene en el CSV
        // (alimenta las colecciones de la tienda).
        ...(row.tags_provided ? { tags: row.tags } : {}),
      }

      if (existingId) {
        const { error } = await supabase.from("products").update(payload).eq("id", existingId)
        if (error) errors.push({ slug: row.slug, line: entry.line, message: error.message })
        else updated++
      } else {
        const { error } = await supabase.from("products").insert({ ...payload, slug: row.slug })
        if (error) errors.push({ slug: row.slug, line: entry.line, message: error.message })
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
        detail: { import: true, mode, created, updated, skipped, failed: errors.length },
      })
    }

    return NextResponse.json({ created, updated, skipped, mode, errors })
  } catch (error) {
    logger.error("[ADMIN-IMPORT] error:", error)
    return NextResponse.json({ error: "Error al importar productos" }, { status: 500 })
  }
}
