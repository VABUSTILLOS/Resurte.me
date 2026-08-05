import { createServiceClient } from "@/lib/supabase/service"
import { NextResponse } from "next/server"

/**
 * PATCH /api/admin/products/toggle-visibility
 * Toggles the is_visible field for a product (superadmin only).
 */
export async function PATCH(request: Request) {
  try {
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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
