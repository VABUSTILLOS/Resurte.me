import { unstable_cache } from "next/cache"
import { createPublicClient } from "@/lib/supabase/public"
import { logger } from "@/lib/logger"

// ============================================================
// Índice público de precios de insumos (Fase 6 — GEO/AEO).
//
// Capa de lectura de `price_index` (migración 00091). Es la única fuente
// que consumen /precios, /precios/[insumo], /precios/[ciudad] y el CSV
// descargable. El feed /api/feed/precios.json lee la misma tabla.
//
// CRÍTICO: sin cookies() ni headers(). Se puede prerenderizar y cachear.
//
// DEGRADACIÓN: si Supabase no está configurado, la tabla todavía no existe
// (42P01/PGRST205) o la query falla, devuelve un snapshot vacío con
// status "pending" en vez de lanzar. Las páginas deben renderizar igual.
// ============================================================

/** Códigos de Postgres/PostgREST para "tabla o columna aún no migrada". */
const MISSING_SCHEMA_CODES = new Set(["42P01", "42703", "PGRST205", "PGRST204"])

const TABLE = "price_index"

/** Tope de filas del snapshot publicado (20 ciudades × 300 insumos). */
const MAX_ROWS = 6000

/** PostgREST devuelve como máximo 1000 filas por request. */
const PAGE_SIZE = 1000

export interface PricePoint {
  /** Fecha del snapshot (lunes de la semana ISO). Es la dimensión temporal. */
  fecha: string
  insumo: string
  insumoSlug: string
  unidad: string | null
  /** Precio de referencia publicado: mediana entre tiendas de la ciudad. */
  precio: number
  precioMin: number | null
  precioMax: number | null
  /** Precio de catálogo sin agregar, para auditar la diferencia. */
  precioCatalogo: number | null
  moneda: string
  ciudad: string
  ciudadSlug: string
  categoria: string | null
  categoriaSlug: string | null
  /** Tiendas con precio para ese insumo/ciudad. 1 = punto único. */
  muestra: number
  /** Timestamp del último recálculo del snapshot. */
  actualizadoEn: string | null
}

export interface PriceIndexSnapshot {
  status: "ok" | "pending"
  /** Fecha del snapshot publicado (null si todavía no hay datos). */
  fecha: string | null
  actualizadoEn: string | null
  points: PricePoint[]
  note?: string
}

const EMPTY_SNAPSHOT: PriceIndexSnapshot = {
  status: "pending",
  fecha: null,
  actualizadoEn: null,
  points: [],
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim()
  return null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/** Normaliza una fila de `price_index` al contrato público. */
function toPricePoint(row: Record<string, unknown>): PricePoint | null {
  const insumo = asString(row.insumo)
  const insumoSlug = asString(row.insumo_slug)
  const ciudad = asString(row.ciudad)
  const ciudadSlug = asString(row.ciudad_slug)
  const precio = asNumber(row.precio)
  const fecha = asString(row.fecha)

  if (!insumo || !insumoSlug || !ciudad || !ciudadSlug || precio === null || !fecha) {
    return null
  }

  return {
    fecha,
    insumo,
    insumoSlug,
    unidad: asString(row.unidad),
    precio,
    precioMin: asNumber(row.precio_min),
    precioMax: asNumber(row.precio_max),
    precioCatalogo: asNumber(row.precio_catalogo),
    moneda: asString(row.moneda) ?? "MXN",
    ciudad,
    ciudadSlug,
    categoria: asString(row.categoria),
    categoriaSlug: asString(row.categoria_slug),
    muestra: Math.max(0, Math.trunc(asNumber(row.muestra) ?? 0)),
    actualizadoEn: asString(row.actualizado_en),
  }
}

/** Fecha (YYYY-MM-DD) del lunes de la semana ISO de `date`. */
export function getIsoWeekMonday(date: Date = new Date()): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
  const day = d.getUTCDay() // 0 = domingo, 1 = lunes, …, 6 = sábado
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().slice(0, 10)
}

/**
 * Lee el último snapshot publicado. Dos queries: la fecha más reciente y
 * luego todas las filas de esa fecha (paginadas).
 */
