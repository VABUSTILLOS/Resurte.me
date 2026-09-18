/**
 * Permisos granulares del área /admin.
 *
 * POR QUÉ EXISTE: el acceso admin era todo-o-nada. `MANAGED_ROLES` solo
 * admitía `admin`/`vendedor`/`cliente` (`src/lib/admin-roles.ts`) y el `CHECK`
 * de la base lo confirmaba (`00067:17`), así que **cualquier** admin podía tocar
 * el catálogo, el dinero, las cuentas y la bitácora. Un colaborador de finanzas
 * necesitaba necesariamente el mismo poder que el dueño del producto.
 *
 * QUÉ NO HACE: **no reemplaza `profiles.role`**. El rol sigue siendo la puerta
 * (`admin` o no) y `is_admin()` sigue gobernando RLS. Este módulo añade un
 * segundo eje —*qué dominios* dentro de /admin— sobre una puerta que ya existía.
 * Cambiar la puerta habría obligado a tocar 58 rutas, 20 secciones, el `CHECK`
 * de la base, tres policies RLS y `admin_users`; añadir un eje deja intacto todo
 * lo que ya funcionaba.
 *
 * SEMÁNTICA DEL ÁMBITO (la parte que hay que entender antes de tocar nada):
 *
 *   `scope === null`  → **sin restringir**: el admin ve todo. Es el estado de
 *                       todo admin existente y el valor de la columna hasta que
 *                       alguien lo restringe a mano.
 *   `scope === []`    → restringido a **nada**. Es un estado legítimo (y útil:
 *                       deja la cuenta lista pero sin acceso).
 *   `scope === [...]` → exactamente esos dominios.
 *
 * La distinción `null` vs `[]` es la que impide el fallo catastrófico: si un
 * ámbito restringido se representara con "la lista está vacía", borrar las filas
 * de permisos por error **promovería** al usuario a admin completo. Aquí lo
 * degradaría. Por eso el ámbito se guarda como columna `TEXT[]` anulable y no
 * como tabla de concesiones: `NULL` y `'{}'` son distinguibles en la base, y una
 * tabla con cero filas no lo es.
 *
 * Módulo puro: sin BD, sin Next, sin `process.env`. Se prueba sin dobles.
 */

/** Dominios en los que se divide /admin. */
export const ADMIN_PERMISSIONS = [
  "productos",
  "pedidos",
  "comisiones",
  "marketing",
  "clientes",
  "sistema",
] as const

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number]

/** Etiqueta visible. Se usa en el editor de accesos y en el aviso de denegación. */
export const ADMIN_PERMISSION_LABEL: Record<AdminPermission, string> = {
  productos: "Catálogo",
  pedidos: "Operación",
  comisiones: "Dinero de la red",
  marketing: "Crecimiento",
  clientes: "Clientes",
  sistema: "Sistema",
}

/** Qué habilita cada dominio, en una frase. Se muestra junto a la casilla. */
export const ADMIN_PERMISSION_DESCRIPTION: Record<AdminPermission, string> = {
  productos: "Productos, categorías, precios, imágenes y proveedores.",
  pedidos: "Pedidos, repartidores, incidencias y métricas de operación.",
  comisiones:
    "Comisiones de vendedores, liquidaciones, reembolsos de FoodOS y la comisión de plataforma.",
  marketing: "Cupones, leads, SEO con IA, WhatsApp y generación de contenido.",
  clientes: "Usuarios, recompensas, restaurantes y su revisión.",
  sistema: "Bitácoras de auditoría, conversión y diagnóstico de la plataforma.",
}

export function isAdminPermission(value: unknown): value is AdminPermission {
  return typeof value === "string" && (ADMIN_PERMISSIONS as readonly string[]).includes(value)
}

/**
 * Ámbito de un admin. `null` = sin restringir (ve todo).
 *
 * No es `AdminPermission[] | null` a secas en los puntos de entrada porque el
 * valor llega de una columna de la base y puede ser cualquier cosa.
 */
export type AdminScope = AdminPermission[] | null

