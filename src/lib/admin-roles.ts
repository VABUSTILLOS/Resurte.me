/**
 * Reglas de negocio puras para la gestión de roles desde /admin/usuarios.
 * Separadas de la server action para poder testearlas sin BD.
 */

export const MANAGED_ROLES = ["admin", "vendedor", "cliente"] as const
export type ManagedUserRole = (typeof MANAGED_ROLES)[number]

export function isManagedRole(role: string): role is ManagedUserRole {
  return (MANAGED_ROLES as readonly string[]).includes(role)
}

export interface RoleChangeInput {
  callerId: string
  targetId: string
  newRole: string
  /** Cuántos admins quedan en el sistema excluyendo al target. */
  otherAdminsCount: number
}

/**
 * Valida un cambio de rol. Devuelve un mensaje de error o null si es válido.
 *
 * Reglas:
 * - El rol debe ser uno de MANAGED_ROLES.
 * - Un admin no puede quitarse su propio rol de admin.
 * - El sistema siempre debe conservar al menos un admin.
 */
export function validateRoleChange(input: RoleChangeInput): string | null {
  if (!isManagedRole(input.newRole)) {
    return `Rol inválido: ${input.newRole}`
  }
  if (input.callerId === input.targetId && input.newRole !== "admin") {
    return "No puedes quitarte tu propio rol de administrador"
  }
  if (input.newRole !== "admin" && input.otherAdminsCount === 0) {
    return "Debe quedar al menos un administrador en el sistema"
  }
  return null
}
