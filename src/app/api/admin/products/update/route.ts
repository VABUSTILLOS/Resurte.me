import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { NextResponse } from "next/server"

/**
 * PATCH /api/admin/products/update
 * Actualiza precio/stock/visibilidad/whatsapp de un producto (superadmin).
 * Acepta un subconjunto de campos: price, sale_price, stock_status,
 * is_visible, show_in_whatsapp.
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

    // Whitelist de campos actualizables
    const allowed = ["price", "sale_price", "stock_status", "is_visible", "show_in_whatsapp", "image_url"] as const
    type AllowedField = (typeof allowed)[number]
    const updates: Partial<Record<AllowedField, unknown>> = {}
    for (const field of allowed) {
      if (field in fields) updates[field] = fields[field]
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

    return NextResponse.json({ success: true, productId, ...updates })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
