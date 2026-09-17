import { describe, expect, it } from "vitest"
import { PRODUCT_FLAG_KEYS } from "@/lib/admin-product-filters"
import {
  describeProductPreset,
  isActiveProductPreset,
  makeProductPreset,
  MAX_PRODUCT_PRESETS,
  normalizePresetQuery,
  parseProductPresets,
  parseLegacyProductPresets,
  PRODUCT_FLAG_LABELS,
  PRODUCT_PRESETS_LEGACY_KEY,
  PRODUCT_PRESETS_STORAGE_KEY,
  productPresetFilterCount,
  removeProductPreset,
  serializeProductPresets,
  upsertProductPreset,
  type ProductPreset,
} from "@/lib/product-filter-presets"

describe("normalizePresetQuery", () => {
  it("quita el `?`, la página y los valores vacíos", () => {
    expect(normalizePresetQuery("?q=taco&page=7&category=")).toBe("q=taco")
  })

  it("ordena los parámetros para que dos URLs equivalentes coincidan", () => {
    expect(normalizePresetQuery("stock=low_stock&q=taco")).toBe("q=taco&stock=low_stock")
  })

  it("conserva los parámetros repetidos", () => {
    expect(normalizePresetQuery("tag=a&tag=b")).toBe("tag=a&tag=b")
  })

  it("acepta una query ya canónica sin cambios", () => {
    const canonical = normalizePresetQuery("q=taco&noImage=1")
    expect(normalizePresetQuery(canonical)).toBe(canonical)
  })
})

describe("parseProductPresets", () => {
  it("devuelve [] sin datos o con JSON inválido", () => {
    expect(parseProductPresets(null)).toEqual([])
    expect(parseProductPresets("")).toEqual([])
    expect(parseProductPresets("{")).toEqual([])
    expect(parseProductPresets('"texto"')).toEqual([])
    expect(parseProductPresets("{}")).toEqual([])
  })

  it("descarta entradas sin nombre o sin query en vez de romper la barra", () => {
    const json = JSON.stringify([
      { name: "Ofertas", query: "onSale=1" },
      { name: 7, query: "onSale=1" },
      { name: "Sin query" },
      { query: "noImage=1" },
      null,
      "Ofertas",
    ])
    expect(parseProductPresets(json)).toEqual([{ name: "Ofertas", query: "onSale=1" }])
  })

  it("normaliza la query y el nombre al leer", () => {
    const json = JSON.stringify([{ name: "  Ofertas  ", query: "?page=3&onSale=1" }])
    expect(parseProductPresets(json)).toEqual([{ name: "Ofertas", query: "onSale=1" }])
  })

  it("ignora un nombre vacío tras recortar", () => {
    expect(parseProductPresets(JSON.stringify([{ name: "   ", query: "onSale=1" }]))).toEqual([])
  })

  it("se queda con el primer nombre repetido y respeta el tope", () => {
    const repeated = JSON.stringify([
      { name: "Ofertas", query: "onSale=1" },
      { name: "ofertas", query: "onSale=0" },
    ])
    expect(parseProductPresets(repeated)).toEqual([{ name: "Ofertas", query: "onSale=1" }])

    const many = JSON.stringify(
      Array.from({ length: MAX_PRODUCT_PRESETS + 5 }, (_, i) => ({ name: `V${i}`, query: `q=${i}` }))
    )
    expect(parseProductPresets(many)).toHaveLength(MAX_PRODUCT_PRESETS)
  })

  it("ida y vuelta con serializeProductPresets", () => {
    const presets: ProductPreset[] = [
      { name: "Ofertas", query: "onSale=1" },
      { name: "Sin imagen", query: "noImage=1&stock=out_of_stock" },
    ]
    expect(parseProductPresets(serializeProductPresets(presets))).toEqual(presets)
  })

  it("exporta una clave de almacenamiento propia del listado", () => {
    expect(PRODUCT_PRESETS_STORAGE_KEY).toBe("admin-productos-vistas")
  })
})

