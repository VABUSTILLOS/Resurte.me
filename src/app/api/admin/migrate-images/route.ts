/**
 * POST /api/admin/migrate-images
 *
 * One-time migration: replaces all Unsplash image URLs in the
 * products and stores tables with resurte.me and Wikimedia Commons URLs.
 *
 * Protected by a simple admin key to prevent public access.
 * Uses the Supabase service role client for full DB access.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"

const ADMIN_SECRET = process.env.ADMIN_API_SECRET || "resurte-me-migrate-2024"

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const secret = searchParams.get("secret")

    if (secret !== ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createServiceClient()

    // 1. Update products: replace Unsplash URLs with resurte.me/es/p/{id}
    const { data: products, error: productErr } = await supabase
      .from("products")
      .select("id, image_url")
      .ilike("image_url", "%images.unsplash.com%")

    if (productErr) {
      return NextResponse.json(
        { error: "Failed to query products", details: productErr.message },
        { status: 500 }
      )
    }

    const productResults: { id: number; old_url: string; new_url: string }[] = []

    if (products && products.length > 0) {
      for (const p of products) {
        const newUrl = `https://resurte.me/es/p/${p.id}`
        const { error: updateErr } = await supabase
          .from("products")
          .update({ image_url: newUrl, updated_at: new Date().toISOString() })
          .eq("id", p.id)

        if (!updateErr) {
          productResults.push({ id: p.id, old_url: p.image_url, new_url: newUrl })
        }
      }
    }

    // 2. Update stores: replace Unsplash with Wikimedia Commons
    const { data: stores, error: storeErr } = await supabase
      .from("stores")
      .select("id, slug, logo_url, banner_url")
      .or("logo_url.ilike.%images.unsplash.com%,banner_url.ilike.%images.unsplash.com%")

    if (storeErr) {
      return NextResponse.json(
        { error: "Failed to query stores", details: storeErr.message },
        { status: 500 }
      )
    }

    const storeResults: { id: number; slug: string; updated: string[] }[] = []

    const storeImages: Record<string, { logo_url: string; banner_url: string }> = {
      "resurte-me": {
        logo_url:
          "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Mexican_central_de_abastos.jpg/640px-Mexican_central_de_abastos.jpg",
        banner_url:
          "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Grocery_store_produce_section.jpg/1280px-Grocery_store_produce_section.jpg",
      },
      carnemart: {
        logo_url:
          "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Butcher_shop_display.jpg/640px-Butcher_shop_display.jpg",
        banner_url:
          "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Meat_counter_display.jpg/1280px-Meat_counter_display.jpg",
      },
    }

    if (stores && stores.length > 0) {
      for (const s of stores) {
        const mapping = storeImages[s.slug]
        if (!mapping) continue

        const updates: Record<string, string> = {}
        const updated: string[] = []

        if (s.logo_url && s.logo_url.includes("images.unsplash.com")) {
          updates.logo_url = mapping.logo_url
          updated.push("logo")
        }
        if (s.banner_url && s.banner_url.includes("images.unsplash.com")) {
          updates.banner_url = mapping.banner_url
          updated.push("banner")
        }

        if (Object.keys(updates).length > 0) {
          await supabase
            .from("stores")
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq("id", s.id)

          storeResults.push({ id: s.id, slug: s.slug, updated })
        }
      }
    }

    // 3. Final verification
    const { count: remainingProducts } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .ilike("image_url", "%images.unsplash.com%")

    const { count: remainingStores } = await supabase
      .from("stores")
      .select("*", { count: "exact", head: true })
      .or("logo_url.ilike.%images.unsplash.com%,banner_url.ilike.%images.unsplash.com%")

    return NextResponse.json({
      success: true,
      products_updated: productResults.length,
      stores_updated: storeResults.length,
      products_remaining_with_unsplash: remainingProducts || 0,
      stores_remaining_with_unsplash: remainingStores || 0,
      details: { products: productResults, stores: storeResults },
    })
  } catch (err) {
    console.error("[Admin] Migration error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
