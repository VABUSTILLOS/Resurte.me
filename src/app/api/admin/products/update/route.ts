import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { NextResponse } from "next/server"

/**
 * PATCH /api/admin/products/update
 * Actualiza campos de un producto (superadmin).
 * Acepta un subconjunto de campos: price, sale_price, stock_status,
 * is_visible, show_in_whatsapp, image_url, name, brand, category_id,
 * description.
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
    // publish_at / unpublish_at: ISO 8601 válido o null (limpiar programación).
    for (const field of ["publish_at", "unpublish_at"] as const) {
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
    // Publicar/despublicar manual cancela la programación pendiente.
    if ("is_visible" in updates) {
      updates.publish_at = null
      updates.unpublish_at = null
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
    // image_url: solo URLs https públicas (o rutas locales del sitio).
    if ("image_url" in updates) {
      const url = updates.image_url
      if (typeof url !== "string" || (!url.startsWith("https://") && !url.startsWith("/"))) {
        return NextResponse.json({ error: "image_url debe ser una URL https o ruta local" }, { status: 400 })
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No hay campos válidos para actualizar" },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()
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

    // Fase 15 — bitácora de auditoría (best-effort)
    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "product_update",
      entity: "products",
      entityId: productId,
      detail: updates as Record<string, unknown>,
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
