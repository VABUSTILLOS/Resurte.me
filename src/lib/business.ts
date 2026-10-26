import { ACTIVE_CITIES, DEFAULT_CITY_SLUG } from "@/lib/cities"

/**
 * Fuente única del NAP (Name, Address, Phone) de Resurte.me.
 *
 * Todo lo que declare dónde opera la empresa —schema.org, footer, /contact,
 * /soporte, aviso de privacidad— sale de aquí. Si el teléfono o el domicilio
 * cambian, se cambian en un solo lugar: un NAP inconsistente entre páginas es
 * la causa más común de que Google no asocie una marca con su ciudad.
 *
 * La dirección postal es opcional a propósito. Resurte.me opera como negocio
 * de área de servicio (no hay sucursal abierta al público), así que el schema
 * declara localidad, estado y país, y solo agrega calle y CP cuando existen
 * de verdad. Inventar una dirección debilita la entidad en vez de reforzarla.
 */

/** Número tal como lo espera wa.me (sin "+", con el 1 de móvil mexicano). */
export const WHATSAPP_NUMBER = (
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "5216145337486"
).replace(/\D/g, "")

/** E.164 para `tel:` y para `telephone` en schema.org. */
export const PHONE_E164 = "+526145337486"

/** Formato legible, idéntico en todas las superficies (consistencia NAP). */
export const PHONE_DISPLAY = "+52 614 533 7486"

export const PHONE_TEL_HREF = `tel:${PHONE_E164}`

export const BUSINESS_EMAIL = "hola@resurte.me"

export const WHATSAPP_HREF = `https://wa.me/${WHATSAPP_NUMBER}`

/** Ciudad donde opera la empresa hoy. Se deriva de la fuente única de ciudades. */
export const HOME_CITY = ACTIVE_CITIES[0] ?? {
  name: "Chihuahua",
  slug: DEFAULT_CITY_SLUG,
  state: "Chihuahua",
  lat: 28.635277,
  lng: -106.088882,
}

export interface BusinessAddress {
  streetAddress?: string
  addressLocality: string
  addressRegion: string
  postalCode?: string
  addressCountry: string
}

/**
 * Domicilio declarado. Calle y CP se leen de entorno porque no se publican
 * hasta que exista una dirección operativa confirmada; mientras tanto el
 * schema declara solo localidad/estado/país, que es válido para un negocio
 * de área de servicio.
 */
export const BUSINESS_ADDRESS: BusinessAddress = {
  ...(process.env.NEXT_PUBLIC_BUSINESS_STREET
    ? { streetAddress: process.env.NEXT_PUBLIC_BUSINESS_STREET }
    : {}),
  addressLocality: HOME_CITY.name,
  addressRegion: HOME_CITY.state,
  ...(process.env.NEXT_PUBLIC_BUSINESS_POSTAL_CODE
    ? { postalCode: process.env.NEXT_PUBLIC_BUSINESS_POSTAL_CODE }
    : {}),
  addressCountry: "MX",
}

/** Texto de una línea para pie de página y bloques de contacto. */
export const BUSINESS_LOCATION_LABEL = `${HOME_CITY.name}, ${HOME_CITY.state}, México`

export const BUSINESS_GEO = {
  latitude: HOME_CITY.lat,
  longitude: HOME_CITY.lng,
}

/** Horario de atención. Domingo cerrado: no se declara como día abierto. */
export const BUSINESS_HOURS = [
  { label: "Lunes a viernes", display: "8:00 AM — 6:00 PM", opens: "08:00", closes: "18:00", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
  { label: "Sábados", display: "8:00 AM — 2:00 PM", opens: "08:00", closes: "14:00", days: ["Saturday"] },
] as const

export const BUSINESS_HOURS_NOTE = "Domingos y días festivos: cerrado — el carrito sigue abierto 24/7"

/** Resumen de una línea para el footer. */
export const BUSINESS_HOURS_SUMMARY = "Lun–Vie 8:00–18:00 · Sáb 8:00–14:00"

/**
 * Google Business Profile. Sin esta URL no hay Local Pack ni Maps, así que se
 * declara solo cuando existe: un `sameAs` que no resuelve resta credibilidad.
 */
export const GOOGLE_BUSINESS_URL = process.env.NEXT_PUBLIC_GOOGLE_BUSINESS_URL || null

/** Perfiles externos verificables de la marca. */
export const BRAND_PROFILES: string[] = [
  "https://www.facebook.com/resurteme",
  "https://www.instagram.com/resurteme",
  WHATSAPP_HREF,
  ...(GOOGLE_BUSINESS_URL ? [GOOGLE_BUSINESS_URL] : []),
]

/** `openingHoursSpecification` de schema.org, agrupado por rango horario. */
export function getOpeningHoursSpecification() {
  return BUSINESS_HOURS.map((h) => ({
    "@type": "OpeningHoursSpecification" as const,
    dayOfWeek: [...h.days],
    opens: h.opens,
    closes: h.closes,
  }))
}

/** `PostalAddress` de schema.org, sin campos vacíos. */
export function getPostalAddress() {
  return {
    "@type": "PostalAddress" as const,
    ...BUSINESS_ADDRESS,
  }
}
