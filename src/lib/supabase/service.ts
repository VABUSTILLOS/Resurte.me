import { createClient } from "@supabase/supabase-js"

/**
 * Client con la service role key, SIN cookies de sesión.
 *
 * IMPORTANTE: no usar createServerClient/@supabase/ssr aquí. Si el usuario
 * está logueado, ese client restaura la sesión desde las cookies y las
 * queries van con el access token del usuario (rol `authenticated`), por lo
 * que RLS se aplica y tablas sin política pública (p.ej. `bump_rules`)
 * devuelven 0 filas silenciosamente. Este client fuerza siempre el rol
 * `service_role` (bypass de RLS) para el cálculo server-side de bumps.
 */
export async function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase no está configurado: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY"
    )
  }
  return createClient(
    url,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  )
}
