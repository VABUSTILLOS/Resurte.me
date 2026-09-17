/**
 * Columnas compartidas de las consultas de pedidos del panel admin.
 *
 * Vive fuera de `src/app/admin/actions.ts` porque ese archivo es
 * `"use server"` (solo puede exportar funciones async) y las páginas server
 * y las acciones del CRM necesitan exactamente el mismo string.
 *
 * ## Por qué el embed de `profiles` lleva hint de FK
 *
 * `orders` tiene DOS claves foráneas hacia `profiles`: `orders_user_id_fkey`
 * (por `user_id`) y `orders_seller_id_fkey` (por `seller_id`, añadida por la
 * migración 00052). Con dos relaciones, PostgREST rechaza el embed sin hint
 * con `PGRST201` ("more than one relationship was found for 'orders' and
 * 'profiles'") y el panel de pedidos deja de cargar. El hint fija el cliente
 * del pedido (`user_id`), que es el que el panel muestra.
 *
 * ## Columnas opcionales
 *
 * `coupon_code` y `driver_id` se leen como best-effort: si el esquema
 * desplegado aún no las tiene, PostgREST responde `42703` y el consumidor
 * reintenta sin ellas en lugar de romper la superficie (ver
 * `missingOptionalOrderColumn`). El esquema de referencia las define en
 * `supabase/migrations/` (driver_id en 00076, coupon_code en 00114).
 */

/** FK que desambigua el embed `orders → profiles` (cliente, no vendedor). */
export const ORDERS_PROFILE_FK = "orders_user_id_fkey"

/** Columnas de la dirección de entrega que consume el panel. */
export const ORDERS_ADDRESS_COLUMNS =
  "street, number, interior, neighborhood, city, state, zip_code, references"

/**
 * Columnas de `orders` que el panel lee como best-effort. Solo estas se
 * pueden omitir en el reintento por `42703`: acotar la lista evita que un
 * error real de esquema (una columna obligatoria ausente) se enmascare como
 * una degradación silenciosa.
 */
export const ADMIN_ORDER_OPTIONAL_COLUMNS = ["coupon_code", "driver_id"] as const

export type AdminOrderOptionalColumn = (typeof ADMIN_ORDER_OPTIONAL_COLUMNS)[number]

export function isAdminOrderOptionalColumn(
  value: string
): value is AdminOrderOptionalColumn {
  return (ADMIN_ORDER_OPTIONAL_COLUMNS as readonly string[]).includes(value)
}

export type AdminOrdersSelectOptions = {
  /** Incluir `coupon_code` (omitir cuando la columna no existe en el esquema). */
  coupon?: boolean
  /** Incluir `driver_id` (omitir cuando la columna no existe en el esquema). */
  driver?: boolean
}

/**
 * SELECT de la lista de pedidos del panel (`getAdminOrders`).
 * Solo las columnas que el panel mapea: la tabla `orders` es ancha (utm,
 * tokens, ids de Stripe, etc. no se usan aquí).
 */
export function buildAdminOrdersSelect({
  coupon = true,
  driver = true,
}: AdminOrdersSelectOptions = {}): string {
  return [
    "id",
    "user_id",
    "status",
    "subtotal",
    "delivery_fee",
    "discount",
    ...(coupon ? ["coupon_code"] : []),
    "total",
    "payment_method",
    "payment_status",
    "source",
    "created_at",
    `profiles!${ORDERS_PROFILE_FK}(full_name)`,
    `addresses(${ORDERS_ADDRESS_COLUMNS})`,
    ...(driver ? ["driver_id"] : []),
  ].join(", ")
}

/**
 * SELECT del ticket imprimible (`/admin/pedidos/[id]/print`).
 * `delivery_drivers` y `addresses` tienen una sola FK hacia `orders`, así que
 * no necesitan hint.
 */
export function buildAdminOrderPrintSelect({
  coupon = true,
}: AdminOrdersSelectOptions = {}): string {
  return [
    "id",
    "status",
    "subtotal",
    "discount",
    ...(coupon ? ["coupon_code"] : []),
    "delivery_fee",
    "total",
    "payment_method",
    "payment_status",
    "created_at",
    "scheduled_for",
    "customer_phone",
    `profiles!${ORDERS_PROFILE_FK}(full_name)`,
    `addresses(${ORDERS_ADDRESS_COLUMNS})`,
    "delivery_drivers(name)",
    "order_items(quantity, unit_price, products(name))",
  ].join(", ")
}

