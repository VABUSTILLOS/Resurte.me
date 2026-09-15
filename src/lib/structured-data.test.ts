import { describe, expect, it } from "vitest"
import {
  getCityLandingSchema,
  getDatasetSchema,
  getItemListSchema,
  getOrganizationSchema,
  getProductSchema,
  getWebSiteSchema,
  getWholesaleServiceSchema,
  generateSitemapXml,
} from "./structured-data"
import { ORGANIZATION_ID, PRIMARY_AUTHOR, SITE_URL } from "./author"

describe("getProductSchema", () => {
  it("usa la imagen real del producto cuando se pasa", () => {
    const schema = getProductSchema(
      "Aguacate Hass",
      "Aguacate de Michoacán",
      "Michoacán",
      120,
      "in_stock",
      "https://supabase.co/storage/producto.png"
    )
    expect(schema.image).toBe("https://supabase.co/storage/producto.png")
    expect(schema.image).not.toContain("placeholder-product")
  })

  it("no usa el placeholder-product.png inexistente como fallback", () => {
    const schema = getProductSchema("X", "Y", "Z", 1, "in_stock")
    expect(schema.image).not.toContain("placeholder-product")
  })

  it("mapea stock_status a availability de schema.org", () => {
    expect(getProductSchema("X", "Y", "Z", 1, "in_stock").offers.availability).toBe(
      "https://schema.org/InStock"
    )
    expect(getProductSchema("X", "Y", "Z", 1, "low_stock").offers.availability).toBe(
      "https://schema.org/LimitedAvailability"
    )
    expect(getProductSchema("X", "Y", "Z", 1, "out_of_stock").offers.availability).toBe(
      "https://schema.org/OutOfStock"
    )
  })
})

describe("getOrganizationSchema", () => {
  it("usa un logo real (images/store/logo.webp), no el logo.png inexistente", () => {
    const schema = getOrganizationSchema()
    expect(schema.logo).toBe("https://resurte.me/images/store/logo.webp")
    expect(schema.logo).not.toContain("logo.png")
  })

  it("expone el `@id` canónico al que apuntan los demás schemas", () => {
    expect(getOrganizationSchema()["@id"]).toBe(ORGANIZATION_ID)
  })

  it("declara 'Resurte' como alternateName para que no se lea como otra marca", () => {
    expect(getOrganizationSchema().alternateName).toContain("Resurte")
  })

  it("enlaza el founder con la entidad Person del autor, no con un objeto suelto", () => {
    const founder = getOrganizationSchema().founder
    expect(founder["@type"]).toBe("Person")
    expect(founder["@id"]).toBe(PRIMARY_AUTHOR.id)
  })

  it("cubre las 20 ciudades como `City` estructuradas", () => {
    const schema = getOrganizationSchema()
    expect(schema.areaServed.length).toBeGreaterThan(1)
    for (const area of schema.areaServed) {
      expect(area["@type"]).toBe("City")
    }
  })

  it("declara temas de especialidad (knowsAbout) no vacíos", () => {
    expect(getOrganizationSchema().knowsAbout.length).toBeGreaterThan(3)
  })
})

describe("getWebSiteSchema", () => {
  it("publica como la organización global", () => {
    expect(getWebSiteSchema().publisher["@id"]).toBe(ORGANIZATION_ID)
  })

  it("ofrece un SearchAction con plantilla de consulta", () => {
    const action = getWebSiteSchema().potentialAction
    expect(action["@type"]).toBe("SearchAction")
    expect(action.target.urlTemplate).toContain("{search_term_string}")
    expect(action["query-input"]).toContain("search_term_string")
  })

  it("apunta la búsqueda a /blog, la única ruta de búsqueda que resuelve sin ciudad", () => {
    // El buscador de catálogo vive en /{ciudad}/buscar y no existe en la raíz:
    // un agente que siguiera ese template obtendría 404.
    expect(getWebSiteSchema().potentialAction.target.urlTemplate).toBe(
      `${SITE_URL}/blog?q={search_term_string}`
    )
  })
})

describe("getWholesaleServiceSchema", () => {
  it("declara a la organización como provider", () => {
    expect(getWholesaleServiceSchema().provider["@id"]).toBe(ORGANIZATION_ID)
  })

  it("publica las condiciones comerciales que los asistentes citan", () => {
    const schema = getWholesaleServiceSchema()
    expect(schema.offers.priceCurrency).toBe("MXN")
    expect(schema.description).toContain("$2,500")
    expect(schema.description).toContain("$500")
  })
})

