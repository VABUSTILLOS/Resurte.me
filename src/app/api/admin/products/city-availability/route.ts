import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { revalidateTag } from "next/cache"
import { NextResponse } from "next/server"

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
 */
export async function PATCH(request: Request) {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const body = await request.json()
    const { productId, productIds, cityId, isAvailable, scope, changes } = body ?? {}

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

    if (Array.isArray(changes)) {
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
    }

    // Reflejar el cambio en la tienda sin esperar el TTL del caché.
    revalidateTag("availability", "max")
    revalidateCatalogCache()
    resetCatalogCache()

    return NextResponse.json({ success: true, count: ids.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
