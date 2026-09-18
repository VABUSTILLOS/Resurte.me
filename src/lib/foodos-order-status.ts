import type { FoodosOrderStatus, FoodosPaymentStatus } from "@/types/foodos"

/**
 * Máquina de estados del pedido FoodOS.
 *
 * Antes de este módulo, `updateOrderStatus` escribía cualquier estado sobre
 * cualquier estado: no había validación. Las dos consecuencias reales eran
 * (a) un pedido `delivered` podía volver a `preparing` y el comensal recibía
 * otra vez "tu pedido está en preparación" sobre algo que ya se comió, y
 * (b) un pedido `cancelled` podía resucitar, lo que deja el aviso de
 * cancelación mintiendo.
 *
 * La tabla de abajo no es una invención: es exactamente lo que el panel ya
 * ofrece hoy, leído de sus botones. El panel de pedidos
 * (`src/app/panel/foodos/pedidos/page.tsx`) muestra "Avanzar" y "Cancelar"
 * solo si el estado no es final, y el tablero de cocina
 * (`src/app/panel/foodos/cocina/page.tsx`) solo muestra `confirmed` y
 * `preparing`. `foodos-order-status.test.ts` recorre esas transiciones para
 * que este módulo no pueda dejar al panel sin un botón que ya tenía.
 *
 * Lo que la máquina NO hace: no impide saltar hacia adelante. Cocina pasa de
 * `confirmed` a `preparing` y de `preparing` a `out_for_delivery`/`delivered`;
 * prohibir saltos sería inventar una regla que nadie pidió. Lo que prohíbe es
 * retroceder y resucitar, que es el defecto que existía.
 */
export const FOODOS_OWNER_TRANSITIONS: Record<
  FoodosOrderStatus,
  readonly FoodosOrderStatus[]
> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["out_for_delivery", "delivered", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
}

/** Estados sin salida. Un pedido entregado o cancelado ya no se mueve. */
export const FOODOS_TERMINAL_ORDER_STATUSES: readonly FoodosOrderStatus[] = [
  "delivered",
  "cancelled",
]

export function isTerminalFoodosStatus(status: FoodosOrderStatus): boolean {
  return FOODOS_TERMINAL_ORDER_STATUSES.includes(status)
}

export function ownerTransitionAllowed(
  from: FoodosOrderStatus,
  to: FoodosOrderStatus
): boolean {
  // Sin cambio no es una transición: quien llama ya la filtra antes, y
  // rechazarla aquí convertiría un doble clic en un error visible.
  if (from === to) return true
  return FOODOS_OWNER_TRANSITIONS[from].includes(to)
}

/** Mensaje para el dueño cuando su intento no es legal. Dice qué hacer. */
export function ownerTransitionErrorMessage(
  from: FoodosOrderStatus,
  to: FoodosOrderStatus
): string {
  if (isTerminalFoodosStatus(from)) {
    return from === "cancelled"
      ? "Este pedido está cancelado y ya no se puede mover."
      : "Este pedido ya se entregó y no se puede mover. Si hubo un problema, regístralo como incidencia."
  }
  return `No se puede pasar de «${from}» a «${to}» sin saltarse un paso. Avanza el pedido en orden.`
}

// ---------------------------------------------------------------------------
// Cancelación por el propio comensal
// ---------------------------------------------------------------------------

/**
 * Ventana en la que el comensal puede cancelar solo: mientras el pedido siga
 * `pending`, es decir antes de que el restaurante lo confirme. A partir de ahí
 * ya hay trabajo hecho (insumos, cocina) y la vía es llamar al restaurante.
 */
export const FOODOS_CUSTOMER_CANCELLABLE_STATUSES: readonly FoodosOrderStatus[] = [
  "pending",
]

/**
 * Estados de pago con dinero cobrado o en vuelo. `refunded` también entra: si
 * hubo una devolución, el pedido ya se liquidó con el restaurante y no es el
 * comensal quien lo cierra.
 */
export const FOODOS_CHARGED_PAYMENT_STATUSES: readonly FoodosPaymentStatus[] = [
  "paid",
  "processing",
  "refunded",
]

export type FoodosCancelRefusal = "already_cancelled" | "started" | "charged"

export const FOODOS_CANCEL_REFUSAL_MESSAGE: Record<FoodosCancelRefusal, string> = {
  already_cancelled: "Este pedido ya estaba cancelado.",
  started:
    "El restaurante ya empezó con tu pedido. Llámalos o escríbeles si necesitas cancelarlo.",
  charged:
    "Este pedido ya tiene un pago registrado. Llámalos para cancelarlo y acordar la devolución.",
}

/**
 * Devuelve el motivo por el que el comensal NO puede cancelar, o `null` si sí.
 * El orden importa: un pedido ya cancelado lo dice como tal (y no como
 * "empezado"), y un pedido empezado no se explica con un problema de dinero.
 */
export function foodosCustomerCancelRefusal(
  status: FoodosOrderStatus | null | undefined,
  paymentStatus: FoodosPaymentStatus | null | undefined
): FoodosCancelRefusal | null {
  if (status === "cancelled") return "already_cancelled"
  if (!status || !FOODOS_CUSTOMER_CANCELLABLE_STATUSES.includes(status)) {
    return "started"
  }
  if (paymentStatus && FOODOS_CHARGED_PAYMENT_STATUSES.includes(paymentStatus)) {
    return "charged"
  }
  return null
}

/** Predicado para la UI: ¿se muestra el botón de cancelar? */
export function canFoodosCustomerCancel(
  status: FoodosOrderStatus | null | undefined,
  paymentStatus: FoodosPaymentStatus | null | undefined
): boolean {
  return foodosCustomerCancelRefusal(status, paymentStatus) === null
}
