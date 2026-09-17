// Helpers compartidos por las pruebas de impresión. No es un archivo de
// pruebas: el runner sólo levanta `*.test.ts`.

import type { FoodosOrderItem } from "@/types/foodos"
import type { TicketContext, TicketOrderInput } from "./types"

export const CTX: TicketContext = { restaurantName: "Taquería El Buen Taco" }

export function item(overrides: Partial<FoodosOrderItem> = {}): FoodosOrderItem {
  return {
    item_id: "itm_1",
    name: "Taco al pastor",
    price: 25,
    qty: 1,
    ...overrides,
  }
}

export function order(overrides: Partial<TicketOrderInput> = {}): TicketOrderInput {
  return {
    id: "3f9a2b1c-4d5e-6f70-8192-a3b4c5d6e7f8",
    items: [item()],
    subtotal: 25,
    discount: 0,
    delivery_fee: 0,
    tip: 0,
    total: 25,
    fulfillment: "pickup",
    status: "confirmed",
    payment_method: "cash",
    payment_status: "paid",
    table_number: null,
    customer_name: null,
    customer_phone: null,
    note: null,
    created_at: "2026-02-14T18:30:00.000Z",
    scheduled_for: null,
    ...overrides,
  }
}
