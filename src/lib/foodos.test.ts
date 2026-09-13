import { describe, expect, it } from "vitest"
import {
  buildWhatsAppOrderLink,
  buildWhatsAppOrderMessage,
  cartLineKey,
  modifiersSummary,
  unitPriceWithModifiers,
  validateOptionSelection,
} from "./foodos"
import type { FoodosItemOptionGroup, FoodosOrderItem } from "@/types/foodos"

const group = (partial: Partial<FoodosItemOptionGroup> = {}): FoodosItemOptionGroup => ({
  id: "g1",
  restaurant_id: "r1",
  item_id: "i1",
  name: "Tamaño",
  is_required: true,
  min_select: 1,
  max_select: 1,
  sort_order: 0,
  created_at: "",
  ...partial,
})

describe("unitPriceWithModifiers", () => {
  it("suma los deltas al precio base", () => {
    expect(
      unitPriceWithModifiers(80, [
        { group_id: "g1", group_name: "Tamaño", value_id: "v1", value_name: "Grande", price_delta: 25 },
        { group_id: "g2", group_name: "Extras", value_id: "v2", value_name: "Queso", price_delta: 15 },
      ])
    ).toBe(120)
  })

  it("sin modificadores devuelve el precio base", () => {
    expect(unitPriceWithModifiers(80, undefined)).toBe(80)
    expect(unitPriceWithModifiers(80, [])).toBe(80)
  })
})

describe("cartLineKey", () => {
  it("distingue líneas por set de modificadores", () => {
    const base: FoodosOrderItem = { item_id: "i1", name: "Taco", price: 80, qty: 1 }
    const conMod: FoodosOrderItem = {
      ...base,
      modifiers: [{ group_id: "g1", group_name: "T", value_id: "v1", value_name: "Grande", price_delta: 10 }],
    }
    expect(cartLineKey(base)).not.toBe(cartLineKey(conMod))
    // orden de modificadores no importa
    const reordenado: FoodosOrderItem = {
      ...base,
      modifiers: [
        { group_id: "g2", group_name: "E", value_id: "v2", value_name: "Queso", price_delta: 5 },
        { group_id: "g1", group_name: "T", value_id: "v1", value_name: "Grande", price_delta: 10 },
      ],
    }
    const mismoSet: FoodosOrderItem = {
      ...base,
      modifiers: [...reordenado.modifiers!].reverse(),
    }
    expect(cartLineKey(reordenado)).toBe(cartLineKey(mismoSet))
  })

  it("combos usan su propia clave", () => {
    const combo: FoodosOrderItem = { item_id: "c1", name: "Combo", price: 150, qty: 1, combo_id: "c1" }
    expect(cartLineKey(combo)).toBe("combo:c1")
  })
})

describe("validateOptionSelection", () => {
  it("exige grupos requeridos", () => {
    expect(validateOptionSelection([group()], {})).toContain("Tamaño")
    expect(validateOptionSelection([group()], { g1: ["v1"] })).toBeNull()
  })

  it("respeta max_select", () => {
    const g = group({ is_required: false, min_select: 0, max_select: 2 })
    expect(validateOptionSelection([g], { g1: ["a", "b", "c"] })).toContain("Máximo")
    expect(validateOptionSelection([g], { g1: ["a", "b"] })).toBeNull()
  })
})

describe("buildWhatsAppOrderMessage", () => {
  it("incluye líneas con modificadores, totales y mesa", () => {
    const msg = buildWhatsAppOrderMessage({
      orderRef: "AB12CD34",
      restaurantName: "Taquería X",
      items: [
        {
          item_id: "i1",
          name: "Tacos al pastor",
          price: 105,
          qty: 2,
          modifiers: [
            { group_id: "g1", group_name: "Tamaño", value_id: "v1", value_name: "Grande", price_delta: 25 },
          ],
        },
      ],
      subtotal: 210,
      deliveryFee: 0,
      discount: 0,
      total: 210,
      fulfillment: "dine_in",
      tableNumber: "4",
      customerName: "Ana",
      customerPhone: "5551234567",
      note: "Sin cebolla",
    })
    expect(msg).toContain("#AB12CD34")
    expect(msg).toContain("2× Tacos al pastor")
    expect(msg).toContain("└ Grande")
    expect(msg).toContain("Mesa 4")
    expect(msg).toContain("Sin cebolla")
    expect(msg).toContain("Ana · 5551234567")
  })
})

describe("buildWhatsAppOrderLink", () => {
  it("limpia el teléfono y codifica el mensaje", () => {
    const link = buildWhatsAppOrderLink("+52 55 1234 5678", "Hola\nMundo")
    expect(link).toBe("https://wa.me/525512345678?text=Hola%0AMundo")
  })
})

describe("modifiersSummary", () => {
  it("concatena nombres de valores", () => {
    expect(
      modifiersSummary([
        { group_id: "g1", group_name: "T", value_id: "v1", value_name: "Grande", price_delta: 10 },
        { group_id: "g2", group_name: "E", value_id: "v2", value_name: "Queso", price_delta: 5 },
      ])
    ).toBe("Grande, Queso")
    expect(modifiersSummary(undefined)).toBe("")
  })
})

import { getOpenStatus } from "./foodos"
import type { FoodosBranchHours } from "@/types/foodos"

const hours = (partial: Partial<FoodosBranchHours> = {}): FoodosBranchHours => ({
  id: "h1",
  branch_id: "b1",
  day_of_week: 1,
  open_time: "09:00:00",
  close_time: "22:00:00",
  is_closed: false,
  created_at: "",
  ...partial,
})

// 2026-09-12 15:00 UTC = 09:00 en America/Mexico_City (sábado)
const TZ = "America/Mexico_City"

describe("getOpenStatus", () => {
  it("sin horarios configurados siempre está abierto", () => {
    const s = getOpenStatus([], TZ)
    expect(s.isOpen).toBe(true)
    expect(s.hasSchedule).toBe(false)
  })

  it("dentro del horario está abierto", () => {
    const rows = [hours({ day_of_week: 6 })] // sábado
    const s = getOpenStatus(rows, TZ, new Date("2026-09-12T18:00:00Z")) // 12:00 CDMX
    expect(s.isOpen).toBe(true)
  })

  it("fuera del horario está cerrado con próxima apertura", () => {
    const rows = [hours({ day_of_week: 6 }), hours({ id: "h2", day_of_week: 0 })]
    const s = getOpenStatus(rows, TZ, new Date("2026-09-12T06:00:00Z")) // 00:00 CDMX
    expect(s.isOpen).toBe(false)
    expect(s.nextOpenLabel).toBe("Abre hoy 09:00")
  })

  it("día cerrado reporta la apertura del día siguiente", () => {
    const rows = [
      hours({ day_of_week: 6, is_closed: true, open_time: null, close_time: null }),
      hours({ id: "h2", day_of_week: 0, open_time: "10:00:00" }),
    ]
    const s = getOpenStatus(rows, TZ, new Date("2026-09-12T18:00:00Z"))
    expect(s.isOpen).toBe(false)
    expect(s.nextOpenLabel).toBe("Abre mañana 10:00")
  })
})