async function fetchPriceIndex(): Promise<PriceIndexSnapshot> {
  const supabase = createPublicClient()
  if (!supabase) return EMPTY_SNAPSHOT

  try {
    const { data: latest, error: latestError } = await supabase
      .from(TABLE)
      .select("fecha")
      .order("fecha", { ascending: false })
      .limit(1)

    if (latestError) {
      if (MISSING_SCHEMA_CODES.has(latestError.code ?? "")) {
        return {
          ...EMPTY_SNAPSHOT,
          note: "El índice de precios todavía no está publicado.",
        }
      }
      logger.error("[PRICE-INDEX] error leyendo la fecha más reciente:", latestError)
      return { ...EMPTY_SNAPSHOT, note: "Índice de precios temporalmente no disponible." }
    }

    const fecha = asString((latest?.[0] as Record<string, unknown> | undefined)?.fecha)
    if (!fecha) {
      return {
        ...EMPTY_SNAPSHOT,
        note: "El índice de precios todavía no tiene snapshots publicados.",
      }
    }

    const rows: Record<string, unknown>[] = []
    for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("fecha", fecha)
        .order("ciudad_slug", { ascending: true })
        .order("insumo_slug", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)

      if (error) {
        logger.error("[PRICE-INDEX] error leyendo el snapshot:", error)
        return { ...EMPTY_SNAPSHOT, fecha, note: "Índice de precios temporalmente no disponible." }
      }

      const batch = (data ?? []) as Record<string, unknown>[]
      rows.push(...batch)
      if (batch.length < PAGE_SIZE) break
    }

    const points = rows
      .map(toPricePoint)
      .filter((p): p is PricePoint => p !== null)

    if (points.length === 0) {
      return {
        status: "pending",
        fecha,
        actualizadoEn: null,
        points: [],
        note: "El índice de precios todavía no tiene insumos publicados.",
      }
    }

    // El timestamp más reciente del snapshot es el "actualizado el" visible.
    const actualizadoEn = points.reduce<string | null>(
      (acc, p) =>
        p.actualizadoEn && (!acc || p.actualizadoEn > acc) ? p.actualizadoEn : acc,
      null
    )

    return { status: "ok", fecha, actualizadoEn, points }
  } catch (err) {
    logger.error("[PRICE-INDEX] error inesperado:", err)
    return { ...EMPTY_SNAPSHOT, note: "Índice de precios temporalmente no disponible." }
  }
}

/**
 * Snapshot publicado del índice de precios (cacheado 1 h).
 *
 * No lanza nunca: sin datos devuelve `{ status: "pending", points: [] }`.
 */
export const getPriceIndex = unstable_cache(fetchPriceIndex, ["price-index-latest-v1"], {
  revalidate: 3600,
  tags: ["price-index"],
})

/**
 * Conjunto de slugs publicados, congelado por despliegue.
 *
 * `/precios/[insumo]` y `/precios/ciudad/[ciudad]` usan `dynamicParams = false`,
 * así que solo existen las URLs que `generateStaticParams` prerenderizó en el
 * build. Si el sitemap (que se revalida cada 5 min contra la base de datos)
 * publicara slugs nuevos antes del siguiente despliegue, anunciaría URLs 404.
 *
 * `revalidate: false` mantiene este conjunto idéntico al del build durante toda
 * la vida del despliegue. Para publicar insumos nuevos hay que desplegar (el
 * despliegue arranca con la caché fría) o purgar la etiqueta `price-index`.
 */
export const getPriceIndexUrlSlugs = unstable_cache(
  async (): Promise<{ insumos: string[]; ciudades: string[] }> => {
    const snapshot = await getPriceIndex()
    return {
      insumos: summarizeInsumos(snapshot.points).map((i) => i.insumoSlug),
      ciudades: summarizeCiudades(snapshot.points).map((c) => c.ciudadSlug),
    }
  },
  ["price-index-url-slugs-v1"],
  { revalidate: false, tags: ["price-index"] }
)

// ============================================================
// Agrupaciones y utilidades puras (testables sin Supabase)
// ============================================================

export interface InsumoSummary {
  insumo: string
  insumoSlug: string
  unidad: string | null
  categoria: string | null
  categoriaSlug: string | null
  /** Precio de referencia en la ciudad con la muestra más grande. */
  precio: number
  /** Rango observado entre ciudades (min/max del precio de referencia). */
  precioMin: number
  precioMax: number
  /** Número de ciudades donde el insumo tiene precio publicado. */
  ciudades: number
  /** Puntos de precio distintos en todas las ciudades (suma de muestras). */
  muestra: number
}

