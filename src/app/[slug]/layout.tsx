import { MEXICO_CITIES, isCityActive } from "@/lib/cities"
import { ComingSoonCity } from "@/components/city/coming-soon-city"

/**
 * Layout del segmento dinámico /[slug].
 *
 * Existe SOLO para el prerender: en Next 16 un segmento dinámico sin
 * `generateStaticParams` cae a render dinámico por request (SSR). Las páginas
 * por-usuario de este segmento (`carrito`, `checkout`, `mis-pedidos`,
 * `mis-direcciones`, `pedido-confirmado`) son componentes `"use client"`
 * puros que obtienen sus datos tras montar, así que no hay nada que
 * renderizar en servidor: con estos params se generan como shells estáticas
 * servidas por el CDN.
 *
 * Las páginas hijas con su propio `generateStaticParams` (`page.tsx`,
 * `buscar`, `categoria`, `coleccion`, `producto`) reciben estos params como
 * padre y mantienen su comportamiento.
 */
export const revalidate = 300

export function generateStaticParams() {
  return MEXICO_CITIES.map((c) => ({ slug: c.slug }))
}

interface CityLayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function CityLayout({ children, params }: CityLayoutProps) {
  const { slug } = await params
  // Las ciudades sin cobertura conservan su URL, pero muestran la página
  // "próximamente" en lugar del catálogo (y sin checkout).
  if (!isCityActive(slug)) {
    const city = MEXICO_CITIES.find((c) => c.slug === slug)
    if (city) return <ComingSoonCity city={city} />
  }
  return children
}
