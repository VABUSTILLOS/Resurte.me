import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse, type NextRequest } from "next/server"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { validateSupplierProductPatch } from "@/lib/supplier-admin"

export const runtime = "nodejs"

/**
 * PATCH  /api/admin/suppliers/[id]/products/[linkId] — edita costo, SKU,
 *        presentación, fecha de lista, notas o marca principal.
 * DELETE /api/admin/suppliers/[id]/products/[linkId] — desvincula.
 *
 * Ambas operaciones acotan por `supplier_id` además del id del vínculo:
 * un linkId ajeno responde 404 en vez de dejar que un id filtrado mueva
 * el costo de otro proveedor. `product_id` no se puede cambiar aquí —
 * mover un vínculo de producto es borrar y volver a vincular, y así queda
 * registrado en la bitácora como lo que es.
 */

function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const { user: adminUser, response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const { id: rawSupplierId, linkId: rawLinkId } = await params
    const supplierId = parseId(rawSupplierId)
    const linkId = parseId(rawLinkId)
    if (supplierId === null || linkId === null) {
      return NextResponse.json({ error: "Vínculo inválido" }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
    }

    const parsed = validateSupplierProductPatch(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const supabase = await createServiceClient()

    const { data: current, error: currentError } = await supabase
      .from("product_suppliers")
      .select("id, product_id, supplier_sku")
      .eq("id", linkId)
      .eq("supplier_id", supplierId)
      .maybeSingle()
    if (currentError) throw currentError
    if (!current) {
      return NextResponse.json({ error: "Vínculo no encontrado" }, { status: 404 })
    }

    const nextSku = Object.prototype.hasOwnProperty.call(parsed.value, "supplier_sku")
      ? (parsed.value.supplier_sku ?? "")
      : (current.supplier_sku ?? "")
    if (nextSku !== (current.supplier_sku ?? "")) {
      const { data: siblings, error: siblingsError } = await supabase
        .from("product_suppliers")
        .select("id, supplier_sku")
        .eq("supplier_id", supplierId)
        .eq("product_id", current.product_id)
        .neq("id", linkId)
      if (siblingsError) throw siblingsError
      if ((siblings ?? []).some((row) => (row.supplier_sku ?? "") === nextSku)) {
        return NextResponse.json(
          { error: "Ese producto ya está vinculado a este proveedor con el mismo SKU" },
          { status: 409 }
        )
      }
    }

    if (parsed.value.is_primary === true) {
      const { error: demoteError } = await supabase
        .from("product_suppliers")
        .update({ is_primary: false })
        .eq("product_id", current.product_id)
        .eq("is_primary", true)
        .neq("id", linkId)
      if (demoteError) throw demoteError
    }

    const { data, error } = await supabase
      .from("product_suppliers")
      .update(parsed.value)
      .eq("id", linkId)
      .eq("supplier_id", supplierId)
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
      action: "supplier_product_update",
      entity: "product_suppliers",
      entityId: linkId,
      detail: { supplierId, productId: current.product_id, fields: Object.keys(parsed.value) },
    })

    return NextResponse.json({ link: data })
  } catch (error) {
    logger.error("[ADMIN-SUPPLIERS] link update error:", error)
    return NextResponse.json({ error: "Error al editar el vínculo" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const { user: adminUser, response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const { id: rawSupplierId, linkId: rawLinkId } = await params
    const supplierId = parseId(rawSupplierId)
    const linkId = parseId(rawLinkId)
    if (supplierId === null || linkId === null) {
      return NextResponse.json({ error: "Vínculo inválido" }, { status: 400 })
    }

    const supabase = await createServiceClient()

    const { data: link, error: linkError } = await supabase
      .from("product_suppliers")
      .select("id, product_id, supplier_sku, cost")
      .eq("id", linkId)
      .eq("supplier_id", supplierId)
      .maybeSingle()
    if (linkError) throw linkError
    if (!link) {
      return NextResponse.json({ error: "Vínculo no encontrado" }, { status: 404 })
    }

    const { error } = await supabase
      .from("product_suppliers")
      .delete()
      .eq("id", linkId)
      .eq("supplier_id", supplierId)
    if (error) throw error

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "supplier_product_unlink",
      entity: "product_suppliers",
      entityId: linkId,
      detail: {
        supplierId,
        productId: link.product_id,
        supplierSku: link.supplier_sku,
        cost: link.cost,
      },
    })

    return NextResponse.json({ deleted: true })
  } catch (error) {
    logger.error("[ADMIN-SUPPLIERS] unlink error:", error)
    return NextResponse.json({ error: "Error al desvincular el producto" }, { status: 500 })
  }
}
