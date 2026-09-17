import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { PRODUCT_AUDIT_FIELDS, validateProductPatch } from "@/lib/product-patch"
import { deriveStockStatus } from "@/lib/stock"
import { isMissingColumnError } from "@/lib/sale-window"
import { NextResponse } from "next/server"

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

    // Validación y normalización compartida con el endpoint de lote
    // (POST /api/admin/products/bulk): una sola fuente de reglas por campo.
    // Nota: el slug NO se toca al editar el nombre — regenerarlo rompería
    // URLs ya indexadas/compartidas.
    const parsed = validateProductPatch(fields, { productId: Number(productId) })
    if (!parsed.ok) {
      // `field` deja que el modal marque el control culpable; el mensaje sigue
      // sirviendo como aviso general.
      return NextResponse.json(
        { error: parsed.error, field: parsed.field ?? null },
        { status: 400 }
      )
    }
    const updates = parsed.updates

    const supabase = await createServiceClient()

    // Fila actual: hace falta para derivar el stock con el umbral vigente y
    // para registrar el diff antes/después en la bitácora (Fase 15).
    const AUDIT_COLS = [...PRODUCT_AUDIT_FIELDS, "deleted_at"]
    let thresholdReadable = true
    let currentRes = await supabase
      .from("products")
      .select(AUDIT_COLS.join(", "))
      .eq("id", productId)
      .maybeSingle()
    if (currentRes.error && isMissingColumnError(currentRes.error)) {
      // Migración 00108 pendiente: se relee sin el umbral para no perder el
      // diff antes/después de la bitácora (el umbral queda fuera del diff,
      // porque leerlo como `null` inventaría un cambio inexistente).
      thresholdReadable = false
      const base = AUDIT_COLS.filter((c) => c !== "low_stock_threshold")
      currentRes = (await supabase
        .from("products")
        .select(base.join(", "))
        .eq("id", productId)
        .maybeSingle()) as unknown as typeof currentRes
    }
    const current = currentRes.data as Record<string, unknown> | null

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
          { error: `El SKU ${updates.sku} ya está en uso por otro producto`, field: "sku" },
          { status: 409 }
        )
      }
    }

    // La tienda lee stock_status: con cantidad conocida siempre se deriva
    // contra el umbral del producto (misma regla que create); el status
    // manual solo aplica cuando la cantidad se deja vacía.
    if ("stock_quantity" in updates) {
      const q = updates.stock_quantity
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
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No hay campos válidos para actualizar" },
        { status: 400 }
      )
    }

    let { error } = await supabase.from("products").update(updates).eq("id", productId)

    if (error && isMissingColumnError(error) && "low_stock_threshold" in updates) {
      // Migración 00108 pendiente: PostgREST rechaza el PATCH entero por una
      // sola columna inexistente. Se reintenta sin el umbral para que el
      // resto de la edición sí se guarde (mismo patrón que las lecturas).
      const { low_stock_threshold: _omit, ...rest } = updates
      ;({ error } = await supabase.from("products").update(rest).eq("id", productId))
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Los cambios deben reflejarse en la tienda sin esperar el TTL de la caché.
    revalidateCatalogCache()
    resetCatalogCache()

    // Fase 15 — bitácora de auditoría con diff antes/después (best-effort).
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    for (const field of PRODUCT_AUDIT_FIELDS) {
      if (!(field in updates)) continue
      if (field === "low_stock_threshold" && !thresholdReadable) continue
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
