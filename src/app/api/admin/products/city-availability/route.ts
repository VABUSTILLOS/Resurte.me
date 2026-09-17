import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { revalidateTag } from "next/cache"
import { NextResponse } from "next/server"

/** Tope de ids por consulta: "seleccionar todo" puede abarcar el catálogo. */
const MAX_IDS = 1000

/**
 * GET /api/admin/products/city-availability?ids=1,2,3
 *
 * Filas de disponibilidad de esos productos, para el modal de ciudades del
 * panel. La selección puede abarcar todas las páginas, así que no basta con lo
 * que ya trae el listado (`availability` solo cubre la página visible).
 *
 * Solo se devuelven filas existentes: la ausencia de filas para un producto
 * significa "Global" (disponible en todas las ciudades).
 */
export async function GET(request: Request) {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const requested = [
      ...new Set(
        (new URL(request.url).searchParams.get("ids") ?? "")
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n > 0)
      ),
    ]
    if (requested.length === 0) {
      return NextResponse.json({ error: "Se requiere ids" }, { status: 400 })
    }

    const ids = requested.slice(0, MAX_IDS)
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("product_city_availability")
      .select("product_id,city_id,is_available")
      .in("product_id", ids)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      rows: data ?? [],
      truncated: requested.length > MAX_IDS,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/products/city-availability
 *
 * Gestiona la disponibilidad de productos por ciudad (solo admin).
 * Semántica de la tabla product_city_availability (migración 00065):
 *   - Sin filas para el producto  -> disponible en TODAS las ciudades.
 *   - Con filas                   -> solo disponible donde is_available = true.
 *
 * Body (acepta un producto con `productId` o varios con `productIds: []`):
 *   { productId | productIds, cityId, isAvailable } -> upsert de una celda
 *     (con productIds, la misma celda se aplica a todos)
 *   { productId | productIds, changes: [{ cityId, isAvailable }] } -> upsert
 *     de varias celdas en una sola llamada (p. ej. asignación bulk desde
 *     /admin/productos o pasar de "global" a restringido)
 *   { productId | productIds, scope: "all", isAvailable: true }  -> quita
 *     restricciones (borra las filas; vuelve al default global)
 *   { productId | productIds, scope: "all", isAvailable: false } -> crea
 *     filas is_available=false en todas las ciudades activas
 *   { productIds, restore: [{ productId, cityId, isAvailable }] } -> vuelve a
 *     "global" y reescribe exactamente las celdas indicadas. Es la vía de
 *     "Deshacer": reproduce el estado capturado antes del cambio en una sola
 *     petición, sin importar cuántos productos abarque la selección.
 */
