import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { isMissingColumnError } from "@/lib/sale-window"
import { resolveLowStockThreshold } from "@/lib/stock"
import { NextResponse, type NextRequest } from "next/server"

const COLS =
  "id,name,slug,brand,category_id,description,unit,price,sale_price,cost,stock_quantity,sort_order,stock_status,is_visible,show_in_whatsapp,image_url,images,publish_at,unpublish_at,admin_note,seo_title,seo_description,created_at,sku,barcode,tags,sale_starts_at,sale_ends_at,low_stock_threshold,related_product_ids,deleted_at"

/** Set de la ronda 6 (00096-00105) sin las columnas de la ronda 7
 *  (00106-00109): permite degradar solo esas funciones si aún no se
 *  aplicaron las migraciones nuevas. */
const COLS_BASE =
  "id,name,slug,brand,category_id,description,unit,price,sale_price,cost,stock_quantity,sort_order,stock_status,is_visible,show_in_whatsapp,image_url,images,publish_at,unpublish_at,admin_note,seo_title,seo_description,created_at,deleted_at"

/** Columnas que existen desde antes de la migración 00096: si las
 *  migraciones 00096-00104 aún no se aplican, el panel degrada a este set
 *  (sin programación, nota interna ni papelera) en vez de fallar. */
const COLS_LEGACY =
  "id,name,slug,brand,category_id,description,unit,price,sale_price,stock_status,is_visible,show_in_whatsapp,image_url,images"

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
  city: string
  brand: string
  onSale: boolean
  staleSale: boolean
  underThreshold: boolean
  tag: string
  dupNames: boolean
  trash: boolean
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
    city: sp.get("city") ?? "all",
    brand: sp.get("brand") ?? "all",
    onSale: sp.get("onSale") === "1",
    staleSale: sp.get("staleSale") === "1",
    underThreshold: sp.get("underThreshold") === "1",
    tag: (sp.get("tag") ?? "all").trim() || "all",
    dupNames: sp.get("dupNames") === "1",
    trash: sp.get("trash") === "1",
    sort: rawSort === "price" || rawSort === "stock" ? rawSort : "name",
    dir: sp.get("dir") === "desc" ? "desc" : "asc",
    page: Math.max(1, Number(sp.get("page")) || 1),
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, Number(sp.get("pageSize")) || 50)),
    idsOnly: sp.get("idsOnly") === "1",
  }
}

/** Ids de productos con filas de disponibilidad pero sin ninguna ciudad
 *  activa ("sin ciudades"). null = filtro no aplica. */
async function noCitiesProductIds(
  supabase: ServiceClient,
  withDeletedAt: boolean
): Promise<number[]> {
  const { data } = await supabase
    .from("product_city_availability")
    .select("product_id,is_available")
  const withRow = new Set<number>()
  const withAvailable = new Set<number>()
  for (const row of data ?? []) {
    withRow.add(row.product_id)
    if (row.is_available) withAvailable.add(row.product_id)
  }
  if (!withDeletedAt) {
    return [...withRow].filter((id) => !withAvailable.has(id))
  }
  // Excluir la papelera del conteo/filtro.
  const { data: alive } = await supabase
    .from("products")
    .select("id")
    .is("deleted_at", null)
    .limit(MAX_PAGE_SIZE)
  const aliveIds = new Set((alive ?? []).map((p) => p.id as number))
  return [...withRow].filter((id) => !withAvailable.has(id) && aliveIds.has(id))
}

