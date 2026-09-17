import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { readJsonBody } from "@/lib/api-body"
import { NextResponse } from "next/server"

/**
 * DELETE /api/admin/products/delete        { productId }
 * POST   /api/admin/products/delete        { productId, restore: true }
 *
 * Papelera (soft delete, 00099): eliminar marca deleted_at y fuerza
 * is_visible=false. La fila sigue existiendo, así que el historial de
 * pedidos (order_items) se preserva — ya no hay 409 por pedidos.
 * Restaurar limpia deleted_at y el producto queda despublicado.
 */
export async function DELETE(request: Request) {
  try {
    const { response: adminDenied, user: adminUser } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const parsed = await readJsonBody<{ productId?: number }>(request)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

    const { productId } = parsed.data
    if (!productId || typeof productId !== "number") {
      return NextResponse.json({ error: "Se requiere productId" }, { status: 400 })
    }

    const supabase = await createServiceClient()

    const { data: product } = await supabase
      .from("products")
      .select("name, slug")
      .eq("id", productId)
      .single()

    // Soft delete: la fila permanece para el historial de pedidos.
    const { error } = await supabase
      .from("products")
      .update({ deleted_at: new Date().toISOString(), is_visible: false })
      .eq("id", productId)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    revalidateCatalogCache()
    resetCatalogCache()

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "product_delete",
      entity: "products",
      entityId: productId,
      detail: { name: product?.name ?? null, slug: product?.slug ?? null },
    })

    // WA5 — la baja se propaga al catálogo de WhatsApp (best-effort).
    try {
      const { enqueueProductsForWaSync } = await import("@/lib/whatsapp-sync-queue")
      await enqueueProductsForWaSync(supabase, [productId], "product_delete")
    } catch {
      // silencioso por diseño
    }

    return NextResponse.json({ success: true, productId })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Restaura un producto de la papelera (queda despublicado). */
export async function POST(request: Request) {
  try {
    const { response: adminDenied, user: adminUser } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const parsed = await readJsonBody<{ productId?: number; restore?: boolean }>(request)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

    const { productId, restore } = parsed.data
    if (!productId || typeof productId !== "number" || restore !== true) {
      return NextResponse.json({ error: "Se requiere productId y restore: true" }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { error } = await supabase
      .from("products")
      .update({ deleted_at: null, is_visible: false })
      .eq("id", productId)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    revalidateCatalogCache()
    resetCatalogCache()

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "product_restore",
      entity: "products",
      entityId: productId,
    })

    return NextResponse.json({ success: true, productId })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
