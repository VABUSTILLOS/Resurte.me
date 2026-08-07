import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse } from "next/server"

/**
 * PATCH /api/admin/products/toggle-visibility
 * Toggles the is_visible field for a product (superadmin only).
 */
export async function PATCH(request: Request) {
  try {
    // Solo administradores pueden cambiar la visibilidad del catálogo.
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const { productId, isVisible } = await request.json()

    if (!productId || typeof isVisible !== "boolean") {
      return NextResponse.json(
        { error: "Se requiere productId e isVisible" },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()
    const { error } = await supabase
      .from("products")
      .update({ is_visible: isVisible })
      .eq("id", productId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, productId, isVisible })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
