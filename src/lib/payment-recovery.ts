/**
 * Predicado único de recuperación de pagos.
 *
 * Gobierna el barrido `checkAndSendPaymentReminders()` (`src/lib/workflows.ts`),
 * que corre dentro del cron diario y hace dos cosas sobre los pedidos sin pagar:
 * recordarle al cliente que pague, y —pasadas 72 h— cancelar el pedido.
 *
 * POR QUÉ EXISTE ESTE MÓDULO. El barrido seleccionaba por
 * `payment_status = 'pending'` sin mirar el método de pago. Un pedido **contra
 * entrega nace `pending` por diseño** —el cliente paga al recibir, no antes—,
 * así que el barrido lo leía como un impago y lo cancelaba a las 72 h. En
 * producción eso mató los 4 pedidos contra entrega que existían, a las 87, 83,
 * 83 y 81 horas de crearse (la ventana del primer barrido diario después del
 * umbral). Además, antes de cancelarlos les mandaba un "paga tu pedido" a
 * clientes que habían elegido pagar al recibir.
 *
 * El repo ya tenía la regla escrita en otros tres sitios —`abandoned-cart.ts`,
 * `whatsapp-automations-engine.ts` y `reconcile-payments.ts`— cada uno con su
 * propia copia. Este módulo es la copia del barrido de pagos, y la razón de que
 * sea un módulo y no un `.not(...)` suelto es que la condición tiene que
 * coincidir entre la consulta (SQL) y el bucle (JS): cuando cada una lleva su
 * versión, una filtra lo que la otra procesa.
 *
 * Módulo puro: sin Supabase y sin React, para poder probar los bordes.
 */

/**
 * Horas tras las cuales un pedido sin pagar se cancela.
 *
 * Estaba en línea como `hoursSinceCreation >= 72` dentro del barrido. Se nombra
 * aquí para que el test de regresión pueda afirmarlo y para que no se cambie el
 * umbral sin darse cuenta.
 */
export const PAYMENT_RECOVERY_CANCEL_HOURS = 72

/**
 * Métodos de pago que NO entran en la recuperación de pagos.
 *
 * Contra entrega es el único, y la razón es la misma que en `abandoned-cart.ts`:
 * el pedido en efectivo es un **pedido real en espera**, no un impago. Su
 * `payment_status` sigue `pending` hasta que la tienda lo entrega y cobra, así
 * que sin esta exclusión el barrido lo cancela antes de que eso pueda pasar.
 *
 * OXXO, SPEI y CoDi **sí** entran: el cliente eligió pagar por adelantado, no lo
 * ha hecho, y recordárselo —o cancelarlo tras 72 h— es lo correcto.
 */
export const PAYMENT_RECOVERY_EXCLUDED_METHODS = ["cash_on_delivery"] as const

/** Lo mínimo que necesita el predicado de cada pedido. */
export interface RecoverablePaymentOrder {
  status: string
  payment_status: string | null
  payment_method: string | null
}

/** true si el método queda fuera de la recuperación (p. ej. contra entrega). */
export function isExcludedFromPaymentRecovery(method: string | null | undefined): boolean {
  return (PAYMENT_RECOVERY_EXCLUDED_METHODS as readonly string[]).includes(method ?? "")
}

/**
 * true si el pedido puede recordarse y, llegado el caso, cancelarse por impago.
 *
 * Un pedido sin método de pago (`null`) **sí** entra: a diferencia del carrito
 * abandonado —donde la ausencia de método es el abandono más literal— aquí el
 * `payment_method` es obligatorio en el alta (`createOrderSchema`), así que un
 * nulo solo puede venir de datos históricos o de una escritura fuera de la API.
 * Tratarlo como "no cobrable" dejaría esos pedidos sin recordatorio y sin
 * cancelación para siempre, que es una decisión más grande que la que este
 * arreglo necesita tomar. Se conserva el comportamiento previo.
 */
export function isPaymentRecoverable(order: RecoverablePaymentOrder): boolean {
  if (order.status === "cancelled") return false
  if (order.payment_status !== "pending") return false
  if (isExcludedFromPaymentRecovery(order.payment_method)) return false
  return true
}

/** Subconjunto de un constructor de consultas PostgREST que este módulo usa. */
interface PaymentRecoveryChain {
  or(filter: string): PaymentRecoveryChain
}

/**
 * Condición PostgREST que replica `isExcludedFromPaymentRecovery`.
 *
 * El `payment_method.is.null` explícito NO es decorativo, y es la misma trampa
 * que documenta `abandonedCartMethodFilter()`: PostgREST traduce
 * `not.in.(…)` a `NOT (payment_method IN (…))`, y en SQL `NULL IN (…)` es
 * `NULL`, así que la fila queda fuera del `WHERE`. En JS, en cambio,
 * `isExcludedFromPaymentRecovery(null)` devuelve `false` y el pedido SÍ se
 * procesa. Sin el `IS NULL`, la consulta y el bucle discreparían sobre
 * exactamente las filas con método nulo.
 */
export function paymentRecoveryMethodFilter(): string {
  const excluded = PAYMENT_RECOVERY_EXCLUDED_METHODS.join(",")
  return `payment_method.is.null,payment_method.not.in.(${excluded})`
}

/**
 * Aplica a una consulta de `orders` exactamente la elegibilidad de la
 * recuperación de pagos.
 *
 * Es la única forma admitida de escribirla: el barrido la llama en vez de
 * repetir las condiciones a mano, de modo que si mañana se excluye otro método
 * basta con tocar `PAYMENT_RECOVERY_EXCLUDED_METHODS`.
 *
 * El genérico devuelve el mismo tipo que recibe para no romper el encadenado
 * (`.limit`, `.neq`, …) del constructor de PostgREST. El cast intermedio existe
 * por la misma razón que en `abandoned-cart.ts`: restringir `Q` a la firma real
 * del constructor agota la recursión de tipos de supabase-js (`TS2589`).
 */
export function applyPaymentRecoveryFilter<Q>(query: Q): Q {
  const chain = query as unknown as PaymentRecoveryChain
  return chain.or(paymentRecoveryMethodFilter()) as unknown as Q
}
