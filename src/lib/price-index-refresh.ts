import { getIsoWeekMonday } from "@/lib/price-index"
import { isSupabaseConfigured, supabaseUrl } from "@/lib/supabase/env"
import { createServiceClient } from "@/lib/supabase/service"

// ============================================================
// Recálculo del índice de precios (Fase 6).
//
// Llama al RPC `refresh_price_index` (migración 00091), que agrega
// products/product_stores en un snapshot con fecha. Es idempotente por
// fecha: re-ejecutarlo el mismo día actualiza el mismo punto.
//
// La fecha del snapshot es el lunes de la semana ISO, así que la serie
// publicada es semanal aunque el job corra a diario: el punto de la semana
// en curso se refresca con los precios de hoy.
// ============================================================

/** Insumos publicados por ciudad (los más surtidos primero). */
export const PRICE_INDEX_POR_CIUDAD = 300

/** Postgres/PostgREST: función o tabla de la migración aún no aplicada. */
const MISSING_SCHEMA_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"])

export interface PriceIndexRefreshResult {
  status: "ok" | "skipped" | "pending"
  /** Fecha del snapshot (YYYY-MM-DD). */
  fecha: string
  rows: number
  porCiudad: number
  note?: string
}

/** ¿Es una fecha ISO (YYYY-MM-DD) válida y real? */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split("-").map(Number)
  if (y === undefined || m === undefined || d === undefined) return false
  const date = new Date(Date.UTC(y, m - 1, d))
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  )
}

export async function refreshPriceIndex(options?: {
  fecha?: string
  porCiudad?: number
}): Promise<PriceIndexRefreshResult> {
  const fecha = options?.fecha ?? getIsoWeekMonday()
  const porCiudad = options?.porCiudad ?? PRICE_INDEX_POR_CIUDAD
  const base = { fecha, porCiudad, rows: 0 }

  if (!isIsoDate(fecha)) {
    throw new Error(`Fecha inválida (se espera YYYY-MM-DD): ${fecha}`)
  }

  // Sin Supabase utilizable no hay nada que recalcular: no es un error.
  if (!isSupabaseConfigured() || !supabaseUrl() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ...base,
      status: "skipped",
      note: "Supabase sin configurar en este entorno: no hay índice que recalcular.",
    }
  }

  const supabase = await createServiceClient()
  const { data, error } = await supabase.rpc("refresh_price_index", {
    p_fecha: fecha,
    p_por_ciudad: porCiudad,
  })

  if (error) {
    if (MISSING_SCHEMA_CODES.has(error.code ?? "")) {
      return {
        ...base,
        status: "pending",
        note: "La migración 00091_price_index.sql todavía no está aplicada en este proyecto.",
      }
    }
    throw new Error(`refresh_price_index falló: ${error.message}`)
  }

  return { ...base, status: "ok", rows: typeof data === "number" ? data : 0 }
}
