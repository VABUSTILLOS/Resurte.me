"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { requireAdmin } from "@/lib/admin-auth"
import {
  isManagedRole,
  validateRoleChange,
  type ManagedUserRole,
} from "@/lib/admin-roles"

export type { ManagedUserRole } from "@/lib/admin-roles"

export interface ManagedUser {
  id: string
  email: string | null
  full_name: string | null
  role: ManagedUserRole
  created_at: string
  last_sign_in_at: string | null
}

/**
 * Lista usuarios del sitio para el panel /admin/usuarios.
 * Requiere admin; usa service_role para leer auth.users (emails) y todos
 * los profiles (RLS del client SDK solo devolvería los propios).
 *
 * `query` filtra por email o nombre (case-insensitive). Sin `query`,
 * devuelve los más recientes primero.
 */
export async function listUsers(
  query = "",
  limit = 50
): Promise<{ users: ManagedUser[]; total: number }> {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) throw new Error("Acceso restringido a administradores")

  const supabase = await createServiceClient()

  // Emails viven en auth.users — solo accesibles vía Admin API
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (authError) {
    logger.error("listUsers auth.admin.listUsers:", authError.message)
    throw new Error("No se pudo obtener la lista de usuarios")
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, role")
  if (profilesError) {
    logger.error("listUsers profiles:", profilesError.message)
    throw new Error("No se pudieron obtener los perfiles")
  }

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id, p] as const)
  )

  const normalizedQuery = query.trim().toLowerCase()

  let users: ManagedUser[] = authData.users.map((u) => {
    const profile = profileById.get(u.id)
    return {
      id: u.id,
      email: u.email ?? null,
      full_name:
        profile?.full_name ??
        (u.user_metadata?.full_name as string | undefined) ??
        null,
      role: isManagedRole(profile?.role ?? "")
        ? (profile?.role as ManagedUserRole)
        : "cliente",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
    }
  })

  if (normalizedQuery) {
    users = users.filter(
      (u) =>
        u.email?.toLowerCase().includes(normalizedQuery) ||
        u.full_name?.toLowerCase().includes(normalizedQuery)
    )
  }

  users.sort((a, b) => b.created_at.localeCompare(a.created_at))

  return { users: users.slice(0, limit), total: users.length }
}

/**
 * Cambia el rol de un usuario. Reglas de seguridad:
 * - Solo admins (requireAdmin).
 * - Un admin no puede quitarse su propio rol de admin.
 * - El sistema siempre debe conservar al menos un admin.
 * - Mantiene sincronizada la tabla legado admin_users (migración 00030).
 */
export async function setUserRole(
  userId: string,
  role: ManagedUserRole
): Promise<{ ok: true }> {
  const { user: caller, response: adminDenied } = await requireAdmin()
  if (adminDenied || !caller) throw new Error("Acceso restringido a administradores")

  const supabase = await createServiceClient()

  // Cuántos admins quedan excluyendo al target (para la regla del último admin)
  let otherAdminsCount = 0
  if (role !== "admin") {
    const { count, error: countError } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .neq("id", userId)
    if (countError) {
      logger.error("setUserRole count admins:", countError.message)
      throw new Error("No se pudo verificar los administradores restantes")
    }
    otherAdminsCount = count ?? 0
  }

  const validationError = validateRoleChange({
    callerId: caller.id,
    targetId: userId,
    newRole: role,
    otherAdminsCount,
  })
  if (validationError) throw new Error(validationError)

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
  if (updateError) {
    logger.error("setUserRole update:", updateError.message)
    throw new Error("No se pudo actualizar el rol")
  }

  // Sincronizar tabla legado admin_users (si existe)
  if (role === "admin") {
    await supabase
      .from("admin_users")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true })
  } else {
    await supabase.from("admin_users").delete().eq("user_id", userId)
  }

  logger.info(`Admin ${caller.email} cambió rol de ${userId} a ${role}`)
  return { ok: true }
}