describe("makeProductPreset", () => {
  it("recorta el nombre y normaliza la query", () => {
    expect(makeProductPreset("  Ofertas  ", "?onSale=1&page=2")).toEqual({
      name: "Ofertas",
      query: "onSale=1",
    })
  })

  it("devuelve null si el nombre queda vacío", () => {
    expect(makeProductPreset("   ", "onSale=1")).toBeNull()
  })

  it("limita la longitud del nombre", () => {
    expect(makeProductPreset("x".repeat(80), "")!.name).toHaveLength(40)
  })

  it("permite guardar la vista sin filtros", () => {
    expect(makeProductPreset("Todo", "")).toEqual({ name: "Todo", query: "" })
  })
})

describe("upsertProductPreset", () => {
  const base: ProductPreset[] = [
    { name: "Ofertas", query: "onSale=1" },
    { name: "Sin imagen", query: "noImage=1" },
  ]

  it("reemplaza por nombre sin distinguir mayúsculas y conserva la posición", () => {
    const next = upsertProductPreset(base, { name: "ofertas", query: "onSale=1&stock=low_stock" })
    expect(next).toHaveLength(2)
    expect(next[0]).toEqual({ name: "ofertas", query: "onSale=1&stock=low_stock" })
    expect(next[1]).toEqual(base[1])
  })

  it("añade al final una vista nueva", () => {
    const next = upsertProductPreset(base, { name: "Papelera", query: "trash=1" })
    expect(next.map((p) => p.name)).toEqual(["Ofertas", "Sin imagen", "Papelera"])
  })

  it("descarta la más antigua al superar el tope", () => {
    let presets: ProductPreset[] = []
    for (let i = 0; i < MAX_PRODUCT_PRESETS + 2; i++) {
      presets = upsertProductPreset(presets, { name: `V${i}`, query: `q=${i}` })
    }
    expect(presets).toHaveLength(MAX_PRODUCT_PRESETS)
    expect(presets.map((p) => p.name)[0]).toBe("V2")
  })
})

describe("removeProductPreset", () => {
  it("elimina por nombre sin distinguir mayúsculas", () => {
    const presets: ProductPreset[] = [
      { name: "Ofertas", query: "onSale=1" },
      { name: "Sin imagen", query: "noImage=1" },
    ]
    expect(removeProductPreset(presets, "OFERTAS")).toEqual([presets[1]])
  })

  it("no cambia nada si el nombre no existe", () => {
    const presets: ProductPreset[] = [{ name: "Ofertas", query: "onSale=1" }]
    expect(removeProductPreset(presets, "Otra")).toEqual(presets)
  })
})

describe("isActiveProductPreset", () => {
  const preset: ProductPreset = { name: "Ofertas", query: "onSale=1&q=taco" }

  it("reconoce la vista aunque la URL cambie de orden o de página", () => {
    expect(isActiveProductPreset(preset, "?q=taco&onSale=1")).toBe(true)
    expect(isActiveProductPreset(preset, "onSale=1&q=taco&page=4")).toBe(true)
  })

  it("no la marca activa si cambia cualquier filtro", () => {
    expect(isActiveProductPreset(preset, "onSale=1")).toBe(false)
    expect(isActiveProductPreset(preset, "onSale=1&q=tacos")).toBe(false)
  })
})

describe("productPresetFilterCount", () => {
  it("cuenta los filtros activos de la vista", () => {
    expect(productPresetFilterCount({ name: "Todo", query: "" })).toBe(0)
    expect(productPresetFilterCount({ name: "Ofertas", query: "onSale=1&q=taco" })).toBe(2)
  })

  it("no cuenta el orden ni la vista", () => {
    expect(productPresetFilterCount({ name: "Ventas", query: "sort=sales&dir=desc&view=grid" })).toBe(0)
  })
})

