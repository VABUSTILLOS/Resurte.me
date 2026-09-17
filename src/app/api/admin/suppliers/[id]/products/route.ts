import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse, type NextRequest } from "next/server"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { validateSupplierProductInput } from "@/lib/supplier-admin"

export const runtime = "nodejs"

/**
 * POST /api/admin/suppliers/[id]/products — vincula un producto al proveedor
 * con su costo de lista, SKU del proveedor y presentación.
 *
 * Dos reglas que el esquema no puede imponer solo:
 *
 *  1. **Un solo proveedor principal por producto.** `is_primary` es
 *     informativo para decidir a quién pedirle, así que dos "principales"
 *     para el mismo producto serían una contradicción. Al marcar uno se
 *     desmarcan los demás del mismo producto.
 *  2. **Nada de vínculos duplicados con SKU nulo.** El `UNIQUE
 *     (product_id, supplier_id, supplier_sku)` de 00066 no atrapa los
 *     duplicados cuando el SKU va en NULL (en SQL los NULL no colisionan),
 *     y el admin podría vincular el mismo producto dos veces sin darse
 *     cuenta. Se compara en aplicación con `""` como equivalente de NULL.
 */

function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: adminUser, response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const { id: rawId } = await params
    const supplierId = parseId(rawId)
    if (supplierId === null) {
      return NextResponse.json({ error: "Proveedor inválido" }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
    }

    const parsed = validateSupplierProductInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const supabase = await createServiceClient()

    const { data: supplier, error: supplierError } = await supabase
      .from("suppliers")
      .select("id")
      .eq("id", supplierId)
      .maybeSingle()
    if (supplierError) throw supplierError
    if (!supplier) {
      return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 })
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name")
      .eq("id", parsed.value.product_id)
      .maybeSingle()
    if (productError) throw productError
    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 })
    }

    const { data: existing, error: existingError } = await supabase
      .from("product_suppliers")
      .select("id, supplier_sku")
      .eq("supplier_id", supplierId)
      .eq("product_id", parsed.value.product_id)
    if (existingError) throw existingError

    const wanted = parsed.value.supplier_sku ?? ""
    const duplicate = (existing ?? []).some((row) => (row.supplier_sku ?? "") === wanted)
    if (duplicate) {
      return NextResponse.json(
        { error: "Ese producto ya está vinculado a este proveedor con el mismo SKU" },
        { status: 409 }
      )
    }

    if (parsed.value.is_primary) {
      const { error: demoteError } = await supabase
        .from("product_suppliers")
        .update({ is_primary: false })
        .eq("product_id", parsed.value.product_id)
        .eq("is_primary", true)
      if (demoteError) throw demoteError
    }

    const { data, error } = await supabase
      .from("product_suppliers")
      .insert({ ...parsed.value, supplier_id: supplierId })
      .select("id")
      .single()

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Ese producto ya está vinculado a este proveedor con el mismo SKU" },
          { status: 409 }
        )
      }
      throw error
    }

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "supplier_product_link",
      entity: "product_suppliers",
      entityId: data.id,
      detail: {
        supplierId,
        productId: parsed.value.product_id,
        productName: product.name,
        cost: parsed.value.cost,
        isPrimary: parsed.value.is_primary,
      },
    })

    return NextResponse.json({ link: data }, { status: 201 })
  } catch (error) {
    logger.error("[ADMIN-SUPPLIERS] link error:", error)
    return NextResponse.json({ error: "Error al vincular el producto" }, { status: 500 })
  }
}
