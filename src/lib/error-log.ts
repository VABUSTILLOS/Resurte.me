/**
 * Reporte durable de fallos de servidor a `error_logs` (migración `00054`).
 *
 * `logger.error()` solo escribe en la consola del proceso: en producción eso se
 * pierde entre despliegues y el admin no lo ve. `/admin/bitacoras` ya lee
 * `error_logs` (ver `src/lib/admin-errors.ts`), así que un fallo de IA o de
 * entrega reportado aquí aparece junto al resto de la salud de la app sin
 * infraestructura extra (ni Sentry ni credenciales de terceros).
 *
 * **Contrato: nunca lanza.** La observabilidad no puede tumbar el flujo que la
 * llama — un fallo al registrar un fallo de IA no puede impedir que el comensal
 * reciba su respuesta. Todos los caminos terminan en `logger.warn` o en nada.
 */

import { createServiceClient } from "@/lib/supabase/service"
import { isSupabaseConfigured } from "@/lib/supabase/env"
import { logger } from "@/lib/logger"

export type ErrorLogSeverity = "info" | "warn" | "error" | "fatal"

export interface ServerErrorReport {
  /** Qué falló, en una línea y sin PII. */
  message: string
  severity?: ErrorLogSeverity
  /**
   * Datos para el diagnóstico (capacidad, restaurante, proveedor…). Se guardan
   * en la columna `context` (JSONB). **Nunca teléfonos, correos ni cuerpos de
   * mensaje.**
   */
  context?: Record<string, unknown>
  /** Superficie donde ocurrió; se guarda en `url`. */
  url?: string
  /** Error original, si lo hay: su `message` se anexa y su `stack` se guarda. */
  error?: unknown
}

const MAX_MESSAGE = 5000
const MAX_STACK = 10000

function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (error === null || error === undefined) return ""
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/** Mensaje final, con el error original anexado cuando lo hay. */
export function describeServerError(report: ServerErrorReport): string {
  const detail = describe(report.error)
  return (detail ? `${report.message}: ${detail}` : report.message).slice(0, MAX_MESSAGE)
}

function stackOf(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  return error.stack ? error.stack.slice(0, MAX_STACK) : null
}

/**
 * Registra el fallo y devuelve si quedó guardado. `false` significa que el
 * reporte se descartó (sin Supabase, sin service role, o insert fallido); en
 * todos esos casos queda al menos la traza de `logger.warn`.
 */
export async function reportServerError(report: ServerErrorReport): Promise<boolean> {
  const message = describeServerError(report)

  // Sin Supabase no hay dónde escribir, y `createServiceClient()` lanzaría.
  if (!isSupabaseConfigured()) {
    logger.warn("error-log.skipped", { reason: "sin-supabase", message })
    return false
  }

  try {
    const supabase = await createServiceClient()
    const { error } = await supabase.from("error_logs").insert({
      message,
      context: report.context ?? {},
      severity: report.severity ?? "error",
      url: report.url ?? null,
      stack: stackOf(report.error),
      source: "server",
    })
    if (error) {
      logger.warn("error-log.insert", { message: error.message })
      return false
    }
    return true
  } catch (err) {
    logger.warn("error-log.unexpected", { error: describe(err) })
    return false
  }
}
