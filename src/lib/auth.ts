import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

/**
 * Requiere autenticación. Si el usuario no está logueado, redirige a /auth/login.
 * Úsalo en Server Components o Server Actions.
 */
export async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }
  return { supabase, user }
}

/**
 * Obtiene el usuario actual sin redirigir. Retorna null si no está logueado.
 */
export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
