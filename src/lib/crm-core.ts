/**
 * Ronda 7 — núcleo compartido del CRM de prospectos.
 *
 * Antes de esta ronda había **tres** lectores sobre `crm_prospects`, cada uno
 * con su propio tipo de fila, su propio mapeador y su propio vocabulario:
 *
 * - admin    (`crm-pipeline.ts` + `app/admin/actions.ts`)
 * - vendedor (`lib/comercializacion/**`)
 * - agente   (`lib/agente/actions.ts`)
 *
 * Este módulo es la **única autoridad** de lo que ambos roles comparten: el
 * vocabulario de estado, el contrato de fila, el mapeo desde PostgREST, las
 * columnas con su escalera de degradación y el **alcance por rol**.
 *
 * Módulo puro: sin Supabase, sin React, sin `next/*`. Se prueba en
 * `crm-core.contract.test.ts`.
 *
 * Regla de dependencias (acíclica, en un solo sentido):
 *
 *     crm-pipeline.ts ─┐
 *     crm-tags.ts ─────┼─→ crm-core.ts
 *     comercializacion/types.ts ─┘
 */

// ─────────────────────────────────────────────────────────────
// Vocabulario de estado
// ─────────────────────────────────────────────────────────────

/**
 * Estados del embudo comercial.
 *
 * Espejo exacto del `CHECK` de `crm_prospects.status` en
 * `00052_comercializacion.sql:30`. El contrato de `crm-core.contract.test.ts`
 * parsea esa migración y falla si las dos listas se separan: el vocabulario no
 * puede crecer por un lado sin migración que lo respalde.
 */
export const CRM_STATUSES = [
  "nuevo",
  "contactado",
  "en_seguimiento",
  "cliente_activo",
  "inactivo",
  "perdido",
] as const

export type CrmStatus = (typeof CRM_STATUSES)[number]

export const CRM_STATUS_LABEL: Record<CrmStatus, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  en_seguimiento: "En seguimiento",
  cliente_activo: "Cliente activo",
  inactivo: "Inactivo",
  perdido: "Perdido",
}

export function isCrmStatus(value: unknown): value is CrmStatus {
  return typeof value === "string" && (CRM_STATUSES as readonly string[]).includes(value)
}

/**
 * Estados que **cierran** el trato: el embudo ya no los cuenta como pipeline
 * abierto y `closed_at` puede estar presente.
 *
 * Es la lista espejo del índice parcial `idx_crm_prospects_open_pipeline` de
 * `00184`. `crm-core.contract.test.ts` parsea la migración y falla si las dos
 * listas se separan: un estado cerrado que no esté aquí seguiría sumando al
 * pipeline, y uno abierto que sí esté desaparecería del tablero.
 */
export const CRM_CLOSED_STATUSES = ["cliente_activo", "perdido"] as const

export function isCrmClosed(status: CrmStatus): boolean {
  return (CRM_CLOSED_STATUSES as readonly string[]).includes(status)
}

/**
 * Motivos de pérdida.
 *
 * Vocabulario cerrado, espejo del `CHECK` de `crm_prospects.loss_reason` en
 * `00184` (que a su vez exige `status = 'perdido'`). Sin motivo, un trato
 * perdido no deja aprendizaje: no se puede saber si el problema fue precio,
 * zona o producto, y el informe de pérdidas es una lista de "otro".
 *
 * Los siete son los que salieron de la cartera real: los cuatro primeros son
 * decisión del cliente, los tres últimos son del proveedor o del mercado.
 */
export const CRM_LOSS_REASONS = [
  "precio",
  "competencia",
  "sin_presupuesto",
  "no_contesta",
  "cerro_negocio",
  "fuera_de_zona",
  "otro",
] as const

export type CrmLossReason = (typeof CRM_LOSS_REASONS)[number]

export const CRM_LOSS_REASON_LABEL: Record<CrmLossReason, string> = {
  precio: "Precio",
  competencia: "Se fue con la competencia",
  sin_presupuesto: "Sin presupuesto",
  no_contesta: "Nunca contestó",
  cerro_negocio: "Cerró el negocio",
  fuera_de_zona: "Fuera de zona de reparto",
  otro: "Otro",
}

export function isCrmLossReason(value: unknown): value is CrmLossReason {
  return typeof value === "string" && (CRM_LOSS_REASONS as readonly string[]).includes(value)
}

