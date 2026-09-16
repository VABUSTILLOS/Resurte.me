import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { validateSku, validateBarcode } from "@/lib/sku"
import { deriveStockStatus, isStockStatus } from "@/lib/stock"
import { NextResponse } from "next/server"

/** Campos que se guardan en la bitácora para el diff antes/después. */
const AUDIT_FIELDS = [
  "price",
  "sale_price",
  "sale_starts_at",
  "sale_ends_at",
  "stock_status",
  "stock_quantity",
  "low_stock_threshold",
  "is_visible",
  "show_in_whatsapp",
  "name",
  "brand",
  "category_id",
  "sku",
  "barcode",
  "tags",
  "cost",
  "image_url",
  "seo_title",
  "seo_description",
] as const

/**
 * PATCH /api/admin/products/update
 * Actualiza campos de un producto (superadmin).
 * Acepta un subconjunto de campos: price, sale_price, sale_starts_at,
 * sale_ends_at, stock_status, stock_quantity, low_stock_threshold,
 * is_visible, show_in_whatsapp, image_url, name, brand, category_id,
 * description, sku, barcode, tags.
 */
export async function PATCH(request: Request) {
  try {
    // Solo administradores pueden modificar el catálogo.
    const { response: adminDenied, user: adminUser } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const body = await request.json()
    const { productId, ...fields } = body

    if (!productId) {
      return NextResponse.json(
        { error: "Se requiere productId" },
        { status: 400 }
      )
    }

    // Whitelist de campos actualizables. Nota: el slug NO se toca al editar
    // el nombre — regenerarlo rompería URLs ya indexadas/compartidas.
    const allowed = [
      "price",
      "sale_price",
      "stock_status",
      "is_visible",
      "show_in_whatsapp",
      "image_url",
      "name",
      "brand",
      "category_id",
      "description",
      "unit",
      "publish_at",
      "unpublish_at",
      "admin_note",
      "images",
      "stock_quantity",
      "cost",
      "seo_title",
      "seo_description",
      "sku",
      "barcode",
      "tags",
      "sale_starts_at",
      "sale_ends_at",
      "low_stock_threshold",
      "related_product_ids",
    ] as const
    type AllowedField = (typeof allowed)[number]
    const updates: Partial<Record<AllowedField, unknown>> = {}
    for (const field of allowed) {
      if (field in fields) updates[field] = fields[field]
    }
    // Validaciones de tipos de los campos nuevos.
    if ("name" in updates) {
      if (typeof updates.name !== "string" || !updates.name.trim()) {
        return NextResponse.json({ error: "name no puede estar vacío" }, { status: 400 })
      }
      updates.name = updates.name.trim()
    }
    if ("brand" in updates && updates.brand !== null && typeof updates.brand !== "string") {
      return NextResponse.json({ error: "brand debe ser texto o null" }, { status: 400 })
    }
    if (
      "description" in updates &&
      updates.description !== null &&
      typeof updates.description !== "string"
    ) {
      return NextResponse.json({ error: "description debe ser texto o null" }, { status: 400 })
    }
    if ("unit" in updates && updates.unit !== null && typeof updates.unit !== "string") {
      return NextResponse.json({ error: "unit debe ser texto o null" }, { status: 400 })
    }
    // publish_at / unpublish_at / ventana de oferta: ISO 8601 válido o null.
    for (const field of [
      "publish_at",
      "unpublish_at",
      "sale_starts_at",
      "sale_ends_at",
    ] as const) {
      if (field in updates) {
        const v = updates[field]
        if (v !== null && (typeof v !== "string" || Number.isNaN(new Date(v).getTime()))) {
          return NextResponse.json(
            { error: `${field} debe ser una fecha ISO válida o null` },
            { status: 400 }
          )
        }
      }
    }
    // Publicar/despublicar manual cancela la programación pendiente, salvo
    // que la misma petición fije una nueva fecha (p. ej. pausa temporal).
    if ("is_visible" in updates && !("publish_at" in updates) && !("unpublish_at" in updates)) {
      updates.publish_at = null
      updates.unpublish_at = null
    }
    if (
      "admin_note" in updates &&
      updates.admin_note !== null &&
      typeof updates.admin_note !== "string"
    ) {
      return NextResponse.json({ error: "admin_note debe ser texto o null" }, { status: 400 })
    }
    // images: galería de URLs https públicas o rutas locales.
    if ("images" in updates) {
      const imgs = updates.images
      if (
        !Array.isArray(imgs) ||
        imgs.some(
          (u) =>
            typeof u !== "string" || (!u.startsWith("https://") && !u.startsWith("/"))
        )
      ) {
        return NextResponse.json(
          { error: "images debe ser un arreglo de URLs https o rutas locales" },
          { status: 400 }
        )
      }
    }
    // Precios: número finito ≥ 0 o null (la oferta vencida no se borra: se
    // filtra al leer con resolveSalePrice, así el admin ve lo que programó).
    for (const field of ["price", "sale_price"] as const) {
      if (field in updates) {
        const v = updates[field]
        if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
          return NextResponse.json(
            { error: `${field} debe ser un número ≥ 0 o null` },
            { status: 400 }
          )
        }
      }
    }
    // SKU / código de barras (migración 00106).
    if ("sku" in updates) {
      const res = validateSku(updates.sku)
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
      updates.sku = res.value
    }
    if ("barcode" in updates) {
      const res = validateBarcode(updates.barcode)
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
      updates.barcode = res.value
    }
    // tags: arreglo de etiquetas normalizadas (colecciones de la tienda).
    if ("tags" in updates) {
      const raw = updates.tags
      if (raw !== null && !Array.isArray(raw)) {
        return NextResponse.json(
          { error: "tags debe ser un arreglo de etiquetas o null" },
          { status: 400 }
        )
      }
      if (raw === null) {
        updates.tags = []
      } else {
        const seen = new Set<string>()
        for (const t of raw as unknown[]) {
          if (typeof t !== "string") {
            return NextResponse.json(
              { error: "cada etiqueta debe ser texto" },
              { status: 400 }
            )
          }
          const clean = t.trim().toLowerCase()
          if (!clean) continue
          if (clean.length > 40) {
            return NextResponse.json(
              { error: "cada etiqueta admite hasta 40 caracteres" },
              { status: 400 }
            )
          }
          seen.add(clean)
        }
        if (seen.size > 20) {
          return NextResponse.json(
            { error: "máximo 20 etiquetas por producto" },
            { status: 400 }
          )
        }
        updates.tags = [...seen]
      }
    }
    // Umbral de stock bajo (migración 00108).
    if ("low_stock_threshold" in updates) {
      const v = updates.low_stock_threshold
      if (v !== null && (typeof v !== "number" || !Number.isInteger(v) || v < 0)) {
        return NextResponse.json(
          { error: "low_stock_threshold debe ser un entero ≥ 0 o null" },
          { status: 400 }
        )
      }
    }
    // Productos relacionados (migración 00109): ids enteros, sin el propio.
    if ("related_product_ids" in updates) {
      const raw = updates.related_product_ids
      if (raw !== null && !Array.isArray(raw)) {
        return NextResponse.json(
          { error: "related_product_ids debe ser un arreglo de ids o null" },
          { status: 400 }
        )
      }
      if (raw === null) {
        updates.related_product_ids = []
      } else {
        const ids: number[] = []
        for (const v of raw as unknown[]) {
          if (typeof v !== "number" || !Number.isInteger(v)) {
            return NextResponse.json(
              { error: "cada producto relacionado debe ser un id entero" },
              { status: 400 }
            )
          }
          if (v !== productId && !ids.includes(v)) ids.push(v)
        }
        if (ids.length > 12) {
          return NextResponse.json(
            { error: "máximo 12 productos relacionados" },
            { status: 400 }
          )
        }
        updates.related_product_ids = ids
      }
    }

    const supabase = await createServiceClient()

    // Fila actual: hace falta para derivar el stock con el umbral vigente y
    // para registrar el diff antes/después en la bitácora (Fase 15).
    const { data: currentRaw } = await supabase
      .from("products")
      .select([...AUDIT_FIELDS, "deleted_at"].join(", "))
      .eq("id", productId)
      .maybeSingle()
    const current = currentRaw as Record<string, unknown> | null

    // Unicidad de SKU: el índice parcial solo cubre productos no borrados.
    if (typeof updates.sku === "string") {
      const { data: clash } = await supabase
        .from("products")
        .select("id")
        .eq("sku", updates.sku)
        .is("deleted_at", null)
        .neq("id", productId)
        .limit(1)
        .maybeSingle()
      if (clash) {
        return NextResponse.json(
          { error: `El SKU ${updates.sku} ya está en uso por otro producto` },
          { status: 409 }
        )
      }
    }

    if ("stock_status" in updates && !isStockStatus(updates.stock_status)) {
      return NextResponse.json({ error: "stock_status inválido" }, { status: 400 })
    }

    if ("stock_quantity" in updates) {
      const q = updates.stock_quantity
      if (q !== null && (typeof q !== "number" || !Number.isInteger(q) || q < 0)) {
        return NextResponse.json(
          { error: "stock_quantity debe ser un entero ≥ 0 o null" },
          { status: 400 }
        )
      }
      // La tienda lee stock_status: con cantidad conocida siempre se deriva
      // contra el umbral del producto (misma regla que create); el status
      // manual solo aplica cuando la cantidad se deja vacía.
      if (q !== null) {
        const threshold =
          "low_stock_threshold" in updates
            ? (updates.low_stock_threshold as number | null)
            : (current?.low_stock_threshold as number | null | undefined)
        updates.stock_status = deriveStockStatus(q as number, threshold)
      } else if (!("stock_status" in updates)) {
        const threshold =
          "low_stock_threshold" in updates
            ? (updates.low_stock_threshold as number | null)
            : (current?.low_stock_threshold as number | null | undefined)
        updates.stock_status = deriveStockStatus(null, threshold)
      }
    }
    if ("cost" in updates) {
      const c = updates.cost
      if (c !== null && (typeof c !== "number" || !Number.isFinite(c) || c < 0)) {
        return NextResponse.json({ error: "cost debe ser un número ≥ 0 o null" }, { status: 400 })
      }
    }
    for (const field of ["seo_title", "seo_description"] as const) {
      if (field in updates && updates[field] !== null && typeof updates[field] !== "string") {
        return NextResponse.json({ error: `${field} debe ser texto o null` }, { status: 400 })
      }
    }
    if ("category_id" in updates) {
      const cid = updates.category_id
      if (cid !== null && (typeof cid !== "number" || !Number.isInteger(cid))) {
        return NextResponse.json(
          { error: "category_id debe ser un entero o null" },
          { status: 400 }
        )
      }
    }
    // image_url: URL https pública, ruta local del sitio, o null para quitarla.
    if ("image_url" in updates) {
      const url = updates.image_url
      if (
        url !== null &&
        (typeof url !== "string" || (!url.startsWith("https://") && !url.startsWith("/")))
      ) {
        return NextResponse.json(
          { error: "image_url debe ser una URL https, una ruta local o null" },
          { status: 400 }
        )
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No hay campos válidos para actualizar" },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from("products")
      .update(updates)
      .eq("id", productId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Los cambios deben reflejarse en la tienda sin esperar el TTL de la caché.
    revalidateCatalogCache()
    resetCatalogCache()

    // Fase 15 — bitácora de auditoría con diff antes/después (best-effort).
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    for (const field of AUDIT_FIELDS) {
      if (!(field in updates)) continue
      const prev = (current as Record<string, unknown> | null)?.[field] ?? null
      const next = (updates as Record<string, unknown>)[field] ?? null
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        before[field] = prev
        after[field] = next
      }
    }
    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "product_update",
      entity: "products",
      entityId: productId,
      detail: Object.keys(after).length > 0 ? { before, after } : (updates as Record<string, unknown>),
    })

    // WA5 — encolar sync incremental del catálogo WhatsApp (best-effort).
    const { enqueueProductsForWaSync } = await import("@/lib/whatsapp-sync-queue")
    await enqueueProductsForWaSync(supabase, [productId], "product_update")

    return NextResponse.json({ success: true, productId, ...updates })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
