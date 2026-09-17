import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { slugify } from "@/lib/foodos"
import { readJsonBody } from "@/lib/api-body"
import { NextResponse } from "next/server"

/**
 * POST /api/admin/products/duplicate
 * Duplica un producto (superadmin): copia todos sus campos y su
 * disponibilidad por ciudad. La copia nace despublicada con el nombre
 * "<nombre> (copia)" y un slug único.
 */
export async function POST(request: Request) {
  try {
    const { response: adminDenied, user: adminUser } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const parsed = await readJsonBody<Record<string, unknown>>(request)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

    const body = parsed.data
    const { productId } = body
    if (!productId || typeof productId !== "number") {
      return NextResponse.json({ error: "Se requiere productId" }, { status: 400 })
    }

    const supabase = await createServiceClient()

    const { data: source, error: fetchError } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single()
    if (fetchError || !source) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 })
    }

    // Slug único para la copia (nombre personalizado o "<nombre> (copia)").
    const customName =
      typeof body.name === "string" && body.name.trim() ? body.name.trim() : null
    const copyName = customName ?? `${source.name} (copia)`
    const overrideCategoryId =
      typeof body.category_id === "number" && Number.isInteger(body.category_id)
        ? body.category_id
        : null
    const root = slugify(copyName) || "producto-copia"
    const { data: slugRows } = await supabase
      .from("products")
      .select("slug")
      .like("slug", `${root}%`)
    const taken = new Set((slugRows ?? []).map((r) => r.slug as string))
    let slug = root
    let i = 2
    while (taken.has(slug)) slug = `${root}-${i++}`

    const {
      id: _id,
      created_at: _created,
      updated_at: _updated,
      whatsapp_product_id: _waId,
      ...copyable
    } = source

    const { data: copy, error: insertError } = await supabase
      .from("products")
      .insert({
        ...copyable,
        name: copyName,
        slug,
        category_id: overrideCategoryId ?? source.category_id,
        // La copia nace despublicada y fuera del catálogo de WhatsApp.
        is_visible: false,
        show_in_whatsapp: false,
      })
      .select(
        "id,name,slug,brand,category_id,description,unit,price,sale_price,cost,stock_quantity,sort_order,stock_status,is_visible,show_in_whatsapp,image_url,images,publish_at,unpublish_at,admin_note,seo_title,seo_description,created_at"
      )
      .single()
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Copiar disponibilidad por ciudad (si el origen es global no hay filas).
    const { data: availability } = await supabase
      .from("product_city_availability")
      .select("city_id,is_available")
      .eq("product_id", productId)
    if (availability && availability.length > 0) {
      await supabase.from("product_city_availability").insert(
        availability.map((row) => ({
          product_id: copy.id,
          city_id: row.city_id,
          is_available: row.is_available,
        }))
      )
    }

    revalidateCatalogCache()
    resetCatalogCache()

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "product_duplicate",
      entity: "products",
      entityId: copy.id,
      detail: { sourceId: productId, name: copy.name },
    })

    return NextResponse.json({ success: true, product: copy }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
