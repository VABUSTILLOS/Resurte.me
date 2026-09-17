import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse, type NextRequest } from "next/server"
import { logAdminAction } from "@/lib/audit-log"
import { logger } from "@/lib/logger"
import { slugifySupplierName, uniqueSupplierSlug, validateSupplierPatch } from "@/lib/supplier-admin"

export const runtime = "nodejs"

/**
 * PATCH  /api/admin/suppliers/[id] — edita campos del proveedor.
 * DELETE /api/admin/suppliers/[id] — lo borra junto con sus vínculos.
 *
 * El borrado arrastra los `product_suppliers` por `ON DELETE CASCADE`
 * (00066), y esos vínculos son la única copia del costo de lista y la
 * presentación que capturó el admin. Por eso exige `?confirm=1`: sin él
 * responde 409 con cuántos vínculos se perderían, y la UI muestra ese
 * número antes de confirmar. Un borrado silencioso de costos es
 * irrecuperable.
 */

function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: adminUser, response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const { id: rawId } = await params
    const id = parseId(rawId)
    if (id === null) {
      return NextResponse.json({ error: "Proveedor inválido" }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 })
    }

    const parsed = validateSupplierPatch(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const update: Record<string, unknown> = { ...parsed.value }

    if (parsed.renamed && parsed.value.name) {
      const { data: others, error: othersError } = await supabase
        .from("suppliers")
        .select("slug")
        .neq("id", id)
      if (othersError) throw othersError
      const taken = new Set((others ?? []).map((s) => s.slug as string))
      update.slug = uniqueSupplierSlug(slugifySupplierName(parsed.value.name), taken)
    }

    const { data, error } = await supabase
      .from("suppliers")
      .update(update)
      .eq("id", id)
      .select("id, name, slug, status")
      .maybeSingle()

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Ya existe un proveedor con ese nombre" }, { status: 409 })
      }
      if (error.code === "23514") {
        return NextResponse.json({ error: "Estatus inválido" }, { status: 400 })
      }
      throw error
    }
    if (!data) {
      return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 })
    }

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "supplier_update",
      entity: "suppliers",
      entityId: id,
      detail: { fields: Object.keys(parsed.value) },
    })

    return NextResponse.json({ supplier: data })
  } catch (error) {
    logger.error("[ADMIN-SUPPLIERS] update error:", error)
    return NextResponse.json({ error: "Error al editar el proveedor" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user: adminUser, response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const { id: rawId } = await params
    const id = parseId(rawId)
    if (id === null) {
      return NextResponse.json({ error: "Proveedor inválido" }, { status: 400 })
    }

    const supabase = await createServiceClient()

    const { data: supplier, error: supplierError } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("id", id)
      .maybeSingle()
    if (supplierError) throw supplierError
    if (!supplier) {
      return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 })
    }

    const { count, error: countError } = await supabase
      .from("product_suppliers")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", id)
    if (countError) throw countError

    const links = count ?? 0
    const confirmed = request.nextUrl.searchParams.get("confirm") === "1"
    if (links > 0 && !confirmed) {
      return NextResponse.json(
        {
          error: `Este proveedor tiene ${links} producto(s) vinculado(s) con costo de lista. Confirma para borrarlo con todo y vínculos.`,
          requiresConfirmation: true,
          links,
        },
        { status: 409 }
      )
    }

    const { error: deleteError } = await supabase.from("suppliers").delete().eq("id", id)
    if (deleteError) throw deleteError

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "supplier_delete",
      entity: "suppliers",
      entityId: id,
      detail: { name: supplier.name, linksRemoved: links },
    })

    return NextResponse.json({ deleted: true, linksRemoved: links })
  } catch (error) {
    logger.error("[ADMIN-SUPPLIERS] delete error:", error)
    return NextResponse.json({ error: "Error al borrar el proveedor" }, { status: 500 })
  }
}
