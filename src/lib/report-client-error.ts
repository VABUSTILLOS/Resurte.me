/**
 * Reporte de errores de cliente a `error_logs` vía /api/log-error.
 *
 * Contexto: los `error.tsx` del área solo escribían en consola
 * (`logger.error`), así que la pestaña "Errores" de `/admin/bitacoras`
 * (`error_logs`, migración 00054) quedaba siempre vacía y un fallo en
 * producción era indiagnosticable. Este helper cierra ese hueco.
 *
 * Contrato: NUNCA lanza y NUNCA debe enmascarar el error original — un
 * boundary que falla al reportar debe seguir mostrando su UI.
 */

type ReportSource = "client" | "server" | "edge"
type ReportSeverity = "info" | "warn" | "error" | "fatal"

export interface ReportClientErrorOptions {
  /** Etiqueta del boundary que reporta, p. ej. "admin.error_boundary". */
  context?: string
  /** Datos extra serializables (path, digest, ids…). */
  extra?: Record<string, unknown>
  severity?: ReportSeverity
  source?: ReportSource
}

/**
 * Dedupe por mensaje+digest: un boundary que vuelve a montar en bucle
 * reenviaría el mismo error en cada intento. El endpoint tiene rate limit
 * de 30/min por IP, así que sin dedupe perderíamos los errores legítimos.
 */
const reported = new Set<string>()

/** Solo para tests: limpia la memoria de dedupe. */
export function resetReportedErrors(): void {
  reported.clear()
}

export function reportClientError(
  error: unknown,
  options: ReportClientErrorOptions = {}
): void {
  // SSR / build: no hay sesión de navegador que reporte.
  if (typeof window === "undefined") return

  const err = error instanceof Error ? error : new Error(String(error))
  const digest =
    error && typeof error === "object" && "digest" in error
      ? String((error as { digest?: string }).digest ?? "")
      : ""

  const key = `${options.context ?? ""}|${digest}|${err.message}`
  if (reported.has(key)) return
  reported.add(key)

  const payload = {
    message: `[${options.context ?? "client"}] ${err.message}`.slice(0, 5000),
    context: {
      boundary: options.context ?? null,
      digest: digest || null,
      path: window.location.pathname + window.location.search,
      ...options.extra,
    },
    severity: options.severity ?? "error",
    source: options.source ?? "client",
    url: window.location.href,
    stack: err.stack?.slice(0, 10000) ?? null,
  }

  try {
    void fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // keepalive: el reporte debe sobrevivir a la navegación del usuario
      // (p. ej. cuando pulsa "Ir al inicio" en el boundary raíz).
      keepalive: true,
    })
      .then((res) => {
        // El endpoint puede devolver 500 (credenciales o `error_logs` caídos).
        // En producción no se le dice nada al usuario, pero en desarrollo hay
        // que enterarse: si no, la observabilidad se rompe en silencio, que es
        // justo el fallo que este helper viene a cerrar.
        if (!res?.ok && process.env.NODE_ENV !== "production") {
          console.warn(
            `[reportClientError] reporte rechazado (${res?.status ?? "sin respuesta"})`
          )
        }
      })
      .catch(() => {
        /* el reporte es best-effort: no romper el boundary por un fallo de red */
      })
  } catch {
    /* JSON.stringify o fetch no disponibles: ignorar */
  }
}