/** Ids de productos en o por debajo de su umbral de stock bajo. */
async function underThresholdProductIds(
  supabase: ServiceClient,
  withDeletedAt: boolean
): Promise<number[]> {
  const base = () => {
    let q = supabase
      .from("products")
      .select("id,stock_quantity,low_stock_threshold")
      .limit(MAX_PAGE_SIZE)
    if (withDeletedAt) q = q.is("deleted_at", null)
    return q
  }
  const first = await base()
  let rows: { id: number; stock_quantity: number | null; low_stock_threshold?: number | null }[] | null =
    first.data as unknown as { id: number; stock_quantity: number | null }[] | null
  let error = first.error
  if (error && isMissingColumnError(error)) {
    // Migración 00108 pendiente: solo hay umbral por defecto.
    let q = supabase.from("products").select("id,stock_quantity").limit(MAX_PAGE_SIZE)
    if (withDeletedAt) q = q.is("deleted_at", null)
    const second = await q
    rows = second.data
    error = second.error
  }
  if (error || !rows) return []
  return rows
    .filter((row) => {
      if (row.stock_quantity == null) return false
      return row.stock_quantity <= resolveLowStockThreshold(row.low_stock_threshold)
    })
    .map((row) => row.id)
}

/** Ids de productos cuyo nombre normalizado aparece más de una vez. */
async function duplicateNameProductIds(
  supabase: ServiceClient,
  withDeletedAt: boolean
): Promise<number[]> {
  let q = supabase.from("products").select("id,name").limit(MAX_PAGE_SIZE)
  if (withDeletedAt) q = q.is("deleted_at", null)
  const { data } = await q
  const count = new Map<string, number>()
  for (const row of data ?? []) {
    const key = (row.name as string).trim().toLowerCase()
    count.set(key, (count.get(key) ?? 0) + 1)
  }
  return (data ?? [])
    .filter((row) => (count.get((row.name as string).trim().toLowerCase()) ?? 0) > 1)
    .map((row) => row.id as number)
}

/**
 * Aplica los filtros compartidos por la consulta de filas y los conteos.
 *
 * Devuelve el builder dentro de un objeto y no suelto: el builder de PostgREST
 * es "thenable", así que una función `async` que lo retornara directamente lo
 * asimilaría y el `await` del llamador resolvería al resultado ya ejecutado
 * (`{ data, error, count }`) en vez del builder, rompiendo el encadenado
 * posterior (`.order(...)`, `.range(...)`).
 */
