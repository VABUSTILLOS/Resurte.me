/**
 * Cancelación de pedidos del marketplace: **la cascada de efectos vive aquí y
 * solo aquí**.
 *
 * El problema que resuelve este módulo no es "cancelar", es que cancelar un
 * pedido toca cuatro cosas a la vez:
 *
 *   1. `orders.status = 'cancelled'` (y `payment_status = 'failed'` si aún no
 *      se cobró nada).
 *   2. Devolver el inventario que el pedido reservó al crearse (migración
 *      00143). Sin esto, cada cancelación deja stock fantasma inmovilizado.
 *   3. Revertir el `used_count` del cupón que el pedido consumió. Sin esto, el
 *      cupón se agota para todo el mundo por un pedido que no existió.
 *   4. El reverso del cashback, que no se hace aquí porque es un trigger de la
 *      base (`trg_reverse_cashback` sobre el UPDATE de `orders`) y por tanto
 *      ya es gratis.
 *
 * Hasta ahora esos efectos vivían **en línea dentro de la ruta de admin**
 * (`api/orders/[id]/status`). En cuanto el cliente puede cancelar su propio
 * pedido hay dos puertas al mismo estado, y dos copias de una cascada de
 * dinero divergen: la primera que alguien olvide actualizar deja de devolver
 * inventario o de liberar el cupón, en silencio y solo por un camino. Por eso
 * el admin y el cliente llaman a la MISMA función.
 *
 * Frontera de producto — qué puede cancelar el propio cliente:
 *
 *   · **Antes del despacho** (`pending`, `confirmed`, `preparing`). Una vez el
 *     pedido sale a reparto el repartidor ya lleva la mercancía: cancelar no
 *     devuelve nada, solo deja al repartidor en la calle.
 *   · **Y sin dinero cobrado ni en vuelo.** No existe maquinaria de reembolso
 *     para pedidos en este repo (solo para canjes de recompensas). Un botón que
 *     cancelara un pedido `paid` sin devolver el dinero sería exactamente la
 *     clase de función que aparenta y no cumple: quitaría el pedido y se
 *     quedaría con el cobro. Cuando hay dinero de por medio, la cancelación es
 *     una decisión humana y el cliente ve el motivo y la vía de contacto.
 *
 * `applyOrderCancellationEffects` es idempotente por construcción: si el pedido
 * ya estaba cancelado no vuelve a devolver inventario. El guarda vive aquí, no
 * en cada llamador, para que ninguno pueda olvidarlo.
 */

import { logger } from "@/lib/logger"
import { callStockRpc, type SupabaseRpcLike } from "@/lib/order-stock"
import type { OrderStatus, PaymentStatus } from "@/types"

/**
 * Estados desde los que el cliente todavía puede cancelar por su cuenta.
 * `out_for_delivery` queda fuera a propósito: el repartidor ya salió.
 */
export const CANCELLABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
]

/**
 * Estados de pago en los que hay dinero cobrado o en vuelo. Cualquiera de
 * ellos bloquea la autocancelación: `processing` es un cobro que puede
 * liquidarse después de que el pedido desaparezca.
 */
export const CHARGED_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "paid",
  "processing",
  "disputed",
  "amount_mismatch",
]

/** Motivo por el que la autocancelación no está disponible. */
export type CustomerCancelRefusal = "already_cancelled" | "dispatched" | "charged"

/**
 * Mensaje que ve el cliente. Cada motivo dice **qué pasó**; los que dejan al
 * cliente con algo que hacer dicen además **qué hacer**, porque "no se puede
 * cancelar" a secas es un callejón sin salida.
 */
export const CANCEL_REFUSAL_MESSAGE: Record<CustomerCancelRefusal, string> = {
  already_cancelled: "Este pedido ya estaba cancelado.",
  dispatched:
    "Tu pedido ya salió a reparto o ya se entregó, así que no se cancela desde aquí. Escríbenos y lo resolvemos contigo.",
  charged:
    "Este pedido ya tiene un cobro registrado. Escríbenos para cancelarlo y devolverte el dinero.",
}

/**
 * Devuelve el motivo del rechazo, o `null` si el cliente puede cancelar.
 * El orden importa: un pedido ya cancelado se reporta como tal aunque además
 * estuviera cobrado — es el estado más informativo de los tres.
 */
