/**
 * Roles de personal del panel (Fase 4.6, migración 00058).
 *
 * Matriz herramienta×rol: qué herramientas puede usar cada rol. El
 * dueño siempre tiene acceso total; los miembros se limitan según su
 * rol. La misma matriz se aplica en la UI (ocultar herramientas) y en
 * las API routes (403 cuando el rol no puede escribir esa clave).
 */

export type PanelRole = "dueno" | "gerente" | "cocina" | "mesero"

/** Roles asignables a miembros (el dueño no es un miembro). */
export type MemberRole = Exclude<PanelRole, "dueno">

export const MEMBER_ROLES: MemberRole[] = ["gerente", "cocina", "mesero"]

/** Clave de herramienta = segmento de ruta bajo /panel. */
export type PanelToolKey =
  | "costeo" | "planificador" | "mermas" | "rentabilidad" | "analitica"
  | "temporada" | "apertura" | "comanda" | "inventario" | "ventas"
  | "foodos" | "personal"

export const TOOL_ACCESS: Record<PanelToolKey, PanelRole[]> = {
  costeo: ["dueno", "gerente"],
  planificador: ["dueno", "gerente"],
  mermas: ["dueno", "gerente", "cocina"],
  rentabilidad: ["dueno", "gerente"],
  analitica: ["dueno", "gerente"],
  temporada: ["dueno", "gerente"],
  apertura: ["dueno", "gerente"],
  comanda: ["dueno", "gerente", "cocina", "mesero"],
  inventario: ["dueno", "gerente", "cocina"],
  ventas: ["dueno", "gerente", "mesero"],
  foodos: ["dueno", "gerente"],
  personal: ["dueno"],
}

export function canAccessTool(role: PanelRole, tool: PanelToolKey): boolean {
  return TOOL_ACCESS[tool]?.includes(role) ?? false
}

/** Herramientas visibles para un rol (para filtrar grids y navs). */
export function toolsForRole(role: PanelRole): PanelToolKey[] {
  return (Object.keys(TOOL_ACCESS) as PanelToolKey[]).filter((k) => canAccessTool(role, k))
}

/**
 * Permiso de escritura por clave de storage. Lectura: cualquier miembro
 * activo lee las claves de las herramientas a las que tiene acceso.
 *
 * rows:  ventas-entries, mermas-entries, comanda-entries,
 *        inventario-movimientos, planificador-servicios
 * entries: panel-config* solo la escribe el dueño (gerente la lee).
 */
const ROWS_WRITE_ACCESS: Record<string, PanelRole[]> = {
  "ventas-entries": ["dueno", "gerente", "mesero"],
  "mermas-entries": ["dueno", "gerente", "cocina"],
  "comanda-entries": ["dueno", "gerente", "cocina", "mesero"],
  "inventario-movimientos": ["dueno", "gerente", "cocina"],
  "planificador-servicios": ["dueno", "gerente"],
}

export function canWriteRows(role: PanelRole, tool: string): boolean {
  const allowed = ROWS_WRITE_ACCESS[tool]
  if (!allowed) return role === "dueno" || role === "gerente" // herramientas futuras: operación general
  return allowed.includes(role)
}

export function canReadRows(role: PanelRole, tool: string): boolean {
  return canWriteRows(role, tool) || role === "dueno" || role === "gerente"
}

/** Config del panel (umbrales, metas): solo el dueño la modifica. */
function isConfigKey(key: string): boolean {
  return key === "panel-config" || key.startsWith("panel-config-")
}

/** Claves de panel_entries → herramienta que las gobierna. */
const ENTRY_KEY_PREFIX: [string, PanelToolKey][] = [
  ["ventas-", "ventas"],
  ["comanda-", "comanda"],
  ["inventario-", "inventario"],
  ["mermas-", "mermas"],
  ["merma-", "mermas"],
  ["planificador-", "planificador"],
  ["costeo-", "costeo"],
  ["shared-dishes", "costeo"],
  ["temporada-", "temporada"],
  ["apertura-", "apertura"],
  ["rentabilidad-", "rentabilidad"],
  ["foodos-", "foodos"],
  ["alertas-", "analitica"],
]

function toolForEntryKey(key: string): PanelToolKey | null {
  for (const [prefix, tool] of ENTRY_KEY_PREFIX) {
    if (key.startsWith(prefix)) return tool
  }
  return null
}

export function canWriteEntry(role: PanelRole, key: string): boolean {
  if (isConfigKey(key)) return role === "dueno"
  const tool = toolForEntryKey(key)
  if (!tool) return role === "dueno" || role === "gerente" // claves nuevas: default seguro
  return canAccessTool(role, tool)
}

/** Dishes (costeo): lo modifican dueño y gerente. */
export function canWriteDishes(role: PanelRole): boolean {
  return role === "dueno" || role === "gerente"
}

/** Respaldo completo: solo el dueño. */
export function canUseBackup(role: PanelRole): boolean {
  return role === "dueno"
}

/** Administración de personal: solo el dueño. */
export function canManageMembers(role: PanelRole): boolean {
  return role === "dueno"
}

export interface PanelMember {
  id: string
  member_email: string
  role: MemberRole
  status: "pendiente" | "activo"
  invite_token: string
  created_at: string
}

/**
 * Mapea una ruta /panel/<herramienta>[/…] a su clave en la matriz.
 * null = fuera de la matriz (hub /panel, /panel/unirse, rutas públicas)
 * → accesible para cualquier rol.
 */
export function toolKeyForPath(pathname: string): PanelToolKey | null {
  const seg = pathname.split("/")[2] ?? ""
  if (!seg) return null
  if ((Object.keys(TOOL_ACCESS) as string[]).includes(seg)) return seg as PanelToolKey
  return null
}
