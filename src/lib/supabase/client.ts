import { createBrowserClient } from "@supabase/ssr"
import { isSupabaseConfigured, supabaseUrl, supabaseAnonKey } from "@/lib/supabase/env"

export function createClient() {
  // Sin secrets configurados devolvemos null para que la UI degrade con
  // gracia (los consumidores ya hacen `if (!supabase) return`).
  const url = supabaseUrl()
  const anonKey = supabaseAnonKey()
  if (!isSupabaseConfigured() || !url || !anonKey) return null
  // Las passkeys (U13) están detrás de un flag experimental en auth-js: sin él
  // `auth.signInWithPasskey` y `auth.passkey.*` lanzan al llamarse. Encenderlo
  // no cambia nada mientras la UI no invoque esos métodos.
  return createBrowserClient(url, anonKey, {
    auth: { experimental: { passkey: true } },
  })
}
