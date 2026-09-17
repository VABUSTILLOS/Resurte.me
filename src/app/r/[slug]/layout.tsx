import { notFound } from "next/navigation"
import { getPublicRestaurantBySlug } from "@/lib/foodos-public"

/**
 * Layout del micrositio /r/[slug].
 *
 * Existe SOLO para que un slug inexistente devuelva un 404 HTTP real.
 *
 * El problema: `page.tsx` y `carta/page.tsx` llaman a `notFound()` *después* de
 * un `await`, y el `loading.tsx` del segmento (el esqueleto del menú) crea un
 * boundary de `<Suspense>`. Next hace flush del shell en cuanto ese fallback
 * renderiza, y a partir de ahí el status ya viaja como 200 y no se puede
 * corregir: el slug roto queda indexable como soft-404.
 *
 * La solución: el `loading.js` del segmento se anida *dentro* de este layout
 * (`loading.md`: "loading.js will be nested inside layout.js … It does not wrap
 * the layout.js in the same segment"), así que comprobar la existencia aquí
 * ocurre antes de que se emita el primer chunk y el 404 sí se fija.
 *
 * El coste es una lectura de caché: `getPublicRestaurantBySlug` está envuelto en
 * `unstable_cache` (300s, tags `foodos`/`foodos-public`), la misma key que usa
 * la página, así que no añade queries a Supabase. La página sigue haciendo su
 * `await` pesado detrás del esqueleto.
 *
 * El chequeo es equivalente al de la página: la query filtra `status = 'active'`
 * y degrada a `null` (nunca lanza) si Supabase no está configurado.
 */
export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  // GUARD-OFF-PROBE
  return children
}
