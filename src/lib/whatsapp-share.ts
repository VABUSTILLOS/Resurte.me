// ============================================================
// Enlaces de distribución del catálogo WhatsApp (WF1).
// Módulo CLIENTE-SAFE (sin imports de servidor): se usa tanto
// en actions como directamente en componentes de la UI.
// ============================================================

/**
 * Normaliza un teléfono mexicano a dígitos internacionales para wa.me.
 * Acepta: 10 dígitos (6141234567), con 52 (526141234567),
 * con +52 1 legacy (5216141234567) y variantes con espacios/guiones.
 * Devuelve solo dígitos o null si no es un número MX plausible.
 */
export function normalizeMxPhoneForWaMe(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return `52${digits}`
  if (digits.length === 12 && digits.startsWith("52")) return digits
  // Legacy +52 1 XXXXXXXXXX (13 dígitos): wa.me ya no requiere el 1.
  if (digits.length === 13 && digits.startsWith("521")) return `52${digits.slice(3)}`
  return null
}

/** Enlace de chat wa.me con texto precargado (null si el teléfono no sirve). */
export function buildCatalogChatLink(displayPhone: string, catalogName: string): string | null {
  const phone = normalizeMxPhoneForWaMe(displayPhone)
  if (!phone) return null
  const text = encodeURIComponent(`Hola, quiero ver el catálogo de ${catalogName} 🛒`)
  return `https://wa.me/${phone}?text=${text}`
}

/** Enlace directo a la VISTA DE CATÁLOGO de WhatsApp Business (wa.me/c/). */
export function buildCatalogShopLink(displayPhone: string): string | null {
  const phone = normalizeMxPhoneForWaMe(displayPhone)
  if (!phone) return null
  return `https://wa.me/c/${phone}`
}

/** Texto listo para compartir el catálogo por WhatsApp/redes. */
export function buildCatalogShareText(displayPhone: string, catalogName: string): string | null {
  const link = buildCatalogShopLink(displayPhone)
  if (!link) return null
  return `🛒 Surtimos tu negocio desde WhatsApp: mira el catálogo de ${catalogName} y pide aquí: ${link}`
}
