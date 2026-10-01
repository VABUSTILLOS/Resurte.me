import { MEXICO_CITIES } from "@/lib/cities"

/**
 * Detección de la ciudad del visitante a partir de la geolocalización del edge.
 *
 * Next.js 16 eliminó `NextRequest.geo` (deprecado desde 15.2), así que el
 * proxy lee las cabeceras `x-vercel-ip-*` que Vercel inyecta en cada request.
 * Sin esto la detección por IP quedaba muerta y todos los visitantes caían a
 * la ciudad por defecto. Las cabeceras las escribe el edge: un valor enviado
 * por el cliente se descarta antes de llegar a la función.
 */

/** Nombres de ciudad que entrega Vercel (GeoIP2, en inglés) → slug interno. */
const GEO_CITY_TO_SLUG: Record<string, string> = {
  "Mexico City": "cdmx",
  "Ciudad de México": "cdmx",
  Guadalajara: "guadalajara",
  Monterrey: "monterrey",
  Puebla: "puebla",
  Toluca: "toluca",
  Querétaro: "queretaro",
  Queretaro: "queretaro",
  León: "leon",
  Leon: "leon",
  Tijuana: "tijuana",
  Mérida: "merida",
  Merida: "merida",
  "San Luis Potosí": "san-luis-potosi",
  "San Luis Potosi": "san-luis-potosi",
  Aguascalientes: "aguascalientes",
  Hermosillo: "hermosillo",
  Saltillo: "saltillo",
  Culiacán: "culiacan",
  Culiacan: "culiacan",
  Morelia: "morelia",
  Chihuahua: "chihuahua",
  Veracruz: "veracruz",
  Villahermosa: "villahermosa",
  Cancún: "cancun",
  Cancun: "cancun",
  Torreón: "torreon",
  Torreon: "torreon",
}

/** Códigos ISO 3166-2 de región mexicana → slug interno (fallback). */
const GEO_REGION_TO_SLUG: Record<string, string> = {
  "MX-DIF": "cdmx",
  "MX-CMX": "cdmx",
  "MX-JAL": "guadalajara",
  "MX-NLE": "monterrey",
  "MX-PUE": "puebla",
  "MX-MEX": "toluca",
  "MX-QUE": "queretaro",
  "MX-GUA": "leon",
  "MX-BCN": "tijuana",
  "MX-YUC": "merida",
  "MX-SLP": "san-luis-potosi",
  "MX-AGU": "aguascalientes",
  "MX-SON": "hermosillo",
  "MX-COA": "saltillo",
  "MX-SIN": "culiacan",
  "MX-MIC": "morelia",
  "MX-CHH": "chihuahua",
  "MX-VER": "veracruz",
  "MX-TAB": "villahermosa",
  "MX-ROO": "cancun",
}

/** Sin acentos, minúsculas y sin espacios sobrantes: "Querétaro" ≡ "queretaro". */
export function foldGeoName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

const SLUG_BY_CITY_NAME = new Map(
  Object.entries(GEO_CITY_TO_SLUG).map(([name, slug]) => [foldGeoName(name), slug])
)

/** `x-vercel-ip-city` llega percent-encoded ("San%20Luis%20Potos%C3%AD"). */
function decodeCityHeader(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function nearestCitySlug(lat: number, lng: number): string | null {
  let closest: string | null = null
  let minDistance = Number.POSITIVE_INFINITY
  for (const city of MEXICO_CITIES) {
    const dLat = lat - city.lat
    const dLng = lng - city.lng
    const dist = dLat * dLat + dLng * dLng
    if (dist < minDistance) {
      minDistance = dist
      closest = city.slug
    }
  }
  return closest
}

function readNumber(headers: Headers, name: string): number | null {
  const raw = headers.get(name)
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * Resuelve el slug de ciudad del visitante con la geolocalización del edge.
 *
 * Orden de resolución: ciudad → región → coordenadas más cercanas. El
 * fallback por coordenadas cubre ciudades sin entrada en el mapa (municipios
 * conurbados) y solo aplica dentro de México: un visitante en EE. UU. no debe
 * heredar la ciudad mexicana más próxima.
 */
export function detectCityFromHeaders(headers: Headers): string | null {
  const rawCity = headers.get("x-vercel-ip-city")
  if (rawCity) {
    const slug = SLUG_BY_CITY_NAME.get(foldGeoName(decodeCityHeader(rawCity)))
    if (slug) return slug
  }

  const country = headers.get("x-vercel-ip-country")
  const region = headers.get("x-vercel-ip-country-region")
  if (country === "MX" && region) {
    const slug = GEO_REGION_TO_SLUG[`MX-${region.toUpperCase()}`]
    if (slug) return slug
  }

  if (country === "MX") {
    const lat = readNumber(headers, "x-vercel-ip-latitude")
    const lng = readNumber(headers, "x-vercel-ip-longitude")
    if (lat !== null && lng !== null) {
      return nearestCitySlug(lat, lng)
    }
  }

  return null
}
