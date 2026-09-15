import { getPriceIndex, toPriceIndexCsv } from "@/lib/price-index"

/**
 * GET /precios/indice-precios.csv
 *
 * Descarga del índice de precios completo. Vive fuera de /api/ a propósito:
 * robots.txt solo permite rastrear /api/feed/ a los crawlers de IA, y este
 * archivo es el `contentUrl` del DataDownload del Dataset — tiene que ser
 * rastreable por cualquier buscador para que el dato se pueda indexar.
 *
 * Se prerenderiza (force-static) y se refresca por ISR; no lee cookies ni
 * headers, así que no consume presupuesto de cómputo por request.
 */

export const dynamic = "force-static"
export const revalidate = 3600

const CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"

export async function GET() {
  const snapshot = await getPriceIndex()
  const csv = toPriceIndexCsv(snapshot.points)

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'inline; filename="indice-precios-resurte-me.csv"',
      "Cache-Control": CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
  })
}
