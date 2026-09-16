import { describe, expect, it } from "vitest"
import {
  comparePresentations,
  formatUnitPrice,
  normalizeBaseName,
  parsePresentation,
  unitPrice,
} from "./unit-price"

describe("parsePresentation", () => {
  it("interpreta las formas cualitativas del catálogo", () => {
    expect(parsePresentation("por kilo")).toEqual({ quantity: 1, base: "kg" })
    expect(parsePresentation("por pieza")).toEqual({ quantity: 1, base: "pieza" })
    expect(parsePresentation("por litro")).toEqual({ quantity: 1, base: "l" })
  })

  it("normaliza los submúltiplos a la base", () => {
    expect(parsePresentation("500 g")).toEqual({ quantity: 0.5, base: "kg" })
    expect(parsePresentation("200 g")).toEqual({ quantity: 0.2, base: "kg" })
    expect(parsePresentation("355 ml")).toEqual({ quantity: 0.355, base: "l" })
  })

  it("acepta cantidad y unidad juntas", () => {
    expect(parsePresentation("1 kg")).toEqual({ quantity: 1, base: "kg" })
    expect(parsePresentation("5 kg")).toEqual({ quantity: 5, base: "kg" })
    expect(parsePresentation("1.5 l")).toEqual({ quantity: 1.5, base: "l" })
  })

  it("es tolerante con mayúsculas y espacios sobrantes", () => {
    expect(parsePresentation("  1   KG  ")).toEqual({ quantity: 1, base: "kg" })
  })

  it("devuelve null para unidades no comparables", () => {
    expect(parsePresentation("por manojo")).toBeNull()
    expect(parsePresentation("por cabeza")).toBeNull()
    expect(parsePresentation("charola")).toBeNull()
    expect(parsePresentation("caja de 12")).toBeNull()
  })

  it("devuelve null para vacío o basura", () => {
    expect(parsePresentation(null)).toBeNull()
    expect(parsePresentation(undefined)).toBeNull()
    expect(parsePresentation("")).toBeNull()
    expect(parsePresentation("   ")).toBeNull()
    expect(parsePresentation("0 kg")).toBeNull()
  })
})

describe("unitPrice", () => {
  it("calcula el precio por kilo de una presentación de 500 g", () => {
    const result = unitPrice(50, "500 g")
    expect(result).not.toBeNull()
    expect(result?.amount).toBe(100)
    expect(result?.base).toBe("kg")
  })

  it("deja igual el precio cuando la presentación ya es la base", () => {
    expect(unitPrice(28.5, "por kilo")?.amount).toBe(28.5)
  })

  it("redondea a centavos", () => {
    // 100 / 0.355 = 281.6901408...
    expect(unitPrice(100, "355 ml")?.amount).toBe(281.69)
  })

  it("devuelve null sin precio válido o sin unidad comparable", () => {
    expect(unitPrice(null, "por kilo")).toBeNull()
    expect(unitPrice(0, "por kilo")).toBeNull()
    expect(unitPrice(-5, "por kilo")).toBeNull()
    expect(unitPrice(50, "por manojo")).toBeNull()
    expect(unitPrice(50, null)).toBeNull()
  })
})

describe("formatUnitPrice", () => {
  it("formatea con dos decimales y la base", () => {
    const price = unitPrice(50, "500 g")
    expect(price && formatUnitPrice(price)).toBe("$100.00 / kg")
  })

  it("etiqueta litros y piezas", () => {
    const litros = unitPrice(100, "355 ml")
    const piezas = unitPrice(15, "por pieza")
    expect(litros && formatUnitPrice(litros)).toBe("$281.69 / l")
    expect(piezas && formatUnitPrice(piezas)).toBe("$15.00 / pieza")
  })
})

