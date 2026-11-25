import { NextResponse } from "next/server"
import {
  getCachedActiveVariants,
  getCachedCategories,
  getCachedVisibleProducts,
} from "@/lib/catalog-cache"
import { buildMetaFeedCsv } from "@/lib/meta-feed"

// ============================================================
// /api/feed/meta.csv — feed permanente del catálogo para Meta
// ============================================================
// CSV que alimenta el catálogo "Resurte.me" en Meta (WhatsApp
// Business). Misma fuente que las páginas del sitio, así que
// precios, visibilidad e imágenes se actualizan solos; el feed
// temporal subido el 2026-11-20 vence el 2026-11-22 y este lo
// reemplaza. La fórmula del id y el resto de reglas viven en
// src/lib/meta-feed.ts.
//
// Sin cookies() ni headers() — solo lecturas cacheadas.

export const runtime = "nodejs"

const CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"

export async function GET() {
  const [products, categories, variants] = await Promise.all([
    getCachedVisibleProducts(),
    getCachedCategories(),
    getCachedActiveVariants(),
  ])

  const { csv, included, mapped, unmapped, skippedNoImage, skippedNoCategory, variantRows } =
    buildMetaFeedCsv(products, categories, variants)

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": CACHE_CONTROL,
      "X-Meta-Feed-Count": String(included),
      "X-Meta-Feed-Mapped": String(mapped),
      "X-Meta-Feed-Unmapped": String(unmapped),
      "X-Meta-Feed-Skipped-No-Image": String(skippedNoImage),
      "X-Meta-Feed-Skipped-No-Category": String(skippedNoCategory),
      "X-Meta-Feed-Variants": String(variantRows),
    },
  })
}
