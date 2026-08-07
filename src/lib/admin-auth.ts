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

  // 1) Env var ADMIN_EMAILS (fuente primaria)
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (adminEmails.length > 0 && adminEmails.includes(user.email.toLowerCase())) {
    return { user, response: null }
  }

  // 2) Tabla admin_users (opcional, si existe la migración)
  if (adminEmails.length === 0) {
    try {
      const { data: adminRow, error } = await supabase
        .from("admin_users")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle()

      if (!error && adminRow) {
        return { user, response: null }
      }
    } catch {
      // Tabla ausente o RLS — ignorar y continuar
    }
  }

  return {
    user: null,
    response: NextResponse.json(
      { error: "Acceso restringido a administradores" },
      { status: 403 }
    ),
  }
}
