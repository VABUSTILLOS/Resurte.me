/**
 * Deep links de WhatsApp para el vendedor. El envío real ocurre en la
 * app de WhatsApp del vendedor (wa.me); aquí construimos el link y el
 * mensaje prellenado. El registro de la actividad "whatsapp enviado" lo
 * hace la server action `logWhatsappSent` desde la UI.
 */

export function sanitizePhoneNumber(raw: string | null | undefined): string {
  if (!raw) return ""
  // Solo dígitos, sin +, espacios o guiones
  const digits = raw.replace(/\D/g, "")
  // México: normalizar a 52 + 10 dígitos (con o sin prefijo de país)
  if (digits.length === 10) return "52" + digits
  if (digits.length === 11 && digits.startsWith("1")) return "52" + digits.slice(1)
  if (digits.length === 12 && digits.startsWith("52")) return digits
  return digits
}

export function buildWhatsappLink(
  phone: string | null | undefined,
  message: string
): string {
  const digits = sanitizePhoneNumber(phone)
  if (!digits) return ""
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

/** Mensaje de recordatorio semanal prellenado. */
export function weeklyReminderMessage(sellerName: string, restaurantName?: string | null): string {
  return `¡Hola${restaurantName ? `, ${restaurantName}` : ""}! 👋 Soy ${sellerName}, tu asesor de Resurte.me.\n\nTe recordamos que esta semana es momento de tu pedido de insumos. 🛒\n\n¿Te armo tu lista o prefieres pedir tú directo en resurte.me?`
}

/**
 * Mensaje de reorden específico: incluye los productos del último pedido del
 * cliente para que el reorden sea de un toque (B3).
 */
export function reorderSuggestionMessage(
  sellerName: string,
  restaurantName: string | null,
  lastOrderItems: string[]
): string {
  const items =
    lastOrderItems.length > 0
      ? `\n\nTu último pedido fue:\n${lastOrderItems.map((i) => `· ${i}`).join("\n")}\n\n¿Te lo repito igual o ajustamos algo?`
      : `\n\n¿Te armo tu lista de esta semana?`
  return `¡Hola${restaurantName ? `, ${restaurantName}` : ""}! 👋 Soy ${sellerName}, tu asesor de Resurte.me.\n\nEs momento de tu reorden semanal. 🛒${items}\n\nConfírmame y te lo dejo programado. ✅`
}

/** Mensaje de presentación inicial (prospecto nuevo). */
export function firstContactMessage(
  sellerName: string,
  prospectName?: string | null,
  restaurantName?: string | null
): string {
  return `¡Hola${prospectName ? `, ${prospectName}` : ""}! 👋 Soy ${sellerName}, asesor de Resurte.me${restaurantName ? `, especialista en proveeduría para ${restaurantName}` : ""}.\n\nTe compartimos nuestro catálogo de insumos para restaurantes con los mejores precios de mayoreo. ¿Te interesa recibir tu lista semanal?`
}
