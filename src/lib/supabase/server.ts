import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { cookies } from "next/headers"
import {
  isSupabaseConfigured,
  supabaseUrl,
  supabaseAnonKey,
  supabaseConfigError,
} from "@/lib/supabase/env"

export async function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(supabaseConfigError())
  }

  const cookieStore = await cookies()

  return createServerClient(
    supabaseUrl()!,
    supabaseAnonKey()!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}

