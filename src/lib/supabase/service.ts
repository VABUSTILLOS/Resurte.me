import { createClient } from "@supabase/supabase-js"
import { supabaseServiceKey, supabaseUrl } from "./env"

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
  // `supabaseUrl()`/`supabaseServiceKey()` y no `process.env` en crudo: filtran
  // los placeholders (`[SENSITIVE]`, `your-project-url`) para que un entorno
  // mal configurado falle aquí y con este mensaje, no con un 401 más adelante.
  const url = supabaseUrl()
  const serviceRoleKey = supabaseServiceKey()
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