/**
 * Campos de cierre que **hay que limpiar** cuando un cambio de estado mueve el
 * trato a `status`.
 *
 * Los dos `CHECK` de coherencia de `00184` hacen imposible guardar un motivo de
 * pérdida sobre un trato abierto o un `closed_at` sobre uno no cerrado. Eso
 * significa que cualquier ruta que escriba `status` —el desplegable del admin,
 * la edición del vendedor— tiene que aplicar este parche en el mismo `UPDATE`,
 * o la base rechaza la escritura entera.
 *
 * Devolver `{}` para `perdido` es deliberado: cerrar como perdido **sí** escribe
 * esos campos, pero lo hace `closeCrmProspect()`, no un cambio de estado suelto.
 * Aquí solo se limpia lo que dejaría de ser cierto.
 *
 *     crmStatusPatch("nuevo")          → { loss_reason: null, closed_at: null }
 *     crmStatusPatch("cliente_activo") → { loss_reason: null }
 *     crmStatusPatch("perdido")        → {}
 */
export function crmStatusPatch(status: CrmStatus): {
  loss_reason?: null
  closed_at?: null
} {
  return {
    ...(status === "perdido" ? {} : { loss_reason: null }),
    ...(isCrmClosed(status) ? {} : { closed_at: null }),
  }
}

// ─────────────────────────────────────────────────────────────
// Contrato de fila
// ─────────────────────────────────────────────────────────────

/**
 * Una fila de `crm_prospects` tal como la consumen las dos superficies.
 *
 * Campos obligatorios-pero-nullables: la escalera de columnas puede no traer
 * algunas columnas (migración sin aplicar) y en ese caso el valor es `null`, no
 * "desconocido". `null` nunca se convierte en `0` ni en `""`.
 */
export interface CrmProspectRow {
  id: number
  /** `null` = sin asignar (p.ej. un lead web convertido que nadie repartió). */
  seller_id: string | null
  /** Lead web de origen; `null` si el prospecto se capturó a mano. */
  lead_id: number | null
  name: string
  restaurant_name: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  city_id: number | null
  /** Nombre de la ciudad resuelto por el join `cities(name)`; `null` sin join. */
  city_name: string | null
  tier: number | null
  zone: string | null
  /**
   * Segmentación de prospección (00059). Nadie las escribía hasta la ronda 16:
   * el módulo `agente` las declaraba como columnas extra y las leía para armar
   * su prompt, así que razonaba sobre cuatro `null` permanentes. Están en el
   * contrato porque el formulario ahora las captura.
   */
  employees: number | null
  instagram: string | null
  weekly_volume_min: number | null
  weekly_volume_max: number | null
  status: CrmStatus
  /**
   * Valor **estimado** del trato (00184), en MXN. `null` = no estimado, nunca
   * `0`. No es el ingreso real: ese se deriva de `orders` vía `user_id`.
   */
  estimated_value: number | null
  /** Motivo de pérdida (00184). Solo puede estar presente si `status = 'perdido'`. */
  loss_reason: CrmLossReason | null
  /** Momento del cierre (00184). Solo si el trato está cerrado. */
  closed_at: string | null
  /** Vínculo a la cuenta real del restaurante; `null` si aún no se registró. */
  user_id: string | null
  referral_code: string | null
  last_contact_at: string | null
  next_follow_up_at: string | null
  notes: string | null
  source: string
  /** Etiquetas (00140), ya saneadas. Siempre arreglo: `[]` si no hay ninguna. */
  tags: string[]
  created_at: string
  updated_at: string
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function asNumberOrNull(value: unknown): number | null {
  return value != null ? Number(value) : null
}

/**
 * Un motivo de pérdida fuera del vocabulario se normaliza a `null`.
 *
 * El `CHECK` de 00184 hace imposible guardarlo, así que esto solo cubre el caso
 * de una base donde la migración no está aplicada (la columna llega `undefined`)
 * o de un valor escrito a mano por `psql`. Se normaliza en vez de conservarlo
 * porque el tipo tiene que ser total: un `CrmLossReason | string | null` obliga a
 * cada consumidor a tener una rama de respaldo, y esa rama es la que se olvida.
 */
function asLossReasonOrNull(value: unknown): CrmLossReason | null {
  return isCrmLossReason(value) ? value : null
}

/**
 * Lee `crm_prospects.tags` tal como llega de PostgREST.
 *
 * No normaliza ni aplica el tope: lo que ya está guardado se muestra tal cual.
 * Solo descarta lo que no sea texto y las repeticiones exactas.
 */
export function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== "string") continue
    const trimmed = item.trim()
    if (trimmed && !out.includes(trimmed)) out.push(trimmed)
  }
  return out
}

