import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Verifica que el request tenga una sesión de usuario admin.
 *
 * La fuente de verdad es la variable de entorno ADMIN_EMAILS (lista de
 * emails separados por coma). Opcionalmente también se consulta la tabla
 * `admin_users` cuando la migración 00030 está aplicada, de modo que el
 * admin pueda gestionarse desde la BD.
 *
 * Uso dentro de un route handler:
 *   const { user } = await requireAdmin()
 *   if (!user) return 401 (el helper ya construye la respuesta)
 */
/**
 * Determina si un usuario autenticado es admin.
 *
 * Fuentes de verdad (cualquiera basta):
 * 1. ADMIN_EMAILS (env var) — bootstrap/emergencia.
 * 2. profiles.role = 'admin' (migración 00067) — gestionable desde /admin/usuarios.
 * 3. Tabla `admin_users` (migración 00030) — legado, se mantiene sincronizada.
 */
export async function isAdminUser(user: {
  id: string
  email?: string | null
}): Promise<boolean> {
  if (!user?.id) return false

  // 1) Env var ADMIN_EMAILS (bootstrap/emergencia)
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (user.email && adminEmails.length > 0) {
    if (adminEmails.includes(user.email.toLowerCase())) return true
  }

  try {
    const supabase = await createClient()

    // 2) profiles.role = 'admin' (fuente principal gestionable desde la UI)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle()

    if (profile?.role === "admin") return true

    // 3) Tabla admin_users (legado, migración 00030)
    const { data: adminRow, error } = await supabase
      .from("admin_users")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()

    return !error && !!adminRow
  } catch {
    // Tabla ausente o RLS — ignorar
    return false
  }
}

export async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user || !user.email) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      ),
    }
  }

  if (await isAdminUser(user)) {
    return { user, response: null }
  }

  return {
    user: null,
    response: NextResponse.json(
      { error: "Acceso restringido a administradores" },
      { status: 403 }
    ),
  }
}