describe("getItemListSchema", () => {
  it("devuelve null con lista vacía", () => {
    expect(getItemListSchema("Vacía", `${SITE_URL}/x`, [])).toBeNull()
  })

  it("numera los elementos desde 1 sin huecos", () => {
    const schema = getItemListSchema("Lista", `${SITE_URL}/x`, [
      { name: "A", url: `${SITE_URL}/a` },
      { name: "B", url: `${SITE_URL}/b` },
      { name: "C", url: `${SITE_URL}/c` },
    ])
    expect(schema?.numberOfItems).toBe(3)
    expect(schema?.itemListElement.map((e) => e.position)).toEqual([1, 2, 3])
  })

  it("no duplica el detalle del elemento fuera de `item`", () => {
    const schema = getItemListSchema("Lista", `${SITE_URL}/x`, [
      { name: "A", url: `${SITE_URL}/a`, description: "Descripción A" },
    ])
    const entry = schema?.itemListElement[0]
    if (!entry) throw new Error("esperaba al menos un elemento")
    // El ListItem sólo aporta el orden; name/url/description viven en `item`.
    expect(Object.keys(entry).sort()).toEqual(["@type", "item", "position"])
    expect(entry.item).toEqual({
      "@type": "Thing",
      name: "A",
      url: `${SITE_URL}/a`,
      description: "Descripción A",
    })
  })

  it("respeta itemType y omite description cuando no se provee", () => {
    const schema = getItemListSchema(
      "Preguntas",
      `${SITE_URL}/preguntas`,
      [{ name: "¿Cuánto cuesta?", url: `${SITE_URL}/preguntas#cuanto` }],
      "Question"
    )
    const entry = schema?.itemListElement[0]
    if (!entry) throw new Error("esperaba al menos un elemento")
    expect(entry.item["@type"]).toBe("Question")
    expect("description" in entry.item).toBe(false)
  })
})

describe("getDatasetSchema", () => {
  it("emite un Dataset con la organización como creador y publicador", () => {
    const schema = getDatasetSchema({
      name: "Índice de precios",
      description: "Precios de referencia por insumo y ciudad.",
      url: `${SITE_URL}/precios`,
    })
    expect(schema["@type"]).toBe("Dataset")
    expect(schema.creator).toEqual({ "@id": ORGANIZATION_ID })
    expect(schema.publisher).toEqual({ "@id": ORGANIZATION_ID })
    expect(schema.isAccessibleForFree).toBe(true)
    expect(schema["@id"]).toBe(`${SITE_URL}/precios#dataset`)
  })

  it("omite las propiedades opcionales que no se pasan", () => {
    const schema = getDatasetSchema({
      name: "Índice de precios",
      description: "Precios de referencia.",
      url: `${SITE_URL}/precios`,
    })
    expect(schema).not.toHaveProperty("variableMeasured")
    expect(schema).not.toHaveProperty("distribution")
    expect(schema).not.toHaveProperty("temporalCoverage")
    expect(schema).not.toHaveProperty("dateModified")
  })

  it("convierte las variables en PropertyValue", () => {
    const schema = getDatasetSchema({
      name: "Índice de precios",
      description: "Precios de referencia.",
      url: `${SITE_URL}/precios`,
      variables: [
        { name: "precio", description: "Precio de referencia.", unitText: "MXN" },
      ],
    })
    expect(schema.variableMeasured).toEqual([
      {
        "@type": "PropertyValue",
        name: "precio",
        description: "Precio de referencia.",
        unitText: "MXN",
      },
    ])
  })

  it("convierte las distribuciones en DataDownload con contentUrl", () => {
    const schema = getDatasetSchema({
      name: "Índice de precios",
      description: "Precios de referencia.",
      url: `${SITE_URL}/precios`,
      distributions: [
        { url: `${SITE_URL}/precios/indice-precios.csv`, format: "text/csv", name: "CSV" },
      ],
    })
    expect(schema.distribution).toEqual([
      {
        "@type": "DataDownload",
        contentUrl: `${SITE_URL}/precios/indice-precios.csv`,
        encodingFormat: "text/csv",
        name: "CSV",
      },
    ])
  })

  it("normaliza dateModified a ISO completo cuando llega una fecha", () => {
    const schema = getDatasetSchema({
      name: "Índice de precios",
      description: "Precios de referencia.",
      url: `${SITE_URL}/precios`,
      dateModified: "2026-03-02T12:00:00Z",
      datePublished: "2026-03-02",
    })
    expect(schema.dateModified).toBe("2026-03-02T12:00:00Z")
    expect(schema.datePublished).toBe("2026-03-02")
  })

  it("declara la cobertura espacial y temporal", () => {
    const schema = getDatasetSchema({
      name: "Índice de precios",
      description: "Precios de referencia.",
      url: `${SITE_URL}/precios`,
      spatialCoverage: "México",
      temporalCoverage: "2026-03-02/..",
    })
    expect(schema.spatialCoverage).toEqual({ "@type": "Place", name: "México" })
    expect(schema.temporalCoverage).toBe("2026-03-02/..")
  })
})

describe("getCityLandingSchema", () => {
  it("usa la ruta dinámica /opengraph-image en vez del og-image.png inexistente", () => {
    const schema = getCityLandingSchema("Chihuahua", "Chihuahua", 28.6, -106.07)
    expect(schema.image).toBe("https://resurte.me/opengraph-image")
    expect(schema.image).not.toContain("og-image.png")
  })

  it("cuelga la tienda de ciudad de la organización global", () => {
    // Sin esto cada ciudad sería una tienda huérfana y la cobertura no se
    // leería como una sola red de proveeduría.
    const schema = getCityLandingSchema("Chihuahua", "Chihuahua", 28.6, -106.07)
    expect(schema.parentOrganization["@id"]).toBe(ORGANIZATION_ID)
  })
})

describe("generateSitemapXml", () => {
  it("genera urlset con las entradas dadas", () => {
    const xml = generateSitemapXml([{ url: "https://resurte.me/", priority: 1.0 }])
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain("<loc>https://resurte.me/</loc>")
    expect(xml).toContain("<priority>1</priority>")
  })
})
