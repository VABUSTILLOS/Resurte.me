import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { NextResponse, type NextRequest } from "next/server"

/**
 * GET /api/admin/products/store-prices?productId=123
 * Overrides de precio/oferta por tienda (`product_stores`, 00001) más la
 * lista de tiendas activas para armar el modal del panel.
 */
export async function GET(request: NextRequest) {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const productId = Number(request.nextUrl.searchParams.get("productId"))
    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ error: "Se requiere productId" }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const [storesRes, pricesRes] = await Promise.all([
      supabase.from("stores").select("id,name").eq("is_active", true).order("name"),
      supabase
        .from("product_stores")
        .select("store_id,price,sale_price")
        .eq("product_id", productId),
    ])

    return NextResponse.json({
      stores: storesRes.data ?? [],
      prices: pricesRes.data ?? [],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PUT /api/admin/products/store-prices
 * Reemplaza los overrides de un producto. Body:
 * { productId, prices: [{ store_id, price, sale_price? | null }] }
 * Una entrada sin price elimina el override de esa tienda.
 */
export async function PUT(request: Request) {
  try {
    const { response: adminDenied, user: adminUser } = await requireAdmin()
    if (adminDenied) return adminDenied

    const body = await request.json()
    const { productId, prices } = body
    if (!productId || !Array.isArray(prices)) {
      return NextResponse.json(
        { error: "Se requieren productId y prices" },
        { status: 400 }
      )
    }

    // Validación: price requerido > 0; sale_price opcional ≥ 0.
    for (const row of prices) {
      if (row.price === null || row.price === undefined) continue
      const price = Number(row.price)
      if (!Number.isFinite(price) || price <= 0) {
        return NextResponse.json({ error: "price debe ser mayor a 0" }, { status: 400 })
      }
      if (row.sale_price !== null && row.sale_price !== undefined) {
        const sp = Number(row.sale_price)
        if (!Number.isFinite(sp) || sp < 0) {
          return NextResponse.json({ error: "sale_price inválido" }, { status: 400 })
        }
      }
    }

    const supabase = await createServiceClient()

    // Estrategia simple y predecible: borrar y reinsertar los overrides con
    // precio (los que vienen sin precio se eliminan).
    await supabase.from("product_stores").delete().eq("product_id", productId)
    const rows = prices
      .filter((row) => row.price !== null && row.price !== undefined)
      .map((row) => ({
        product_id: productId,
        store_id: row.store_id,
        price: Number(row.price),
        sale_price:
          row.sale_price !== null && row.sale_price !== undefined
            ? Number(row.sale_price)
            : null,
      }))
    if (rows.length > 0) {
      const { error } = await supabase.from("product_stores").insert(rows)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    revalidateCatalogCache()
    resetCatalogCache()

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "product_update",
      entity: "products",
      entityId: productId,
      detail: { storePrices: rows.length },
    })

    return NextResponse.json({ success: true, productId, overrides: rows.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