describe("describeProductPreset", () => {
  it("describe filtros, orden y vista", () => {
    const text = describeProductPreset({
      name: "Alerta",
      query: "q=taco&stock=low_stock&noImage=1&sort=sales&dir=desc&view=grid",
    })
    expect(text).toContain("«taco»")
    expect(text).toContain("Stock bajo")
    expect(text).toContain("Sin imagen")
    expect(text).toContain("Más vendidos ↓")
    expect(text).toContain("Tarjetas")
  })

  it("describe la vista sin filtros solo con su orden", () => {
    expect(describeProductPreset({ name: "Todo", query: "" })).toBe("Nombre ↑")
  })

  it("traduce categoría, etiqueta, marca, ciudad y publicación", () => {
    const text = describeProductPreset({
      name: "Mix",
      query: "category=tacos&tag=nuevo&brand=Acme&city=lima&status=unpublished",
    })
    expect(text).toContain("Categoría: tacos")
    expect(text).toContain("Etiqueta: nuevo")
    expect(text).toContain("Marca: Acme")
    expect(text).toContain("Ciudad: lima")
    expect(text).toContain("Ocultos")
  })
})

describe("PRODUCT_FLAG_LABELS", () => {
  it("etiqueta todos los filtros rápidos y ninguno de más", () => {
    expect(Object.keys(PRODUCT_FLAG_LABELS).sort()).toEqual([...PRODUCT_FLAG_KEYS].sort())
    for (const label of Object.values(PRODUCT_FLAG_LABELS)) {
      expect(label.trim()).not.toBe("")
    }
  })
})

describe("parseLegacyProductPresets", () => {
  it("usa una clave distinta de la actual", () => {
    expect(PRODUCT_PRESETS_LEGACY_KEY).not.toBe(PRODUCT_PRESETS_STORAGE_KEY)
  })

  it("convierte el objeto `params` del panel anterior a la query canónica", () => {
    const legacy = JSON.stringify([
      { name: "Sin imagen", params: { noImage: "1", sort: "sales", dir: "desc", view: "grid" } },
    ])
    expect(parseLegacyProductPresets(legacy)).toEqual([
      { name: "Sin imagen", query: "dir=desc&noImage=1&sort=sales&view=grid" },
    ])
  })

  it("descarta valores vacíos y parámetros que no son texto", () => {
    const legacy = JSON.stringify([{ name: "Todo", params: { q: "", page: "3", n: 5 } }])
    expect(parseLegacyProductPresets(legacy)).toEqual([{ name: "Todo", query: "" }])
  })

  it("normaliza la página fuera de la vista heredada", () => {
    const legacy = JSON.stringify([{ name: "Papelera", params: { trash: "1", page: "4" } }])
    expect(parseLegacyProductPresets(legacy)).toEqual([{ name: "Papelera", query: "trash=1" }])
  })

  it("ignora entradas sin nombre, sin params o de tipo inesperado", () => {
    const legacy = JSON.stringify([
      { name: "Buena", params: { trash: "1" } },
      { params: { trash: "1" } },
      { name: "Sin params" },
      { name: 7, params: {} },
      "texto suelto",
      null,
    ])
    expect(parseLegacyProductPresets(legacy)).toEqual([{ name: "Buena", query: "trash=1" }])
  })

  it("aplica el tope de vistas al migrar", () => {
    const legacy = JSON.stringify(
      Array.from({ length: MAX_PRODUCT_PRESETS + 3 }, (_, i) => ({
        name: `V${i}`,
        params: { q: `t${i}` },
      }))
    )
    expect(parseLegacyProductPresets(legacy)).toHaveLength(MAX_PRODUCT_PRESETS)
  })

  it("nunca lanza con almacenamiento corrupto o ausente", () => {
    expect(parseLegacyProductPresets(null)).toEqual([])
    expect(parseLegacyProductPresets("")).toEqual([])
    expect(parseLegacyProductPresets("{no-json")).toEqual([])
    expect(parseLegacyProductPresets('{"name":"no es lista"}')).toEqual([])
  })
})
