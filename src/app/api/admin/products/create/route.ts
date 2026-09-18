import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { readJsonBody } from "@/lib/api-body"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { slugify } from "@/lib/foodos"
import { validateSku, validateBarcode } from "@/lib/sku"
import { deriveStockStatus, isStockStatus } from "@/lib/stock"
import { isMissingColumnError } from "@/lib/sale-window"
import { NextResponse } from "next/server"

/** Productos relacionados: ids enteros, sin duplicados, sin el propio. */
function normalizeRelatedIds(raw: unknown, selfId?: number): number[] | null {
  if (raw === null || raw === undefined) return []
  if (!Array.isArray(raw)) return null
  const ids: number[] = []
  for (const v of raw) {
    if (typeof v !== "number" || !Number.isInteger(v)) return null
    if (v !== selfId && !ids.includes(v)) ids.push(v)
  }
  return ids.slice(0, 12)
}

/** Etiquetas normalizadas (minúsculas, sin duplicados, máximo 20). */
function normalizeTags(raw: unknown): string[] | null {
  if (raw === null || raw === undefined) return []
  if (!Array.isArray(raw)) return null
  const seen = new Set<string>()
  for (const t of raw) {
    if (typeof t !== "string") return null
    const clean = t.trim().toLowerCase()
    if (!clean) continue
    if (clean.length > 40) return null
    seen.add(clean)
  }
  return seen.size > 20 ? null : [...seen]
}

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
    const { response: adminDenied, user: adminUser } = await requireAdmin({ permission: "productos" })
    if (adminDenied) {
      return adminDenied
    }

    const parsed = await readJsonBody<Record<string, unknown>>(request)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

    const body = parsed.data
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) {
      return NextResponse.json({ error: "El nombre es obligatorio", field: "name" }, { status: 400 })
    }

    const price = body.price === null || body.price === undefined ? null : Number(body.price)
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      return NextResponse.json({ error: "Precio inválido", field: "price" }, { status: 400 })
    }
    const salePrice =
      body.sale_price === null || body.sale_price === undefined ? null : Number(body.sale_price)
    if (salePrice !== null && (!Number.isFinite(salePrice) || salePrice < 0)) {
      return NextResponse.json({ error: "Precio de oferta inválido", field: "sale_price" }, { status: 400 })
    }

    const sku = validateSku(body.sku)
    if (!sku.ok) {
      return NextResponse.json({ error: sku.error, field: "sku" }, { status: 400 })
    }
    const barcode = validateBarcode(body.barcode)
    if (!barcode.ok) {
      return NextResponse.json({ error: barcode.error, field: "barcode" }, { status: 400 })
    }
    const tags = normalizeTags(body.tags)
    if (tags === null) {
      return NextResponse.json(
        { error: "tags debe ser un arreglo de hasta 20 etiquetas de texto" },
        { status: 400 }
      )
    }
    const relatedIds = normalizeRelatedIds(body.related_product_ids)
    if (relatedIds === null) {
      return NextResponse.json(
        { error: "related_product_ids debe ser un arreglo de ids enteros" },
        { status: 400 }
      )
    }
    const lowStockThreshold =
      typeof body.low_stock_threshold === "number" &&
      Number.isInteger(body.low_stock_threshold) &&
      body.low_stock_threshold >= 0
        ? body.low_stock_threshold
        : null

    const stockStatus = isStockStatus(body.stock_status) ? body.stock_status : "in_stock"
    const categoryId =
      typeof body.category_id === "number" && Number.isInteger(body.category_id)
        ? body.category_id
        : null

    const stockQuantity =
      typeof body.stock_quantity === "number" &&
      Number.isInteger(body.stock_quantity) &&
      body.stock_quantity >= 0
        ? body.stock_quantity
        : null
    const derivedStock =
      stockQuantity === null
        ? stockStatus
        : deriveStockStatus(stockQuantity, lowStockThreshold)
    const cost =
      typeof body.cost === "number" && Number.isFinite(body.cost) && body.cost >= 0
        ? body.cost
        : null

    // Programación y ventana de oferta: fechas ISO válidas o null.
    const schedule: {
      publish_at: string | null
      unpublish_at: string | null
      sale_starts_at: string | null
      sale_ends_at: string | null
    } = {
      publish_at: null,
      unpublish_at: null,
      sale_starts_at: null,
      sale_ends_at: null,
    }
    for (const field of [
      "publish_at",
      "unpublish_at",
      "sale_starts_at",
      "sale_ends_at",
    ] as const) {
      const v = body[field]
      if (v !== null && v !== undefined) {
        if (typeof v !== "string" || Number.isNaN(new Date(v).getTime())) {
          return NextResponse.json(
            { error: `${field} debe ser una fecha ISO válida o null`, field },
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

    // SKU único entre productos vivos (índice parcial idx_products_sku_unique).
    if (sku.value) {
      const { data: clash } = await supabase
        .from("products")
        .select("id")
        .eq("sku", sku.value)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle()
      if (clash) {
        return NextResponse.json(
          { error: `El SKU ${sku.value} ya está en uso por otro producto`, field: "sku" },
          { status: 409 }
        )
      }
    }

    const payload = {
      name,
      slug,
      description: typeof body.description === "string" ? body.description : null,
      unit: typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : null,
      brand: typeof body.brand === "string" ? body.brand : null,
      category_id: categoryId,
      price,
      sale_price: salePrice,
      sku: sku.value,
      barcode: barcode.value,
      tags,
      sale_starts_at: schedule.sale_starts_at,
      sale_ends_at: schedule.sale_ends_at,
      low_stock_threshold: lowStockThreshold,
      related_product_ids: relatedIds,
      stock_status: derivedStock,
      stock_quantity: stockQuantity,
      cost,
      is_visible: body.is_visible === true,
      show_in_whatsapp: body.show_in_whatsapp === true,
      publish_at: schedule.publish_at,
      unpublish_at: schedule.unpublish_at,
      admin_note: typeof body.admin_note === "string" ? body.admin_note : null,
      seo_title: typeof body.seo_title === "string" ? body.seo_title : null,
      seo_description: typeof body.seo_description === "string" ? body.seo_description : null,
      image_url: imageUrl,
      images,
    }

    const SELECT_COLS =
      "id,name,slug,brand,category_id,description,unit,price,sale_price,cost,stock_quantity,sort_order,stock_status,is_visible,show_in_whatsapp,image_url,images,publish_at,unpublish_at,admin_note,seo_title,seo_description,sku,barcode,tags,sale_starts_at,sale_ends_at,low_stock_threshold,related_product_ids,created_at"
    const SELECT_COLS_BASE =
      "id,name,slug,brand,category_id,description,unit,price,sale_price,cost,stock_quantity,sort_order,stock_status,is_visible,show_in_whatsapp,image_url,images,publish_at,unpublish_at,admin_note,seo_title,seo_description,sku,barcode,tags,sale_starts_at,sale_ends_at,related_product_ids,created_at"

    let inserted = await supabase.from("products").insert(payload).select(SELECT_COLS).single()

    if (inserted.error && isMissingColumnError(inserted.error)) {
      // Migración 00108 pendiente: el umbral por producto aún no existe y
      // PostgREST rechaza el INSERT completo. Se reintenta sin la columna
      // (mismo patrón que list/payments/order-bumps); `stock_status` ya viene
      // derivado contra el umbral efectivo, así que la tienda no cambia.
      const { low_stock_threshold: _omit, ...base } = payload
      inserted = (await supabase
        .from("products")
        .insert(base)
        .select(SELECT_COLS_BASE)
        .single()) as unknown as typeof inserted
    }

    const { data, error } = inserted

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
