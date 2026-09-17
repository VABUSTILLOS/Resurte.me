import { describe, expect, it } from "vitest"
import {
  absoluteUrl,
  buildBreadcrumbSchema,
  buildFaqSchema,
  buildMenuSchema,
  buildRestaurantManifest,
  buildRestaurantSchema,
  DEFAULT_SEO_ORIGIN,
  DEFAULT_SEO_THEME_COLOR,
  fallbackAbout,
  fallbackFaq,
  googleBusinessChecklist,
  googleBusinessProgress,
  GOOGLE_BUSINESS_CREATE_URL,
  imageMimeType,
  manifestIcons,
  manifestPath,
  menuPath,
  openingHoursSpecification,
  parseFaq,
  restaurantPath,
  safeThemeColor,
  seoDescription,
  seoPagePath,
  seoTitle,
  siteOrigin,
  slugifySeo,
  truncate,
  type SeoBranchFacts,
  type SeoHoursFact,
  type SeoMenuItemFact,
  type SeoRestaurantProfile,
} from "./foodos-seo"

const profile: SeoRestaurantProfile = {
  slug: "tacos-don-beto",
  name: "Tacos Don Beto",
  tagline: "Tacos al pastor desde 1998",
  about: "Una taquería de barrio con receta familiar.",
  logo_url: "https://cdn.example.com/logo.png",
  theme_color: "#B45309",
  currency: "mxn",
}

const branches: SeoBranchFacts[] = [
  {
    name: "Centro",
    city: "Puebla",
    address: "Av. Juárez 123",
    lat: 19.043,
    lng: -98.198,
    phone: "2221234567",
    pickup_active: true,
    delivery_active: true,
    dine_in_active: true,
  },
]

const hours: SeoHoursFact[] = [
  { day_of_week: 0, open_time: "10:00:00", close_time: "14:00:00" },
  { day_of_week: 1, open_time: "09:00:00", close_time: "18:00:00" },
  { day_of_week: 2, open_time: "09:00:00", close_time: "18:00:00" },
  { day_of_week: 3, open_time: "09:00:00", close_time: "18:00:00", is_closed: true },
]

describe("rutas", () => {
  it("arma las rutas públicas del sitio", () => {
    expect(restaurantPath("don-beto")).toBe("/r/don-beto")
    expect(menuPath("don-beto")).toBe("/r/don-beto/carta")
    expect(manifestPath("don-beto")).toBe("/r/don-beto/manifest.webmanifest")
    expect(seoPagePath("don-beto", "sobre-nosotros")).toBe("/r/don-beto/p/sobre-nosotros")
  })
})

describe("siteOrigin", () => {
  it("prefiere NEXT_PUBLIC_SITE_URL y quita la barra final", () => {
    expect(siteOrigin({ NEXT_PUBLIC_SITE_URL: "https://resurte.mx/" })).toBe("https://resurte.mx")
  })

  it("cae al dominio por defecto cuando la variable falta o está vacía", () => {
    expect(siteOrigin({})).toBe(DEFAULT_SEO_ORIGIN)
    expect(siteOrigin({ NEXT_PUBLIC_SITE_URL: "   " })).toBe(DEFAULT_SEO_ORIGIN)
  })
})

describe("absoluteUrl", () => {
  it("normaliza la barra entre origen y ruta", () => {
    expect(absoluteUrl("https://x.com/", "/a")).toBe("https://x.com/a")
    expect(absoluteUrl("https://x.com", "a")).toBe("https://x.com/a")
  })
})

describe("truncate", () => {
  it("no toca el texto que ya cabe", () => {
    expect(truncate("Tacos al pastor", 40)).toBe("Tacos al pastor")
  })

  it("colapsa espacios repetidos", () => {
    expect(truncate("abc   def\n ghi", 100)).toBe("abc def ghi")
  })

  it("corta en frontera de palabra y marca la elipsis", () => {
    expect(truncate("Hola mundo cruel", 10)).toBe("Hola mundo…")
  })

  it("corta duro cuando no hay un espacio razonable", () => {
    expect(truncate("Supercalifragilistico", 5)).toBe("Super…")
  })

  it("no deja puntuación suelta antes de la elipsis", () => {
    expect(truncate("Tacos, pastor y más", 6)).toBe("Tacos…")
  })
})

