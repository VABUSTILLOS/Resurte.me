/**
 * Sondeo de imágenes de producto (ronda 7): decide si la URL guardada en
 * `products.image_url` sigue respondiendo. La lógica pura vive aquí para poder
 * probarla; el I/O de red vive en `/api/admin/products/check-images`.
 *
 * Criterio: 2xx/3xx = imagen viva; cualquier 4xx/5xx o un fallo de red/timeout
 * = imagen rota. Los 403/405/501 se reintentan con GET porque muchos CDN
 * rechazan HEAD aunque la imagen exista.
 */

/** Resultado del sondeo de una imagen. */
export type ImageProbeResult = "ok" | "broken" | "skipped"

/** Máximo de productos por corrida del sondeo (limita el tiempo de respuesta). */
export const MAX_PROBE_IDS = 60

/** Códigos con los que un servidor rechaza HEAD aunque la imagen exista. */
const HEAD_REJECTION_STATUSES: readonly number[] = [403, 405, 501]

/**
 * true solo para URLs absolutas http(s): las rutas locales (`/...`) y los
 * valores vacíos no se pueden sondear desde el servidor.
 */
export function isProbeableImageUrl(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim())
}

/** Clasifica la respuesta del sondeo. `null` = fallo de red o timeout. */
export function classifyImageProbe(status: number | null): ImageProbeResult {
  if (status == null) return "broken"
  return status >= 200 && status < 400 ? "ok" : "broken"
}

/** ¿Conviene reintentar con GET porque el servidor rechazó el HEAD? */
export function shouldRetryWithGet(status: number | null): boolean {
  return status != null && HEAD_REJECTION_STATUSES.includes(status)
}

/** Motivo legible del fallo, para mostrarlo en el panel. */
export function imageProbeReason(status: number | null): string {
  if (status == null) return "sin respuesta (timeout o error de red)"
  if (status === 404) return "404: la imagen ya no existe"
  if (status >= 500) return `${status}: el servidor de la imagen falló`
  if (status >= 400) return `${status}: la imagen no es accesible`
  return `HTTP ${status}`
}

/** Reparte una lista en tandas de `size` (para limitar la concurrencia de red). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) return [items.slice()]
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
