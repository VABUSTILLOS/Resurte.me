import { NextResponse } from "next/server"
import { createPublicClient } from "@/lib/supabase/public"
import { logger } from "@/lib/logger"
import { MEXICO_CITIES } from "@/lib/cities"

// ============================================================
// /api/feed/precios.json — índice de precios de insumos para agentes
// ============================================================
// Feed estable y versionado con la estructura del índice de precios por
// insumo, unidad, ciudad y fecha de actualización.
//
// ESTADO: la tabla `price_index` (y la ruta /precios que la publica) todavía
// no existe en este repo. Este feed ya lee de forma defensiva contra
// `price_index` para quedar conectado en cuanto la migración aterrice: si la
// tabla no existe (42P01 / PGRST205) o Supabase no está configurado, devuelve
// `status: "pending"` con items vacíos en vez de romper el JSON.
//
// Los nombres de columna se resuelven con tolerancia (varias claves
// candidatas por campo) para no acoplarse a una migración que aún se está
// escribiendo. Cuando el esquema esté congelado, se puede reducir a las claves
// definitivas.
//
// CRÍTICO: sin cookies() ni headers().

export const runtime = "nodejs"

const BASE_URL = "https://resurte.me"

/** Versión del contrato del feed. Subir ante cualquier cambio incompatible. */
const FEED_VERSION = "1.0"

const CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"

const PRICE_INDEX_TABLE = "price_index"
const MAX_ROWS = 5000

/** Códigos de Postgres/PostgREST para "tabla o columna aún no migrada". */
const MISSING_SCHEMA_CODES = new Set(["42P01", "42703", "PGRST205", "PGRST204"])

type PriceRow = Record<string, unknown>

interface PriceItem {
  insumo: string
  insumoSlug: string | null
  unidad: string | null
  precio: number
  moneda: "MXN"
  ciudad: string | null
  ciudadSlug: string | null
  categoria: string | null
  actualizadoEn: string | null
}

function firstString(row: PriceRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === "string" && value.trim().length > 0) return value.trim()
  }
  return null
}

function firstNumber(row: PriceRow, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

/** Normaliza una fila del índice al contrato del feed. */
function toPriceItem(row: PriceRow): PriceItem | null {
  const insumo =
    firstString(row, ["insumo", "insumo_nombre", "nombre", "name", "product_name"]) ?? null
  const precio = firstNumber(row, [
    "precio",
    "precio_promedio",
    "precio_medio",
    "precio_promedio_mxn",
    "price",
    "avg_price",
    "average_price",
  ])
  if (!insumo || precio === null) return null

  const cityId = firstNumber(row, ["city_id", "ciudad_id"])
  const cityFromId =
    cityId === null ? undefined : MEXICO_CITIES.find((c) => c.id === cityId)

  const ciudadSlug =
    firstString(row, ["ciudad_slug", "city_slug", "slug_ciudad"]) ??
    cityFromId?.slug ??
    null
  const ciudad =
    firstString(row, ["ciudad", "city_name", "city", "nombre_ciudad"]) ??
    cityFromId?.name ??
    null

  return {
    insumo,
    insumoSlug: firstString(row, ["insumo_slug", "product_slug", "slug"]),
    unidad: firstString(row, ["unidad", "unidad_medida", "unit", "presentacion"]),
    precio,
    moneda: "MXN",
    ciudad,
    ciudadSlug,
    categoria: firstString(row, ["categoria", "categoria_slug", "category", "category_slug"]),
    actualizadoEn: firstString(row, [
      "actualizado_en",
      "actualizado",
      "updated_at",
      "fecha",
      "fecha_actualizacion",
      "date",
    ]),
  }
}

export async function GET() {
  const empty = (status: "pending", note: string) =>
    NextResponse.json(
      {
        version: FEED_VERSION,
        generatedAt: new Date().toISOString(),
        count: 0,
        status,
        note,
        baseUrl: BASE_URL,
        source: { table: PRICE_INDEX_TABLE },
        items: [],
      },
      { headers: { "Cache-Control": CACHE_CONTROL } }
    )

  const supabase = createPublicClient()
  if (!supabase) {
    return empty(
      "pending",
      "Índice de precios no disponible: Supabase sin configurar en este entorno."
    )
  }

  try {
    const { data, error } = await supabase
      .from(PRICE_INDEX_TABLE)
      .select("*")
      .limit(MAX_ROWS)

    if (error) {
      // Tabla inexistente (migración pendiente) o no expuesta por PostgREST:
      // degradar en silencio y avisar con status "pending".
      if (MISSING_SCHEMA_CODES.has(error.code ?? "")) {
        return empty(
          "pending",
          `Índice de precios en construcción: la tabla ${PRICE_INDEX_TABLE} todavía no está publicada.`
        )
      }
      logger.error("[FEED PRECIOS] query error:", error)
      return empty("pending", "Índice de precios temporalmente no disponible.")
    }

    const items = ((data ?? []) as PriceRow[])
      .map(toPriceItem)
      .filter((item): item is PriceItem => item !== null)
      .sort((a, b) => (a.actualizadoEn ?? "") < (b.actualizadoEn ?? "") ? 1 : -1)

    return NextResponse.json(
      {
        version: FEED_VERSION,
        generatedAt: new Date().toISOString(),
        count: items.length,
        status: items.length > 0 ? "ok" : "pending",
        note:
          items.length > 0
            ? undefined
            : `La tabla ${PRICE_INDEX_TABLE} existe pero todavía no tiene filas publicadas.`,
        baseUrl: BASE_URL,
        currency: "MXN",
        source: { table: PRICE_INDEX_TABLE },
        items,
      },
      { headers: { "Cache-Control": CACHE_CONTROL } }
    )
  } catch (err) {
    logger.error("[FEED PRECIOS] unexpected error:", err)
    return empty("pending", "Índice de precios temporalmente no disponible.")
  }
}