describe("seoDescription", () => {
  it("prefiere la frase corta sobre el párrafo", () => {
    expect(seoDescription(profile)).toBe("Tacos al pastor desde 1998")
  })

  it("usa la descripción cuando no hay frase corta", () => {
    const value = seoDescription({ ...profile, tagline: null, description: "Cocina de mercado" })
    expect(value).toBe("Cocina de mercado")
  })

  it("cae a la descripción larga si no hay nada más", () => {
    const value = seoDescription({ slug: "x", name: "X", about: "Somos una fonda familiar" })
    expect(value).toBe("Somos una fonda familiar")
  })

  it("arma un texto neutro cuando el perfil está vacío", () => {
    const value = seoDescription({ slug: "x", name: "Fonda Lupe" })
    expect(value).toContain("Fonda Lupe")
    expect(value.length).toBeLessThanOrEqual(156)
  })

  it("recorta al límite de Google", () => {
    const value = seoDescription({ slug: "x", name: "X", tagline: "a ".repeat(200) })
    expect(value.length).toBeLessThanOrEqual(156)
    expect(value.endsWith("…")).toBe(true)
  })
})

describe("seoTitle", () => {
  it("incluye la ciudad cuando existe", () => {
    expect(seoTitle(profile, "Puebla")).toBe("Tacos Don Beto · Puebla · Pide en línea")
  })

  it("omite la ciudad cuando falta", () => {
    expect(seoTitle(profile, null)).toBe("Tacos Don Beto · Pide en línea")
  })

  it("recorta nombres largos al límite del título", () => {
    const value = seoTitle({ slug: "x", name: "Restaurante de comida corrida La Casa de los Abuelos" })
    expect(value.length).toBeLessThanOrEqual(61)
    expect(value.endsWith("…")).toBe(true)
  })
})

describe("slugifySeo", () => {
  it("quita acentos y normaliza a kebab-case", () => {
    expect(slugifySeo("Tacos al Pastor")).toBe("tacos-al-pastor")
    expect(slugifySeo("Café Ñoño")).toBe("cafe-nono")
  })

  it("no deja guiones al inicio ni al final", () => {
    expect(slugifySeo("  ¡Sopa azteca!  ")).toBe("sopa-azteca")
  })

  it("acota el slug a 60 caracteres", () => {
    expect(slugifySeo("palabra ".repeat(30)).length).toBeLessThanOrEqual(60)
  })
})

describe("safeThemeColor", () => {
  it("acepta hex de 3 y 6 dígitos", () => {
    expect(safeThemeColor("#abc")).toBe("#abc")
    expect(safeThemeColor("#B45309")).toBe("#B45309")
  })

  it("rechaza lo que no es hex con almohadilla", () => {
    expect(safeThemeColor("B45309")).toBe(DEFAULT_SEO_THEME_COLOR)
    expect(safeThemeColor("#12345")).toBe(DEFAULT_SEO_THEME_COLOR)
    expect(safeThemeColor("red")).toBe(DEFAULT_SEO_THEME_COLOR)
    expect(safeThemeColor(null)).toBe(DEFAULT_SEO_THEME_COLOR)
  })
})

describe("imageMimeType", () => {
  it("deduce el tipo por extensión, ignorando el querystring", () => {
    expect(imageMimeType("https://cdn/x/logo.JPG?v=2")).toBe("image/jpeg")
    expect(imageMimeType("https://cdn/x/logo.webp")).toBe("image/webp")
    expect(imageMimeType("https://cdn/x/logo.svg")).toBe("image/svg+xml")
  })

  it("cae a png cuando no reconoce la extensión", () => {
    expect(imageMimeType("https://cdn/x/logo")).toBe("image/png")
  })
})

describe("manifestIcons", () => {
  it("declara el logo con sizes any (no conocemos sus dimensiones)", () => {
    const icons = manifestIcons("https://cdn.example.com/logo.webp")
    expect(icons).toEqual([
      { src: "https://cdn.example.com/logo.webp", sizes: "any", type: "image/webp", purpose: "any" },
      {
        src: "https://cdn.example.com/logo.webp",
        sizes: "any",
        type: "image/webp",
        purpose: "maskable",
      },
    ])
  })

  it("cae a los iconos de Resurte.me para que la app siga siendo instalable", () => {
    const icons = manifestIcons(null)
    expect(icons).toHaveLength(3)
    expect(icons[0]?.src).toBe("/icon-192.png")
    expect(icons[2]?.purpose).toBe("maskable")
  })
})

