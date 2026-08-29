"use client"

/**
 * Cliente ligero para enviar errores al endpoint /api/log-error.
 * Uso: logError({ message, context, severity, ... })
 * Fail-open: si falla la red, no rompe la app.
 */

interface LogErrorOptions {
  message: string
  context?: Record<string, unknown>
  severity?: "info" | "warn" | "error" | "fatal"
  userId?: string
  sessionId?: string
  requestId?: string
  stack?: string
  source?: "client" | "server" | "edge"
}

export async function logError(opts: LogErrorOptions): Promise<void> {
  if (typeof window === "undefined") return // solo cliente

  try {
    await fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...opts,
        url: window.location.href,
        userAgent: navigator.userAgent,
        stack: opts.stack ?? (opts.severity === "fatal" ? new Error().stack : undefined),
      }),
      // keepalive para que no se cancele en unload
      keepalive: true,
    })
  } catch {
    // Fail-open: silencioso
  }
}

/** Helper para React error boundaries / try-catch */
export function captureError(
  error: unknown,
  context?: Record<string, unknown>
): void {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined

  logError({
    message,
    context,
    severity: "error",
    stack,
  })
}

/** Helper para warnings no fatales */
export function captureWarning(
  message: string,
  context?: Record<string, unknown>
): void {
  logError({
    message,
    context,
    severity: "warn",
  })
}