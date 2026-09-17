// ============================================================
// Manifest PWA por restaurante (Fase 6, nivel Diamante).
//
// El comensal que pide seguido en el mismo restaurante puede instalarlo como
// app: icono propio en la pantalla de inicio, abre directo en el menú y sin
// barra del navegador. Es el "app de marca" sin publicar en tiendas.
//
// Sin `cookies()`/`headers()`: el manifest es el mismo para todos y se puede
// prerenderizar. El `slug` entra en el caché de `getPublicRestaurantBySlug`,
// así que esto no añade una consulta por request.
// ============================================================

import { getPublicRestaurantBySlug } from "@/lib/foodos-public"
import { buildRestaurantManifest } from "@/lib/foodos-seo"

export const revalidate = 300

interface RouteProps {
  params: Promise<{ slug: string }>
}

export async function GET(_request: Request, { params }: RouteProps) {
  const { slug } = await params
  const data = await getPublicRestaurantBySlug(slug)

  if (!data) {
    return new Response(JSON.stringify({ error: "Restaurante no encontrado" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  const manifest = buildRestaurantManifest({
    slug: data.restaurant.slug,
    name: data.restaurant.name,
    description: data.restaurant.description,
    logo_url: data.restaurant.logo_url,
    theme_color: data.restaurant.theme_color,
    currency: data.restaurant.currency,
  })

  return new Response(JSON.stringify(manifest), {
    headers: {
      // `application/manifest+json` es lo que exige la especificación; algunos
      // navegadores son laxos con `application/json` pero Chrome no lo instala.
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
    },
  })
}