describe("buildRestaurantManifest", () => {
  it("acota short_name a 12 caracteres y ancla el scope al restaurante", () => {
    const manifest = buildRestaurantManifest(profile)
    expect(manifest.short_name.length).toBeLessThanOrEqual(12)
    expect(manifest.id).toBe("/r/tacos-don-beto")
    expect(manifest.start_url).toBe("/r/tacos-don-beto")
    expect(manifest.scope).toBe("/r/tacos-don-beto")
    expect(manifest.display).toBe("standalone")
    expect(manifest.theme_color).toBe("#B45309")
    expect(manifest.lang).toBe("es-MX")
  })

  it("sanea un tema inválido en vez de romper el manifest", () => {
    const manifest = buildRestaurantManifest({ ...profile, theme_color: "azul" })
    expect(manifest.theme_color).toBe(DEFAULT_SEO_THEME_COLOR)
  })
})

describe("openingHoursSpecification", () => {
  it("agrupa los días con el mismo horario en una sola especificación", () => {
    const spec = openingHoursSpecification(hours)
    expect(spec).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday"],
        opens: "09:00",
        closes: "18:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Sunday"],
        opens: "10:00",
        closes: "14:00",
      },
    ])
  })

  it("omite los días cerrados y los horarios ilegibles", () => {
    const spec = openingHoursSpecification([
      { day_of_week: 4, is_closed: true, open_time: "09:00:00", close_time: "18:00:00" },
      { day_of_week: 5, open_time: "abierto", close_time: "18:00:00" },
      { day_of_week: 9, open_time: "09:00:00", close_time: "18:00:00" },
    ])
    expect(spec).toEqual([])
  })

  it("ordena los días dentro de cada especificación", () => {
    const spec = openingHoursSpecification([
      { day_of_week: 6, open_time: "09:00:00", close_time: "18:00:00" },
      { day_of_week: 1, open_time: "09:00:00", close_time: "18:00:00" },
    ])
    expect(spec[0]?.dayOfWeek).toEqual(["Monday", "Saturday"])
  })
})

describe("buildRestaurantSchema", () => {
  it("arma el nodo Restaurant con dirección, teléfono, horarios y valoración", () => {
    const schema = buildRestaurantSchema({
      profile,
      branches,
      hours,
      rating: { value: 4.567, count: 12 },
      url: "https://resurte.me/r/tacos-don-beto",
    }) as Record<string, unknown>

    expect(schema["@type"]).toBe("Restaurant")
    expect(schema["@id"]).toBe("https://resurte.me/r/tacos-don-beto#restaurant")
    expect(schema.priceRange).toBe("$$")
    expect(schema.acceptsReservations).toBe("True")
    expect(schema.telephone).toBe("2221234567")
    expect(schema.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "Av. Juárez 123",
      addressLocality: "Puebla",
      addressCountry: "MX",
    })
    expect(schema.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: 19.043,
      longitude: -98.198,
    })
    expect(schema.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.6,
      reviewCount: 12,
      bestRating: 5,
      worstRating: 1,
    })
    expect(schema.hasDeliveryMethod).toEqual([
      "https://schema.org/DeliveryModeHomeDelivery",
      "https://schema.org/DeliveryModePickup",
    ])
    expect(schema.sameAs).toBeUndefined()
  })

  it("no publica valoración sin reseñas (Google penaliza el rating falso)", () => {
    const schema = buildRestaurantSchema({
      profile,
      branches,
      hours,
      rating: { value: 5, count: 0 },
      url: "https://x/r/y",
    }) as Record<string, unknown>
    expect(schema.aggregateRating).toBeUndefined()
  })

  it("omite geo cuando falta latitud o longitud", () => {
    const schema = buildRestaurantSchema({
      profile,
      branches: [{ name: "Única", city: "Puebla", lat: 19.04 }],
      hours: [],
      url: "https://x/r/y",
    }) as Record<string, unknown>
    expect(schema.geo).toBeUndefined()
    expect(schema.hasDeliveryMethod).toBeUndefined()
    expect(schema.acceptsReservations).toBe("False")
  })

  it("incluye el enlace de Google Business como sameAs", () => {
    const schema = buildRestaurantSchema({
      profile: { ...profile, google_business_url: "https://maps.app.goo.gl/abc" },
      branches,
      hours,
      url: "https://x/r/y",
    }) as Record<string, unknown>
    expect(schema.sameAs).toEqual(["https://maps.app.goo.gl/abc"])
  })

  it("usa las palabras clave como tipo de cocina, acotadas a 8", () => {
    const schema = buildRestaurantSchema({
      profile: { ...profile, seo_keywords: Array.from({ length: 12 }, (_, i) => `k${i}`) },
      branches,
      hours,
      url: "https://x/r/y",
    }) as Record<string, unknown>
    expect(schema.servesCuisine).toHaveLength(8)
  })
})

