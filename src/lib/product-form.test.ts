import { describe, it, expect } from "vitest"
import { validateProductForm, PRODUCT_FIELD_INPUT_IDS, formKeyForServerField } from "./product-form"
import type { ProductFormInput } from "./product-form"

const VALID: ProductFormInput = {
  name: "Agua 600 ml",
  price: "12.5",
  salePrice: "",
  cost: "8",
  stockQuantity: "24",
  lowStockThreshold: "5",
  sku: "AGUA-600",
  barcode: "7501234567890",
  saleStartsAt: "",
  saleEndsAt: "",
}

const withInput = (patch: Partial<ProductFormInput>): ProductFormInput => ({
  ...VALID,
  ...patch,
})

describe("validateProductForm", () => {
  it("acepta un formulario completo y devuelve los valores parseados", () => {
    const result = validateProductForm(VALID)
    expect(result.errors).toEqual({})
    expect(result.firstInvalid).toBeNull()
    expect(result.price).toBe(12.5)
    expect(result.cost).toBe(8)
    expect(result.stockQuantity).toBe(24)
    expect(result.lowStockThreshold).toBe(5)
  })

  it("trata los campos vacíos como 'sin valor', no como error", () => {
    const result = validateProductForm(
      withInput({
        price: "   ",
        salePrice: "",
        cost: "",
        stockQuantity: "",
        lowStockThreshold: "",
        sku: "",
        barcode: "",
      })
    )
    expect(result.errors).toEqual({})
    expect(result.price).toBeNull()
    expect(result.salePrice).toBeNull()
    expect(result.cost).toBeNull()
    expect(result.stockQuantity).toBeNull()
    expect(result.lowStockThreshold).toBeNull()
  })

  it("exige el nombre y lo recorta antes de decidir", () => {
    expect(validateProductForm(withInput({ name: "   " })).errors.name).toBe(
      "El nombre es obligatorio"
    )
    expect(validateProductForm(withInput({ name: "  Sal " })).errors.name).toBeUndefined()
  })

  it("rechaza precios, ofertas y costos no numéricos o negativos", () => {
    const result = validateProductForm(
      withInput({ price: "abc", salePrice: "-1", cost: "-0.5" })
    )
    expect(result.errors.price).toBe("Precio inválido")
    expect(result.errors.salePrice).toBe("Precio de oferta inválido")
    expect(result.errors.cost).toBe("Costo inválido")
  })

  it("exige enteros no negativos en cantidad y umbral", () => {
    const result = validateProductForm(
      withInput({ stockQuantity: "-3", lowStockThreshold: "mucho" })
    )
    expect(result.errors.stockQuantity).toBe("Cantidad de stock inválida")
    expect(result.errors.lowStockThreshold).toBe("Umbral de stock bajo inválido")
  })

  it("delega SKU y código de barras en sus validadores", () => {
    const result = validateProductForm(
      withInput({ sku: "-inicio", barcode: "123" })
    )
    expect(result.errors.sku).toContain("SKU")
    expect(result.errors.barcode).toContain("dígitos")
  })

  it("rechaza una ventana de oferta invertida", () => {
    const result = validateProductForm(
      withInput({
        salePrice: "9",
        saleStartsAt: "2026-03-10T10:00",
        saleEndsAt: "2026-03-01T10:00",
      })
    )
    expect(result.errors.saleWindow).toBe(
      "La oferta no puede empezar después de terminar"
    )
  })

  it("acepta una ventana de oferta en orden y con un solo extremo", () => {
    expect(
      validateProductForm(
        withInput({
          saleStartsAt: "2026-03-01T10:00",
          saleEndsAt: "2026-03-10T10:00",
        })
      ).errors.saleWindow
    ).toBeUndefined()
    expect(
      validateProductForm(withInput({ saleEndsAt: "2026-03-10T10:00" })).errors
        .saleWindow
    ).toBeUndefined()
  })

  it("devuelve todos los errores a la vez y ordena el foco por campo del formulario", () => {
    const result = validateProductForm({
      name: "",
      price: "-1",
      salePrice: "-1",
      cost: "-1",
      stockQuantity: "-1",
      lowStockThreshold: "-1",
      sku: "-x",
      barcode: "1",
      saleStartsAt: "2026-03-10T10:00",
      saleEndsAt: "2026-03-01T10:00",
    })
    expect(Object.keys(result.errors)).toEqual([
      "name",
      "price",
      "salePrice",
      "cost",
      "stockQuantity",
      "lowStockThreshold",
      "sku",
      "barcode",
      "saleWindow",
    ])
    expect(result.firstInvalid).toBe("name")
  })

  it("todo campo con error tiene un control al que llevar el foco", () => {
    const result = validateProductForm({
      name: "",
      price: "-1",
      salePrice: "-1",
      cost: "-1",
      stockQuantity: "-1",
      lowStockThreshold: "-1",
      sku: "-x",
      barcode: "1",
      saleStartsAt: "2026-03-10T10:00",
      saleEndsAt: "2026-03-01T10:00",
    })
    for (const key of Object.keys(result.errors)) {
      expect(PRODUCT_FIELD_INPUT_IDS[key]).toBeTruthy()
    }
  })
})

describe("formKeyForServerField", () => {
  it("traduce las columnas del servidor a las claves del formulario", () => {
    expect(formKeyForServerField("name")).toBe("name")
    expect(formKeyForServerField("sale_price")).toBe("salePrice")
    expect(formKeyForServerField("low_stock_threshold")).toBe("lowStockThreshold")
    expect(formKeyForServerField("stock_quantity")).toBe("stockQuantity")
    expect(formKeyForServerField("stock_status")).toBe("stockStatus")
    expect(formKeyForServerField("sku")).toBe("sku")
    expect(formKeyForServerField("barcode")).toBe("barcode")
  })

  it("cada clave traducida tiene control al que llevar el foco", () => {
    // Un 400 de campo que no se puede pintar acaba en el aviso general, así que
    // el mapa de ids y el de columnas tienen que ir juntos.
    for (const field of ["stock_status", "stock_quantity", "sale_price", "cost"]) {
      const key = formKeyForServerField(field)
      expect(key).not.toBeNull()
      expect(PRODUCT_FIELD_INPUT_IDS[key as string]).toBeTruthy()
    }
  })

  it("manda las dos fechas de la oferta al mismo campo", () => {
    expect(formKeyForServerField("sale_starts_at")).toBe("saleWindow")
    expect(formKeyForServerField("sale_ends_at")).toBe("saleWindow")
  })

  it("no marca nada cuando el servidor no dice el campo o no hay control", () => {
    expect(formKeyForServerField(undefined)).toBeNull()
    expect(formKeyForServerField(null)).toBeNull()
    expect(formKeyForServerField(42)).toBeNull()
    expect(formKeyForServerField("productId")).toBeNull()
  })

  it("toda clave traducida tiene un control al que llevar el foco", () => {
    const serverFields = [
      "name",
      "category_id",
      "price",
      "sale_price",
      "sale_starts_at",
      "sale_ends_at",
      "cost",
      "stock_quantity",
      "low_stock_threshold",
      "sku",
      "barcode",
    ]
    for (const field of serverFields) {
      const key = formKeyForServerField(field)
      expect(key).toBeTruthy()
      expect(PRODUCT_FIELD_INPUT_IDS[key as string]).toBeTruthy()
    }
  })
})
