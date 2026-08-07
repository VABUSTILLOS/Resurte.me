import { createClient as createSupabaseJsClient } from "@supabase/supabase-js"
import { isSupabaseConfigured, supabaseUrl, supabaseAnonKey } from "@/lib/supabase/env"

/**
 * Cliente Supabase anónimo SIN cookies (RLS de solo lectura pública).
 *
 * A diferencia de createClient() (SSR, lee cookies()), este cliente no toca
 * APIs dinámicas de Next, por lo que puede ejecutarse dentro de unstable_cache.
 * Úsalo únicamente para lecturas de catálogo públicas (categories, products,
 * restaurant_collections, foodos_*) donde RLS expone la misma data a todos.
 */
export function createPublicClient() {
  if (!isSupabaseConfigured()) return null
  return createSupabaseJsClient(supabaseUrl()!, supabaseAnonKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