describe("buildMenuSchema", () => {
  const items: SeoMenuItemFact[] = [
    { name: "Taco al pastor", price: 18, categoryName: "Tacos", description: "Con piña" },
    { name: "Agua de horchata", price: 35, categoryName: null },
    { name: "   ", price: 10, categoryName: "Tacos" },
  ]

  it("agrupa por categoría y manda los platillos sin categoría a Menú", () => {
    const schema = buildMenuSchema({
      profile,
      items,
      url: "https://resurte.me/r/tacos-don-beto/carta",
    }) as { hasMenuSection: { name: string; hasMenuItem: unknown[] }[] }

    expect(schema.hasMenuSection.map((section) => section.name)).toEqual(["Tacos", "Menú"])
    expect(schema.hasMenuSection[0]?.hasMenuItem).toHaveLength(1)
  })

  it("formatea el precio a dos decimales con la moneda del restaurante", () => {
    const schema = buildMenuSchema({
      profile,
      items,
      url: "https://x",
    }) as { hasMenuSection: { hasMenuItem: { offers: { price: string; priceCurrency: string } }[] }[] }
    const offer = schema.hasMenuSection[0]?.hasMenuItem[0]?.offers
    expect(offer?.price).toBe("18.00")
    expect(offer?.priceCurrency).toBe("MXN")
  })

  it("devuelve null cuando no hay platillos usables", () => {
    expect(buildMenuSchema({ profile, items: [], url: "https://x" })).toBeNull()
    expect(
      buildMenuSchema({ profile, items: [{ name: "  ", price: 10 }], url: "https://x" })
    ).toBeNull()
  })

  it("acota cada sección a 60 platillos", () => {
    const many: SeoMenuItemFact[] = Array.from({ length: 75 }, (_, i) => ({
      name: `Platillo ${i}`,
      price: 10 + i,
      categoryName: "Fuertes",
    }))
    const schema = buildMenuSchema({ profile, items: many, url: "https://x" }) as {
      hasMenuSection: { hasMenuItem: unknown[] }[]
    }
    expect(schema.hasMenuSection[0]?.hasMenuItem).toHaveLength(60)
  })
})

describe("buildFaqSchema", () => {
  it("arma el nodo FAQPage", () => {
    const schema = buildFaqSchema([{ q: "¿Hay envío?", a: "Sí." }], "https://x") as {
      "@type": string
      mainEntity: { name: string; acceptedAnswer: { text: string } }[]
    }
    expect(schema["@type"]).toBe("FAQPage")
    expect(schema.mainEntity[0]?.name).toBe("¿Hay envío?")
    expect(schema.mainEntity[0]?.acceptedAnswer.text).toBe("Sí.")
  })

  it("descarta entradas incompletas y devuelve null si no queda nada", () => {
    expect(buildFaqSchema([{ q: "  ", a: "Sí" }], "https://x")).toBeNull()
    expect(buildFaqSchema([], "https://x")).toBeNull()
  })
})

describe("buildBreadcrumbSchema", () => {
  it("numera los elementos desde 1", () => {
    const schema = buildBreadcrumbSchema([
      { name: "Inicio", url: "https://x/" },
      { name: "Carta", url: "https://x/carta" },
    ]) as { itemListElement: { position: number }[] }
    expect(schema.itemListElement.map((item) => item.position)).toEqual([1, 2])
  })

  it("devuelve null sin elementos usables", () => {
    expect(buildBreadcrumbSchema([{ name: "", url: "" }])).toBeNull()
  })
})