/**
 * Mapea una fila cruda de PostgREST al contrato compartido.
 *
 * Es el único mapeador: antes había dos (`toCrmProspectRow` en el admin y
 * `mapProspect` en el CRM de vendedores) que ya habían divergido en qué campos
 * copiaban. Las convenciones de `null` se conservan tal cual estaban:
 *
 * - `seller_id`: `String(null)` daría `"null"`, por eso se comprueba antes.
 * - numéricos: `null` ≠ `0`, así que un `0` legítimo no se pierde.
 */
export function mapCrmProspect(row: Record<string, unknown>): CrmProspectRow {
  const status = row.status
  const createdAt = String(row.created_at)
  return {
    id: Number(row.id),
    seller_id: row.seller_id != null ? String(row.seller_id) : null,
    lead_id: asNumberOrNull(row.lead_id),
    name: String(row.name),
    restaurant_name: asStringOrNull(row.restaurant_name),
    phone: asStringOrNull(row.phone),
    whatsapp: asStringOrNull(row.whatsapp),
    email: asStringOrNull(row.email),
    city_id: asNumberOrNull(row.city_id),
    city_name: asStringOrNull(row.city_name),
    tier: asNumberOrNull(row.tier),
    zone: asStringOrNull(row.zone),
    employees: asNumberOrNull(row.employees),
    instagram: asStringOrNull(row.instagram),
    weekly_volume_min: asNumberOrNull(row.weekly_volume_min),
    weekly_volume_max: asNumberOrNull(row.weekly_volume_max),
    // El `CHECK` de 00052 hace que `status` solo pueda valer uno de los seis;
    // el respaldo existe para que el tipo sea total, no para inventar datos.
    status: isCrmStatus(status) ? status : "nuevo",
    estimated_value: asNumberOrNull(row.estimated_value),
    loss_reason: asLossReasonOrNull(row.loss_reason),
    closed_at: asStringOrNull(row.closed_at),
    user_id: asStringOrNull(row.user_id),
    referral_code: asStringOrNull(row.referral_code),
    last_contact_at: asStringOrNull(row.last_contact_at),
    next_follow_up_at: asStringOrNull(row.next_follow_up_at),
    notes: asStringOrNull(row.notes),
    source: asStringOrNull(row.source) ?? "manual",
    tags: readTags(row.tags),
    created_at: createdAt,
    updated_at: asStringOrNull(row.updated_at) ?? createdAt,
  }
}

// ─────────────────────────────────────────────────────────────
// Columnas y degradación
// ─────────────────────────────────────────────────────────────

/** Columnas de `crm_prospects` en 00052 — existen en cualquier entorno. */
const COLUMNS_00052 = [
  "id",
  "seller_id",
  "name",
  "restaurant_name",
  "phone",
  "whatsapp",
  "email",
  "city_id",
  "status",
  "user_id",
  "referral_code",
  "last_contact_at",
  "next_follow_up_at",
  "notes",
  "source",
  "created_at",
  "updated_at",
] as const

/** 00059 añade la segmentación de prospección: tier, zona, plantilla y volumen. */
const COLUMNS_00059 = [
  ...COLUMNS_00052,
  "tier",
  "zone",
  "employees",
  "instagram",
  "weekly_volume_min",
  "weekly_volume_max",
]
/** 00139 añade el vínculo con el lead web de origen. */
const COLUMNS_00139 = [...COLUMNS_00059, "lead_id"]
/** 00140 añade las etiquetas. */
const COLUMNS_00140 = [...COLUMNS_00139, "tags"]
/** 00184 añade el cierre del trato y el valor estimado. */
const COLUMNS_00184 = [...COLUMNS_00140, "estimated_value", "loss_reason", "closed_at"]

/**
 * Escalera de degradación, de la más completa a la mínima.
 *
 * Cada escalón quita exactamente las columnas de **una** migración, para que el
 * lector pueda reintentar cuando `isMissingColumnError` indica que esa migración
 * aún no está aplicada (00139 y 00140 se escribieron antes de aplicarse, y
 * 00184 nace con la misma posibilidad).
 *
 * El orden importa: `crm-prospects.ts` recorre el arreglo de arriba abajo y
 * `crm-core.contract.test.ts` comprueba que cada escalón sea un superconjunto
 * estricto del siguiente. Un escalón fuera de sitio no rompe el `select`, pero
 * degrada de más y pierde columnas que sí existían.
 */
