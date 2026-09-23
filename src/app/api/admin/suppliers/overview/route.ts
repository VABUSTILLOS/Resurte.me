import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { isMissingColumnError } from "@/lib/sale-window"
import { chunkIds, type AvailabilityRow } from "@/lib/admin-product-list"
import { summarizeSupplierCities } from "@/lib/admin-supplier-panel"
import { NextResponse } from "next/server"

/**
 * GET /api/admin/suppliers/overview
 *
 * Resumen por proveedor para el apartado "Proveedores" de `/admin/productos`:
 * cuántos productos tiene, cuántos están publicados, cuáles son sus ids y en
 * qué ciudades está disponible. Es lo que el panel necesita para disparar las
 * acciones masivas contra las rutas que ya existen
 * (`POST /api/admin/products/bulk` y
 * `PATCH /api/admin/products/city-availability`).
 *
 * POR QUÉ UNA RUTA NUEVA Y NO `GET /api/admin/suppliers`
 * -----------------------------------------------------
 * Esa ruta devuelve los vínculos con `select("*")` sobre `product_suppliers`,
 * es decir **el costo de compra de cada producto**, más los datos de contacto
 * del proveedor. Nada de eso hace falta para prender o apagar un proveedor, y
 * traerlo a la pantalla de productos sería publicar el margen en un payload que
 * no lo necesita — el mismo criterio que `00191` y `00192` aplican a
 * `products.cost`. Aquí solo salen conteos, ids y estado de ciudades.
 *
 * LA DISPONIBILIDAD SE RESUELVE AQUÍ, NO EN EL CLIENTE
 * ----------------------------------------------------
 * La regla vive en `summarizeSupplierCities` (misma función que usaría el
 * cliente), pero se evalúa en el servidor para no mandar las filas crudas de
 * `product_city_availability` —que son productos × ciudades— ni obligar al
 * navegador a trocear consultas.
 *
 * Los productos en la papelera (`deleted_at`) no cuentan ni se devuelven: no se
 * pueden publicar, así que ofrecerlos en un botón de "publicar todo" sería
 * mentir. Si la columna aún no existe (00099 sin aplicar) se degrada sin ella.
 */
export async function GET() {
  const { response: adminDenied } = await requireAdmin({ permission: "productos" })
  if (adminDenied) return adminDenied

  try {
    const supabase = await createServiceClient()

    const [suppliersRes, linksRes, citiesRes] = await Promise.all([
      supabase.from("suppliers").select("id,name,slug,status").order("name"),
      supabase.from("product_suppliers").select("product_id,supplier_id"),
      supabase.from("cities").select("id").eq("is_active", true).order("name"),
    ])

    if (suppliersRes.error) {
      return NextResponse.json({ error: suppliersRes.error.message }, { status: 500 })
    }
    if (linksRes.error) {
      return NextResponse.json({ error: linksRes.error.message }, { status: 500 })
    }
    if (citiesRes.error) {
      return NextResponse.json({ error: citiesRes.error.message }, { status: 500 })
    }

    const cities = (citiesRes.data ?? []).map((c) => ({ id: c.id as number }))

    // supplier_id -> ids de producto (sin duplicados: un producto puede tener
    // varias filas del mismo proveedor con distinto SKU).
    const idsBySupplier = new Map<number, number[]>()
    const allIds = new Set<number>()
    for (const link of linksRes.data ?? []) {
      const supplierId = link.supplier_id as number
      const productId = link.product_id as number
      const list = idsBySupplier.get(supplierId) ?? []
      if (!list.includes(productId)) list.push(productId)
      idsBySupplier.set(supplierId, list)
      allIds.add(productId)
    }

    const products = await loadProducts(supabase, [...allIds])
    const availability = await loadAvailability(supabase, [...allIds])

    const suppliers = (suppliersRes.data ?? []).map((s) => {
      const supplierId = s.id as number
      const linked = idsBySupplier.get(supplierId) ?? []
      const alive = linked.filter((id) => products.has(id))
      const visibleCount = alive.filter((id) => products.get(id)?.isVisible).length
      return {
        id: supplierId,
        name: s.name as string,
        slug: s.slug as string,
        status: s.status as string,
        productCount: alive.length,
        visibleCount,
        productIds: alive,
        cities: summarizeSupplierCities(availability, cities, alive),
      }
    })

    return NextResponse.json({ suppliers })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

interface ProductRow {
  id: number
  isVisible: boolean
}

/**
 * Productos vivos con su visibilidad. Troceado con `chunkIds` (mismo tope que
 * el resto del panel) porque
 * `.in()` viaja en la URL: con el catálogo entero vinculado, una sola consulta
 * se pasa del límite y PostgREST responde con error en vez de recortar.
 */
async function loadProducts(
  supabase: ServiceClient,
  ids: number[]
): Promise<Map<number, ProductRow>> {
  const out = new Map<number, ProductRow>()
  for (const part of chunkIds(ids)) {
    let res = await supabase
      .from("products")
      .select("id,is_visible")
      .in("id", part)
      .is("deleted_at", null)
    if (res.error && isMissingColumnError(res.error)) {
      // 00099 (papelera) sin aplicar: se sigue sin el filtro.
      res = await supabase.from("products").select("id,is_visible").in("id", part)
    }
    if (res.error) throw new Error(res.error.message)
    for (const row of res.data ?? []) {
      out.set(row.id as number, { id: row.id as number, isVisible: row.is_visible === true })
    }
  }
  return out
}

/** Filas de restricción por ciudad de esos productos (solo las que existen). */
async function loadAvailability(
  supabase: ServiceClient,
  ids: number[]
): Promise<AvailabilityRow[]> {
  const out: AvailabilityRow[] = []
  for (const part of chunkIds(ids)) {
    const { data, error } = await supabase
      .from("product_city_availability")
      .select("product_id,city_id,is_available")
      .in("product_id", part)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      out.push({
        product_id: row.product_id as number,
        city_id: row.city_id as number,
        is_available: row.is_available === true,
      })
    }
  }
  return out
}
