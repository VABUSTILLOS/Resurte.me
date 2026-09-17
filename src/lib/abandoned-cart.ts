/**
 * Predicado único de carrito abandonado.
 *
 * Lo consumen dos superficies que **deben** coincidir:
 *
 *   1. el motor de recuperación (`src/lib/email-workflows.ts`), que decide a
 *      qué pedidos les manda la secuencia de 3 toques;
 *   2. el embudo de conversión (`src/lib/conversion-funnel.ts`), que reporta
 *      cuántos carritos están abandonados.
 *
 * Cuando cada uno llevaba su propia copia de la condición, el panel podía
 * afirmar "0 abandonados" mientras el motor mandaba correos, o al revés. Aquí
 * vive la definición y los dos la importan: la deriva deja de ser posible.
 *
 * Módulo puro: sin Supabase y sin React, para poder probar los bordes.
 */

/** Estados que debe cumplir un pedido para seguir siendo un carrito vivo. */
export const ABANDONED_CART_STATUS = "pending" as const
export const ABANDONED_CART_PAYMENT_STATUS = "pending" as const

/**
 * Métodos que NO pueden abandonarse aunque el pedido siga `pending`.
 *
 * Contra entrega es el único: el pedido en efectivo permanece `pending` hasta
 * que la tienda lo confirma y lo entrega, pero ya es un pedido real en espera,
 * no un carrito que alguien dejó a medias.
 *
 * OXXO, SPEI y CoDi **sí** cuentan como abandonados: el cliente eligió pagar,
 * todavía no ha pagado, y el pedido se queda `pending` hasta que lo haga.
 */
export const ABANDONED_CART_EXCLUDED_METHODS = ["cash_on_delivery"] as const

/**
 * Edad mínima (horas) antes de considerar un carrito abandonado. Es el inicio
 * de la ventana del primer toque: por debajo de esto el cliente puede estar
 * pagando todavía.
 */
export const ABANDONED_CART_MIN_AGE_HOURS = 2

/** Lo mínimo que necesita el predicado de cada pedido. */
export interface AbandonableOrder {
  status: string
  payment_status: string | null
  payment_method: string | null
}

/** true si el método está excluido del abandono (p. ej. contra entrega). */
export function isExcludedPaymentMethod(method: string | null | undefined): boolean {
  return (ABANDONED_CART_EXCLUDED_METHODS as readonly string[]).includes(method ?? "")
}

/**
 * true si el pedido es un carrito abandonado: sigue vivo, sin pagar, por un
 * método que puede abandonarse y con la antigüedad mínima cumplida.
 *
 * `ageHours` es opcional: el motor ya acota por fecha en SQL (su ventana son
 * 74 h), así que solo el panel necesita evaluar la edad.
 */
export function isAbandonedCartOrder(
  order: AbandonableOrder,
  ageHours?: number | null,
): boolean {
  if (order.status !== ABANDONED_CART_STATUS) return false
  if (order.payment_status !== ABANDONED_CART_PAYMENT_STATUS) return false
  if (isExcludedPaymentMethod(order.payment_method)) return false
  if (ageHours !== undefined && ageHours !== null && ageHours < ABANDONED_CART_MIN_AGE_HOURS) {
    return false
  }
  return true
}

/** Horas transcurridas desde la creación; `null` si la fecha es inválida. */
export function ageHoursOf(createdAt: string, now: Date = new Date()): number | null {
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return null
  return (now.getTime() - created.getTime()) / (60 * 60 * 1000)
}

/** Subconjunto de un constructor de consultas PostgREST que este módulo usa. */
interface AbandonedCartChain {
  eq(column: string, value: string): AbandonedCartChain
  or(filter: string): AbandonedCartChain
}

/**
 * Aplica a una consulta de `orders` exactamente la elegibilidad del abandono.
 *
 * Es la única forma admitida de escribirla: el motor la llama en vez de repetir
 * las tres condiciones a mano, de modo que si mañana se excluye otro método
 * basta con tocar `ABANDONED_CART_EXCLUDED_METHODS`.
 *
 * El genérico devuelve el mismo tipo que recibe para no romper el encadenado
 * (`.gte`, `.order`, …) del constructor de PostgREST. El cast intermedio existe
 * porque restringir `Q` a la firma real del constructor agota la recursión de
 * tipos de supabase-js (`TS2589`); aquí solo se usan `eq` y `not`.
 */
export function applyAbandonedCartFilter<Q>(query: Q): Q {
  const chain = query as unknown as AbandonedCartChain
  const filtered = chain
    .eq("status", ABANDONED_CART_STATUS)
    .eq("payment_status", ABANDONED_CART_PAYMENT_STATUS)
    .or(abandonedCartMethodFilter())
  return filtered as unknown as Q
}

/**
 * Condición PostgREST que replica `isExcludedPaymentMethod`.
 *
 * El `payment_method IS NULL` explícito NO es decorativo. PostgREST traduce
 * `not.in.(…)` a `NOT (payment_method IN (…))`, y en SQL `NULL IN (…)` es
 * `NULL`, así que la fila queda fuera del `WHERE`. En JS, en cambio,
 * `isExcludedPaymentMethod(null)` devuelve `false` y el pedido SÍ cuenta como
 * abandonado. Esa asimetría hacía que el panel pudiera reportar un abandono que
 * el motor nunca iba a contactar — exactamente la deriva que este módulo
 * existe para impedir. Con el `IS NULL` las dos definiciones coinciden.
 *
 * Un pedido sin método de pago es el abandono más literal que hay: el cliente
 * nunca llegó a elegir cómo pagar.
 */
export function abandonedCartMethodFilter(): string {
  const excluded = ABANDONED_CART_EXCLUDED_METHODS.join(",")
  return `payment_method.is.null,payment_method.not.in.(${excluded})`
}
