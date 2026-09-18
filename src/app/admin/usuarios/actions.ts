"use server"

import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { logAdminAction } from "@/lib/audit-log"
import { requireAdmin } from "@/lib/admin-auth"
import {
  isFullAdminScope,
  normalizeCallerScope,
  parseAdminScope,
  validateScopeChange,
  type AdminPermission,
  type AdminScope,
} from "@/lib/admin-permissions"
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
  /**
   * Dominios de /admin de esta cuenta. `null` = sin restringir. Solo tiene
   * efecto cuando `role === "admin"`: en los demás roles la columna puede traer
   * valores y se ignoran (el ámbito recorta dentro de la puerta, no la abre).
   */
  adminScope: AdminScope
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
  const { response: adminDenied } = await requireAdmin({ permission: "clientes" })
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
    .select("id, full_name, role, admin_permissions")
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
      adminScope: parseAdminScope(profile?.admin_permissions),
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
 * - Solo admins con el dominio de clientes (requireAdmin).
 * - Un admin no puede quitarse su propio rol de admin.
 * - El sistema siempre debe conservar al menos un admin.
 * - Mantiene sincronizada la tabla legado admin_users (migración 00030).
 * - **Conceder o retirar `admin` exige un admin sin restringir.** Quien puede
 *   nombrar admins puede nombrarse un cómplice con acceso total, así que la
 *   llave de la puerta no se delega. Cambiar entre los roles no-admin sigue
 *   siendo trabajo normal del dominio de clientes.
 */
export async function setUserRole(
  userId: string,
  role: ManagedUserRole
): Promise<{ ok: true }> {
  const {
    user: caller,
    response: adminDenied,
    permissions: callerScope,
  } = await requireAdmin({ permission: "clientes" })
  if (adminDenied || !caller) throw new Error("Acceso restringido a administradores")

  if (role === "admin" && !isFullAdminScope(normalizeCallerScope(callerScope))) {
    throw new Error("Solo un administrador con acceso completo puede conceder el rol de admin")
  }

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

  await logAdminAction(supabase, {
    actorId: caller.id,
    actorEmail: caller.email ?? null,
    action: "user_role",
    entity: "profiles",
    entityId: userId,
    detail: { role },
  })

  logger.info(`Admin ${caller.email} cambió rol de ${userId} a ${role}`)
  return { ok: true }
}

/**
 * Cambia los dominios de /admin a los que tiene acceso una cuenta.
 *
 * `scope === null` quita la restricción (acceso a todo lo que la puerta de
 * admin ya permitía); un arreglo restringe a esos dominios. Pasar `[]` deja la
 * cuenta dentro de /admin pero sin poder abrir ninguna sección — un estado
 * válido y reversible, útil para dejar a alguien en pausa sin quitarle el rol.
 *
 * Reglas (ver `validateScopeChange`):
 * - Solo delega un admin **sin restringir**. Si un admin restringido pudiera
 *   escribir ámbitos se concedería el resto a sí mismo en el siguiente clic.
 * - Nadie cambia su propio ámbito: un admin que se recorta se deja fuera de la
 *   pantalla que lo desharía.
 * - El destino debe ser admin. Guardar un ámbito en una cuenta que no lo es
 *   haría que la UI pareciera funcionar sin efecto alguno.
 *
 * Al degradar una cuenta a un rol no-admin el ámbito **no se borra**: si se la
 * vuelve a promover, la restricción sigue puesta, que es el lado seguro del
 * error.
 */
export async function setAdminPermissions(
  userId: string,
  scope: AdminPermission[] | null
): Promise<{ ok: true }> {
  const {
    user: caller,
    response: adminDenied,
    permissions: callerScope,
  } = await requireAdmin()
  if (adminDenied || !caller) throw new Error("Acceso restringido a administradores")

  const validationError = validateScopeChange({
    callerId: caller.id,
    targetId: userId,
    callerScope: normalizeCallerScope(callerScope),
  })
  if (validationError) throw new Error(validationError)

  const supabase = await createServiceClient()

  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("role, admin_permissions")
    .eq("id", userId)
    .maybeSingle()
  if (targetError) {
    logger.error("setAdminPermissions target:", targetError.message)
    throw new Error("No se pudo verificar el usuario")
  }
  if (!target) throw new Error("El usuario no existe")
  if (target.role !== "admin") {
    throw new Error("Solo se pueden restringir cuentas con rol de administrador")
  }

  // Normaliza y descarta dominios desconocidos. Un valor ilegible se resuelve a
  // `[]` (degradar) y nunca a `null` (ascender).
  const nextScope = parseAdminScope(scope)
  const previousScope = parseAdminScope(target.admin_permissions)

  const { error: writeError } = await supabase
    .from("profiles")
    .update({ admin_permissions: nextScope })
    .eq("id", userId)
  if (writeError) {
    logger.error("setAdminPermissions update:", writeError.message)
    throw new Error("No se pudieron actualizar los permisos")
  }

  await logAdminAction(supabase, {
    actorId: caller.id,
    actorEmail: caller.email ?? null,
    action: "user_permissions",
    entity: "profiles",
    entityId: userId,
    detail: { previous: previousScope, scope: nextScope },
  })

  logger.info(`Admin ${caller.email} cambió permisos de ${userId} a ${nextScope?.join(",") ?? "todos"}`)
  return { ok: true }
}
