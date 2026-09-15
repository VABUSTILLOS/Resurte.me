import { safeNextPath } from "./safe-next"

/**
 * Cookie donde se guarda el destino original (`next`) para que sobreviva a
 * los flujos que salen del sitio y vuelven por `/auth/callback`:
 * Google OAuth y el enlace de confirmación por email.
 *
 * Esos flujos construyen `redirectTo` apuntando a `/auth/callback` sin
 * query, y añadirle `?next=` depende de la allowlist de "Redirect URLs" de
 * Supabase (si no coincide, Supabase cae al Site URL y se pierde el
 * destino). La cookie evita esa dependencia: `redirectTo` queda intacto.
 *
 * `SameSite=Lax` es suficiente porque la vuelta desde Supabase es una
 * navegación top-level GET, que sí envía la cookie.
 */
export const NEXT_COOKIE = "resurte_auth_next"

/** El enlace de confirmación puede tardar, pero no más que esto. */
const MAX_AGE_SECONDS = 60 * 30

/** Guarda el destino antes de salir al proveedor. Solo en el navegador. */
export function rememberNextPath(next: string | null | undefined): void {
  if (typeof document === "undefined") return

  const safe = safeNextPath(next)
  const secure = window.location.protocol === "https:" ? "; Secure" : ""

  // Sin destino útil no dejamos cookie: el callback caerá a "/".
  if (safe === "/") {
    document.cookie = `${NEXT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
    return
  }

  document.cookie = `${NEXT_COOKIE}=${encodeURIComponent(safe)}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`
}

/** Lee el destino guardado desde una cabecera `Cookie`. */
export function readNextPath(
  cookieHeader: string | null | undefined
): string | null {
  if (!cookieHeader) return null

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=")
    if (separator === -1) continue
    if (part.slice(0, separator).trim() !== NEXT_COOKIE) continue

    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      // Valor con porcentaje inválido — ignorar en lugar de romper el login.
      return null
    }
  }

  return null
}

/** `Set-Cookie` que borra la cookie una vez consumida. */
export function clearNextCookie(): string {
  return `${NEXT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}
