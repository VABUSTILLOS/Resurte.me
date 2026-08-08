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
 * Refresca la sesión de Supabase y devuelve la response con las cookies de
 * auth actualizadas. `user` es null para visitantes anónimos.
 *
 * Optimizaciones (evitan un roundtrip a la red en cada request):
 * - assets estáticos no necesitan refresco de sesión.
 * - sin Supabase configurado (dev local o preview sin secrets) no hay sesión.
 * - sin cookies `sb-` el visitante es anónimo: se omite `getUser()`.
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