export const CRM_PROSPECT_COLUMN_SETS: readonly (readonly string[])[] = [
  COLUMNS_00184,
  COLUMNS_00140,
  COLUMNS_00139,
  COLUMNS_00059,
  COLUMNS_00052,
]

/** Lista de columnas lista para `.select()`, en el escalón más completo. */
export const CRM_PROSPECT_COLUMNS = COLUMNS_00184.join(", ")

/**
 * El mismo conjunto sin `tags`. Es el respaldo de una sola columna que usan las
 * lecturas puntuales cuando 00140 aún no está aplicada.
 */
export const CRM_PROSPECT_COLUMNS_WITHOUT_TAGS = COLUMNS_00139.join(", ")

/** Une un escalón con el join de ciudades que necesita el nombre de la ciudad. */
export function withCityJoin(columns: readonly string[]): string {
  return `${columns.join(", ")}, cities(name)`
}

// ─────────────────────────────────────────────────────────────
// Alcance por rol
// ─────────────────────────────────────────────────────────────

/**
 * Quién mira la tabla.
 *
 * - `admin`  ve todo, incluidos los prospectos sin asignar (`seller_id IS NULL`).
 * - `seller` ve **solo** su cartera.
 *
 * Los prospectos sin asignar son invisibles para el vendedor **por diseño**:
 * la política RLS `crm_prospects_owner_all` es `USING (seller_id = auth.uid())`
 * y un `NULL` no satisface esa igualdad. Nunca se añade `OR seller_id IS NULL`.
 *
 * Como todas las server actions usan `createServiceClient()`, que **omite RLS**,
 * este alcance tiene que ser una comprobación explícita en código. La política
 * de la base es la red de seguridad, no la barrera.
 */
export type CrmScope = { kind: "admin" } | { kind: "seller"; userId: string }

/** Alcance del admin, que no filtra nada. */
export const ADMIN_SCOPE: CrmScope = { kind: "admin" }

export function sellerScope(userId: string): CrmScope {
  return { kind: "seller", userId }
}

/**
 * Traduce el rol de la sesión al alcance de lectura.
 *
 * Cualquier rol que no sea `admin` se trata como vendedor. Es deliberado: el
 * único camino que amplía la visibilidad al pozo sin asignar es el nombre
 * exacto del rol, así que un rol nuevo (o desconocido) no lo hereda por
 * descuido.
 */
export function scopeForRole(role: string, userId: string): CrmScope {
  return role === "admin" ? ADMIN_SCOPE : sellerScope(userId)
}

/** ¿Esta fila entra en el alcance? */
export function isProspectInScope(
  prospect: Pick<CrmProspectRow, "seller_id">,
  scope: CrmScope,
): boolean {
  if (scope.kind === "admin") return true
  return prospect.seller_id !== null && prospect.seller_id === scope.userId
}

/**
 * Corta el acceso a una fila fuera de alcance.
 *
 * El mensaje es siempre `"Prospecto no encontrado"` y nunca `"Acceso denegado"`:
 * un vendedor no debe poder distinguir "no existe" de "es de otro", porque esa
 * diferencia filtra la existencia de prospectos ajenos.
 */
export function assertProspectInScope(
  prospect: Pick<CrmProspectRow, "seller_id">,
  scope: CrmScope,
): void {
  if (!isProspectInScope(prospect, scope)) {
    throw new Error("Prospecto no encontrado")
  }
}

/** Filtro de alcance como dato, para quien prefiera no encadenar la consulta. */
export function crmScopeFilter(scope: CrmScope): { column: "seller_id"; value: string } | null {
  return scope.kind === "seller" ? { column: "seller_id", value: scope.userId } : null
}

/**
 * Aplica el alcance a una consulta de PostgREST.
 *
 * Devuelve el mismo builder que recibe, así que el resultado sigue encadenando
 * `.order()`, `.range()`, etc. Para el admin no se añade ningún filtro — y en
 * particular **no** se añade `seller_id IS NULL` ni se excluyen los `NULL`.
 *
 * La firma es deliberadamente laxa. La variante estricta
 * (`T extends { eq(column, value): T }`) hace que TypeScript intente unificar el
 * builder real de PostgREST —que es genérico sobre la forma filtrada— consigo
 * mismo, y el compilador aborta con *"Type instantiation is excessively deep and
 * possibly infinite"*. El único punto donde eso importa es esta llamada, así que
 * el casteo vive aquí y no en cada consumidor.
 */
