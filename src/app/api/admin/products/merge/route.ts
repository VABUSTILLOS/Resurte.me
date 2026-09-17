import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { readJsonBody } from "@/lib/api-body"
import { NextResponse } from "next/server"

/**
 * POST /api/admin/products/merge
 * Fusiona dos productos (típico al limpiar "Nombres duplicados"):
 * - el TARGET conserva su disponibilidad y suma la del SOURCE que falte,
 * - la galería se une (target primero, sin duplicados),
 * - si el target no tiene imagen principal, hereda la del source,
 * - el SOURCE va a la papelera (soft delete + despublicado).
 * Body: { sourceId, targetId }.
 */
export async function POST(request: Request) {
  try {
    const { response: adminDenied, user: adminUser } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const parsed = await readJsonBody<{ sourceId?: number; targetId?: number }>(request)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

    const { sourceId, targetId } = parsed.data
    if (
      typeof sourceId !== "number" ||
      typeof targetId !== "number" ||
      sourceId === targetId
    ) {
      return NextResponse.json(
        { error: "Se requieren sourceId y targetId distintos" },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()

    const [{ data: source }, { data: target }] = await Promise.all([
      supabase.from("products").select("id,name,image_url,images").eq("id", sourceId).single(),
      supabase.from("products").select("id,name,image_url,images").eq("id", targetId).single(),
    ])
    if (!source || !target) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 })
    }

    // 1) Disponibilidad: copiar del source las ciudades que el target no tiene.
    const [{ data: srcAvail }, { data: tgtAvail }] = await Promise.all([
      supabase
        .from("product_city_availability")
        .select("city_id,is_available")
        .eq("product_id", sourceId),
      supabase
        .from("product_city_availability")
        .select("city_id")
        .eq("product_id", targetId),
    ])
    const targetCities = new Set((tgtAvail ?? []).map((r) => r.city_id as number))
    const missing = (srcAvail ?? []).filter((r) => !targetCities.has(r.city_id))
    if (missing.length > 0) {
      await supabase.from("product_city_availability").insert(
        missing.map((row) => ({
          product_id: targetId,
          city_id: row.city_id,
          is_available: row.is_available,
        }))
      )
    }

    // 2) Galería e imagen principal.
    const mergedImages = [
      ...new Set([...(target.images ?? []), ...(source.images ?? [])]),
    ] as string[]
    const mergedImageUrl = target.image_url ?? source.image_url
    const { error: updErr } = await supabase
      .from("products")
      .update({ images: mergedImages, image_url: mergedImageUrl })
      .eq("id", targetId)
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    // 3) Source a la papelera.
    const { error: delErr } = await supabase
      .from("products")
      .update({ deleted_at: new Date().toISOString(), is_visible: false })
      .eq("id", sourceId)
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 })
    }

    revalidateCatalogCache()
    resetCatalogCache()

    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "product_update",
      entity: "products",
      entityId: targetId,
      detail: { mergeFrom: sourceId },
    })
    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "product_delete",
      entity: "products",
      entityId: sourceId,
      detail: { mergedInto: targetId, name: source.name },
    })

    try {
      const { enqueueProductsForWaSync } = await import("@/lib/whatsapp-sync-queue")
      await enqueueProductsForWaSync(supabase, [targetId], "product_merge")
    } catch {
      // silencioso por diseño
    }

    return NextResponse.json({ success: true, sourceId, targetId })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
