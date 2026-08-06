import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
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

/**
 * Igual que createClient pero degrada a 404 cuando Supabase no está
 * configurado en el entorno (dev local o preview sin secrets). Ideal para
 * páginas de catálogo que no tienen datos que mostrar sin backend.
 */
export async function createClientOrNotFound() {
  try {
    return await createClient()
  } catch (error) {
    if (error instanceof Error && error.message.includes("Supabase no está configurado")) {
      notFound()
    }
    throw error
  }
}