export function applyCrmScope<T>(query: T, scope: CrmScope): T {
  const filter = crmScopeFilter(scope)
  if (!filter) return query
  const builder = query as { eq(column: string, value: string): unknown }
  return builder.eq(filter.column, filter.value) as T
}

// ─────────────────────────────────────────────────────────────
// Primitivas de comparación
// ─────────────────────────────────────────────────────────────

/** Normaliza para comparar: minúsculas y sin acentos. */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

/** Sólo dígitos; `null` si no queda ninguno. Sirve para comparar teléfonos. */
export function digitsOf(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, "")
  return digits.length > 0 ? digits : null
}

/**
 * Clave de comparación de teléfonos. En México el número nacional son 10 dígitos
 * (LADA + número), y el mismo celular aparece como `+52 614…`, `52 1 614…` o
 * `614…` según quién lo capturó. Comparar los últimos 10 dígitos evita duplicar
 * la ficha por la pura lada del país. Números más cortos se comparan completos.
 */
export function phoneKey(value: string | null | undefined): string | null {
  const digits = digitsOf(value)
  if (!digits) return null
  return digits.length > 10 ? digits.slice(-10) : digits
}

/** Un seguimiento está vencido si tiene fecha y ya pasó. */
export function isFollowUpDue(nextFollowUpAt: string | null, now: Date = new Date()): boolean {
  if (!nextFollowUpAt) return false
  return new Date(nextFollowUpAt) <= now
}

// ─────────────────────────────────────────────────────────────
// Búsqueda y filtros
// ─────────────────────────────────────────────────────────────

export interface ProspectFilters {
  /** Texto libre sobre nombre, restaurante, correo y teléfono. */
  q?: string
  status?: CrmStatus | "todos"
  /**
   * Varios estados a la vez. La cola del agente pide cuatro activos más
   * `inactivo` de una sola pasada; `status` sólo admite uno.
   */
  statuses?: readonly CrmStatus[]
  /** Sólo los que tienen seguimiento vencido. */
  due?: boolean
  /** Sólo los que no tienen vendedor asignado. */
  unassigned?: boolean
  /** Sólo los que nadie ha trabajado: `nuevo` o con seguimiento vencido. */
  onlyPending?: boolean
}

/**
 * ¿Alguno de los campos coincide con la búsqueda?
 *
 * Además del texto normalizado, se comparan los dígitos: quien busca un teléfono
 * suele pegarlo tal cual lo tiene en el celular (`+52 614 123 4567`) o pegado
 * sin espacios, y `normalizeForSearch` no borra signos, así que sin esta segunda
 * pasada la búsqueda por teléfono fallaría según cómo se escribió.
 */
export function matchesSearch(
  q: string,
  fields: Array<string | null | undefined>,
  digitsFields: Array<string | null | undefined> = [],
): boolean {
  const needle = normalizeForSearch(q)
  if (!needle) return true
  const haystack = normalizeForSearch(fields.filter(Boolean).join(" "))
  if (haystack.includes(needle)) return true

  const needleDigits = digitsOf(q)
  if (!needleDigits) return false
  return digitsFields.some((value) => digitsOf(value)?.includes(needleDigits) ?? false)
}

export function matchesProspectFilters(
  p: CrmProspectRow,
  filters: ProspectFilters,
  now: Date = new Date(),
): boolean {
  if (filters.status && filters.status !== "todos" && p.status !== filters.status) return false
  if (filters.statuses?.length && !filters.statuses.includes(p.status)) return false
  if (filters.due && !isFollowUpDue(p.next_follow_up_at, now)) return false
  if (filters.unassigned && p.seller_id !== null) return false
  if (filters.onlyPending && p.status !== "nuevo" && !isFollowUpDue(p.next_follow_up_at, now)) {
    return false
  }

  if (filters.q) {
    return matchesSearch(
      filters.q,
      [p.name, p.restaurant_name, p.email, p.phone, p.whatsapp],
      [p.phone, p.whatsapp],
    )
  }
  return true
}

export function filterProspects(
  prospects: CrmProspectRow[],
  filters: ProspectFilters,
  now: Date = new Date(),
): CrmProspectRow[] {
  return prospects.filter((p) => matchesProspectFilters(p, filters, now))
}