export interface CiudadSummary {
  ciudad: string
  ciudadSlug: string
  insumos: number
  categorias: number
  /** Precio de referencia mínimo/máximo entre los insumos publicados. */
  precioMin: number
  precioMax: number
}

/** Resume los insumos publicados, con el precio de la ciudad más surtida. */
export function summarizeInsumos(points: PricePoint[]): InsumoSummary[] {
  const bySlug = new Map<string, PricePoint[]>()
  for (const p of points) {
    const list = bySlug.get(p.insumoSlug)
    if (list) list.push(p)
    else bySlug.set(p.insumoSlug, [p])
  }

  const out: InsumoSummary[] = []
  for (const [insumoSlug, list] of bySlug) {
    const precios = list.map((p) => p.precio)
    // Ciudad de referencia: la que tiene más puntos de precio. Empate → la
    // primera alfabéticamente, para que el resumen sea determinista.
    const reference = [...list].sort(
      (a, b) => b.muestra - a.muestra || a.ciudad.localeCompare(b.ciudad, "es")
    ).at(0)
    if (!reference) continue
    out.push({
      insumo: reference.insumo,
      insumoSlug,
      unidad: reference.unidad,
      categoria: reference.categoria,
      categoriaSlug: reference.categoriaSlug,
      precio: reference.precio,
      precioMin: Math.min(...precios),
      precioMax: Math.max(...precios),
      ciudades: list.length,
      muestra: list.reduce((sum, p) => sum + p.muestra, 0),
    })
  }

  // Los más surtidos primero: más ciudades y más puntos de precio.
  return out.sort(
    (a, b) => b.ciudades - a.ciudades || b.muestra - a.muestra || a.insumo.localeCompare(b.insumo, "es")
  )
}

/** Resume las ciudades publicadas. */
export function summarizeCiudades(points: PricePoint[]): CiudadSummary[] {
  const bySlug = new Map<string, PricePoint[]>()
  for (const p of points) {
    const list = bySlug.get(p.ciudadSlug)
    if (list) list.push(p)
    else bySlug.set(p.ciudadSlug, [p])
  }

  const out: CiudadSummary[] = []
  for (const [ciudadSlug, list] of bySlug) {
    const first = list[0]
    if (!first) continue
    const precios = list.map((p) => p.precio)
    const categorias = new Set(
      list.map((p) => p.categoriaSlug).filter((c): c is string => Boolean(c))
    )
    out.push({
      ciudad: first.ciudad,
      ciudadSlug,
      insumos: list.length,
      categorias: categorias.size,
      precioMin: Math.min(...precios),
      precioMax: Math.max(...precios),
    })
  }

  return out.sort((a, b) => b.insumos - a.insumos || a.ciudad.localeCompare(b.ciudad, "es"))
}

/** Precios de un insumo en todas las ciudades, más barato primero. */
export function filterByInsumo(points: PricePoint[], insumoSlug: string): PricePoint[] {
  return points
    .filter((p) => p.insumoSlug === insumoSlug)
    .sort((a, b) => a.precio - b.precio || a.ciudad.localeCompare(b.ciudad, "es"))
}

/** Precios publicados en una ciudad, alfabético por insumo. */
export function filterByCiudad(points: PricePoint[], ciudadSlug: string): PricePoint[] {
  return points
    .filter((p) => p.ciudadSlug === ciudadSlug)
    .sort((a, b) => a.insumo.localeCompare(b.insumo, "es"))
}