export function customerCancelRefusal(
  status: string | null | undefined,
  paymentStatus: string | null | undefined
): CustomerCancelRefusal | null {
  if (status === "cancelled") return "already_cancelled"
  if (!status || !CANCELLABLE_ORDER_STATUSES.includes(status as OrderStatus)) {
    return "dispatched"
  }
  if (
    paymentStatus &&
    CHARGED_PAYMENT_STATUSES.includes(paymentStatus as PaymentStatus)
  ) {
    return "charged"
  }
  return null
}

/** Atajo booleano para la UI, que necesita decidir si pinta el botón. */
export function canCustomerCancel(
  status: string | null | undefined,
  paymentStatus: string | null | undefined
): boolean {
  return customerCancelRefusal(status, paymentStatus) === null
}

/** Fila de cupón que lee el reverso. */
export interface CancellableCouponRow {
  id: number
  used_count: number
}

/**
 * Lo mínimo que este módulo usa del cliente de Supabase. Se declara explícito
 * (en vez del tipo completo) porque el módulo es puro salvo por estos dos
 * accesos y así se puede probar sin red.
 */
export interface CancellationClient extends SupabaseRpcLike {
  from(table: string): {
    select(columns: string): {
      ilike(
        column: string,
        pattern: string
      ): {
        maybeSingle(): PromiseLike<{
          data: CancellableCouponRow | null
          error: { message?: string } | null
        }>
      }
    }
    update(values: Record<string, unknown>): {
      eq(
        column: string,
        value: unknown
      ): {
        eq(
          column: string,
          value: unknown
        ): PromiseLike<{ error: { message?: string } | null }>
      }
    }
  }
}

export interface CancellationEffects {
  /** Se intentó devolver el inventario y la RPC dijo que sí. */
  stockReleased: boolean
  /** Se devolvió una unidad al `used_count` del cupón. */
  couponReversed: boolean
}

/**
 * Ejecuta los efectos secundarios de cancelar un pedido.
 *
 * No cambia `orders.status`: eso lo hace el llamador con el payload que ya
 * tenía (el admin puede además tocar `payment_status` y `driver_id` en la
 * misma escritura). Este módulo se ocupa de lo que el UPDATE **no** hace solo.
 *
 * Nunca lanza. Un fallo al devolver inventario o al liberar el cupón se
 * registra pero no convierte una cancelación correcta en un error para el
 * cliente: el pedido ya está cancelado y esa es la verdad que él ve.
 */
export async function applyOrderCancellationEffects(
  supabase: CancellationClient,
  input: { orderId: number; oldStatus: string; couponCode?: string | null }
): Promise<CancellationEffects> {
  const effects: CancellationEffects = { stockReleased: false, couponReversed: false }

  // Idempotencia: cancelar algo ya cancelado no vuelve a devolver nada.
  if (input.oldStatus === "cancelled") return effects

  try {
    const released = await callStockRpc(supabase, "release_order_stock", input.orderId)
    if (released?.ok === false && released.reason !== "not_reserved") {
      logger.warn("[orders] No se pudo devolver el inventario del pedido cancelado", {
        orderId: input.orderId,
        reason: released.reason,
      })
    } else if (released?.ok === true) {
      effects.stockReleased = true
    }
  } catch (err) {
    logger.error("[orders] Excepción devolviendo el inventario del pedido cancelado", err, {
      orderId: input.orderId,
    })
  }

  if (input.couponCode) {
    try {
      const { data: coupon } = await supabase
        .from("coupons")
        .select("id, used_count")
        .ilike("code", input.couponCode)
        .maybeSingle()

      // El segundo `eq` sobre `used_count` es concurrencia optimista: si otro
      // pedido consumió el cupón entre la lectura y la escritura, el UPDATE no
      // toca ninguna fila en vez de pisar un contador ajeno.
      if (coupon && coupon.used_count > 0) {
        const { error } = await supabase
          .from("coupons")
          .update({ used_count: coupon.used_count - 1 })
          .eq("id", coupon.id)
          .eq("used_count", coupon.used_count)
        if (error) {
          logger.warn("[orders] No se pudo liberar el cupón del pedido cancelado", {
            orderId: input.orderId,
            code: input.couponCode,
            message: error.message,
          })
        } else {
          effects.couponReversed = true
        }
      }
    } catch (err) {
      logger.error("[orders] Excepción liberando el cupón del pedido cancelado", err, {
        orderId: input.orderId,
        code: input.couponCode,
      })
    }
  }

  return effects
}
