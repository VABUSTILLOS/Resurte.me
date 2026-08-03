import { type NextRequest, NextResponse } from "next/server"
import { MEXICO_CITIES } from "@/lib/cities"

const VALID_SLUGS = MEXICO_CITIES.map((c) => c.slug)

// Vercel Edge proporciona geo en el request (no está en los tipos de Next.js)
interface GeoInfo {
  city?: string
  country?: string
  region?: string
  latitude?: string
  longitude?: string
  timezone?: string
}

type RequestWithGeo = NextRequest & { geo?: GeoInfo }

// Mapa de códigos de ciudad de Vercel Edge → nuestros slugs
const GEO_CITY_TO_SLUG: Record<string, string> = {
  "Mexico City": "cdmx",
  "Guadalajara": "guadalajara",
  "Monterrey": "monterrey",
  "Puebla": "puebla",
  "Toluca": "toluca",
  "Querétaro": "queretaro",
  "León": "leon",
  "Tijuana": "tijuana",
  "Mérida": "merida",
  "San Luis Potosí": "san-luis-potosi",
  "Aguascalientes": "aguascalientes",
  "Hermosillo": "hermosillo",
  "Saltillo": "saltillo",
  "Culiacán": "culiacan",
  "Morelia": "morelia",
  "Chihuahua": "chihuahua",
  "Veracruz": "veracruz",
  "Villahermosa": "villahermosa",
  "Cancún": "cancun",
  "Torreón": "torreon",
}

// Mapa de country+region a nuestros slugs (fallback para regiones cercanas)
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

const SKIP_PATHS = ["/_next", "/api", "/favicon.ico", "/auth", "/admin", "/static"]

function isPublicPath(pathname: string): boolean {
  return SKIP_PATHS.some((p) => pathname.startsWith(p))
}

/**
 * Detecta la ciudad del visitante usando Vercel Edge geolocation.
 */
function detectCityFromGeo(request: RequestWithGeo): string | null {
  const city = request.geo?.city
  if (city && GEO_CITY_TO_SLUG[city]) {
    return GEO_CITY_TO_SLUG[city]
  }
  // Fallback: usar código de región (ej: MX-JAL → guadalajara)
  const country = request.geo?.country
  const region = request.geo?.region
  if (country === "MX" && region) {
    const key = `MX-${region}`
    if (GEO_REGION_TO_SLUG[key]) {
      return GEO_REGION_TO_SLUG[key]
    }
  }
  return null
}

/**
 * Proxy: maneja detección de ciudad y ruteo.
 * - Si root ("/") sin cookie de ciudad: detecta por IP y redirige
 * - Si root con cookie: redirige a esa ciudad
 * - Si path tipo "/:slug/...": valida slug, setea cookie
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Root path — attempt IP detection
  if (pathname === "/") {
    const cookieSlug = request.cookies.get("city-slug")?.value
    if (cookieSlug && VALID_SLUGS.includes(cookieSlug)) {
      return NextResponse.redirect(new URL(`/${cookieSlug}`, request.url))
    }
    // Try IP geolocation
    const detectedSlug = detectCityFromGeo(request)
    if (detectedSlug) {
      const response = NextResponse.redirect(new URL(`/${detectedSlug}`, request.url))
      response.cookies.set("city-slug", detectedSlug, {
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      })
      return response
    }
    // No se pudo detectar — mostrar landing con selector
    return NextResponse.next()
  }

  // Extract city slug from path: /:slug/...
  const segments = pathname.split("/").filter(Boolean)
  const citySlug = segments[0]

  // Valid city slug → set cookie and continue
  if (VALID_SLUGS.includes(citySlug)) {
    const response = NextResponse.next()
    response.cookies.set("city-slug", citySlug, {
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    })
    return response
  }

  // Unknown route — let Next.js handle (404)
  return NextResponse.next()
}
