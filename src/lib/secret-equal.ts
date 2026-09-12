import { timingSafeEqual } from "crypto"

/**
 * Comparación de secretos en tiempo constante.
 *
 * `provided === expected` con strings filtra por timing cuántos caracteres
 * iniciales son correctos; para secretos de endpoints (CRON_SECRET,
 * ADMIN_API_SECRET, SEED_API_TOKEN) se compara con timingSafeEqual.
 *
 * Fail-closed: cualquier ausencia o diferencia de longitud devuelve false.
 */
export function safeSecretEqual(
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!provided || !expected) return false
  const a = Buffer.from(provided, "utf8")
  const b = Buffer.from(expected, "utf8")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
