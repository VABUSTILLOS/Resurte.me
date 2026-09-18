"use server"

/**
 * Salud de la app (E2): lectura de `error_logs` para el admin.
 *
 * La tabla ya existe (migración 00054) y la puebla /api/log-error desde
 * cliente, servidor y edge. Esta acción solo la lee con guard admin; no
 * requiere Sentry ni credenciales externas.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logger } from "@/lib/logger"
import { ERROR_LOG_CAP, ERROR_LOG_PAGE_DEFAULT, paginaCapada } from "@/lib/bitacora"

export interface ErrorLogEntry {
  id: number
  message: string
  severity: "info" | "warn" | "error" | "fatal"
  source: "client" | "server" | "edge"
  url: string | null
  user_id: string | null
  created_at: string
}

export interface ErrorLogsReport {
  entries: ErrorLogEntry[]
  /**
   * Conteo por severidad **en las filas devueltas**, no en el periodo.
   *
   * Se llamaba así desde el principio y la UI lo pintaba como tarjetas del
   * periodo (`errores-tab.tsx`), que es presentar una página como un total. El
   * nombre se conserva para no romper a quien lo lea, pero ahora la UI dice
   * explícitamente "en la vista" y el universo real viaja en `total`.
   */
  bySeverity: Record<string, number>
  /** Conteo por fuente **en las filas devueltas**, no en el periodo. */
  bySource: Record<string, number>
  /**
   * Total real de filas que cumplen el filtro (no las devueltas). `null` si el
   * conteo no llegó.
   *
   * Deliberadamente **no** se rellena con el número de filas devueltas: hacerlo
   * era el defecto original —un campo llamado `total` que significaba
   * "mostradas"— y volver a caer en él por comodidad lo reintroduciría en
   * silencio.
   */
  total: number | null
  /** Tope duro de la consulta. */
  cap: number
  /** `true` si hay más filas que las devueltas. */
  truncated: boolean
}

export async function getErrorLogs(opts?: {
  severity?: string
  source?: string
  limit?: number
}): Promise<ErrorLogsReport> {
  const { response } = await requireAdmin()
  if (response) throw new Error("Acceso restringido a administradores")

  const limit = Math.min(ERROR_LOG_CAP, Math.max(10, opts?.limit ?? ERROR_LOG_PAGE_DEFAULT))
  const supabase = await createServiceClient()

  // `count: "exact"` devuelve el total que cumple el filtro, no el de la página.
  // Antes este campo se rellenaba con `entries.length`, así que `total` mentía
  // por construcción: con la tabla llena decía 100 y la UI lo creía.
  // Se piden `limit + 1` filas: la de más es la sonda de "¿hay más?".
  let query = supabase
    .from("error_logs")
    .select("id, message, severity, source, url, user_id, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit + 1)

  if (opts?.severity && ["info", "warn", "error", "fatal"].includes(opts.severity)) {
    query = query.eq("severity", opts.severity)
  }
  if (opts?.source && ["client", "server", "edge"].includes(opts.source)) {
    query = query.eq("source", opts.source)
  }

  const { data, error, count } = await query
  if (error) {
    logger.error("[ERROR-LOGS] query error:", error)
    throw new Error("No se pudieron cargar los errores")
  }

  const pagina = paginaCapada((data ?? []) as ErrorLogEntry[], limit, count ?? null)

  const bySeverity: Record<string, number> = {}
  const bySource: Record<string, number> = {}
  for (const e of pagina.entries) {
    bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1
    bySource[e.source] = (bySource[e.source] ?? 0) + 1
  }

  return {
    entries: pagina.entries,
    bySeverity,
    bySource,
    total: pagina.total,
    cap: pagina.cap,
    truncated: pagina.truncated,
  }
}
