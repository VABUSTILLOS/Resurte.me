import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { safeNextPath } from "@/lib/safe-next"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import {
  type AdminPermission,
  type AdminScope,
  ADMIN_PERMISSION_LABEL,
  hasAdminPermission,
  parseAdminScope,
} from "@/lib/admin-permissions"

/**
 * Verifica que el request tenga una sesión de usuario admin.
 *
 * FUENTE DE VERDAD: `profiles.role = 'admin'`.
 *
 * POR QUÉ: la regla "este usuario es admin" estaba escrita cinco veces con
 * cuatro implementaciones distintas — `is_admin()` en SQL, tres policies RLS
 * con la regla copiada inline, y tres fuentes diferentes aquí. El resultado no
 * era un error visible sino un "éxito falso": un admin cuyo acceso viniera solo
 * de ADMIN_EMAILS o de la tabla `admin_users` pasaba este guard —y por tanto
 * todas las rutas /api/admin/*, que usan service_role y saltan RLS— pero
 * fallaba las policies RLS, que solo miran profiles.role. En vez de un 403
 * salían tablas vacías.
 *
 * CÓMO: ADMIN_EMAILS y `admin_users` siguen sirviendo para CONCEDER acceso,
 * pero en cuanto lo conceden esta función espeja el resultado a profiles.role,
 * así que la capa de app y la de base de datos convergen en lugar de discrepar.
 * La migración 00145 hace lo mismo del lado SQL: un trigger espeja
 * `admin_users` y las tres policies duplicadas pasan a llamar a `is_admin()`.
 *
 * ADMIN_EMAILS es además el bootstrap de emergencia: si la BD no responde,
 * concede igualmente el acceso (avisando), porque si no no serviría justo
 * cuando hace falta. Esa divergencia se muestra en /admin/sistema.
 */

/** De dónde vino el permiso de administrador. */
export type AdminAccessSource = "env" | "profile" | "legacy" | null

export type AdminAccess = {
  /** Si el usuario puede usar el panel de administración. */
  isAdmin: boolean
  /** Fuente que otorgó el permiso. `null` cuando no es admin. */
  source: AdminAccessSource
  /** true si `profiles.role` ya reconoce el permiso (RLS y app coinciden). */
  mirrored: boolean
  /** Motivo por el que las dos capas NO coinciden. `null` = todo bien. */
  warning: string | null
  /**
   * Dominios de /admin que puede usar. `null` = sin restringir (todos).
   *
   * Viene de `profiles.admin_permissions` y solo recorta dentro de la puerta:
   * un no-admin lo recibe igualmente, y quien lo consulte debe comprobar
   * `isAdmin` primero. La lectura es la misma consulta que ya traía el rol, así
   * que esto no añade ningún viaje a la base.
   */
  permissions: AdminScope
}

const NOT_ADMIN: AdminAccess = {
  isAdmin: false,
  source: null,
  mirrored: false,
  warning: null,
  permissions: null,
}

/** Emails del bootstrap de emergencia, normalizados. */
export function getAdminEmailAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false
  return getAdminEmailAllowlist().includes(email.toLowerCase())
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "error desconocido"
}

/**
 * Espeja un permiso concedido fuera de `profiles.role` hacia `profiles.role`,
 * que es la única columna que leen las policies RLS. Requiere service_role:
 * el trigger `protect_profile_role` impide que un usuario cambie su propio rol.
 *
 * Devuelve `null` si convergió, o el motivo por el que no pudo.
 */
async function mirrorRoleToProfile(userId: string): Promise<string | null> {
  try {
    const service = await createServiceClient()
    const { data, error } = await service
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", userId)
      .select("id")

    if (error) {
      return `No se pudo sincronizar profiles.role: ${error.message}`
    }
    if (!data || data.length === 0) {
      return "No existe la fila en profiles; RLS no reconocerá el acceso hasta crearla"
    }
    return null
  } catch (err) {
    return `No se pudo sincronizar profiles.role: ${describeError(err)}`
  }
}

/**
 * Resuelve el acceso admin y, de paso, de qué fuente viene.
 *
 * Se usa directamente en /admin/sistema para poder mostrar la divergencia;
 * el resto del código debería seguir usando `isAdminUser()` / `requireAdmin()`.
 */
