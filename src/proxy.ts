import { type NextRequest, NextResponse } from "next/server"
import { MEXICO_CITIES } from "@/lib/cities"
import { buildCspHeader } from "@/lib/csp"
import { updateSession } from "@/lib/supabase/middleware"

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

/** Copia las cookies de auth de Supabase a una response existente */
function copyAuthCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    if (cookie.name.startsWith("sb-")) {
      target.cookies.set(cookie.name, cookie.value, {
        path: cookie.path,
        maxAge: cookie.maxAge,
        domain: cookie.domain,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite as boolean | "lax" | "strict" | "none" | undefined,
      })
    }
  })
}

// Paths que no renderizan HTML (no necesitan CSP): assets, API, estáticos.
const ASSET_PATHS = ["/_next", "/api", "/favicon.ico", "/static"]

/**
 * Proxy: refresca sesión Supabase + CSP con nonces + detección de ciudad.
 *
 * CSP: se genera un nonce por request y se inyecta en `request.headers`
 * (x-nonce + Content-Security-Policy) ANTES de llamar a updateSession. Como
 * updateSession construye `NextResponse.next({ request })` con el MISMO objeto
 * request, las mutaciones de headers se propagan al render y Next.js aplica el
 * nonce a scripts/estilos que genera. El header CSP también se setea en la
 * response para que el navegador lo aplique.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Prefetch (next/link) y assets no renderizan HTML: se omite CSP para evitar
  // nonces cacheados. updateSession igual refresca la sesión en /api.
  const isPrefetch =
    request.headers.has("next-router-prefetch") ||
    request.headers.get("purpose") === "prefetch"
  const isAsset = ASSET_PATHS.some((p) => pathname.startsWith(p))

  let cspHeader: string | null = null
  if (!isPrefetch && !isAsset) {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
    cspHeader = buildCspHeader(nonce)
    request.headers.set("x-nonce", nonce)
    request.headers.set("Content-Security-Policy", cspHeader)
  }

  // ── Supabase session refresh (delegado a updateSession) ──
  const { supabaseResponse } = await updateSession(request)

  if (cspHeader) {
    supabaseResponse.headers.set("Content-Security-Policy", cspHeader)
  }

  // ── City detection & routing ──

  // Skip public paths — still return supabaseResponse with auth cookies
  if (isPublicPath(pathname)) {
    return supabaseResponse
  }

  // Root path — attempt IP detection
  if (pathname === "/") {
    const cookieSlug = request.cookies.get("city-slug")?.value
    if (cookieSlug && VALID_SLUGS.includes(cookieSlug)) {
      const redirect = NextResponse.redirect(new URL(`/${cookieSlug}`, request.url))
      copyAuthCookies(supabaseResponse, redirect)
      return redirect
    }
    // Try IP geolocation
    const detectedSlug = detectCityFromGeo(request)
    if (detectedSlug) {
      const response = NextResponse.redirect(new URL(`/${detectedSlug}`, request.url))
      response.cookies.set("city-slug", detectedSlug, {
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      })
      copyAuthCookies(supabaseResponse, response)
      return response
    }
    // No se pudo detectar — mostrar landing con selector
    return supabaseResponse
  }

  // Extract city slug from path: /:slug/...
  const segments = pathname.split("/").filter(Boolean)
  const citySlug = segments[0] ?? ""

  // Valid city slug → set cookie and continue (preserves auth cookies)
  if (citySlug && VALID_SLUGS.includes(citySlug)) {
    supabaseResponse.cookies.set("city-slug", citySlug, {
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    })
    return supabaseResponse
  }

  // Unknown route — let Next.js handle (404) with auth cookies
  return supabaseResponse
}
