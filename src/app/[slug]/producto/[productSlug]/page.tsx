import { notFound } from "next/navigation"
import { DEFAULT_CITY_SLUG, MEXICO_CITIES } from "@/lib/cities"
import { Metadata } from "next"
import {
  filterByCityAvailability,
  getCachedCategoryById,
  getCachedProductBySlug,
  getCachedProductsByCategory,
  getCachedVisibleProducts,
  getCityAvailabilityForSlug,
  getProductReviewIndex,
} from "@/lib/catalog-cache"
import { ProductDetailClient } from "./product-detail-client"
import { RecentlyViewed } from "@/components/product/recently-viewed"
import { getBreadcrumbSchema, getProductSchema } from "@/lib/structured-data"
import { buildRelatedProducts } from "@/lib/related-products"
import { comparePresentations } from "@/lib/unit-price"
import { fetchQuantityLimits } from "@/lib/product-quantity-limits"
import { fetchProductVariants } from "@/lib/product-variants"
import type { ProductVariant } from "@/types"
import { createServiceClient } from "@/lib/supabase/service"

// ISR: se revalida cada 5 min (alineado con catalog-cache). La primera
// visita a cada producto renderiza y cachea; el resto sale del CDN.
export const revalidate = 300

// Next 16: sin generateStaticParams el segmento dinámico cae a SSR por request.
// Pre-render de los primeros 100 productos de la ciudad por defecto; el resto
// se genera bajo demanda y queda cacheado (dynamicParams=true por defecto).
export async function generateStaticParams() {
  const products = await getCachedVisibleProducts()
  return products.slice(0, 100).map((p) => ({
    slug: DEFAULT_CITY_SLUG,
    productSlug: p.slug,
  }))
}

interface Props {
  params: Promise<{ slug: string; productSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productSlug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  if (!city) return { title: "Producto no encontrado — Resurte.me" }

  const product = await getCachedProductBySlug(productSlug)

  if (!product) return { title: "Producto no encontrado — Resurte.me" }

  // SEO por producto (00104): los campos dedicados ganan; si están vacíos
  // se usa el título/descripción derivados como antes.
  const title = product.seo_title?.trim()
    ? product.seo_title.trim()
    : `${product.name} en ${city.name} — Resurte.me`
  const description =
    product.seo_description?.trim() ||
    product.description?.slice(0, 160) ||
    `${product.name} por mayoreo en ${city.name}.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: product.image_url ? [product.image_url] : [],
      url: `https://resurte.me/${city.slug}/producto/${productSlug}`,
      siteName: "Resurte.me",
      locale: "es_MX",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: product.image_url ? [product.image_url] : [],
    },
    alternates: {
      canonical: `https://resurte.me/${city.slug}/producto/${productSlug}`,
    },
  }
}