/**
 * Nombre de la columna que falta en un error `42703` (undefined_column).
 * El mensaje de Postgres es `column orders.coupon_code does not exist`; se
 * acepta con o sin el prefijo de tabla para no depender del formato exacto.
 */
export function missingColumnName(error: PostgrestErrorLike | null): string | null {
  if (!error || error.code !== "42703") return null
  const match = /column\s+(?:[\w"]+\.)?([\w"]+)\s+does not exist/i.exec(error.message ?? "")
  return match?.[1]?.replace(/"/g, "") ?? null
}

/**
 * Igual que `missingColumnName`, pero solo devuelve la columna cuando es una
 * de las opcionales: así un error de esquema real (una columna obligatoria
 * ausente) no se degrada en silencio.
 */
export function missingOptionalOrderColumn(
  error: PostgrestErrorLike | null
): AdminOrderOptionalColumn | null {
  const column = missingColumnName(error)
  if (!column || !isAdminOrderOptionalColumn(column)) return null
  return column
}

/** Forma mínima del error de PostgREST que consumen los reintentos. */
export interface PostgrestErrorLike {
  code?: string | null
  message?: string | null
}

/** Dirección embebida en un pedido (many-to-one: objeto único en runtime). */
export interface AdminOrderAddressRow {
  street: string
  number: string
  interior: string | null
  neighborhood: string
  city: string
  state: string
  zip_code: string
  references: string | null
}

/** Fila cruda de `orders` tal como la devuelve `buildAdminOrdersSelect`. */
export interface AdminOrderRow {
  id: number
  /** Nullable desde 00009: el checkout de invitado crea pedidos sin usuario. */
  user_id: string | null
  status: string
  subtotal: number | string
  delivery_fee: number | string
  discount: number | string | null
  /** Ausente cuando la columna no existe en el esquema desplegado (00114). */
  coupon_code?: string | null
  total: number | string
  payment_method: string | null
  payment_status: string
  source: string
  created_at: string
  /** Ausente cuando la columna no existe en el esquema desplegado (00076). */
  driver_id?: number | null
  profiles: { full_name: string | null } | { full_name: string | null }[] | null
  addresses: AdminOrderAddressRow | AdminOrderAddressRow[] | null
}

/** Fila cruda de `orders` tal como la devuelve `buildAdminOrderPrintSelect`. */
export interface AdminOrderPrintRow {
  id: number
  status: string
  subtotal: number | string
  discount: number | string | null
  coupon_code?: string | null
  delivery_fee: number | string
  total: number | string
  payment_method: string | null
  payment_status: string
  created_at: string
  scheduled_for: string | null
  customer_phone: string | null
  profiles: { full_name: string | null } | { full_name: string | null }[] | null
  addresses: AdminOrderAddressRow | AdminOrderAddressRow[] | null
  delivery_drivers: { name: string } | { name: string }[] | null
  order_items:
    | {
        quantity: number
        unit_price: number | string
        products: { name: string } | { name: string }[] | null
      }[]
    | null
}

/** Respuesta de una consulta a `orders` tipada con la fila que espera quien la consume. */
export interface OrderQueryResult<Row> {
  data: Row | null
  error: PostgrestErrorLike | null
}

/**
 * Nombre visible del cliente de un pedido.
 *
 * `orders.user_id` es nullable desde la migración 00009 (checkout de invitado
 * sin perfil), así que el embed `profiles` puede venir nulo y `customer_name`
 * quedar vacío. Sin esta guarda el panel hacía `null.slice(0, 8)` dentro del
 * `.map` de la tabla y el TypeError tumbaba toda la sección `/admin/pedidos`.
 */
export function orderCustomerLabel(order: {
  customer_name: string | null
  user_id: string | null
}): string {
  if (order.customer_name) return order.customer_name
  return order.user_id ? `Usuario #${order.user_id.slice(0, 8)}` : "Invitado"
}
