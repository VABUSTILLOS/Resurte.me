import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"
import { isSupabaseConfigured } from "@/lib/supabase/env"

const STATIC_PATHS = [
  "/_next",
  "/images",
  "/favicon",
  "/apple-icon",
  "/icon",
  "/robots",
  "/sitemap",
  "/manifest",
]

/**
 * Extrae el `exp` (segundos UNIX) del access_token guardado en el cookie de
 * sesión de Supabase. Devuelve null si no se puede parsear (formato
 * desconocido, sesión con otro shape, etc.) — en ese caso el llamador debe
 * caer al comportamiento seguro (getUser()).
 *
 * Formatos soportados de @supabase/ssr:
 * - JSON plano: {"access_token":"<jwt>",...}
 * - Prefijo "base64-": el JSON va codificado en base64.
 */
function extractAccessTokenExp(raw: string): number | null {
  try {
    const decoded = raw.startsWith("base64-")
      ? atob(raw.slice("base64-".length))
      : decodeURIComponent(raw)
    const session = JSON.parse(decoded)
    const token: unknown = session?.access_token
    if (typeof token !== "string") return null
    const payloadB64 = token.split(".")[1]
    if (!payloadB64) return null
    const payload = JSON.parse(
      atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))
    )
    return typeof payload?.exp === "number" ? payload.exp : null
  } catch {
    return null
  }
}

/**
 * Refresca la sesión de Supabase y devuelve la response con las cookies de
 * auth actualizadas. `user` es null para visitantes anónimos.
 *
 * Optimizaciones (evitan un roundtrip a la red en cada request):
 * - assets estáticos no necesitan refresco de sesión.
 * - sin Supabase configurado (dev local o preview sin secrets) no hay sesión.
 * - sin cookies `sb-` el visitante es anónimo: se omite `getUser()`.
 * - con el access token vigente (exp > ahora + 120s, leído localmente del
 *   JWT) no hay nada que refrescar: se omite `getUser()`. Solo cuando el
 *   token está por expirar se llama a `getUser()`, que dispara el refresh.
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (STATIC_PATHS.some((p) => pathname.startsWith(p))) {
    return { supabaseResponse: NextResponse.next({ request }), user: null }
  }

  if (!isSupabaseConfigured()) {
    return { supabaseResponse: NextResponse.next({ request }), user: null }
  }

  const hasSessionCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"))
  if (!hasSessionCookie) {
    return { supabaseResponse: NextResponse.next({ request }), user: null }
  }

  // Lee el `exp` del access token JWT (payload sin verificar firma: la
  // verificación real la hace Supabase en cada llamada autenticada; aquí solo
  // decidimos si vale la pena el roundtrip). El cookie de sesión de
  // @supabase/ssr guarda el JSON de la sesión, posiblemente troceado en
  // cookies `.0`, `.1`, …
  const sessionRaw = request.cookies
    .getAll()
    .filter((c) => c.name.startsWith("sb-"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.value)
    .join("")
  const exp = extractAccessTokenExp(sessionRaw)
  // Token vigente con margen: la sesión no necesita refresco todavía.
  // Ahorra un roundtrip de red a Supabase Auth en cada navegación.
  if (exp !== null && exp * 1000 > Date.now() + 120_000) {
    return { supabaseResponse: NextResponse.next({ request }), user: null }
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabaseResponse, user }
}