export async function resolveAdminAccess(user: {
  id: string
  email?: string | null
}): Promise<AdminAccess> {
  if (!user?.id) return NOT_ADMIN

  const fromEnv = isAdminEmail(user.email)

  let profileRole: string | null = null
  let profileScope: AdminScope = null
  let readError: string | null = null

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("profiles")
      .select("role, admin_permissions")
      .eq("id", user.id)
      .maybeSingle()

    if (error) readError = error.message
    else {
      profileRole = data?.role ?? null
      profileScope = parseAdminScope(data?.admin_permissions)
    }
  } catch (err) {
    readError = describeError(err)
  }

  // Caso normal: profiles.role ya es la fuente de verdad y está de acuerdo.
  if (profileRole === "admin") {
    return {
      isAdmin: true,
      source: fromEnv ? "env" : "profile",
      mirrored: true,
      warning: null,
      permissions: profileScope,
    }
  }

  // Bootstrap de emergencia: concede aunque la BD no responda.
  if (fromEnv) {
    if (readError) {
      logger.warn("admin_auth.profile_read_failed", { error: readError })
      return {
        isAdmin: true,
        source: "env",
        mirrored: false,
        warning: `No se pudo leer profiles.role (${readError}); el acceso no está respaldado por RLS`,
        // No se pudo leer el ámbito. Conceder sin restringir es coherente con
        // esta rama: es el bootstrap de emergencia, que ya concede a ciegas.
        permissions: null,
      }
    }
    const warning = await mirrorRoleToProfile(user.id)
    if (warning) logger.warn("admin_auth.mirror_failed", { source: "env", error: warning })
    // La fila existe (la lectura fue bien), así que su ámbito se respeta aunque
    // el rol viniera de ADMIN_EMAILS: recortar aquí no impide el rescate.
    return { isAdmin: true, source: "env", mirrored: !warning, warning, permissions: profileScope }
  }

  if (readError) {
    logger.warn("admin_auth.profile_read_failed", { error: readError })
    return NOT_ADMIN
  }

  // Legado (00030): fila en admin_users sin el rol reflejado en profiles.
  // Solo puede pasar en una base de datos sin la migración 00145.
  try {
    const supabase = await createClient()
    const { data: adminRow, error } = await supabase
      .from("admin_users")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (error || !adminRow) return NOT_ADMIN

    const warning = await mirrorRoleToProfile(user.id)
    if (warning) logger.warn("admin_auth.mirror_failed", { source: "legacy", error: warning })
    return {
      isAdmin: true,
      source: "legacy",
      mirrored: !warning,
      warning,
      permissions: profileScope,
    }
  } catch {
    return NOT_ADMIN
  }
}

export async function isAdminUser(user: {
  id: string
  email?: string | null
}): Promise<boolean> {
  if (!user?.id) return false
  return (await resolveAdminAccess(user)).isAdmin
}

/**
 * Guard de las rutas y páginas de /admin.
 *
 * El parámetro es **opcional y añadido hacia atrás**: `requireAdmin()` sin
 * argumentos se comporta exactamente como antes (401 sin sesión, 403 si no es
 * admin), que es lo que hacen las 139 llamadas existentes y lo que simulan los
 * ~20 archivos de test que lo mockean con `vi.fn()`. Pasar `{ permission }`
 * añade una comprobación **encima** de la puerta, nunca en lugar de ella.
 *
 * Devuelve también el `permissions` del llamante para que las acciones que
 * **delegan** (cambiar rol o ámbito en /admin/usuarios) puedan exigir un admin
 * sin restringir sin volver a leer `profiles`.
 */
export async function requireAdmin(options?: { permission?: AdminPermission }): Promise<{
  user: { id: string; email?: string | null } | null
  response: NextResponse | null
  /**
   * Ámbito del llamante. `undefined` = el llamante no lo declaró (mocks
   * antiguos) y se trata como **restringido**, no como sin restringir: las dos
   * acciones que lo leen conceden poder, así que el default tiene que ser el
   * lado que niega.
   */
  permissions?: AdminScope | null
}> {
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
      permissions: null,
    }
  }

  const access = await resolveAdminAccess(user)

  if (!access.isAdmin) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Acceso restringido a administradores" },
        { status: 403 }
      ),
      permissions: null,
    }
  }

  const needed = options?.permission
  if (needed && !hasAdminPermission("admin", access.permissions, needed)) {
    // El mensaje nombra el dominio para que el 403 sea diagnosticable sin
    // acceso a la base: quien lo lea sabe qué pedir, no solo que no puede.
    return {
      user: null,
      response: NextResponse.json(
        { error: `Tu cuenta no tiene acceso a ${ADMIN_PERMISSION_LABEL[needed]}` },
        { status: 403 }
      ),
      permissions: null,
    }
  }

  return { user, response: null, permissions: access.permissions }
}

