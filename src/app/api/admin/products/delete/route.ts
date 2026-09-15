import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { NextResponse } from "next/server"

/**
 * DELETE /api/admin/products/delete
 * Elimina un producto (superadmin). PROTECCIÓN: order_items.product_id es
 * NOT NULL ON DELETE CASCADE, así que borrar un producto con pedidos
 * destruiría historial de ventas — se rechaza con 409 y se sugiere
 * despublicar en su lugar.
 */
export async function DELETE(request: Request) {
  try {
    const { response: adminDenied, user: adminUser } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const { productId } = await request.json()
    if (!productId || typeof productId !== "number") {
      return NextResponse.json({ error: "Se requiere productId" }, { status: 400 })
    }

    const supabase = await createServiceClient()

    // ¿Tiene pedidos? Entonces no se borra: el historial de ventas manda.
    const { count } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `No se puede eliminar: el producto tiene ${count} pedido${
            count === 1 ? "" : "s"
          } asociado${count === 1 ? "" : "s"}. Despublícalo para quitarlo de la tienda sin perder el historial.`,
          orderCount: count,
        },
        { status: 409 }
      )
    }

    const { data: product } = await supabase
      .from("products")
      .select("name, slug")
      .eq("id", productId)
      .single()

    const { error } = await supabase.from("products").delete().eq("id", productId)
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

    return NextResponse.json({ success: true, productId })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
