import { describe, expect, it } from "vitest"
import {
  PROJECTION_SAFETY_MARGIN,
  PURCHASE_TARGET_MULTIPLIER,
  projectionVerdict,
  purchaseOrderLine,
} from "./inventario-shared"

describe("purchaseOrderLine — cuánto pedir y cuánto cuesta", () => {
  it("pide hasta el doble del mínimo, no hasta el mínimo", () => {
    // stock 0, mínimo 10 → objetivo 20, se piden 20
    const l = purchaseOrderLine({ stock: 0, minStock: 10, pricePerUnit: 5 })
    expect(l.target).toBe(20)
    expect(l.toBuy).toBe(20)
    expect(l.cost).toBe(100)
  })

  it("descuenta el stock actual del objetivo", () => {
    // objetivo 20, hay 12 → se piden 8
    const l = purchaseOrderLine({ stock: 12, minStock: 10, pricePerUnit: 5 })
    expect(l.toBuy).toBe(8)
    expect(l.cost).toBe(40)
  })

  it("nunca pide cantidades negativas si el stock supera el objetivo", () => {
    const l = purchaseOrderLine({ stock: 100, minStock: 10, pricePerUnit: 5 })
    expect(l.toBuy).toBe(0)
    expect(l.cost).toBe(0)
  })

  it("cuesta cero cuando el insumo no tiene precio capturado", () => {
    const l = purchaseOrderLine({ stock: 0, minStock: 10, pricePerUnit: 0 })
    expect(l.toBuy).toBe(20)
    expect(l.cost).toBe(0)
  })

  it("el costo es proporcional: pedir el doble cuesta el doble", () => {
    const a = purchaseOrderLine({ stock: 0, minStock: 10, pricePerUnit: 7 })
    const b = purchaseOrderLine({ stock: 0, minStock: 20, pricePerUnit: 7 })
    expect(b.cost).toBe(a.cost * 2)
  })

  it("el multiplicador del objetivo es 2 (regla declarada)", () => {
    expect(PURCHASE_TARGET_MULTIPLIER).toBe(2)
    expect(purchaseOrderLine({ stock: 0, minStock: 3, pricePerUnit: 1 }).target).toBe(6)
  })

  it("es pura: no muta el insumo recibido", () => {
    const item = { stock: 1, minStock: 10, pricePerUnit: 5 }
    const copia = { ...item }
    purchaseOrderLine(item)
    expect(item).toEqual(copia)
  })
})

describe("projectionVerdict — ¿me alcanza para el servicio previsto?", () => {
  it("marca 'falta' cuando el insumo no está registrado en inventario", () => {
    const v = projectionVerdict(null, 5)
    expect(v.status).toBe("falta")
    expect(v.label).toBe("No registrado en inventario")
    expect(v.icon).toBe("🔴")
    // Sin stock conocido no se puede calcular un faltante parcial: falta todo.
    expect(v.shortfallQty).toBe(5)
  })

  it("marca 'suficiente' solo con el colchón de seguridad completo", () => {
    expect(projectionVerdict(11, 10).status).toBe("ok")
    expect(projectionVerdict(11, 10).label).toBe("Suficiente")
    expect(projectionVerdict(11, 10).icon).toBe("🟢")
  })

  it("marca 'justo' cuando alcanza sin colchón", () => {
    const v = projectionVerdict(10, 10)
    expect(v.status).toBe("justo")
    expect(v.label).toBe("Justo (mínimo)")
    expect(v.icon).toBe("🟡")
    expect(v.shortfallQty).toBe(0)
  })

  it("el límite exacto del colchón cae del lado seguro (justo, no suficiente)", () => {
    // 10 × 1.1 = 11; con 11 exactos ya es "suficiente", con 10.999 no.
    expect(projectionVerdict(11, 10).status).toBe("ok")
    expect(projectionVerdict(10.999, 10).status).toBe("justo")
  })

  it("marca 'falta' con el faltante exacto cuando el stock no alcanza", () => {
    const v = projectionVerdict(4, 10)
    expect(v.status).toBe("falta")
    expect(v.label).toBe("Falta pedir")
    expect(v.icon).toBe("🔴")
    expect(v.shortfallQty).toBe(6)
  })

  it("el faltante nunca es negativo", () => {
    expect(projectionVerdict(999, 1).shortfallQty).toBe(0)
  })

  it("un consumo previsto de cero siempre alcanza si hay algo en inventario", () => {
    expect(projectionVerdict(1, 0).status).toBe("ok")
    expect(projectionVerdict(0, 0).status).toBe("ok")
  })

  it("un consumo previsto de cero con inventario en cero también alcanza", () => {
    // 0 >= 0 × 1.1 → suficiente. Nada que servir, nada que falta.
    expect(projectionVerdict(0, 0).status).toBe("ok")
    expect(projectionVerdict(0, 0).shortfallQty).toBe(0)
  })

  it("el colchón de seguridad es 1.1 (regla declarada)", () => {
    expect(PROJECTION_SAFETY_MARGIN).toBe(1.1)
    // Justo por debajo del umbral: 100 × 1.1 = 110
    expect(projectionVerdict(109.99, 100).status).toBe("justo")
    expect(projectionVerdict(110, 100).status).toBe("ok")
  })

  it("solo tres estados, y cada uno con su icono", () => {
    const estados = [projectionVerdict(null, 1).status, projectionVerdict(1, 1).status, projectionVerdict(10, 1).status]
    expect(estados).toEqual(["falta", "justo", "ok"])
    const iconos = [projectionVerdict(null, 1).icon, projectionVerdict(1, 1).icon, projectionVerdict(10, 1).icon]
    expect(new Set(iconos).size).toBe(3)
  })

  it("etiqueta siempre legible: ninguna combinación deja label vacío", () => {
    for (const stock of [null, 0, 1, 5, 10, 11, 100]) {
      for (const needed of [0, 1, 10, 100]) {
        const v = projectionVerdict(stock, needed)
        expect(v.label.length).toBeGreaterThan(0)
        expect(v.icon.length).toBeGreaterThan(0)
        expect(Number.isFinite(v.shortfallQty)).toBe(true)
        expect(v.shortfallQty).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