describe("parseFaq", () => {
  it("ignora cualquier forma que no sea una lista", () => {
    expect(parseFaq(null)).toEqual([])
    expect(parseFaq({ q: "a", a: "b" })).toEqual([])
    expect(parseFaq("texto")).toEqual([])
  })

  it("descarta registros corruptos sin tumbar la página", () => {
    expect(
      parseFaq([{ q: "¿Sí?", a: "Claro" }, null, { q: 5, a: "x" }, { q: " ", a: "y" }])
    ).toEqual([{ q: "¿Sí?", a: "Claro" }])
  })

  it("acota a 20 preguntas", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ q: `P${i}`, a: "R" }))
    expect(parseFaq(many)).toHaveLength(20)
  })
})

describe("googleBusinessChecklist", () => {
  it("marca lo que el restaurante ya tiene cargado", () => {
    const steps = googleBusinessChecklist({
      profile,
      branches,
      hours,
      reviewCount: 3,
    })
    const byKey = new Map(steps.map((step) => [step.key, step]))
    expect(byKey.get("logo")?.done).toBe(true)
    expect(byKey.get("hours")?.done).toBe(true)
    expect(byKey.get("phone")?.done).toBe(true)
    expect(byKey.get("reviews")?.done).toBe(true)
    expect(byKey.get("google_business")?.done).toBe(false)
  })

  it("apunta al alta de Google Business cuando no hay ficha", () => {
    const steps = googleBusinessChecklist({ profile, branches, hours, reviewCount: 0 })
    const step = steps.find((entry) => entry.key === "google_business")
    expect(step?.href).toBe(GOOGLE_BUSINESS_CREATE_URL)
  })

  it("apunta a la ficha cuando el dueño ya la capturó", () => {
    const steps = googleBusinessChecklist({
      profile: { ...profile, google_business_url: "https://maps.app.goo.gl/abc" },
      branches,
      hours,
      reviewCount: 0,
    })
    const step = steps.find((entry) => entry.key === "google_business")
    expect(step?.done).toBe(true)
    expect(step?.href).toBe("https://maps.app.goo.gl/abc")
  })

  it("no cuenta horarios si todos los días están cerrados", () => {
    const steps = googleBusinessChecklist({
      profile,
      branches,
      hours: [{ day_of_week: 1, is_closed: true, open_time: "09:00:00", close_time: "18:00:00" }],
      reviewCount: 0,
    })
    expect(steps.find((entry) => entry.key === "hours")?.done).toBe(false)
  })
})

describe("googleBusinessProgress", () => {
  it("calcula el avance con dos decimales y lista lo pendiente", () => {
    const progress = googleBusinessProgress([
      { key: "a", done: true },
      { key: "b", done: true },
      { key: "c", done: false },
    ])
    expect(progress).toEqual({ done: 2, total: 3, ratio: 0.67, pending: ["c"] })
  })

  it("devuelve 0 sin pasos en vez de NaN", () => {
    expect(googleBusinessProgress([]).ratio).toBe(0)
  })
})

describe("fallbackAbout", () => {
  it("menciona la ciudad y lo que el restaurante dijo de sí mismo", () => {
    const text = fallbackAbout({ name: "Fonda Lupe", city: "Puebla", keywords: ["mole", "pozole"] })
    expect(text).toContain("Fonda Lupe")
    expect(text).toContain("Puebla")
    expect(text).toContain("mole")
  })

  it("funciona sin ciudad ni palabras clave", () => {
    const text = fallbackAbout({ name: "Fonda Lupe" })
    expect(text).toContain("Fonda Lupe")
    expect(text).not.toContain("Nos conocen por")
  })
})

describe("fallbackFaq", () => {
  it("pregunta por envío solo si el restaurante lo tiene activo", () => {
    const items = fallbackFaq({
      name: "Fonda Lupe",
      branches,
      hasDelivery: true,
      hasPickup: true,
    })
    expect(items).toHaveLength(3)
    expect(items[0]?.q).toContain("Fonda Lupe")
    expect(items[0]?.a).toContain("Puebla")
  })

  it("siempre incluye cómo se paga", () => {
    const items = fallbackFaq({
      name: "Fonda Lupe",
      branches: [],
      hasDelivery: false,
      hasPickup: false,
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.q).toBe("¿Cómo pago mi pedido?")
  })
})
