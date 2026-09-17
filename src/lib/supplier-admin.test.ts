import { describe, expect, it } from "vitest"
import {
  SUPPLIER_STATUSES,
  isSupplierStatus,
  normalizeWebsite,
  normalizeWhatsApp,
  slugifySupplierName,
  uniqueSupplierSlug,
  validateSupplierInput,
  validateSupplierPatch,
  validateSupplierProductInput,
  validateSupplierProductPatch,
} from "./supplier-admin"

describe("isSupplierStatus", () => {
  it("acepta los estatus de la migración 00066", () => {
    for (const status of SUPPLIER_STATUSES) {
      expect(isSupplierStatus(status)).toBe(true)
    }
  })

  it("rechaza cualquier otro valor", () => {
    expect(isSupplierStatus("activo ")).toBe(false)
    expect(isSupplierStatus("ACTIVO")).toBe(false)
    expect(isSupplierStatus(null)).toBe(false)
    expect(isSupplierStatus(7)).toBe(false)
  })
})

describe("normalizeWhatsApp", () => {
  it("deja sólo dígitos porque el enlace es wa.me/<dígitos>", () => {
    expect(normalizeWhatsApp("+52 1 614 533 7486")).toBe("5216145337486")
    expect(normalizeWhatsApp("(614) 533-7486")).toBe("6145337486")
  })

  it("trata vacío y null como 'sin WhatsApp'", () => {
    expect(normalizeWhatsApp("")).toBeNull()
    expect(normalizeWhatsApp("   ")).toBeNull()
    expect(normalizeWhatsApp(null)).toBeNull()
    expect(normalizeWhatsApp(undefined)).toBeNull()
  })

  it("rechaza números que no pueden ser reales", () => {
    expect(normalizeWhatsApp("12345")).toBeUndefined()
    expect(normalizeWhatsApp("1".repeat(16))).toBeUndefined()
  })

  it("rechaza tipos que no son texto", () => {
    expect(normalizeWhatsApp(6145337486)).toBeUndefined()
    expect(normalizeWhatsApp({})).toBeUndefined()
  })
})

describe("normalizeWebsite", () => {
  it("antepone https:// cuando falta el esquema", () => {
    expect(normalizeWebsite("proveedor.com")).toBe("https://proveedor.com")
  })

  it("respeta el esquema existente", () => {
    expect(normalizeWebsite("http://proveedor.com")).toBe("http://proveedor.com")
    expect(normalizeWebsite("HTTPS://proveedor.com")).toBe("HTTPS://proveedor.com")
  })
})

describe("slugifySupplierName", () => {
  it("quita acentos, espacios y signos", () => {
    expect(slugifySupplierName("Ñandú & Cía. S.A.")).toBe("nandu-cia-s-a")
  })

  it("nunca devuelve vacío, porque la columna es NOT NULL", () => {
    expect(slugifySupplierName("")).toBe("proveedor")
    expect(slugifySupplierName("!!!")).toBe("proveedor")
  })

  it("recorta a 60 caracteres sin dejar guión colgando", () => {
    const slug = slugifySupplierName(`${"a".repeat(59)} b`)
    expect(slug).toBe("a".repeat(59))
  })
})

describe("uniqueSupplierSlug", () => {
  it("conserva el slug libre", () => {
    expect(uniqueSupplierSlug("central", new Set())).toBe("central")
  })

  it("resuelve colisiones con sufijo determinista", () => {
    expect(uniqueSupplierSlug("central", new Set(["central"]))).toBe("central-2")
    expect(uniqueSupplierSlug("central", new Set(["central", "central-2"]))).toBe("central-3")
  })

  it("sigue devolviendo un slug libre cuando se agotan los sufijos", () => {
    const taken = new Set(["central"])
    for (let n = 2; n <= 99; n++) taken.add(`central-${n}`)
    const slug = uniqueSupplierSlug("central", taken)
    expect(slug.startsWith("central")).toBe(true)
    expect(taken.has(slug)).toBe(false)
  })
})

