/**
 * Sanea el parámetro `next` que usan las pantallas de auth para volver al
 * destino original (p. ej. `/admin`, al que redirige el guard de
 * `src/app/admin/layout.tsx`).
 *
 * Solo acepta rutas internas absolutas: rechaza URLs absolutas
 * (`https://evil.com`), protocol-relative (`//evil.com`), backslashes
 * (`/\evil.com`) y caracteres de control, para evitar open redirect.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = "/"
): string {
  if (!next) return fallback

  const value = next.trim()
  if (!value.startsWith("/")) return fallback
  if (value.startsWith("//")) return fallback
  if (value.includes("\\")) return fallback
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback
  // Evita el bucle login → login
  if (value === "/auth/login" || value.startsWith("/auth/login?")) {
    return fallback
  }

  return value
}
