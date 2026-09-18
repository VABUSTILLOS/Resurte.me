import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse, type NextRequest } from "next/server"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import {
  slugifySupplierName,
  uniqueSupplierSlug,
  validateSupplierInput,
} from "@/lib/supplier-admin"

export const runtime = "nodejs"

/**
 * GET  /api/admin/suppliers — directorio con sus productos vinculados.
 * POST /api/admin/suppliers — da de alta un proveedor.
 *
 * Las tablas suppliers/product_suppliers tienen RLS sin políticas
 * públicas (los costos son confidenciales), así que esta ruta lee y
 * escribe con el service client después de validar requireAdmin({ permission: "productos" }).
 *
 * `GET ?productSearch=<q>` agrega `productMatches`: es el buscador del
 * selector de productos al vincular. Vive aquí, y no en una ruta propia,
 * porque un segmento estático hermano de `[id]` (`/suppliers/products`)
 * se resuelve antes que el dinámico y vuelve ambigua la lectura.
 *
 * Respuesta: { suppliers: SupplierWithProducts[], productMatches?: ProductMatch[] }
 */
export async function GET(request: NextRequest) {
  try {
    const { response: adminDenied } = await requireAdmin({ permission: "productos" })
    if (adminDenied) {
      return adminDenied
    }

    const supabase = await createServiceClient()
    const search = (request.nextUrl.searchParams.get("productSearch") ?? "").trim()

    const { data: suppliers, error: suppliersError } = await supabase
      .from("suppliers")
      .select("*")
      .order("name")

    if (suppliersError) {
      return NextResponse.json({ error: suppliersError.message }, { status: 500 })
    }

    const { data: links, error: linksError } = await supabase
      .from("product_suppliers")
      .select("*, products(id, name, slug, price, is_visible, stock_status)")
      .order("cost", { ascending: false })

    if (linksError) {
      return NextResponse.json({ error: linksError.message }, { status: 500 })
    }

    const bySupplier = new Map<number, typeof links>()
    for (const link of links ?? []) {
      const list = bySupplier.get(link.supplier_id) ?? []
      list.push(link)
      bySupplier.set(link.supplier_id, list)
    }

    const payload: Record<string, unknown> = {
      suppliers: (suppliers ?? []).map((s) => ({
        ...s,
        products: bySupplier.get(s.id) ?? [],
      })),
    }

    if (search) {
      payload.productMatches = await searchProducts(supabase, search)
    }

    return NextResponse.json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

interface ProductMatch {
  id: number
  name: string
  sku: string | null
  unit: string | null
  price: number | null
}

/** Hasta 20 coincidencias por nombre, ignorando la papelera. */
async function searchProducts(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  term: string
): Promise<ProductMatch[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku, unit, price")
    .is("deleted_at", null)
    .ilike("name", `%${term}%`)
    .order("name")
    .limit(20)

  if (error) {
    // 42703 = `deleted_at` aún no migrada (00096): se busca sin el filtro
    // en vez de dejar el selector inservible.
    if (error.code === "42703") {
      const legacy = await supabase
        .from("products")
        .select("id, name, sku, unit, price")
        .ilike("name", `%${term}%`)
        .order("name")
        .limit(20)
      if (legacy.error) throw legacy.error
      return (legacy.data ?? []) as ProductMatch[]
    }
    throw error
  }
  return (data ?? []) as ProductMatch[]
}

export async function POST(request: NextRequest) {
  const { user: adminUser, response: adminDenied } = await requireAdmin({ permission: "productos" })
  if (adminDenied) return adminDenied

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
    }

    const parsed = validateSupplierInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const supabase = await createServiceClient()

    const { data: existing, error: existingError } = await supabase
      .from("suppliers")
      .select("slug")
    if (existingError) throw existingError

    const taken = new Set((existing ?? []).map((s) => s.slug as string))
    const slug = uniqueSupplierSlug(slugifySupplierName(parsed.value.name), taken)

    const { data, error } = await supabase
      .from("suppliers")
      .insert({ ...parsed.value, slug })
      .select("id, name, slug, status")
      .single()

    if (error) {
      // 23505 = colisión de slug; 23514 = CHECK de status.
      if (error.code === "23505") {
        return NextResponse.json({ error: "Ya existe un proveedor con ese nombre" }, { status: 409 })
      }
      if (error.code === "23514") {
        return NextResponse.json({ error: "Estatus inválido" }, { status: 400 })
      }
      throw error
    }

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "supplier_create",
      entity: "suppliers",
      entityId: data.id,
      detail: { name: data.name, slug: data.slug, status: data.status },
    })

    return NextResponse.json({ supplier: data }, { status: 201 })
  } catch (error) {
    logger.error("[ADMIN-SUPPLIERS] create error:", error)
    return NextResponse.json({ error: "Error al crear el proveedor" }, { status: 500 })
  }
}
