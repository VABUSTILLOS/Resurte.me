import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { NextResponse } from "next/server"

/**
 * POST /api/admin/products/reorder
 * Mueve un producto una posición ↑/↓ en el orden manual del catálogo
 * (`sort_order`, 00100). Intercambia el valor con el vecino; si los valores
 * están empatados (p.ej. todos en 0 tras la migración) primero normaliza
 * toda la lista a pasos de 10. Body: { productId, direction: "up"|"down" }.
 */
export async function POST(request: Request) {
  try {
    const { response: adminDenied, user: adminUser } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const { productId, direction } = await request.json()
    if (!productId || (direction !== "up" && direction !== "down")) {
      return NextResponse.json(
        { error: "Se requiere productId y direction (up|down)" },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()
    const { data: all, error } = await supabase
      .from("products")
      .select("id,sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = all ?? []
    const idx = rows.findIndex((r) => r.id === productId)
    const neighborIdx = direction === "up" ? idx - 1 : idx + 1
    if (idx === -1 || neighborIdx < 0 || neighborIdx >= rows.length) {
      // Ya está en el extremo: no-op exitoso.
      return NextResponse.json({ success: true, productId, moved: false })
    }

    const current = rows[idx]
    const neighbor = rows[neighborIdx]
    if (!current || !neighbor) {
      return NextResponse.json({ success: true, productId, moved: false })
    }

    if (current.sort_order === neighbor.sort_order) {
      // Empate (típico tras la migración, todo en 0): normaliza a pasos de 10
      // y luego intercambia.
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (row) row.sort_order = i * 10
      }
      for (const row of rows) {
        await supabase.from("products").update({ sort_order: row.sort_order }).eq("id", row.id)
      }
      const currentRow = rows[idx]
      const neighborRow = rows[neighborIdx]
      if (!currentRow || !neighborRow) {
        return NextResponse.json({ success: true, productId, moved: false })
      }
      const a = currentRow.sort_order
      currentRow.sort_order = neighborRow.sort_order
      neighborRow.sort_order = a
      await supabase.from("products").update({ sort_order: currentRow.sort_order }).eq("id", productId)
      await supabase
        .from("products")
        .update({ sort_order: neighborRow.sort_order })
        .eq("id", neighbor.id)
    } else {
      await supabase
        .from("products")
        .update({ sort_order: neighbor.sort_order })
        .eq("id", productId)
      await supabase
        .from("products")
        .update({ sort_order: current.sort_order })
        .eq("id", neighbor.id)
    }

    revalidateCatalogCache()
    resetCatalogCache()

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "product_update",
      entity: "products",
      entityId: productId,
      detail: { reorder: direction },
    })

    return NextResponse.json({ success: true, productId, moved: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
