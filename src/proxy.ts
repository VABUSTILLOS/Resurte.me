import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"
import { isSupabaseConfigured } from "@/lib/supabase/env"
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

/**
 * Proxy: refresca sesión Supabase + detección de ciudad + ruteo.
 */
export async function proxy(request: NextRequest) {
  // ── Supabase session refresh ──
  let supabaseResponse = NextResponse.next({ request })

  // Sin Supabase configurado (dev local o preview sin secrets) el sitio
  // público renderiza igual: no hay sesión que refrescar ni cookies que copiar.
  if (isSupabaseConfigured()) {
    // Solo hay sesión que refrescar si el request trae cookies `sb-` (visitante
    // autenticado). Saltarnos getUser() para visitantes anónimos ahorra un
    // roundtrip a la red en CADA request del sitio.
    const hasSessionCookie = request.cookies
      .getAll()
      .some((c) => c.name.startsWith("sb-"))

    if (hasSessionCookie) {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return request.cookies.getAll()
            },
            setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
              cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
              supabaseResponse = NextResponse.next({ request })
              cookiesToSet.forEach(({ name, value, options }) =>
                supabaseResponse.cookies.set(name, value, options)
              )
            },
          },
        }
      )

      // Refresca la sesión (renueva token si expiró, setea cookies)
      await supabase.auth.getUser()
    }
  }

  // ── City detection & routing ──
  const { pathname } = request.nextUrl

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
  const citySlug = segments[0]

  // Valid city slug → set cookie and continue (preserves auth cookies)
  if (VALID_SLUGS.includes(citySlug)) {
    supabaseResponse.cookies.set("city-slug", citySlug, {
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    })
    return supabaseResponse
  }

  // Unknown route — let Next.js handle (404) with auth cookies
  return supabaseResponse
}
