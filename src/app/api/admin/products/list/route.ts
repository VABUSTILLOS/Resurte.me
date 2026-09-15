import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse, type NextRequest } from "next/server"

const COLS =
  "id,name,slug,brand,category_id,description,unit,price,sale_price,stock_status,is_visible,show_in_whatsapp,image_url,publish_at,unpublish_at"

const MAX_PAGE_SIZE = 1000

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

interface ListParams {
  q: string
  category: string
  stock: string
  status: string
  noImage: boolean
  noCities: boolean
  noPrice: boolean
  noCategory: boolean
  waMismatch: boolean
  sort: "name" | "price" | "stock"
  dir: "asc" | "desc"
  page: number
  pageSize: number
  idsOnly: boolean
}

function parseParams(req: NextRequest): ListParams {
  const sp = req.nextUrl.searchParams
  const rawSort = sp.get("sort")
  return {
    q: (sp.get("q") ?? "").trim(),
    category: sp.get("category") ?? "all",
    stock: sp.get("stock") ?? "all",
    status: sp.get("status") ?? "all",
    noImage: sp.get("noImage") === "1",
    noCities: sp.get("noCities") === "1",
    noPrice: sp.get("noPrice") === "1",
    noCategory: sp.get("noCategory") === "1",
    waMismatch: sp.get("waMismatch") === "1",
    sort: rawSort === "price" || rawSort === "stock" ? rawSort : "name",
    dir: sp.get("dir") === "desc" ? "desc" : "asc",
    page: Math.max(1, Number(sp.get("page")) || 1),
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, Number(sp.get("pageSize")) || 50)),
    idsOnly: sp.get("idsOnly") === "1",
  }
}

/** Ids de productos con filas de disponibilidad pero sin ninguna ciudad
 *  activa ("sin ciudades"). null = filtro no aplica. */
async function noCitiesProductIds(supabase: ServiceClient): Promise<number[]> {
  const { data } = await supabase
    .from("product_city_availability")
    .select("product_id,is_available")
  const withRow = new Set<number>()
  const withAvailable = new Set<number>()
  for (const row of data ?? []) {
    withRow.add(row.product_id)
    if (row.is_available) withAvailable.add(row.product_id)
  }
  return [...withRow].filter((id) => !withAvailable.has(id))
}

/** Aplica los filtros compartidos por la consulta de filas y los conteos. */
async function applyFilters(
  supabase: ServiceClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- builder de PostgREST no exporta un tipo reusable
  query: any,
  p: ListParams
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  if (p.q) {
    // ilike no admite comodines del usuario; se escapan % _ y comas.
    const safe = p.q.replace(/[%_,()"]/g, "")
    if (safe) {
      const { data: cats } = await supabase
        .from("categories")
        .select("id")
        .ilike("name", `%${safe}%`)
      const catIds = (cats ?? []).map((c) => c.id as number)
      query = query.or(
        catIds.length > 0
          ? `name.ilike.%${safe}%,brand.ilike.%${safe}%,category_id.in.(${catIds.join(",")})`
          : `name.ilike.%${safe}%,brand.ilike.%${safe}%`
      )
    }
  }
  if (p.category !== "all") query = query.eq("category_id", Number(p.category))
  if (p.stock !== "all") query = query.eq("stock_status", p.stock)
  if (p.status === "published") query = query.eq("is_visible", true)
  if (p.status === "unpublished") query = query.eq("is_visible", false)
  if (p.noImage) query = query.is("image_url", null)
  if (p.noPrice) query = query.is("price", null)
  if (p.noCategory) query = query.is("category_id", null)
  if (p.waMismatch) query = query.eq("show_in_whatsapp", true).eq("is_visible", false)
  if (p.noCities) {
    const ids = await noCitiesProductIds(supabase)
    if (ids.length === 0) {
      query = query.in("id", [-1]) // sin matches
    } else {
      query = query.in("id", ids)
    }
  }
  return query
}

/**
 * GET /api/admin/products/list
 * Lista server-side del catálogo para el panel: búsqueda, filtros, orden y
 * paginación en Postgres, más conteos agregados para los chips.
 *
 * Params: q, category, stock, status, noImage, noCities, sort, dir, page,
 * pageSize (máx 1000), idsOnly=1 (solo ids, para select-all/export).
 */
export async function GET(request: NextRequest) {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const p = parseParams(request)
    const supabase = await createServiceClient()

    // Modo ids=1,2,3: trae productos específicos sin filtros ni paginación
    // (usado por el ajuste de precio en lote, que necesita precios frescos
    // de productos seleccionados en otras páginas).
    const idsParam = request.nextUrl.searchParams.get("ids")
    if (idsParam) {
      const ids = idsParam
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
        .slice(0, MAX_PAGE_SIZE)
      if (ids.length === 0) return NextResponse.json({ rows: [], total: 0 })
      const { data, error } = await supabase.from("products").select(COLS).in("id", ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ rows: data ?? [], total: data?.length ?? 0 })
    }

    let query = await applyFilters(
      supabase,
      supabase.from("products").select(p.idsOnly ? "id" : COLS, { count: "exact" }),
      p
    )

    // Orden: stock se ordena por severidad (in_stock < low_stock < out_of_stock)
    // vía CASE, ya que el enum no garantiza orden alfabético útil.
    const ascending = p.dir === "asc"
    if (p.sort === "stock") {
      query = query
        .order("stock_status", { ascending })
        .order("name", { ascending: true })
    } else {
      query = query.order(p.sort === "price" ? "price" : "name", {
        ascending,
        nullsFirst: false,
      })
    }

    const from = (p.page - 1) * p.pageSize
    const { data, error, count } = await query.range(from, from + p.pageSize - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (p.idsOnly) {
      return NextResponse.json({ ids: (data ?? []).map((r: { id: number }) => r.id), total: count ?? 0 })
    }

    // Conteos globales para los chips (independientes de los filtros activos,
    // salvo noCities que se deriva de disponibilidad completa).
    const [
      catalogTotal,
      published,
      noImage,
      lowStock,
      outStock,
      noCitiesIds,
      noPrice,
      noCategory,
      waMismatch,
    ] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("is_visible", true),
      supabase.from("products").select("id", { count: "exact", head: true }).is("image_url", null),
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("stock_status", "low_stock"),
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("stock_status", "out_of_stock"),
      noCitiesProductIds(supabase),
      supabase.from("products").select("id", { count: "exact", head: true }).is("price", null),
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .is("category_id", null),
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("show_in_whatsapp", true)
        .eq("is_visible", false),
    ])

    return NextResponse.json({
      rows: data ?? [],
      total: count ?? 0,
      counts: {
        catalogTotal: catalogTotal.count ?? 0,
        published: published.count ?? 0,
        unpublished: (catalogTotal.count ?? 0) - (published.count ?? 0),
        noImage: noImage.count ?? 0,
        lowStock: lowStock.count ?? 0,
        outStock: outStock.count ?? 0,
        noCities: noCitiesIds.length,
        noPrice: noPrice.count ?? 0,
        noCategory: noCategory.count ?? 0,
        waMismatch: waMismatch.count ?? 0,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
