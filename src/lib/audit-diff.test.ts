import { describe, expect, it } from "vitest"
import {
  auditDiffRows,
  auditExtraFields,
  auditFieldLabel,
  formatAuditValue,
  priceSeries,
} from "./audit-diff"

describe("auditFieldLabel", () => {
  it("traduce los campos conocidos", () => {
    expect(auditFieldLabel("price")).toBe("Precio")
    expect(auditFieldLabel("low_stock_threshold")).toBe("Umbral de stock bajo")
  })

  it("cae al nombre crudo si no hay traducción", () => {
    expect(auditFieldLabel("campo_raro")).toBe("campo_raro")
  })
})

describe("formatAuditValue", () => {
  it("formatea dinero con dos decimales", () => {
    expect(formatAuditValue("price", 1234.5)).toBe("$1.234,50")
    expect(formatAuditValue("cost", 0)).toBe("$0,00")
  })

  it("formatea números no monetarios como texto plano", () => {
    expect(formatAuditValue("stock_quantity", 12)).toBe("12")
  })

  it("traduce booleanos y nulos", () => {
    expect(formatAuditValue("is_visible", true)).toBe("Sí")
    expect(formatAuditValue("is_visible", false)).toBe("No")
    expect(formatAuditValue("brand", null)).toBe("—")
    expect(formatAuditValue("brand", "")).toBe("—")
  })

  it("traduce el estado de stock", () => {
    expect(formatAuditValue("stock_status", "out_of_stock")).toBe("Agotado")
    expect(formatAuditValue("stock_status", "desconocido")).toBe("desconocido")
  })

  it("une arrays y marca los vacíos", () => {
    expect(formatAuditValue("tags", ["arranque", "limpieza"])).toBe("arranque, limpieza")
    expect(formatAuditValue("tags", [])).toBe("—")
  })

  it("formatea fechas ISO de campos _at", () => {
    const out = formatAuditValue("sale_ends_at", "2025-06-30T15:00:00.000Z")
    expect(out).not.toBe("2025-06-30T15:00:00.000Z")
    expect(out).toContain("2025")
  })

  it("devuelve el valor crudo si la fecha es inválida", () => {
    expect(formatAuditValue("sale_ends_at", "no-es-fecha")).toBe("no-es-fecha")
  })
})

describe("auditDiffRows", () => {
  it("arma filas antes/después con etiquetas", () => {
    const rows = auditDiffRows({ before: { price: 1000 }, after: { price: 1200 } })
    expect(rows).toEqual([
      { field: "price", label: "Precio", before: "$1.000,00", after: "$1.200,00" },
    ])
  })

  it("incluye campos presentes solo en un lado", () => {
    const rows = auditDiffRows({ before: {}, after: { sku: "ABC-1" } })
    expect(rows).toEqual([{ field: "sku", label: "SKU", before: "—", after: "ABC-1" }])
  })

  it("devuelve vacío sin estructura before/after", () => {
    expect(auditDiffRows({ name: "Café", slug: "cafe" })).toEqual([])
    expect(auditDiffRows(null)).toEqual([])
    expect(auditDiffRows("texto")).toEqual([])
    expect(auditDiffRows([1, 2])).toEqual([])
  })
})

describe("auditExtraFields", () => {
  it("extrae los campos que no son el diff", () => {
    expect(auditExtraFields({ name: "Café", slug: "cafe" })).toEqual([
      { label: "Nombre", value: "Café" },
      { label: "Slug", value: "cafe" },
    ])
  })

  it("ignora before y after", () => {
    const out = auditExtraFields({ before: { price: 1 }, after: { price: 2 }, name: "X" })
    expect(out).toEqual([{ label: "Nombre", value: "X" }])
  })

  it("devuelve vacío con detalles inválidos", () => {
    expect(auditExtraFields(undefined)).toEqual([])
    expect(auditExtraFields(42)).toEqual([])
  })
})

describe("priceSeries", () => {
  it("lee el formato nuevo (after.price)", () => {
    const series = priceSeries([
      { created_at: "2025-01-01T00:00:00.000Z", detail: { before: { price: 100 }, after: { price: 200 } } },
    ])
    expect(series).toEqual([{ at: "2025-01-01T00:00:00.000Z", price: 200 }])
  })

  it("sigue leyendo el formato antiguo (price plano)", () => {
    const series = priceSeries([
      { created_at: "2025-01-01T00:00:00.000Z", detail: { price: 150 } },
    ])
    expect(series).toEqual([{ at: "2025-01-01T00:00:00.000Z", price: 150 }])
  })

  it("ignora entradas sin precio o inválidas", () => {
    const series = priceSeries([
      { created_at: "a", detail: { before: { sku: "X" }, after: { sku: "Y" } } },
      { created_at: "b", detail: { after: { price: "200" } } },
      { created_at: "c" },
      { created_at: "d", detail: { price: Number.NaN } },
    ])
    expect(series).toEqual([])
  })

  it("prefiere after.price cuando ambos existen", () => {
    const series = priceSeries([
      { created_at: "x", detail: { price: 10, before: { price: 1 }, after: { price: 20 } } },
    ])
    expect(series[0]?.price).toBe(20)
  })
})
