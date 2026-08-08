/**
 * Autoguardado de la dirección del checkout anónimo.
 *
 * Claves en localStorage:
 *  - resurte_guest_token: UUID del navegador. El servidor guarda las
 *    direcciones anónimas con este token y las reutiliza en compras
 *    siguientes (mismo navegador). Al iniciar sesión se reclaman vía
 *    POST /api/addresses/claim y el token se limpia.
 *  - resurte_last_address: última dirección + teléfono usados (para
 *    precargar el formulario del checkout sin sesión).
 */

export interface GuestAddressData {
  label?: string
  street?: string
  number?: string
  interior?: string
  neighborhood?: string
  zip_code?: string
  references?: string
  phone?: string
}

const TOKEN_KEY = "resurte_guest_token"
const LAST_ADDRESS_KEY = "resurte_last_address"

/** Token persistente del navegador; se genera una sola vez. */
export function getGuestToken(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(TOKEN_KEY)
}

/**
 * Persiste el guest_token generado por el servidor (POST /api/orders).
 * Solo se guarda si aún no hay uno, para no pisar el token de compras previas.
 */
export function saveGuestToken(token: string): void {
  if (typeof window === "undefined" || !token) return
  if (getGuestToken()) return
  try {
    window.localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // localStorage puede no estar disponible (modo privado) — no bloquear
  }
}

function clearGuestToken(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignorar
  }
}

export function getLastAddress(): GuestAddressData | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(LAST_ADDRESS_KEY)
    return raw ? (JSON.parse(raw) as GuestAddressData) : null
  } catch {
    return null
  }
}

export function saveLastAddress(data: GuestAddressData): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(LAST_ADDRESS_KEY, JSON.stringify(data))
  } catch {
    // ignorar
  }
}

/**
 * Reclama las direcciones anónimas (guest_token) al usuario autenticado.
 * Se llama tras iniciar sesión / registrarse. No-op si no hay token o falla
 * silenciosamente (nunca bloquear el login por esto).
 */
export async function claimGuestAddresses(): Promise<void> {
  const token = getGuestToken()
  if (!token) return
  try {
    const res = await fetch("/api/addresses/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guest_token: token }),
    })
    if (res.ok) {
      clearGuestToken()
    }
  } catch {
    // El claim es best-effort: si falla, las direcciones siguen vinculadas
    // al token y se pueden reclamar en el próximo intento.
  }
}

