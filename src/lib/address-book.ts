/**
 * Libro de direcciones del checkout: helpers puros compartidos por el hook
 * (use-checkout-order), el endpoint anónimo (/api/addresses/guest) y la UI.
 *
 * Antes cada flujo decidía por su cuenta qué dirección precargar (el drawer
 * tomaba la `is_default`, la página no precargaba nada y los invitados solo
 * tenían una copia en localStorage), así que el comprador reescribía su
 * dirección en cada compra. Aquí vive la regla única de preselección.
 */

import type { Address } from "@/types"
import type { AddressForm } from "@/components/checkout/checkout-shared"

/**
 * Máximo de direcciones anónimas que el checkout lista por navegador.
 * El servidor conserva todas (los pedidos históricos las referencian), pero
 * la lista se acota a las últimas para no crecer sin control en un navegador
 * compartido. Un usuario con sesión no tiene tope: ve todas las suyas.
 */
export const GUEST_ADDRESS_LIMIT = 5

/** `guest_token` válido (UUID v4 del navegador, ver guest-address.ts). */
const GUEST_TOKEN_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Normaliza y valida un `guest_token` recibido por query/body. Devuelve null
 * si no es un UUID: evita consultar con cadenas arbitrarias (y descarta
 * `undefined`, arrays de query string, etc.).
 */
export function sanitizeGuestToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const token = raw.trim()
  return GUEST_TOKEN_RE.test(token) ? token : null
}

/** Fecha de referencia para ordenar: último uso, con created_at de respaldo. */
function usedAt(address: Address): string {
  return address.last_used_at ?? address.created_at ?? ""
}

/**
 * Dirección que el checkout debe precargar de una lista ya guardada:
 *  1. la predeterminada (`is_default`, solo usuarios con sesión);
 *  2. la usada más recientemente (`last_used_at`, que el servidor toca en
 *     cada POST /api/orders);
 *  3. la primera de la lista (ya viene ordenada por el servidor).
 * Devuelve null si no hay ninguna.
 */
export function pickPreferredAddress(rows: Address[]): Address | null {
  if (rows.length === 0) return null
  const byDefault = rows.find((a) => a.is_default)
  if (byDefault) return byDefault
  return rows.reduce((best, candidate) => (usedAt(candidate) > usedAt(best) ? candidate : best))
}

/**
 * ¿El formulario sigue siendo exactamente la dirección guardada?
 * Se compara sin `label`: renombrar ("Casa" → "Oficina") no convierte la
 * dirección en una nueva, y el pedido debe seguir apuntando a la fila
 * guardada (para no duplicarla en cada compra). Debe coincidir con la
 * comparación del servidor en POST /api/orders.
 */
export function addressesMatch(saved: Address, form: AddressForm): boolean {
  return (
    saved.street === form.street &&
    saved.number === form.number &&
    (saved.interior ?? "") === form.interior &&
    saved.neighborhood === form.neighborhood &&
    saved.zip_code === form.zip_code &&
    (saved.references ?? "") === form.references
  )
}

/**
 * Campos de dirección que el checkout sabe mapear a su formulario. Se acepta
 * tanto una fila de `addresses` como el respaldo de localStorage
 * (`GuestAddressData`), donde todo es opcional.
 */
export interface AddressFields {
  label?: string | null
  street?: string | null
  number?: string | null
  interior?: string | null
  neighborhood?: string | null
  zip_code?: string | null
  references?: string | null
}

/** Dirección guardada → formulario del checkout (campos nullables → ""). */
export function toAddressForm(saved: AddressFields): AddressForm {
  return {
    label: saved.label ?? "",
    street: saved.street ?? "",
    number: saved.number ?? "",
    interior: saved.interior ?? "",
    neighborhood: saved.neighborhood ?? "",
    zip_code: saved.zip_code ?? "",
    references: saved.references ?? "",
  }
}

/** Etiqueta visible de una dirección guardada (nunca vacía). */
export function addressLabel(saved: Address): string {
  return saved.label?.trim() || "Dirección"
}

/** Una línea legible para el selector: "Av. Siempre Viva 123, Centro". */
export function addressSummary(saved: Address): string {
  const interior = saved.interior?.trim() ? ` int. ${saved.interior.trim()}` : ""
  return `${saved.street} ${saved.number}${interior}, ${saved.neighborhood}`
}