describe("normalizeBaseName", () => {
  it("quita el token de presentación", () => {
    expect(normalizeBaseName("Jitomate Saladette 1 kg")).toBe("jitomate saladette")
    expect(normalizeBaseName("Jitomate Saladette 500 g")).toBe("jitomate saladette")
    expect(normalizeBaseName("Leche Entera 1 l")).toBe("leche entera")
  })

  it("ignora acentos y mayúsculas", () => {
    expect(normalizeBaseName("Aguacate HASS por kilo")).toBe("aguacate hass")
  })

  it("quita tokens no comparables para que dos presentaciones se reconozcan", () => {
    expect(normalizeBaseName("Cilantro por manojo")).toBe("cilantro")
    expect(normalizeBaseName("Cilantro charola")).toBe("cilantro")
  })

  it("no toca nombres sin presentación", () => {
    expect(normalizeBaseName("Tortilla de maíz")).toBe("tortilla de maiz")
  })
})

describe("comparePresentations", () => {
  const jitomate1kg = { id: 1, name: "Jitomate Saladette 1 kg", price: 30, unit: "1 kg" }
  const jitomate5kg = { id: 2, name: "Jitomate Saladette 5 kg", price: 120, unit: "5 kg" }
  const jitomate500g = { id: 3, name: "Jitomate Saladette 500 g", price: 18, unit: "500 g" }

  it("ordena de más barato a más caro por precio unitario", () => {
    const out = comparePresentations(jitomate1kg, [jitomate5kg, jitomate500g])
    expect(out.map((c) => c.product.id)).toEqual([2, 3])
    expect(out[0]?.unitPrice.amount).toBe(24)
    expect(out[1]?.unitPrice.amount).toBe(36)
  })

  it("calcula el delta porcentual contra el producto actual", () => {
    const out = comparePresentations(jitomate1kg, [jitomate5kg, jitomate500g])
    expect(out[0]?.deltaPct).toBe(-20)
    expect(out[1]?.deltaPct).toBe(20)
  })

  it("marca best solo cuando el candidato es más barato que el actual", () => {
    const out = comparePresentations(jitomate1kg, [jitomate5kg, jitomate500g])
    expect(out[0]?.best).toBe(true)
    expect(out[1]?.best).toBe(false)
  })

  it("no marca best si el producto actual ya es el más barato", () => {
    const barato = { id: 7, name: "Jitomate Saladette 5 kg", price: 100, unit: "5 kg" }
    const out = comparePresentations(barato, [jitomate1kg])
    expect(out.map((c) => c.best)).toEqual([false])
    expect(out[0]?.deltaPct).toBe(50)
  })

  it("descarta candidatos con otra base", () => {
    const pieza = { id: 9, name: "Jitomate Saladette por pieza", price: 5, unit: "por pieza" }
    expect(comparePresentations(jitomate1kg, [pieza])).toEqual([])
  })

  it("descarta productos con nombre base distinto", () => {
    const otro = { id: 9, name: "Tomate Bola 1 kg", price: 20, unit: "1 kg" }
    expect(comparePresentations(jitomate1kg, [otro])).toEqual([])
  })

  it("descarta el propio producto y los duplicados por id", () => {
    const out = comparePresentations(jitomate1kg, [jitomate1kg, jitomate5kg, jitomate5kg])
    expect(out.map((c) => c.product.id)).toEqual([2])
  })

  it("respeta el límite de presentaciones mostradas", () => {
    const candidatos = Array.from({ length: 8 }, (_, i) => ({
      id: i + 10,
      name: "Jitomate Saladette 1 kg",
      price: 30 - i,
      unit: "1 kg",
    }))
    expect(comparePresentations(jitomate1kg, candidatos, 3)).toHaveLength(3)
  })

  it("devuelve lista vacía si el producto actual no es comparable", () => {
    const manojo = { id: 1, name: "Cilantro por manojo", price: 12, unit: "por manojo" }
    expect(comparePresentations(manojo, [jitomate1kg])).toEqual([])
  })

  it("ignora candidatos sin unidad interpretable", () => {
    const charola = { id: 9, name: "Jitomate Saladette charola", price: 200, unit: "charola" }
    expect(comparePresentations(jitomate1kg, [charola])).toEqual([])
  })
})