describe("validateSupplierInput", () => {
  it("exige el nombre", () => {
    const result = validateSupplierInput({})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/nombre/i)
  })

  it("rechaza un nombre de sólo espacios", () => {
    expect(validateSupplierInput({ name: "   " }).ok).toBe(false)
  })

  it("aplica el estatus por defecto y normaliza los opcionales", () => {
    const result = validateSupplierInput({
      name: "  Distribuidora Central  ",
      whatsapp: "+52 1 614 533 7486",
      website: "central.mx",
      email: "ventas@central.mx",
      notes: "",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      name: "Distribuidora Central",
      status: "prospecto",
      whatsapp: "5216145337486",
      website: "https://central.mx",
      email: "ventas@central.mx",
      notes: null,
      contact_name: null,
      phone: null,
      address: null,
      city: null,
      state: null,
    })
  })

  it("rechaza un estatus fuera del catálogo", () => {
    const result = validateSupplierInput({ name: "X", status: "activo_total" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/estatus/i)
  })

  it("rechaza emails sin forma de email", () => {
    for (const email of ["ventas", "ventas@", "@central.mx", "ventas@central", "a b@c.mx"]) {
      const result = validateSupplierInput({ name: "X", email })
      expect(result.ok, email).toBe(false)
    }
  })

  it("acepta email nulo o vacío como 'sin email'", () => {
    for (const email of [null, "", "  "]) {
      const result = validateSupplierInput({ name: "X", email })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.email).toBeNull()
    }
  })

  it("rechaza un WhatsApp imposible en vez de guardarlo roto", () => {
    const result = validateSupplierInput({ name: "X", whatsapp: "123" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/10 y 15 dígitos/)
  })

  it("rechaza campos de texto con tipo equivocado", () => {
    expect(validateSupplierInput({ name: "X", city: 42 }).ok).toBe(false)
    expect(validateSupplierInput({ name: "X", notes: {} }).ok).toBe(false)
  })

  it("recorta el nombre y las notas a la longitud de la columna", () => {
    const result = validateSupplierInput({
      name: "n".repeat(200),
      notes: "x".repeat(5000),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.name).toHaveLength(120)
    expect(result.value.notes).toHaveLength(2000)
  })
})

describe("validateSupplierPatch", () => {
  it("rechaza un body sin campos editables", () => {
    const result = validateSupplierPatch({})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/ningún campo/i)
  })

  it("sólo toca las claves presentes", () => {
    const result = validateSupplierPatch({ city: "Chihuahua" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({ city: "Chihuahua" })
    expect(result.renamed).toBe(false)
  })

  it("marca renamed cuando viene el nombre", () => {
    const result = validateSupplierPatch({ name: "Nuevo Nombre" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.renamed).toBe(true)
    expect(result.value.name).toBe("Nuevo Nombre")
  })

  it("no permite vaciar el nombre", () => {
    const result = validateSupplierPatch({ name: "  " })
    expect(result.ok).toBe(false)
  })

  it("permite limpiar un opcional con null", () => {
    const result = validateSupplierPatch({ phone: null, whatsapp: null, notes: null })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({ phone: null, whatsapp: null, notes: null })
  })

  it("valida estatus, email y whatsapp cuando vienen", () => {
    expect(validateSupplierPatch({ status: "nope" }).ok).toBe(false)
    expect(validateSupplierPatch({ email: "sin-arroba" }).ok).toBe(false)
    expect(validateSupplierPatch({ whatsapp: "12" }).ok).toBe(false)
  })

  it("normaliza el sitio web al editarlo", () => {
    const result = validateSupplierPatch({ website: "central.mx" })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.website).toBe("https://central.mx")
  })
})

describe("validateSupplierProductInput", () => {
  it("exige un producto válido", () => {
    expect(validateSupplierProductInput({ product_id: 0 }).ok).toBe(false)
    expect(validateSupplierProductInput({ product_id: "abc" }).ok).toBe(false)
    expect(validateSupplierProductInput({ product_id: 1.5 }).ok).toBe(false)
    expect(validateSupplierProductInput({}).ok).toBe(false)
  })

  it("acepta el alta mínima y deja el vínculo como principal", () => {
    const result = validateSupplierProductInput({ product_id: 12 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      product_id: 12,
      supplier_sku: null,
      presentation: null,
      cost: null,
      list_date: null,
      is_primary: true,
      notes: null,
    })
  })

  it("redondea el costo a centavos", () => {
    const result = validateSupplierProductInput({ product_id: 12, cost: 123.456 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.cost).toBe(123.46)
  })

  it("acepta costo cero, que es un costo capturado y no un hueco", () => {
    const result = validateSupplierProductInput({ product_id: 12, cost: 0 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.cost).toBe(0)
  })

  it("rechaza costos negativos o absurdos", () => {
    expect(validateSupplierProductInput({ product_id: 12, cost: -1 }).ok).toBe(false)
    expect(validateSupplierProductInput({ product_id: 12, cost: 1e12 }).ok).toBe(false)
  })

  it("valida el formato y la existencia real de la fecha de lista", () => {
    expect(validateSupplierProductInput({ product_id: 12, list_date: "01/02/2025" }).ok).toBe(false)
    expect(validateSupplierProductInput({ product_id: 12, list_date: "2025-02-30" }).ok).toBe(false)
    const ok = validateSupplierProductInput({ product_id: 12, list_date: "2024-02-29" })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value.list_date).toBe("2024-02-29")
  })

  it("respeta is_primary explícito y lo vuelve booleano", () => {
    const off = validateSupplierProductInput({ product_id: 12, is_primary: false })
    expect(off.ok).toBe(true)
    if (off.ok) expect(off.value.is_primary).toBe(false)

    const truthy = validateSupplierProductInput({ product_id: 12, is_primary: "true" })
    expect(truthy.ok).toBe(true)
    if (truthy.ok) expect(truthy.value.is_primary).toBe(true)

    const numeric = validateSupplierProductInput({ product_id: 12, is_primary: 0 })
    expect(numeric.ok).toBe(true)
    if (numeric.ok) expect(numeric.value.is_primary).toBe(false)
  })

  it("rechaza un is_primary que no sabe interpretar", () => {
    const result = validateSupplierProductInput({ product_id: 12, is_primary: {} })
    expect(result.ok).toBe(false)
  })
})

describe("validateSupplierProductPatch", () => {
  it("no acepta mover el vínculo de producto", () => {
    const result = validateSupplierProductPatch({ product_id: 99 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/ningún campo/i)
  })

  it("edita costo, SKU y presentación", () => {
    const result = validateSupplierProductPatch({
      cost: "150.005",
      supplier_sku: "  ABC-1 ",
      presentation: "Caja 12 pzas",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      cost: 150.01,
      supplier_sku: "ABC-1",
      presentation: "Caja 12 pzas",
    })
  })

  it("permite quitar el costo y el SKU", () => {
    const result = validateSupplierProductPatch({ cost: null, supplier_sku: null })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ cost: null, supplier_sku: null })
  })

  it("normaliza is_primary a booleano", () => {
    const on = validateSupplierProductPatch({ is_primary: 1 })
    expect(on.ok).toBe(true)
    if (on.ok) expect(on.value.is_primary).toBe(true)

    const off = validateSupplierProductPatch({ is_primary: "false" })
    expect(off.ok).toBe(true)
    if (off.ok) expect(off.value.is_primary).toBe(false)
  })

  it("rechaza un is_primary que no sabe interpretar", () => {
    const result = validateSupplierProductPatch({ is_primary: "quizá" })
    expect(result.ok).toBe(false)
  })

  it("rechaza un body sin campos editables", () => {
    expect(validateSupplierProductPatch({}).ok).toBe(false)
  })
})
