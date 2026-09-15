import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { slugify } from "@/lib/foodos"
import { NextResponse } from "next/server"

/** Genera un slug único agregando sufijos -2, -3… si ya existe. */
async function uniqueSlug(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  base: string
): Promise<string> {
  const root = slugify(base) || "producto"
  const { data } = await supabase.from("products").select("slug").like("slug", `${root}%`)
  const taken = new Set((data ?? []).map((r) => r.slug as string))
  if (!taken.has(root)) return root
  let i = 2
  while (taken.has(`${root}-${i}`)) i++
  return `${root}-${i}`
}

/**
 * POST /api/admin/products/create
 * Crea un producto nuevo (superadmin). Nace despublicado por defecto salvo
 * que se indique is_visible: true.
 */
export async function POST(request: Request) {
  try {
    const { response: adminDenied, user: adminUser } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const body = await request.json()
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 })
    }

    const price = body.price === null || body.price === undefined ? null : Number(body.price)
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      return NextResponse.json({ error: "Precio inválido" }, { status: 400 })
    }
    const salePrice =
      body.sale_price === null || body.sale_price === undefined ? null : Number(body.sale_price)
    if (salePrice !== null && (!Number.isFinite(salePrice) || salePrice < 0)) {
      return NextResponse.json({ error: "Precio de oferta inválido" }, { status: 400 })
    }

    const stockStatus = ["in_stock", "low_stock", "out_of_stock"].includes(body.stock_status)
      ? body.stock_status
      : "in_stock"
    const categoryId =
      typeof body.category_id === "number" && Number.isInteger(body.category_id)
        ? body.category_id
        : null

    // Programación opcional: fechas ISO válidas o null.
    const schedule: { publish_at: string | null; unpublish_at: string | null } = {
      publish_at: null,
      unpublish_at: null,
    }
    for (const field of ["publish_at", "unpublish_at"] as const) {
      const v = body[field]
      if (v !== null && v !== undefined) {
        if (typeof v !== "string" || Number.isNaN(new Date(v).getTime())) {
          return NextResponse.json(
            { error: `${field} debe ser una fecha ISO válida o null` },
            { status: 400 }
          )
        }
        schedule[field] = v
      }
    }

    // Imagen principal y galería (opcionales).
    const imageUrl =
      typeof body.image_url === "string" &&
      (body.image_url.startsWith("https://") || body.image_url.startsWith("/"))
        ? body.image_url
        : null
    const images = Array.isArray(body.images)
      ? body.images.filter(
          (u: unknown) =>
            typeof u === "string" &&
            ((u as string).startsWith("https://") || (u as string).startsWith("/"))
        )
      : []

    const supabase = await createServiceClient()
    const slug = await uniqueSlug(supabase, name)

    const { data, error } = await supabase
      .from("products")
      .insert({
        name,
        slug,
        description: typeof body.description === "string" ? body.description : null,
        unit: typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : null,
        brand: typeof body.brand === "string" ? body.brand : null,
        category_id: categoryId,
        price,
        sale_price: salePrice,
        stock_status: stockStatus,
        is_visible: body.is_visible === true,
        show_in_whatsapp: body.show_in_whatsapp === true,
        publish_at: schedule.publish_at,
        unpublish_at: schedule.unpublish_at,
        admin_note: typeof body.admin_note === "string" ? body.admin_note : null,
        image_url: imageUrl,
        images,
      })
      .select(
        "id,name,slug,brand,category_id,description,unit,price,sale_price,stock_status,is_visible,show_in_whatsapp,image_url,images,publish_at,unpublish_at,admin_note"
      )
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    revalidateCatalogCache()
    resetCatalogCache()

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "product_create",
      entity: "products",
      entityId: data.id,
      detail: { name, slug },
    })

    return NextResponse.json({ success: true, product: data }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