/**
 * Cabecera donde `src/proxy.ts` deja el pathname que pidió el visitante.
 *
 * Un layout de Next **no recibe la ruta**: `requireAdminPage()` corre desde
 * los layouts de `src/app/admin` y no tiene forma de saber si el usuario venía
 * de `/admin/comisiones` o de `/admin/productos`. Sin ese dato el guard solo
 * podía recordar un destino fijo, y **perdía el deep link**: quien abría una
 * sección concreta sin sesión iniciaba sesión y aterrizaba en el dashboard.
 */
export const ADMIN_PATH_HEADER = "x-pathname"

/**
 * URL de login recordando a dónde iba el usuario.
 *
 * Puro a propósito (sin `headers()`), para poder probar la construcción del
 * destino sin montar un request. `safeNextPath` sanea el valor aunque lo
 * escriba nuestro propio proxy: la cabecera viaja por la request y una
 * redirección abierta en el guard de `/admin` sería explotable.
 */
export function adminLoginPath(requested: string | null | undefined): string {
  return `/auth/login?next=${encodeURIComponent(safeNextPath(requested, "/admin"))}`
}

/**
 * Guard de las **páginas** de /admin (el de `requireAdmin()` es para las rutas
 * de API, que responden con un `NextResponse` en vez de redirigir).
 *
 * Mismo criterio que `requireAdmin`, distinta salida: un layout o una página no
 * puede devolver un 403, así que redirige. Sin sesión → login; sin el dominio
 * → el dashboard con un aviso, porque rebotar en silencio deja al usuario sin
 * saber si la sección no existe, si está rota o si no le corresponde.
 */
export async function requireAdminPage(options?: { permission?: AdminPermission }): Promise<{
  userId: string
  email: string
  permissions: AdminScope
}> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user || !user.email) {
    const requested = (await headers()).get(ADMIN_PATH_HEADER)
    redirect(adminLoginPath(requested))
  }

  const access = await resolveAdminAccess(user)
  if (!access.isAdmin) redirect("/")

  const needed = options?.permission
  if (needed && !hasAdminPermission("admin", access.permissions, needed)) {
    redirect(`/admin?sin-acceso=${needed}`)
  }

  return { userId: user.id, email: user.email, permissions: access.permissions }
}

/** Una fila de `admin_access_report()` (00145), lista para la UI. */
export type AdminAccessRow = {
  userId: string
  email: string | null
  profileRole: string
  inAdminUsers: boolean
}

/**
 * Emails del bootstrap que todavía NO están respaldados por `profiles.role`.
 *
 * Son los que hoy pasan el guard de la app pero no las policies RLS, es decir
 * la divergencia que hay que hacer visible. `resolveAdminAccess()` los corrige
 * en cuanto el usuario inicia sesión; si alguno sigue aquí, es que aún no ha
 * entrado o que el espejo falló.
 */
export function findUnconvergedAdminEmails(
  allowlist: string[],
  report: AdminAccessRow[]
): string[] {
  const converged = new Set(
    report
      .filter((row) => row.profileRole === "admin" && row.email)
      .map((row) => (row.email as string).toLowerCase())
  )
  return allowlist.filter((email) => !converged.has(email.toLowerCase()))
}

/**
 * Quién tiene acceso admin según la base de datos y por qué vía.
 *
 * `admin_access_report()` es service_role-only, así que este reporte solo
 * funciona con la service key. Si falta o la función no existe, devuelve el
 * error en vez de una lista vacía silenciosa.
 */
export async function getAdminAccessReport(): Promise<{
  rows: AdminAccessRow[]
  error: string | null
}> {
  try {
    const service = await createServiceClient()
    const { data, error } = await service.rpc("admin_access_report")
    if (error) return { rows: [], error: error.message }

    const raw = (data ?? []) as Array<{
      user_id: string
      email: string | null
      profile_role: string
      in_admin_users: boolean
    }>

    const rows: AdminAccessRow[] = raw.map((row) => ({
      userId: row.user_id,
      email: row.email,
      profileRole: row.profile_role,
      inAdminUsers: row.in_admin_users,
    }))
    return { rows, error: null }
  } catch (err) {
    return { rows: [], error: describeError(err) }
  }
}
