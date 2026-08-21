import { MEXICO_CITIES } from "@/lib/cities"

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

export default function CityLayout({ children }: { children: React.ReactNode }) {
  return children
}
