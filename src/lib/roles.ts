import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/env"
import { requireAuth } from "@/lib/auth"
import { isAdminUser } from "@/lib/admin-auth"
import { redirect } from "next/navigation"
import type { User } from "@supabase/supabase-js"

export type AppRole = "admin" | "vendedor" | "cliente" | null

/**
 * Obtiene el rol del usuario actual.
 * - `admin`    → ADMIN_EMAILS / admin_users (ve todo el sitio).
 * - `vendedor` → profiles.role = 'vendedor' (solo Comercialización).
 * - `cliente`  → cualquier otro usuario (no ve Comercialización).
 * - `null`     → sin sesión.
 *
 * Uso en Server Components, layouts y server actions.
 */
export async function getUserRole(): Promise<AppRole> {
  // Sin Supabase configurado (dev local / preview sin secrets) no puede haber
  // sesión: devolvemos null en lugar de lanzar, para que layouts y server
  // components degraden sin romper el render.
  if (!isSupabaseConfigured()) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  if (await isAdminUser(user)) return "admin"

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  return profile?.role === "vendedor" ? "vendedor" : "cliente"
}

/**
 * Requiere sesión y rol vendedor o admin (para /comercializacion).
 * Redirige a /auth/login si no hay sesión y a / si el rol no tiene acceso.
 * Usar en Server Components y layouts de la sección.
 */
export async function requireSellerOrAdmin(): Promise<{
  userId: string
  user: User
  role: "vendedor" | "admin"
}> {
  const { user } = await requireAuth()
  const role = await getUserRole()
  if (role !== "vendedor" && role !== "admin") {
    redirect("/")
  }
  return { userId: user.id, user, role }
}

/**
 * Igual que requireSellerOrAdmin pero para server actions: lanza un Error
 * (no redirige) para que el cliente pueda mostrar el mensaje.
 */
export async function requireSellerOrAdminAction(): Promise<{
  userId: string
  user: User
  role: "vendedor" | "admin"
}> {
  const { user } = await requireAuth()
  const role = await getUserRole()
  if (role !== "vendedor" && role !== "admin") {
    throw new Error("Acceso restringido: solo vendedores y administradores")
  }
  return { userId: user.id, user, role }
}
