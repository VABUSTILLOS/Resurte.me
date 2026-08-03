import { MEXICO_CITIES } from "@/lib/cities"

/**
 * Structured data helpers for JSON-LD schema.org markup.
 * Injects into pages via <script type="application/ld+json">.
 */

interface OrganizationSchema {
  "@context": "https://schema.org"
  "@type": "Organization"
  name: string
  url: string
  logo: string
  description: string
  sameAs: string[]
  contactPoint: {
    "@type": "ContactPoint"
    telephone: string
    contactType: string
    areaServed: string[]
    availableLanguage: string
  }
}

export function getOrganizationSchema(): OrganizationSchema {
  const cities = MEXICO_CITIES.map((c) => `${c.name}, ${c.state}, MX`)
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Resurte.me",
    url: "https://resurte.me",
    logo: "https://resurte.me/logo.png",
    description:
      "Central de abastos digital para restaurantes y negocios en México. Abarrotes, frutas, verduras y carnes por mayoreo — entregados a tu puerta.",
    sameAs: [
      "https://www.facebook.com/resurteme",
      "https://www.instagram.com/resurteme",
      "https://wa.me/525512345678",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+525512345678",
      contactType: "customer service",
      areaServed: cities,
      availableLanguage: "es",
    },
  }
}

interface LocalBusinessSchema {
  "@context": "https://schema.org"
  "@type": "LocalBusiness" | "WholesaleStore"
  name: string
  description: string
  image: string
  address: {
    "@type": "PostalAddress"
    addressLocality: string
    addressRegion: string
    addressCountry: string
  }
  geo: {
    "@type": "GeoCoordinates"
    latitude: number
    longitude: number
  }
  areaServed: {
    "@type": "City"
    name: string
  }
}

export function getCityLandingSchema(cityName: string, state: string, lat: number, lng: number): LocalBusinessSchema {
  return {
    "@context": "https://schema.org",
    "@type": "WholesaleStore",
    name: `Resurte.me — ${cityName}`,
    description: `Central de abastos digital en ${cityName}, ${state}. Abarrotes, frutas, verduras y carnes por mayoreo para restaurantes y negocios.`,

    image: "https://resurte.me/og-image.png",

    address: {
      "@type": "PostalAddress",
      addressLocality: cityName,
      addressRegion: state,
      addressCountry: "MX",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: lat,
      longitude: lng,
    },
    areaServed: {
      "@type": "City",
      name: cityName,
    },
  }
}

interface BreadcrumbItem {
  name: string
  url: string
}

export function getBreadcrumbSchema(items: BreadcrumbItem[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

interface ProductSchema {
  "@context": "https://schema.org"
  "@type": "Product"
  name: string
  description: string
  image: string
  brand: { "@type": "Brand"; name: string }
  offers: {
    "@type": "Offer"
    price: number
    priceCurrency: string
    availability: string
  }
}

export function getProductSchema(
  name: string,
  description: string,
  brand: string,
  price: number,
  availability: string
): ProductSchema {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    image: "https://resurte.me/placeholder-product.png",
    brand: { "@type": "Brand", name: brand },
    offers: {
      "@type": "Offer",
      price,
      priceCurrency: "MXN",
      availability:
        availability === "in_stock"
          ? "https://schema.org/InStock"
          : availability === "low_stock"
            ? "https://schema.org/LimitedAvailability"
            : "https://schema.org/OutOfStock",
    },
  }
}

export interface SitemapEntry {
  url: string
  lastModified?: string
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never"
  priority?: number
}

export function generateSitemapXml(entries: SitemapEntry[]): string {
  const items = entries
    .map(
      (entry) =>
        `  <url>
    <loc>${entry.url}</loc>
    <lastmod>${entry.lastModified || new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>${entry.changeFrequency || "weekly"}</changefreq>
    <priority>${entry.priority || 0.8}</priority>
  </url>`
    )
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>`
}
