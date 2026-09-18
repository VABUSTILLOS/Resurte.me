import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { slugify } from "@/lib/foodos"
import { NextResponse } from "next/server"

/**
 * POST /api/admin/categories/create
 * Crea una categoría (superadmin) con slug único derivado del nombre.
 */
export async function POST(request: Request) {
  try {
    const { response: adminDenied, user: adminUser } = await requireAdmin({ permission: "productos" })
    if (adminDenied) {
      return adminDenied
    }

    const body = await request.json()
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 })
    }

    const supabase = await createServiceClient()

    const root = slugify(name) || "categoria"
    const { data: slugRows } = await supabase
      .from("categories")
      .select("slug")
      .like("slug", `${root}%`)
    const taken = new Set((slugRows ?? []).map((r) => r.slug as string))
    let slug = root
    let i = 2
    while (taken.has(slug)) slug = `${root}-${i++}`

    const { data, error } = await supabase
      .from("categories")
      .insert({ name, slug })
      .select("id,name,slug,icon")
      .single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    revalidateCatalogCache()
    resetCatalogCache()

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "category_create",
      entity: "categories",
      entityId: data.id,
      detail: { name, slug },
    })

    return NextResponse.json({ success: true, category: data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
