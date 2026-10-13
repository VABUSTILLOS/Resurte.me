import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { readJsonBody } from "@/lib/api-body"
import { NextResponse } from "next/server"

/**
 * DELETE /api/admin/categories/delete   { categoryId }
 *
 * Borra una categoría. Es irreversible —la fila desaparece— y además tiene una
 * consecuencia que no se ve en el nombre: `products.category_id` es
 * `ON DELETE SET NULL` (00001), así que **sus productos quedan sin categoría**.
 * No se pierden ni se despublican, pero salen del agrupamiento por categoría
 * (dejan de aparecer en las secciones del catálogo de WhatsApp) hasta que
 * alguien los vuelva a clasificar.
 *
 * Por eso el conteo va en la respuesta y el panel lo pone en la confirmación:
 * un borrado silencioso de 200 productos es exactamente lo que no debe pasar.
 *
 * No se bloquea cuando tiene productos (a diferencia de borrar un producto con
 * pedidos): reasignar una categoría es recuperable, y la categoría vacía es el
 * caso normal. Lo que sí es obligatorio es decir cuántos quedan huérfanos
 * **antes** de borrar.
 */
export async function DELETE(request: Request) {
  try {
    const { response: adminDenied, user: adminUser } = await requireAdmin({ permission: "productos" })
    if (adminDenied) {
      return adminDenied
    }

    const parsed = await readJsonBody<{ categoryId?: number }>(request)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

    const { categoryId } = parsed.data
    if (!categoryId || typeof categoryId !== "number" || !Number.isInteger(categoryId)) {
      return NextResponse.json({ error: "Se requiere categoryId" }, { status: 400 })
    }

    const supabase = await createServiceClient()

    const { data: category } = await supabase
      .from("categories")
      .select("id, name")
      .eq("id", categoryId)
      .maybeSingle()
    if (!category) {
      return NextResponse.json({ error: "La categoría no existe" }, { status: 404 })
    }

    // Cuántos productos quedan sin categoría. Se cuenta ANTES de borrar.
    const { count } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId)
    const orphaned = count ?? 0

    const { error } = await supabase.from("categories").delete().eq("id", categoryId)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    revalidateCatalogCache()
    resetCatalogCache()

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "category_delete",
      entity: "categories",
      entityId: categoryId,
      detail: { name: category.name, orphanedProducts: orphaned },
    })

    return NextResponse.json({ success: true, name: category.name, orphaned })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
