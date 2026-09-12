/**
 * Mapeo de pedidos FoodOS (menú digital) → SaleEntry del panel.
 *
 * Cierra el loop app → panel: los pedidos pagados del micrositio /r/[slug]
 * aparecen como ventas (y por tanto en comanda, analítica y rentabilidad).
 *
 * Reglas:
 *  - Una SaleEntry por item del pedido (así la comanda ve cada platillo).
 *  - id estable `foodos-<orderId>-<itemId|idx>` para dedupe idempotente.
 *  - El descuento del pedido se aplica a la primera línea (tope: su total).
 *  - Canal: fulfillment delivery→domicilio, pickup→para-llevar,
 *    dine_in→comedor. Pago: tarjeta/transferencia/efectivo.
 *  - unitCost = 0: el costeo no conoce el vínculo app↔platillo costeado;
 *    el margen de estas ventas se reporta sin costo hasta que exista.
 *
 * Función pura, sin dependencias de React/Supabase (testable).
 */

import type { FoodosOrder, FoodosOrderItem } from "@/types/foodos"
import type { SaleEntry, SaleChannel, PaymentMethod } from "@/components/panel/ventas/ventas-shared"

const CHANNEL_BY_FULFILLMENT: Record<string, SaleChannel> = {
  delivery: "domicilio",
  pickup: "para-llevar",
  dine_in: "comedor",
}

function mapPaymentMethod(raw: string | null): PaymentMethod {
  const v = (raw ?? "").toLowerCase()
  if (v.includes("card") || v.includes("tarjeta") || v.includes("stripe")) return "tarjeta"
  if (v.includes("spei") || v.includes("transfer")) return "transferencia"
  return "efectivo"
}

function localDateStr(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Convierte un pedido FoodOS pagado en líneas de venta del panel. */
export function foodosOrderToSaleEntries(order: FoodosOrder): SaleEntry[] {
  const date = localDateStr(order.created_at)
  const channel = CHANNEL_BY_FULFILLMENT[order.fulfillment] ?? "rapido"
  const paymentMethod = mapPaymentMethod(order.payment_method)
  let discountLeft = Math.max(0, Number(order.discount ?? 0))

  return order.items.map((item: FoodosOrderItem, idx: number) => {
    const lineTotal = item.price * item.qty
    const discount = discountLeft > 0 ? Math.min(discountLeft, lineTotal) : 0
    discountLeft -= discount
    return {
      id: `foodos-${order.id}-${item.item_id || idx}`,
      dishId: `foodos-${item.item_id || idx}`,
      dishName: item.name,
      quantity: item.qty,
      date,
      unitPrice: item.price,
      unitCost: 0,
      paymentMethod,
      channel,
      discount: discount > 0 ? { type: "monto" as const, value: discount } : undefined,
      createdAt: order.created_at,
    }
  })
}

/**
 * Filtra las entradas ya importadas (por id estable) para que la
 * sincronización sea idempotente.
 */
export function missingFoodosEntries(
  orders: FoodosOrder[],
  existingIds: Set<string>
): SaleEntry[] {
  const out: SaleEntry[] = []
  for (const order of orders) {
    for (const entry of foodosOrderToSaleEntries(order)) {
      if (!existingIds.has(entry.id)) out.push(entry)
    }
  }
  return out
}