export async function PATCH(request: Request) {
  try {
    const { response: adminDenied, user: adminUser } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const body = await request.json()
    const { productId, productIds, cityId, isAvailable, scope, changes, restore } = body ?? {}

    const ids: number[] = Array.isArray(productIds)
      ? productIds.filter((n): n is number => typeof n === "number" && Number.isInteger(n))
      : typeof productId === "number"
        ? [productId]
        : []

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "Se requiere productId o productIds" },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()
    const now = new Date().toISOString()
    // Resumen de lo aplicado, para la bitácora (una entrada por petición).
    let auditDetail: Record<string, unknown> = {}

    if (Array.isArray(restore)) {
      // Deshacer: primero se vuelve al default global (borra las filas) y luego
      // se reescriben las celdas capturadas antes del cambio. Las dos escrituras
      // van en la misma petición para que el estado intermedio no sea visible.
      const idSet = new Set(ids)
      const validRestore = restore.filter(
        (r) =>
          r &&
          typeof r.productId === "number" &&
          typeof r.cityId === "number" &&
          typeof r.isAvailable === "boolean" &&
          idSet.has(r.productId)
      )
      const { error: resetError } = await supabase
        .from("product_city_availability")
        .delete()
        .in("product_id", ids)
      if (resetError) {
        return NextResponse.json({ error: resetError.message }, { status: 500 })
      }
      if (validRestore.length > 0) {
        const { error } = await supabase.from("product_city_availability").upsert(
          validRestore.map((r) => ({
            product_id: r.productId,
            city_id: r.cityId,
            is_available: r.isAvailable,
            updated_at: now,
          })),
          { onConflict: "product_id,city_id" }
        )
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
      }
      auditDetail = { mode: "restore", cells: validRestore.length }
    } else if (Array.isArray(changes)) {
      // Upsert en lote de celdas (productId, cityId, isAvailable).
      const validChanges = changes.filter(
        (c) => c && typeof c.cityId === "number" && typeof c.isAvailable === "boolean"
      )
      if (validChanges.length === 0) {
        return NextResponse.json(
          { error: "changes debe incluir al menos una celda válida" },
          { status: 400 }
        )
      }
      const rows = ids.flatMap((id) =>
        validChanges.map((c) => ({
          product_id: id,
          city_id: c.cityId,
          is_available: c.isAvailable,
          updated_at: now,
        }))
      )
      const { error } = await supabase
        .from("product_city_availability")
        .upsert(rows, { onConflict: "product_id,city_id" })
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      auditDetail = {
        mode: "changes",
        cells: validChanges.map((c) => ({ cityId: c.cityId, isAvailable: c.isAvailable })),
      }
    } else if (scope === "all") {
      if (typeof isAvailable !== "boolean") {
        return NextResponse.json({ error: "Se requiere isAvailable" }, { status: 400 })
      }
      if (isAvailable) {
        // Volver al default global: sin filas = disponible en todas.
        const { error } = await supabase
          .from("product_city_availability")
          .delete()
          .in("product_id", ids)
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
        auditDetail = { mode: "all", isAvailable: true }
      } else {
        // Apagar en todas: filas explícitas en cada ciudad activa.
        const { data: cities, error: citiesError } = await supabase
          .from("cities")
          .select("id")
          .eq("is_active", true)
        if (citiesError) {
          return NextResponse.json({ error: citiesError.message }, { status: 500 })
        }
        const rows = ids.flatMap((id) =>
          (cities ?? []).map((c) => ({
            product_id: id,
            city_id: c.id,
            is_available: false,
            updated_at: now,
          }))
        )
        if (rows.length > 0) {
          const { error } = await supabase
            .from("product_city_availability")
            .upsert(rows, { onConflict: "product_id,city_id" })
          if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
          }
        }
        auditDetail = { mode: "all", isAvailable: false, cities: cities?.length ?? 0 }
      }
    } else {
      if (!cityId || typeof isAvailable !== "boolean") {
        return NextResponse.json(
          { error: "Se requiere cityId e isAvailable para un cambio por ciudad" },
          { status: 400 }
        )
      }
      const rows = ids.map((id) => ({
        product_id: id,
        city_id: cityId,
        is_available: isAvailable,
        updated_at: now,
      }))
      const { error } = await supabase
        .from("product_city_availability")
        .upsert(rows, { onConflict: "product_id,city_id" })
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      auditDetail = { mode: "cell", cityId, isAvailable }
    }

    // Reflejar el cambio en la tienda sin esperar el TTL del caché.
    revalidateTag("availability", "max")
    revalidateCatalogCache()
    resetCatalogCache()

    // Sin esto, "por qué este producto no aparece en Guadalajara" no tenía
    // rastro: es la superficie donde un error deja productos invisibles.
    await logAdminAction(supabase, {
      actorId: adminUser?.id ?? null,
      actorEmail: adminUser?.email ?? null,
      action: "product_city_availability",
      entity: "product_city_availability",
      detail: { ids, count: ids.length, ...auditDetail },
    })

    // WA5 — encolar sync incremental del catálogo WhatsApp (best-effort).
    const { enqueueProductsForWaSync } = await import("@/lib/whatsapp-sync-queue")
    await enqueueProductsForWaSync(supabase, ids, "city_availability")

    return NextResponse.json({ success: true, count: ids.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
