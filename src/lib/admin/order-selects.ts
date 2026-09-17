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
 * Nombre de la columna que falta cuando PostgREST responde `42703`.
 * El mensaje de Postgres es `column orders.coupon_code does not exist`; se
 * acepta con o sin el prefijo de tabla para no depender del formato exacto.
 * Devuelve `null` para cualquier columna que no sea una de las opcionales.
 */
export function missingOptionalOrderColumn(
  error: { code?: string | null; message?: string | null } | null
): AdminOrderOptionalColumn | null {
  if (!error || error.code !== "42703") return null
  const match = /column\s+(?:[\w"]+\.)?([\w"]+)\s+does not exist/i.exec(error.message ?? "")
  const column = match?.[1]?.replace(/"/g, "")
  if (!column || !isAdminOrderOptionalColumn(column)) return null
  return column
}