async function applyFilters(
  supabase: ServiceClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- builder de PostgREST no exporta un tipo reusable
  query: any,
  p: ListParams,
  withDeletedAt: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ query: any }> {
  // Papelera (00099): por defecto solo productos vivos; trash=1 lista borrados.
  if (withDeletedAt) {
    query = p.trash ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  }
  if (p.q) {
    // ilike no admite comodines del usuario; se escapan % _ y comas.
    const safe = p.q.replace(/[%_,()"]/g, "")
    if (safe) {
      // Búsqueda tolerante a typos vía pg_trgm (00103/00110), que también
      // cubre SKU y código de barras; si la función no existe todavía, cae a
      // ilike clásico.
      const { data: fuzzy, error: fuzzyErr } = await supabase.rpc(
        "search_product_ids_fuzzy",
        { term: safe }
      )
      if (!fuzzyErr && Array.isArray(fuzzy)) {
        const ids = (fuzzy as { id: number }[]).map((r) => r.id)
        query = query.in("id", ids.length > 0 ? ids : [-1])
      } else {
        const { data: cats } = await supabase
          .from("categories")
          .select("id")
          .ilike("name", `%${safe}%`)
        const catIds = (cats ?? []).map((c) => c.id as number)
        const base =
          catIds.length > 0
            ? `name.ilike.%${safe}%,brand.ilike.%${safe}%,category_id.in.(${catIds.join(",")})`
            : `name.ilike.%${safe}%,brand.ilike.%${safe}%`
        // Con SKU/código de barras (00106) si están disponibles; sin ellos si
        // las migraciones pendientes son precisamente esas columnas.
        let fb = supabase
          .from("products")
          .select("id")
          .or(`${base},sku.ilike.%${safe}%,barcode.ilike.%${safe}%`)
          .limit(MAX_PAGE_SIZE)
        if (withDeletedAt) fb = fb.is("deleted_at", null)
        let fbRes = await fb
        if (fbRes.error && isMissingColumnError(fbRes.error)) {
          let plain = supabase
            .from("products")
            .select("id")
            .or(base)
            .limit(MAX_PAGE_SIZE)
          if (withDeletedAt) plain = plain.is("deleted_at", null)
          fbRes = await plain
        }
        const ids = (fbRes.data ?? []).map((r) => r.id as number)
        query = query.in("id", ids.length > 0 ? ids : [-1])
      }
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
  if (p.brand !== "all") query = query.eq("brand", p.brand)
  if (p.onSale) query = query.not("sale_price", "is", null)
  // Ofertas vencidas: precio de oferta activo pero ventana ya cerrada.
  if (p.staleSale) {
    query = query
      .not("sale_price", "is", null)
      .not("sale_ends_at", "is", null)
      .lt("sale_ends_at", new Date().toISOString())
  }
  // Etiqueta (JSONB): coincidencia exacta dentro del arreglo.
  if (p.tag !== "all") query = query.contains("tags", JSON.stringify([p.tag]))
  if (p.underThreshold) {
    const ids = await underThresholdProductIds(supabase, withDeletedAt)
    query = query.in("id", ids.length > 0 ? ids : [-1])
  }
  if (p.dupNames) {
    const ids = await duplicateNameProductIds(supabase, withDeletedAt)
    query = query.in("id", ids.length > 0 ? ids : [-1])
  }
  if (p.city !== "all") {
    // Disponible en la ciudad = no tiene fila is_available=false para ella
    // (global, sin filas, cuenta como disponible).
    const { data: rows } = await supabase
      .from("product_city_availability")
      .select("product_id")
      .eq("city_id", Number(p.city))
      .eq("is_available", false)
    const unavailable = (rows ?? []).map((r) => r.product_id as number)
    if (unavailable.length > 0) {
      query = query.not("id", "in", `(${unavailable.join(",")})`)
    }
  }
  if (p.noCities) {
    const ids = await noCitiesProductIds(supabase, withDeletedAt)
    if (ids.length === 0) {
      query = query.in("id", [-1]) // sin matches
    } else {
      query = query.in("id", ids)
    }
  }
  return { query }
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
      const fetchIds = (cols: string) =>
        supabase.from("products").select(cols).in("id", ids).is("deleted_at", null)
      const first = await fetchIds(COLS)
      // Migraciones pendientes: reintentar sin las columnas de la ronda 7 y,
      // en último término, sin las de la ronda 6.
      const second =
        first.error && isMissingColumnError(first.error) ? await fetchIds(COLS_BASE) : first
      const res =
        second.error && isMissingColumnError(second.error)
          ? await supabase.from("products").select(COLS_LEGACY).in("id", ids)
          : second
      if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
      return NextResponse.json({ rows: res.data ?? [], total: res.data?.length ?? 0 })
    }

    // Carga principal con degradación: si alguna columna de las migraciones
    // 00096-00099 aún no existe en la BD, reintenta sin ellas (panel usable
    // con funciones limitadas en vez de error 500).
    async function loadData(withDeletedAt: boolean, cols: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const alive = (q: any) => (withDeletedAt ? q.is("deleted_at", null) : q)

      let { query } = await applyFilters(
        supabase,
        supabase.from("products").select(p.idsOnly ? "id" : cols, { count: "exact" }),
        p,
        withDeletedAt
      )

      // Orden: stock se ordena por severidad (in_stock < low_stock < out_of_stock).
      const ascending = p.dir === "asc"
      if (p.sort === "stock") {
        query = query.order("stock_status", { ascending }).order("name", { ascending: true })
      } else {
        query = query.order(p.sort === "price" ? "price" : "name", {
          ascending,
          nullsFirst: false,
        })
      }

      const from = (p.page - 1) * p.pageSize
      const result = await query.range(from, from + p.pageSize - 1)
      if (result.error) return { error: result.error }

      if (p.idsOnly) {
        return {
          idsOnlyResult: {
            ids: (result.data ?? []).map((r: { id: number }) => r.id),
            total: result.count ?? 0,
          },
        }
      }

      // Conteos globales para los chips.
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
        onSale,
        staleSale,
        dupNameIds,
        underThresholdIds,
        trashCount,
      ] = await Promise.all([
        alive(supabase.from("products").select("id", { count: "exact", head: true })),
        alive(
          supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("is_visible", true)
        ),
        alive(
          supabase.from("products").select("id", { count: "exact", head: true }).is("image_url", null)
        ),
        alive(
          supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("stock_status", "low_stock")
        ),
        alive(
          supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("stock_status", "out_of_stock")
        ),
        noCitiesProductIds(supabase, withDeletedAt),
        alive(
          supabase.from("products").select("id", { count: "exact", head: true }).is("price", null)
        ),
        alive(
          supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .is("category_id", null)
        ),
        alive(
          supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("show_in_whatsapp", true)
            .eq("is_visible", false)
        ),
        alive(
          supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .not("sale_price", "is", null)
        ),
        alive(
          supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .not("sale_price", "is", null)
            .not("sale_ends_at", "is", null)
            .lt("sale_ends_at", new Date().toISOString())
        ),
        duplicateNameProductIds(supabase, withDeletedAt),
        underThresholdProductIds(supabase, withDeletedAt),
        withDeletedAt
          ? supabase
              .from("products")
              .select("id", { count: "exact", head: true })
              .not("deleted_at", "is", null)
          : Promise.resolve({ count: 0 }),
      ])

      // Marcas distintas para el filtro (dedup en JS; catálogo acotado).
      const { data: brandRows } = await alive(
        supabase.from("products").select("brand").not("brand", "is", null).limit(MAX_PAGE_SIZE)
      )
      const brands = [
        ...new Set(
          ((brandRows ?? []) as { brand: string | null }[])
            .map((r: { brand: string | null }) => r.brand?.trim() ?? "")
            .filter((b: string) => b.length > 0)
        ),
      ].sort((a: string, b: string) => a.localeCompare(b, "es"))

      // Etiquetas en uso, ordenadas por frecuencia (filtro de colecciones).
      const { data: tagRows } = await alive(
        supabase.from("products").select("tags").limit(MAX_PAGE_SIZE)
      )
      const tagCount = new Map<string, number>()
      for (const row of (tagRows ?? []) as { tags: string[] | null }[]) {
        for (const t of row.tags ?? []) {
          if (typeof t !== "string" || !t.trim()) continue
          const key = t.trim().toLowerCase()
          tagCount.set(key, (tagCount.get(key) ?? 0) + 1)
        }
      }
      const tags = [...tagCount.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
        .slice(0, 50)
        .map(([tag]) => tag)

      return {
        rows: result.data ?? [],
        total: result.count ?? 0,
        brands,
        tags,
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
          onSale: onSale.count ?? 0,
          staleSale: staleSale.count ?? 0,
          dupNames: dupNameIds.length,
          underThreshold: underThresholdIds.length,
          trash: trashCount.count ?? 0,
        },
      }
    }

    let out = await loadData(true, COLS)
    let schemaDrift = false
    if ("error" in out && out.error && isMissingColumnError(out.error)) {
      // Migraciones de la ronda 7 (00106-00109) pendientes: se mantienen las
      // funciones de la ronda 6 y se avisa en el panel.
      out = await loadData(true, COLS_BASE)
      schemaDrift = true
    }
    if ("error" in out && out.error && isMissingColumnError(out.error)) {
      // Migraciones 00096-00099 pendientes: degradar del todo.
      out = await loadData(false, COLS_LEGACY)
      schemaDrift = true
    }
    if ("error" in out && out.error) {
      return NextResponse.json({ error: out.error.message }, { status: 500 })
    }
    if ("idsOnlyResult" in out && out.idsOnlyResult) {
      return NextResponse.json(out.idsOnlyResult)
    }

    return NextResponse.json({ ...out, schemaDrift })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
