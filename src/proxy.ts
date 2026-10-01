import { type NextRequest, NextResponse } from "next/server"
import { MEXICO_CITIES } from "@/lib/cities"
import { buildStaticCspHeader } from "@/lib/csp"
import { detectCityFromHeaders } from "@/lib/geo-city"
import { updateSession } from "@/lib/supabase/middleware"

const VALID_SLUGS = MEXICO_CITIES.map((c) => c.slug)

const CITY_COOKIE = "city-slug"
/**
 * Origen de `city-slug`: `manual` (el visitante eligió en el selector) o
 * `auto` (geolocalización por IP). Solo una elección manual se respeta por
 * encima de la detección: así una IP mal geolocalizada —o un dato viejo—
 * no deja al visitante atado a la ciudad equivocada durante 30 días.
 */
const CITY_SOURCE_COOKIE = "city-source"
const CITY_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

const SKIP_PATHS = ["/_next", "/api", "/favicon.ico", "/auth", "/admin", "/static"]

function isPublicPath(pathname: string): boolean {
  return SKIP_PATHS.some((p) => pathname.startsWith(p))
}

function setCityCookie(response: NextResponse, slug: string, source: "auto" | "manual") {
  response.cookies.set(CITY_COOKIE, slug, { maxAge: CITY_COOKIE_MAX_AGE, path: "/" })
  response.cookies.set(CITY_SOURCE_COOKIE, source, {
    maxAge: CITY_COOKIE_MAX_AGE,
    path: "/",
  })
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
 * Proxy: refresca sesión Supabase + CSP estática + detección de ciudad.
 *
 * CSP: la política es ESTÁTICA (sin nonce por request) — ver `src/lib/csp.ts`.
 * El nonce por request obligaba a todas las páginas públicas a leer
 * `headers()` y las convertía en SSR por request (208% del límite de Fluid
 * Active CPU en Vercel). Al fijar la CSP solo en la response, las páginas de
 * catálogo vuelven a ser ISR/estáticas servidas por el CDN.
 *
 * `config.matcher` excluye assets estáticos (`_next/static`, `_next/image`,
 * `public/*`, archivos con extensión): antes el proxy corría en CADA request
 * (decenas de assets por página), inflando Function Invocations.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Prefetch (next/link) y assets no renderizan HTML: se omite CSP para no
  // romper respuestas cacheadas. updateSession igual refresca la sesión en /api.
  const isPrefetch =
    request.headers.has("next-router-prefetch") ||
    request.headers.get("purpose") === "prefetch"
  const isAsset = ASSET_PATHS.some((p) => pathname.startsWith(p))

  const reportOnlyEnabled = ["true", "1"].includes(
    (process.env.CSP_REPORT_ONLY ?? "").toLowerCase()
  )
  const applyCsp = !isPrefetch && !isAsset

  // ── /admin: el destino del guard viaja en la request ──
  // `requireAdminPage()` redirige al login sin sesión, y para devolver al
  // usuario **a donde iba** necesita saber qué ruta pidió. Un layout de Next
  // no recibe el pathname, así que se lo pasa el proxy por cabecera de
  // request. Viaja con la query: los avisos del dashboard enlazan al recurso
  // concreto (`/admin/pedidos?status=pending`) y sin ella el admin volvería a
  // la lista sin filtrar, que es justo lo que el enlace evitaba.
  // Se muta `request.headers` **antes** de `updateSession` porque es
  // `NextResponse.next({ request })` quien las propaga, y `updateSession`
  // tiene varias salidas tempranas: mutar después dejaría algunas sin la
  // cabecera. Solo para /admin, que ya es dinámico por el propio guard.
  if (pathname.startsWith("/admin")) {
    request.headers.set("x-pathname", pathname + request.nextUrl.search)
  }

  // ── Supabase session refresh (delegado a updateSession) ──
  const { supabaseResponse } = await updateSession(request)

  if (applyCsp) {
    // Con CSP_REPORT_ONLY=true la política se envía solo como observación
    // (Content-Security-Policy-Report-Only) sin bloquear nada.
    const headerName = reportOnlyEnabled
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy"
    supabaseResponse.headers.set(
      headerName,
      buildStaticCspHeader({ reportOnly: reportOnlyEnabled })
    )
  }

  // ── /admin: noindex/nofollow ──
  // El layout de /admin es un client component y no puede exportar metadata;
  // el header X-Robots-Tag cubre todas las subrutas de /admin, presentes y
  // futuras. /admin está en SKIP_PATHS, así que siempre sale por
  // `supabaseResponse` y basta fijar el header sobre esa respuesta.
  if (pathname.startsWith("/admin")) {
    supabaseResponse.headers.set("X-Robots-Tag", "noindex, nofollow")
  }

  // ── City detection & routing ──

  // Skip public paths — still return supabaseResponse with auth cookies
  if (isPublicPath(pathname)) {
    return supabaseResponse
  }

  // Root path — attempt IP detection
  if (pathname === "/") {
    const cookieSlug = request.cookies.get(CITY_COOKIE)?.value
    const cookieSource = request.cookies.get(CITY_SOURCE_COOKIE)?.value
    const savedSlug =
      cookieSlug && VALID_SLUGS.includes(cookieSlug) ? cookieSlug : null

    // Elección explícita del visitante: manda sobre la IP.
    if (cookieSource === "manual" && savedSlug) {
      const redirect = NextResponse.redirect(new URL(`/${savedSlug}`, request.url))
      copyAuthCookies(supabaseResponse, redirect)
      return redirect
    }

    // Detección por IP (cabeceras x-vercel-ip-*): define la ciudad del
    // visitante en cada entrada a la raíz, salvo que haya elegido una.
    const detectedSlug = detectCityFromHeaders(request.headers)
    if (detectedSlug) {
      const response = NextResponse.redirect(new URL(`/${detectedSlug}`, request.url))
      setCityCookie(response, detectedSlug, "auto")
      copyAuthCookies(supabaseResponse, response)
      return response
    }

    // Sin geolocalización disponible: se conserva la última ciudad conocida.
    if (savedSlug) {
      const redirect = NextResponse.redirect(new URL(`/${savedSlug}`, request.url))
      copyAuthCookies(supabaseResponse, redirect)
      return redirect
    }

    // No se pudo detectar — mostrar landing con selector
    return supabaseResponse
  }

  // Extract city slug from path: /:slug/...
  const segments = pathname.split("/").filter(Boolean)
  const citySlug = segments[0] ?? ""

  // Valid city slug → set cookie and continue (preserves auth cookies).
  // No se marca como `manual`: navegar a una ciudad no es elegirla, así que
  // la próxima visita a la raíz vuelve a resolverla por IP.
  if (citySlug && VALID_SLUGS.includes(citySlug)) {
    supabaseResponse.cookies.set(CITY_COOKIE, citySlug, {
      maxAge: CITY_COOKIE_MAX_AGE,
      path: "/",
    })
    return supabaseResponse
  }

  // Unknown route — let Next.js handle (404) with auth cookies
  return supabaseResponse
}

/**
 * Sin matcher el proxy corre en TODOS los requests (incluidos _next/static,
 * _next/image y assets de public/), disparando una invocación de función por
 * cada asset de cada página. Se limita a páginas HTML y /api/* (refresco de
 * sesión), excluyendo rutas de assets y archivos con extensión.
 *
 * Además se excluyen las APIs machine-to-machine (`api/webhooks/`,
 * `api/cron/`, `api/csp-report`): no usan sesión de usuario y cada request
 * suyo pagaría doble invocación (proxy + route handler). El resto de /api/*
 * sigue pasando por el proxy para el refresco de sesión.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/webhooks|api/cron|api/csp-report|images/|favicon|icon\\.png|apple-icon|opengraph-image|robots\\.txt|sitemap\\.xml|manifest\\.json|rss\\.xml|.*\\.(?:webp|avif|png|jpg|jpeg|svg|gif|ico|xml|txt|json|webmanifest|woff2?|map)$).*)",
  ],
}
