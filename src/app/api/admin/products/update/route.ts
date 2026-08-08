import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
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
    const { response: adminDenied } = await requireAdmin()
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
    const allowed = ["price", "sale_price", "stock_status", "is_visible", "show_in_whatsapp"] as const
    const updates: Record<string, unknown> = {}
    for (const field of allowed) {
      if (field in fields) updates[field] = fields[field]
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

    return NextResponse.json({ success: true, productId, ...updates })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