const CSV_COLUMNS = [
  "fecha",
  "insumo",
  "insumo_slug",
  "unidad",
  "precio",
  "precio_min",
  "precio_max",
  "precio_catalogo",
  "moneda",
  "ciudad",
  "ciudad_slug",
  "categoria",
  "categoria_slug",
  "muestra",
  "actualizado_en",
] as const

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** CSV del snapshot completo, para descarga (DataDownload / dataset). */
export function toPriceIndexCsv(points: PricePoint[]): string {
  const lines = [CSV_COLUMNS.join(",")]
  for (const p of points) {
    lines.push(
      [
        p.fecha,
        p.insumo,
        p.insumoSlug,
        p.unidad,
        p.precio,
        p.precioMin,
        p.precioMax,
        p.precioCatalogo,
        p.moneda,
        p.ciudad,
        p.ciudadSlug,
        p.categoria,
        p.categoriaSlug,
        p.muestra,
        p.actualizadoEn,
      ]
        .map(csvCell)
        .join(",")
    )
  }
  // Newline final: CSV POSIX y lo que esperan las hojas de cálculo y los agentes.
  return `${lines.join("\n")}\n`
}

/** Formato de moneda para la UI (MXN, sin decimales si son .00). */
export function formatPrecio(precio: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: Number.isInteger(precio) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(precio)
}

/** Formato de fecha larga en español, sin desfase de zona horaria. */
export function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number)
  if (!y || !m || !d) return fecha
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** Nota metodológica: describe `muestra` sin presentarla como promedio. */
export function describeMuestra(muestra: number): string {
  if (muestra <= 0) return "Precio de catálogo, sin comparativa entre tiendas."
  if (muestra === 1) return "Un solo precio observado: no es un promedio de mercado."
  return `Mediana de ${muestra} tiendas.`
}

// ============================================================
// Serie histórica
// ============================================================

export interface PriceHistoryPoint {
  fecha: string
  precio: number
  precioMin: number | null
  precioMax: number | null
  muestra: number
  ciudad: string
  ciudadSlug: string
}

/** Máximo de snapshots semanales que publica la serie (~5 años). */
const MAX_HISTORY = 260

async function fetchHistory(
  insumoSlug: string,
  ciudadSlug?: string
): Promise<PriceHistoryPoint[]> {
  const supabase = createPublicClient()
  if (!supabase) return []

  try {
    let query = supabase
      .from(TABLE)
      .select("fecha, precio, precio_min, precio_max, muestra, ciudad, ciudad_slug")
      .eq("insumo_slug", insumoSlug)
      .order("fecha", { ascending: true })
      .limit(MAX_HISTORY)

    if (ciudadSlug) query = query.eq("ciudad_slug", ciudadSlug)

    const { data, error } = await query
    if (error) {
      if (!MISSING_SCHEMA_CODES.has(error.code ?? "")) {
        logger.error("[PRICE-INDEX] error leyendo la serie histórica:", error)
      }
      return []
    }

    return ((data ?? []) as Record<string, unknown>[])
      .map((row) => {
        const fecha = asString(row.fecha)
        const precio = asNumber(row.precio)
        const ciudad = asString(row.ciudad)
        const ciudadSlugValue = asString(row.ciudad_slug)
        if (!fecha || precio === null || !ciudad || !ciudadSlugValue) return null
        return {
          fecha,
          precio,
          precioMin: asNumber(row.precio_min),
          precioMax: asNumber(row.precio_max),
          muestra: Math.max(0, Math.trunc(asNumber(row.muestra) ?? 0)),
          ciudad,
          ciudadSlug: ciudadSlugValue,
        }
      })
      .filter((p): p is PriceHistoryPoint => p !== null)
  } catch (err) {
    logger.error("[PRICE-INDEX] error inesperado en la serie histórica:", err)
    return []
  }
}

/**
 * Serie de precios publicados de un insumo (todas las semanas), opcionalmente
 * acotada a una ciudad. Devuelve `[]` si todavía no hay histórico.
 */
export const getPriceIndexHistory = unstable_cache(
  fetchHistory,
  ["price-index-history-v1"],
  { revalidate: 3600, tags: ["price-index"] }
)

/** Variación porcentual entre el primer y el último punto de la serie. */
export function variacionPct(serie: Array<{ precio: number }>): number | null {
  const first = serie[0]
  const last = serie[serie.length - 1]
  if (serie.length < 2 || !first || !last || first.precio <= 0) return null
  return ((last.precio - first.precio) / first.precio) * 100
}

/** Promedio simple de una serie de puntos de precio. */
export function promedio(serie: Array<{ precio: number }>): number | null {
  if (serie.length === 0) return null
  return serie.reduce((sum, p) => sum + p.precio, 0) / serie.length
}