/**
 * Normaliza el valor crudo de `profiles.admin_permissions`.
 *
 * Reglas:
 * - `null`/`undefined` → `null` (sin restringir).
 * - Un array → los valores **válidos** que contenga, sin duplicados y en el
 *   orden canónico de `ADMIN_PERMISSIONS`. Un valor desconocido se descarta en
 *   vez de romper: la base no puede contener basura (tiene un `CHECK`) pero una
 *   migración futura podría retirar un permiso y las filas viejas sobrevivirían.
 * - Cualquier otra cosa (string suelto, objeto) → `[]`, es decir **restringido a
 *   nada**. Un valor que no sabemos leer no puede conceder acceso: es el único
 *   lado seguro hacia el que fallar.
 */
export function parseAdminScope(raw: unknown): AdminScope {
  if (raw === null || raw === undefined) return null
  if (!Array.isArray(raw)) return []
  const seen = new Set(raw.filter(isAdminPermission))
  return ADMIN_PERMISSIONS.filter((permission) => seen.has(permission))
}

/** `true` solo para el ámbito sin restringir. `[]` **no** es admin completo. */
export function isFullAdminScope(scope: AdminScope): boolean {
  return scope === null
}

/**
 * Dominios efectivos de una cuenta.
 *
 * Un rol que no sea `admin` no tiene ninguno, aunque la columna traiga valores:
 * el ámbito solo recorta dentro de la puerta, nunca la abre.
 */
export function effectiveAdminPermissions(role: string, scope: AdminScope): AdminPermission[] {
  if (role !== "admin") return []
  if (scope === null) return [...ADMIN_PERMISSIONS]
  return scope
}

export function hasAdminPermission(
  role: string,
  scope: AdminScope,
  needed: AdminPermission
): boolean {
  if (role !== "admin") return false
  if (scope === null) return true
  return scope.includes(needed)
}

/**
 * Normaliza el ámbito tal como lo entrega un guard que puede no declararlo.
 *
 * `undefined` **no** es "sin restringir": es "nadie lo declaró". Como los
 * consumidores de este valor conceden poder (cambiar un rol, delegar dominios),
 * el valor ausente se resuelve al lado que niega. Es el mismo criterio que
 * `parseAdminScope`, que ante un valor ilegible devuelve `[]` y nunca `null`.
 */
export function normalizeCallerScope(scope: AdminScope | undefined): AdminScope {
  return scope === undefined ? [] : scope
}

/** Entrada del cambio de ámbito, separada de la server action para poder probarla. */export interface ScopeChangeInput {
  callerId: string
  targetId: string
  /** Ámbito de quien hace el cambio. `null` = sin restringir. */
  callerScope: AdminScope
}

/**
 * Valida un cambio de ámbito. Devuelve un mensaje de error o `null` si es válido.
 *
 * Dos reglas, y las dos existen porque **poder delegar es poder tener todo**:
 *
 * 1. Solo delega quien no está restringido. Si un admin con `clientes` pudiera
 *    escribir ámbitos, se concedería `comisiones` a sí mismo en el siguiente
 *    clic: la restricción sería decorativa. El ámbito se recorta **desde
 *    arriba**, nunca desde dentro.
 * 2. Nadie cambia su propio ámbito. Un admin sin restricciones que se recorta a
 *    sí mismo se deja fuera de la pantalla que lo desharía, y la única salida
 *    sería SQL. Es la misma razón por la que `validateRoleChange` impide que un
 *    admin se quite su propio rol.
 */
export function validateScopeChange(input: ScopeChangeInput): string | null {
  if (!isFullAdminScope(input.callerScope)) {
    return "Solo un administrador con acceso completo puede cambiar los permisos"
  }
  if (input.callerId === input.targetId) {
    return "No puedes cambiar tus propios permisos"
  }
  return null
}

/**
 * Dominio al que pertenece una ruta de /admin, o `null` si la ruta no tiene
 * dominio (`/admin`, el dashboard: cualquier admin lo ve).
 *
 * `undefined` = la ruta **no está declarada**. Es distinto de `null` a
 * propósito: `null` es una decisión ("aquí no hay dominio") y `undefined` es un
 * olvido, y se tratan al revés (ver `canAccessAdminPath`).
 *
 * Gana la coincidencia **más larga**, así `/admin/foodos/dispersiones` no se
 * resuelve como `/admin/foodos`. Por eso `/admin` lleva `exact: true`: sin eso
 * su prefijo casaría con *cualquier* ruta hija y toda sección no declarada
 * heredaría su `permission: null`, que es justo el fail-open que hay que evitar.
 */
