/**
 * Política de cantidad de una línea del pedido en el checkout.
 *
 * El "−" nunca elimina un artículo por sí solo: baja la cantidad hasta 0 (la
 * línea queda vacía y aporta $0 al total) y, ya en 0, un segundo "−" pide
 * confirmación explícita para quitarla del pedido. Así nadie borra algo por
 * accidente, pero tampoco queda atrapado con un artículo que ya no quiere.
 *
 * Función pura (sin DOM ni estado) para poder probarla en el entorno node de
 * Vitest y para que las dos superficies de checkout compartan la misma regla.
 */

/** Acción a ejecutar cuando el usuario toca "−"/"+" en una línea del pedido. */
export type OrderLineAction =
  /** Actualizar la cantidad de una línea que sigue en el carrito. */
  | { type: "set"; quantity: number }
  /** Bajar la línea a 0: sale del carrito pero sigue visible en el pedido. */
  | { type: "empty" }
  /** Devolver al carrito una línea que estaba vacía (0). */
  | { type: "restore"; quantity: number }
  /** Segundo "−" sobre una línea en 0: confirmar antes de eliminarla. */
  | { type: "confirm-remove" }

/**
 * @param inCart la línea sigue en el carrito (`false` = ya está vacía, en 0)
 * @param next   cantidad que pide el stepper; un valor negativo significa
 *               "−" sobre una línea que ya está en 0
 */
export function resolveQuantityChange(inCart: boolean, next: number): OrderLineAction {
  if (next < 0) return { type: "confirm-remove" }
  if (next === 0) return inCart ? { type: "empty" } : { type: "confirm-remove" }
  return inCart ? { type: "set", quantity: next } : { type: "restore", quantity: next }
}