export default async function ProductPage({ params }: Props) {
  const { slug, productSlug } = await params
  const city = MEXICO_CITIES.find((c) => c.slug === slug)
  if (!city) notFound()

  // Fetch product with category (cached)
  const product = await getCachedProductBySlug(productSlug)

  if (!product) notFound()

  // Selector por ciudad (migración 00065): si el producto no está
  // disponible en esta ciudad, la página no existe para ese mercado.
  const availableIds = await getCityAvailabilityForSlug(slug)
  if (availableIds && !availableIds.includes(product.id)) notFound()

  // Fetch category info (cached)
  const category = await getCachedCategoryById(product.category_id)

  // Fetch related products: primero los relacionados explícitos del admin
  // (00109), en su orden; después la misma categoría y el resto del catálogo.
  // Todo filtrado por disponibilidad de la ciudad.
  const relatedSameCategory = filterByCityAvailability(
    await getCachedProductsByCategory(product.category_id),
    availableIds
  ).filter(
    (p) => p.id !== product.id
  )

  const availableProducts = filterByCityAvailability(
    await getCachedVisibleProducts(),
    availableIds
  )

  const related = buildRelatedProducts({
    productId: product.id,
    explicitIds: product.related_product_ids,
    availableById: new Map(availableProducts.map((p) => [p.id, p])),
    sameCategory: relatedSameCategory,
    others: availableProducts.filter(
      (p) => p.id !== product.id && p.category_id !== product.category_id
    ),
  })

  // Presentaciones comparables (C13): el pool es el catálogo visible ya
  // filtrado por ciudad, que la página ya tiene en memoria. `comparePresentations`
  // descarta todo lo que no comparta nombre base y unidad física, así que el
  // resultado solo contiene la misma mercancía en otro tamaño.
  const presentations = comparePresentations(
    { ...product, price: product.sale_price ?? product.price },
    availableProducts
      .filter((p) => p.id !== product.id)
      .map((p) => ({ ...p, price: p.sale_price ?? p.price }))
  )

  // Reseñas del producto (00158): agregado ya cacheado, resuelto en O(1).
  // `undefined` cuando no hay ninguna, y entonces no se pinta el bloque.
  //
  // No se emite `aggregateRating` en el JSON-LD a propósito: la calificación es
  // del pedido completo (incluye entrega y atención), así que declararla como
  // nota del producto en datos estructurados sería una afirmación falsa —y el
  // tipo de marcado que Google penaliza.
  const reviewStats = (await getProductReviewIndex()).get(product.id)

  // Cantidad mínima/máxima por pedido (00229): columnas PRIVADAS
  // (solo service_role). La ficha las lee con el cliente de servicio
  // en servidor para mostrar el mínimo y para que el botón «Avísame
  // cuando haya» no dependa de ellas; si la migración aún no se
  // aplica, la lectura degrada a sin límites y la ficha se pinta
  // igual que antes.
  let minOrderQty: number | null = null
  let maxOrderQty: number | null = null
  // Presentaciones (00232): solo activas. Si la migración aún no se
  // aplica, la lectura degrada a [] y la ficha vende el producto
  // base como siempre.
  let productVariants: ProductVariant[] = []
  try {
    const service = await createServiceClient()
    const limits = await fetchQuantityLimits(service, [product.id])
    const row = limits.get(product.id)
    minOrderQty = row?.min_order_qty ?? null
    maxOrderQty = row?.max_order_qty ?? null
    productVariants = await fetchProductVariants(service, product.id)
  } catch {
    // Sin límites visibles: la ficha no muestra el mínimo.
  }

  const url = `https://resurte.me/${slug}/producto/${productSlug}`
  const jsonLd = [
    getProductSchema(
      product.name,
      product.description?.slice(0, 300) ?? `${product.name} por mayoreo en ${city.name}.`,
      product.brand || "Resurte.me",
      product.sale_price ?? product.price,
      product.stock_status,
      product.image_url || undefined
    ),
    getBreadcrumbSchema([
      { name: city.name, url: `https://resurte.me/${slug}` },
      // El breadcrumb sin categoría apuntaba a `/{ciudad}/catalogo`, que no existe
      // (el catálogo de la ciudad es `/{ciudad}`). Un JSON-LD que enlaza a un 404
      // es una señal mala para los buscadores.
      { name: category?.name ?? "Catálogo", url: category ? `https://resurte.me/${slug}/categoria/${category.slug}` : `https://resurte.me/${slug}` },
      { name: product.name, url },
    ]),
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductDetailClient
        product={product}
        category={category ?? undefined}
        relatedProducts={related}
        presentations={presentations}
        citySlug={slug}
        cityName={city.name}
        reviewStats={reviewStats}
        minOrderQty={minOrderQty}
        maxOrderQty={maxOrderQty}
        variants={productVariants}
      />
      {/* Rail de vistos recientemente (cliente, localStorage) */}
      <RecentlyViewed
        current={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          image_url: product.image_url ?? null,
          price: product.price,
          sale_price: product.sale_price ?? null,
        }}
        citySlug={slug}
      />
    </>
  )
}