export const ADMIN_SECTIONS: ReadonlyArray<{
  path: string
  permission: AdminPermission | null
  /** Solo casa la ruta exacta, no sus hijas. */
  exact?: boolean
}> = [
  { path: "/admin", permission: null, exact: true },
  // Catálogo
  { path: "/admin/productos", permission: "productos" },
  { path: "/admin/proveedores", permission: "productos" },
  // Operación
  { path: "/admin/pedidos", permission: "pedidos" },
  { path: "/admin/repartidores", permission: "pedidos" },
  // Dinero de la red
  { path: "/admin/comisiones", permission: "comisiones" },
  { path: "/admin/foodos/dispersiones", permission: "comisiones" },
  // Crecimiento
  { path: "/admin/marketing", permission: "marketing" },
  { path: "/admin/leads", permission: "marketing" },
  { path: "/admin/seo-ia", permission: "marketing" },
  { path: "/admin/whatsapp", permission: "marketing" },
  // Clientes
  { path: "/admin/usuarios", permission: "clientes" },
  { path: "/admin/recompensas", permission: "clientes" },
  { path: "/admin/restaurantes", permission: "clientes" },
  { path: "/admin/foodos/restaurantes", permission: "clientes" },
  { path: "/admin/operar", permission: "clientes" },
  // Sistema
  { path: "/admin/conversion", permission: "sistema" },
  { path: "/admin/bitacoras", permission: "sistema" },
  { path: "/admin/sistema", permission: "sistema" },
]

/** Quita query, hash y barra final para que las comparaciones sean estables. */
function normalizePath(pathname: string): string {
  const withoutQuery = pathname.split("?")[0] ?? ""
  const withoutHash = withoutQuery.split("#")[0] ?? ""
  if (withoutHash.length > 1 && withoutHash.endsWith("/")) {
    return withoutHash.slice(0, -1)
  }
  return withoutHash
}

export function adminSectionForPath(pathname: string): AdminPermission | null | undefined {
  const path = normalizePath(pathname)
  if (path !== "/admin" && !path.startsWith("/admin/")) return undefined

  let best: { path: string; permission: AdminPermission | null } | null = null
  for (const section of ADMIN_SECTIONS) {
    const isMatch =
      path === section.path || (!section.exact && path.startsWith(`${section.path}/`))
    if (!isMatch) continue
    if (!best || section.path.length > best.path.length) best = section
  }
  return best ? best.permission : undefined
}

/**
 * ¿Puede esta cuenta abrir esta ruta de /admin?
 *
 * El caso `undefined` (ruta no declarada) **deniega a los admins restringidos**
 * y concede a los completos. Una sección nueva sin declarar no puede convertirse
 * en una puerta abierta para quien tiene el ámbito recortado; el contrato
 * `src/lib/admin-sections.contract.test.ts` impide que eso ocurra en la práctica.
 */
export function canAccessAdminPath(
  role: string,
  scope: AdminScope,
  pathname: string
): boolean {
  if (role !== "admin") return false
  const section = adminSectionForPath(pathname)
  if (section === undefined) return isFullAdminScope(scope)
  if (section === null) return true
  return hasAdminPermission(role, scope, section)
}

/**
 * Filtra las secciones de navegación que la cuenta puede usar.
 *
 * El sub-nav se construye con esto para que un admin restringido no vea una
 * pestaña que le va a responder 403: la misma decisión que toma el guard de la
 * página, tomada una vez.
 */
export function filterAdminNav<T extends { href: string }>(
  role: string,
  scope: AdminScope,
  items: readonly T[]
): T[] {
  return items.filter((item) => canAccessAdminPath(role, scope, item.href))
}

/**
 * Formatea el ámbito para mostrarlo en una tabla: `"Todos"`, `"Ninguno"` o la
 * lista de etiquetas separadas por comas.
 */
export function describeAdminScope(scope: AdminScope): string {
  if (scope === null) return "Todos"
  if (scope.length === 0) return "Ninguno"
  return scope.map((permission) => ADMIN_PERMISSION_LABEL[permission]).join(", ")
}
