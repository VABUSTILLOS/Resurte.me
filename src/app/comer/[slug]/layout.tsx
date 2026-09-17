import { notFound } from "next/navigation"
import { getPublicRestaurantBySlug } from "@/lib/foodos-public"

/**
 * Layout de la ficha de restaurante dentro del directorio (`/comer/[slug]`).
 *
 * Mismo motivo que en `src/app/r/[slug]/layout.tsx`: la página llama a
 * `notFound()` *después* de un `await`, y el `loading.tsx` del segmento crea un
 * boundary de `<Suspense>`. Next hace flush del shell en cuanto ese fallback
 * renderiza, así que el status viaja como 200 y el slug roto queda indexable
 * como soft-404. Comprobar aquí la existencia ocurre antes del primer chunk y
 * fija el 404 real.
 *
 * El coste es cero queries: `getPublicRestaurantBySlug` está envuelto en
 * `unstable_cache` (300s, tags `foodos`/`foodos-public`), la misma key que usa
 * la página.
 */
export default async function ComerRestaurantLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await getPublicRestaurantBySlug(slug)
  if (!data) notFound()
  return children
}
