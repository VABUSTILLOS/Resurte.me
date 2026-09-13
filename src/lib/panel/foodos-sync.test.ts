import { describe, expect, it } from "vitest"
import { foodosOrderToSaleEntries, missingFoodosEntries } from "./foodos-sync"
import type { FoodosOrder } from "@/types/foodos"

function order(partial: Partial<FoodosOrder> = {}): FoodosOrder {
  return {
    id: "ord-1",
    restaurant_id: "r1",
    branch_id: null,
    customer_id: null,
    items: [
      { item_id: "it-1", name: "Tacos al pastor", price: 80, qty: 2 },
      { item_id: "it-2", name: "Refresco", price: 25, qty: 1 },
    ],
    subtotal: 185,
    discount: 0,
    delivery_fee: 30,
    total: 215,
    channel: "qr",
    fulfillment: "delivery",
    status: "delivered",
    payment_method: "card",
    payment_status: "paid",
    stripe_payment_intent_id: null,
    slug: null,
    customer_name: null,
    customer_phone: null,
    note: null,
    table_number: null,
    tip: 0,
    coupon_code: null,
    loyalty_points_redeemed: 0,
    loyalty_points_earned: 0,
    created_at: "2026-09-12T18:30:00.000Z",
    ...partial,
  }
}

describe("foodosOrderToSaleEntries", () => {
  it("una línea por item con id estable y precios del pedido", () => {
    const entries = foodosOrderToSaleEntries(order())
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      id: "foodos-ord-1-it-1",
      dishName: "Tacos al pastor",
      quantity: 2,
      unitPrice: 80,
      unitCost: 0,
      paymentMethod: "tarjeta",
      channel: "domicilio",
    })
    expect(entries[1]!.id).toBe("foodos-ord-1-it-2")
  })

  it("mapea fulfillment a canal de venta", () => {
    expect(foodosOrderToSaleEntries(order({ fulfillment: "pickup" }))[0]!.channel).toBe("para-llevar")
    expect(foodosOrderToSaleEntries(order({ fulfillment: "dine_in" }))[0]!.channel).toBe("comedor")
  })

  it("mapea método de pago desconocido a efectivo", () => {
    expect(foodosOrderToSaleEntries(order({ payment_method: null }))[0]!.paymentMethod).toBe("efectivo")
    expect(foodosOrderToSaleEntries(order({ payment_method: "spei" }))[0]!.paymentMethod).toBe("transferencia")
  })

  it("aplica el descuento del pedido a la primera línea con tope", () => {
    const entries = foodosOrderToSaleEntries(order({ discount: 50 }))
    expect(entries[0]!.discount).toEqual({ type: "monto", value: 50 })
    expect(entries[1]!.discount).toBeUndefined()
  })

  it("descuento mayor que la primera línea se reparte", () => {
    const entries = foodosOrderToSaleEntries(order({ discount: 170 }))
    expect(entries[0]!.discount).toEqual({ type: "monto", value: 160 })
    expect(entries[1]!.discount).toEqual({ type: "monto", value: 10 })
  })

  it("fecha local YYYY-MM-DD desde created_at", () => {
    expect(foodosOrderToSaleEntries(order())[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("missingFoodosEntries", () => {
  it("omite entradas ya importadas (idempotente)", () => {
    const existing = new Set(["foodos-ord-1-it-1"])
    const missing = missingFoodosEntries([order()], existing)
    expect(missing).toHaveLength(1)
    expect(missing[0]!.id).toBe("foodos-ord-1-it-2")
  })

  it("todo importado → []", () => {
    const existing = new Set(["foodos-ord-1-it-1", "foodos-ord-1-it-2"])
    expect(missingFoodosEntries([order()], existing)).toHaveLength(0)
  })
})
