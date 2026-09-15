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
  /** Conteo por severidad en la ventana consultada. */
  bySeverity: Record<string, number>
  /** Conteo por fuente (client/server/edge). */
  bySource: Record<string, number>
  total: number
}

export async function getErrorLogs(opts?: {
  severity?: string
  source?: string
  limit?: number
}): Promise<ErrorLogsReport> {
  const { response } = await requireAdmin()
  if (response) throw new Error("Acceso restringido a administradores")

  const limit = Math.min(200, Math.max(10, opts?.limit ?? 100))
  const supabase = await createServiceClient()

  let query = supabase
    .from("error_logs")
    .select("id, message, severity, source, url, user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (opts?.severity && ["info", "warn", "error", "fatal"].includes(opts.severity)) {
    query = query.eq("severity", opts.severity)
  }
  if (opts?.source && ["client", "server", "edge"].includes(opts.source)) {
    query = query.eq("source", opts.source)
  }

  const { data, error } = await query
  if (error) {
    logger.error("[ERROR-LOGS] query error:", error)
    throw new Error("No se pudieron cargar los errores")
  }

  const entries = (data ?? []) as ErrorLogEntry[]
  const bySeverity: Record<string, number> = {}
  const bySource: Record<string, number> = {}
  for (const e of entries) {
    bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1
    bySource[e.source] = (bySource[e.source] ?? 0) + 1
  }

  return { entries, bySeverity, bySource, total: entries.length }
}
