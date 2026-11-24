import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { readJsonBody } from "@/lib/api-body"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { PRODUCT_AUDIT_FIELDS, PRODUCT_OPTIONAL_SCHEMA_COLUMNS, validateProductPatch } from "@/lib/product-patch"
import { conflictPayload, isStaleWrite, type ConflictCurrent } from "@/lib/product-conflict"
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
 *
 * B19 — concurrencia optimista: con `expectedUpdatedAt` (la versión que el
 * panel leyó) la escritura solo se aplica si nadie la ha modificado desde
 * entonces; en caso contrario responde 409 sin tocar la fila. Sin el
 * parámetro el endpoint mantiene el comportamiento de siempre.
 */
export async function PATCH(request: Request) {
  try {
    // Solo administradores pueden modificar el catálogo.
    const { response: adminDenied, user: adminUser } = await requireAdmin({ permission: "productos" })
    if (adminDenied) {
      return adminDenied
    }

    const bodyResult = await readJsonBody<Record<string, unknown> & { productId?: number; expectedUpdatedAt?: string }>(request)
    if (!bodyResult.ok)
      return NextResponse.json({ error: bodyResult.error }, { status: bodyResult.status })

    // `expectedUpdatedAt` se extrae antes del spread para que no acabe en
    // `fields` (validateProductPatch solo conoce campos de producto).
    const { productId, expectedUpdatedAt, ...fields } = bodyResult.data

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
    const AUDIT_COLS = [...PRODUCT_AUDIT_FIELDS, "deleted_at", "updated_at"]
    const unreadableOptional = new Set<string>()
    let currentRes = await supabase
      .from("products")
      .select(AUDIT_COLS.join(", "))
      .eq("id", productId)
      .maybeSingle()
    if (currentRes.error && isMissingColumnError(currentRes.error)) {
      // Alguna migración de columnas opcionales sigue pendiente
      // (00108 → low_stock_threshold; 00229 → min/max por pedido): se
      // relee sin TODAS las opcionales para no perder el diff
      // antes/después de la bitácora (quedan fuera del diff, porque
      // leerlas como `null` inventaría un cambio inexistente).
      for (const col of PRODUCT_OPTIONAL_SCHEMA_COLUMNS) unreadableOptional.add(col)
      const base = AUDIT_COLS.filter((c) => !unreadableOptional.has(c))
      currentRes = (await supabase
        .from("products")
        .select(base.join(", "))
        .eq("id", productId)
        .maybeSingle()) as unknown as typeof currentRes
    }
    const current = currentRes.data as Record<string, unknown> | null

    // B19 — precondición de versión. Se comprueba antes de escribir nada: si
    // otro usuario guardó después de que el panel leyera la fila, se devuelve
    // la versión vigente en vez de pisar su cambio en silencio. Sin
    // `expectedUpdatedAt` (clientes antiguos, importaciones) no bloquea.
    if (isStaleWrite(current?.updated_at as string | null | undefined, expectedUpdatedAt)) {
      return NextResponse.json(conflictPayload(current as ConflictCurrent | null), {
        status: 409,
      })
    }

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

    // B19 — cada escritura mueve la versión, que es justo lo que la
    // precondición compara. Se escribe aquí además del trigger de la
    // migración 00119 para que funcione aunque no esté aplicada.
    const nowIso = new Date().toISOString()
    let writePayload: Record<string, unknown> = { ...updates, updated_at: nowIso }

    // `.select("id")` para distinguir "actualizado" de "ya no existe": sin él
    // PostgREST responde sin error aunque no haya tocado ninguna fila.
    const doWrite = (payload: Record<string, unknown>) =>
      supabase.from("products").update(payload).eq("id", productId).select("id")
    let { data: written, error } = await doWrite(writePayload)

    // Migración de columnas opcionales pendiente (00108/00229):
    // PostgREST rechaza el PATCH entero por una sola columna
    // inexistente. Se reintenta sin las opcionales presentes en el
    // payload para que el resto de la edición sí se guarde (mismo
    // patrón que las lecturas).
    for (
      let attempt = 0;
      attempt < 3 && error && isMissingColumnError(error);
      attempt++
    ) {
      const present = PRODUCT_OPTIONAL_SCHEMA_COLUMNS.filter((c) => c in writePayload)
      if (present.length === 0) break
      const next: Record<string, unknown> = { ...writePayload }
      for (const col of present) delete next[col]
      writePayload = next
      ;({ data: written, error } = await doWrite(writePayload))
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!written || written.length === 0) {
      return NextResponse.json(
        { error: "El producto ya no existe", code: "not_found", field: null },
        { status: 404 }
      )
    }

    // Los cambios deben reflejarse en la tienda sin esperar el TTL de la caché.
    revalidateCatalogCache()
    resetCatalogCache()

    // Fase 15 — bitácora de auditoría con diff antes/después (best-effort).
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    for (const field of PRODUCT_AUDIT_FIELDS) {
      if (!(field in updates)) continue
      if (unreadableOptional.has(field)) continue
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

    // Avisos de inventario (00230, best-effort): si la edición tocó
    // la existencia, el producto pudo cruzar su umbral o volver a
    // tener stock para los suscriptores de «avísame cuando haya».
    if ("stock_quantity" in updates) {
      const { processStockNotifications } = await import("@/lib/stock-notifications")
      await processStockNotifications(supabase, [Number(productId)])
    }

    return NextResponse.json({ success: true, productId, updated_at: nowIso, ...updates })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
