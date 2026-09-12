import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse } from "next/server"

/**
 * GET /api/admin/suppliers
 *
 * Directorio de proveedores con sus productos vinculados (solo admin).
 * Las tablas suppliers/product_suppliers tienen RLS sin políticas
 * públicas (los costos son confidenciales), así que esta ruta lee con
 * el service client después de validar requireAdmin().
 *
 * Respuesta: { suppliers: SupplierWithProducts[] }
 */
export async function GET() {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const supabase = await createServiceClient()

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

    return NextResponse.json({
      suppliers: (suppliers ?? []).map((s) => ({
        ...s,
        products: bySupplier.get(s.id) ?? [],
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
