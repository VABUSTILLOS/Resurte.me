/**
 * Centralized logger.
 *
 * - info(): operational events that are safe to log (no PII).
 * - warn(): recoverable problems.
 * - error(): failures. Errors always go through console.error so they
 *   surface in the platform's log/alerting pipeline.
 *
 * Never pass full message bodies, phone numbers, or raw payloads to info().
 */

type LogContext = Record<string, unknown>

function serialize(ctx?: LogContext): string {
  if (!ctx || Object.keys(ctx).length === 0) return ""
  return " " + JSON.stringify(ctx)
}

export const logger = {
  info(event: string, ctx?: LogContext) {
    console.log(`[${event}]${serialize(ctx)}`)
  },

  warn(event: string, ctx?: LogContext) {
    console.warn(`[${event}]${serialize(ctx)}`)
  },

  error(event: string, err?: unknown, ctx?: LogContext) {
    console.error(`[${event}]${serialize(ctx)}`, err ?? "")
  },
}
