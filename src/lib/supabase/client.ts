import { createBrowserClient } from "@supabase/ssr"
import { isSupabaseConfigured, supabaseUrl, supabaseAnonKey } from "@/lib/supabase/env"

export function createClient() {
  // Sin secrets configurados devolvemos null para que la UI degrade con
  // gracia (los consumidores ya hacen `if (!supabase) return`).
  if (!isSupabaseConfigured()) return null
  return createBrowserClient(supabaseUrl()!, supabaseAnonKey()!)
}
