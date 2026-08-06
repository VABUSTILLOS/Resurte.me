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

export async function POST(req: NextRequest) {
  try {
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

    // TODO: Verify admin authentication

    const result = await syncCatalog(products)

    // TODO: Log sync to Supabase

    return NextResponse.json({
      success: true,
      added: result.added,
      removed: result.removed,
      total_in_catalog: products.length,
    })
  } catch (err) {
    console.error("WhatsApp catalog sync error:", err)
    return NextResponse.json(
      {
        error: "Failed to sync catalog",
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
