import { logger } from "@/lib/logger"
/**
 * WhatsApp Catalog Sync API
 * POST /api/whatsapp/catalog/sync
 * 
 * Syncs the curated product catalog to WhatsApp Commerce.
 * Only products with show_in_whatsapp = true are synced.
 * This is the manual curation endpoint — NOT automatic.
 */

import { NextRequest, NextResponse } from "next/server"
import { syncCatalog, type WhatsAppProduct } from "@/lib/whatsapp"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"

export async function POST(req: NextRequest) {
  try {
    // Solo administradores pueden sincronizar el catálogo de WhatsApp Commerce.
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) {
      return adminDenied
    }

    const body = await req.json()

    const { products } = body as {
      products: WhatsAppProduct[]
    }

    if (!products) {
      return NextResponse.json(
        { error: "products are required" },
        { status: 400 }
      )
    }

    const result = await syncCatalog(products)

    // Log del sync en whatsapp_messages (auditoría de catálogo).
    const supabase = await createServiceClient()
    try {
      const { error: logError } = await supabase.from("whatsapp_messages").insert({
        from_number: "system",
        message_type: "catalog_sync",
        content: JSON.stringify({
          added: result.added,
          removed: result.removed,
          total_in_catalog: products.length,
          synced_at: new Date().toISOString(),
        }),
        direction: "outbound",
      })
      if (logError) {
        logger.error("WhatsApp catalog sync log error:", logError)
      }
    } catch (logErr) {
      logger.error("WhatsApp catalog sync log unexpected error:", logErr)
    }

    return NextResponse.json({
      success: true,
      added: result.added,
      removed: result.removed,
      total_in_catalog: products.length,
    })
  } catch (err) {
    logger.error("WhatsApp catalog sync error:", err)
    return NextResponse.json(
      {
        error: "Failed to sync catalog",
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
