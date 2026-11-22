import { describe, expect, it } from "vitest"
import {
  META_FEED_COLUMNS,
  buildMetaFeedCsv,
  metaFeedIdForNew,
  metaFeedMapEntry,
  toAbsoluteImageUrl,
} from "@/lib/meta-feed"
import type { Category, Product } from "@/types"

function product(overrides: Partial<Product>): Product {
  return {
    id: 1,
    name: "Achiote",
    slug: "achiote",
    description: "Semillas de achiote para dar color natural a las comidas.",
    image_url: "/images/products/ai/achiote.webp",
    brand: "Local",
    category_id: 2,
    price: 6.31,
    sale_price: null,
    stock_status: "in_stock",
    show_in_whatsapp: true,
    whatsapp_product_id: null,
    unit: "bolsa 50 g",
    ...overrides,
  } as Product
}

function category(overrides: Partial<Category>): Category {
  return {
    id: 2,
    name: "Abarrotes",
    slug: "abarrotes",
    description: null,
    ...overrides,
  } as Category
}

describe("metaFeedMapEntry", () => {
  it("conserva el id y el título del feed temporal aunque el nombre actual cambió", () => {
    // El nombre actual en el sitio es "Ala 1-2 IQF Pilgrim's (caja 12 kg)";
    // el id de Meta sigue siendo el del feed temporal.
    const entry = metaFeedMapEntry("ala-iqf-pilgrims-caja-12kg")
    expect(entry?.id).toBe("carnes-aves-y-pescados-ala-1-2-iqf-pilgrim-s")
    expect(entry?.title).toBe("Ala 1-2 IQF Pilgrim's")
    expect(entry?.description).toBe("Caja 12 kg — precio por kilo")
  })

  it("el mapa cubre las 268 filas del feed temporal", () => {
    expect(metaFeedMapEntry("achiote")?.id).toBe("abarrotes-achiote")
    expect(metaFeedMapEntry("ajo")?.id).toBe("frutas-y-verduras-ajo")
    expect(metaFeedMapEntry("apio")).toBeUndefined()
  })
})

describe("metaFeedIdForNew", () => {
  it("deriva el id del slug, estable frente a cambios de nombre", () => {
    expect(metaFeedIdForNew("Frutas y Verduras", "apio")).toBe("frutas-y-verduras-apio")
    expect(metaFeedIdForNew("Lácteos y Huevos", "huevo-blanco")).toBe(
      "lacteos-y-huevos-huevo-blanco",
    )
  })
})

describe("toAbsoluteImageUrl", () => {
  it("deja directas las rutas del sitio y las URLs absolutas", () => {
    expect(toAbsoluteImageUrl("/images/products/ai/achiote.webp")).toBe(
      "https://resurte.me/images/products/ai/achiote.webp",
    )
    expect(
      toAbsoluteImageUrl("https://storage.googleapis.com/takeapp/media/x.png"),
    ).toBe("https://storage.googleapis.com/takeapp/media/x.png")
  })

  it("desenvuelve una URL _next/image en vez de publicarla rota", () => {
    expect(
      toAbsoluteImageUrl(
        "https://resurte.me/_next/image?url=%2Fimages%2Fproducts%2Fai%2Fachiote.webp&w=1200&q=80",
      ),
    ).toBe("https://resurte.me/images/products/ai/achiote.webp")
  })

  it("devuelve null sin imagen", () => {
    expect(toAbsoluteImageUrl(null)).toBeNull()
    expect(toAbsoluteImageUrl("")).toBeNull()
  })
})

describe("buildMetaFeedCsv", () => {
  it("emite las mismas columnas y valores que el feed temporal", () => {
    const { csv, included, mapped } = buildMetaFeedCsv([product({})], [category({})])
    const lines = csv.trim().split("\n")
    expect(lines[0]).toBe(META_FEED_COLUMNS.join(","))
    expect(included).toBe(1)
    expect(mapped).toBe(1)
    expect(lines[1]).toBe(
      "abarrotes-achiote,Achiote,Bolsa 50 g,https://resurte.me/chihuahua/producto/achiote," +
        "https://resurte.me/images/products/ai/achiote.webp,Resurte.me,6.31 MXN,in stock,new," +
        '"{latitude: 28.63581, longitude: -106.07645}",20,km,Abarrotes,abarrotes',
    )
  })

  it("usa el precio de oferta vigente y marca agotados", () => {
    const { csv } = buildMetaFeedCsv(
      [
        product({ name: "Anís", slug: "anis", price: 324, sale_price: 300, unit: "por kilo" }),
        product({
          name: "Fresa",
          slug: "fresa",
          price: 111,
          stock_status: "out_of_stock",
          unit: "por kilo",
        }),
      ],
      [category({}), category({ id: 15, name: "Frutas y Verduras", slug: "frutas-verduras" })],
    )
    expect(csv).toContain("300.00 MXN")
    expect(csv).toContain("out of stock")
  })

  it("un producto nuevo sin entrada en el mapa usa id por slug y presentación", () => {
    const { csv, unmapped } = buildMetaFeedCsv(
      [
        product({
          name: "Apio",
          slug: "apio",
          price: 24.9,
          unit: "por kilo",
          image_url: "/images/products/ai/apio.webp",
          category_id: 15,
        }),
      ],
      [category({ id: 15, name: "Frutas y Verduras", slug: "frutas-verduras" })],
    )
    expect(unmapped).toBe(1)
    expect(csv).toContain("frutas-y-verduras-apio,Apio,Por kilo,")
    expect(csv).toContain("24.90 MXN")
  })

  it("salta productos sin imagen o sin categoría y los cuenta", () => {
    const result = buildMetaFeedCsv(
      [
        product({}),
        product({ name: "Sin foto", slug: "sin-foto", image_url: "" }),
        product({ name: "Sin categoría", slug: "sin-categoria", category_id: 999 }),
      ],
      [category({})],
    )
    expect(result.included).toBe(1)
    expect(result.skippedNoImage).toBe(1)
    expect(result.skippedNoCategory).toBe(1)
  })
})
