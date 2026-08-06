import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/fix-catalog
 *
 * Verifies all products have the required fields (price, stock_status).
 * Since the multi-vendor architecture was removed, products now own their
 * pricing and visibility directly — no product_stores table needed.
 */
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const results: string[] = []

  try {
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("id,name,price,stock_status,is_visible")
      .order("id")

    if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 })

    const missingPrice = products?.filter((p) => !p.price) || []
    const missingStock = products?.filter((p) => !p.stock_status) || []

    results.push(`Total: ${products?.length}`)
    results.push(`Missing price: ${missingPrice.length}`)
    results.push(`Missing stock_status: ${missingStock.length}`)

    // Fix products without price
    for (const p of missingPrice) {
      const { error } = await supabase
        .from("products")
        .update({ price: 0 })
        .eq("id", p.id)

      if (error) {
        results.push(`❌ [${p.id}] ${p.name}: ${error.message}`)
      } else {
        results.push(`✅ [${p.id}] ${p.name} — price set to 0`)
      }
    }

    // Fix products without stock_status
    for (const p of missingStock) {
      const { error } = await supabase
        .from("products")
        .update({ stock_status: "in_stock" })
        .eq("id", p.id)

      if (error) {
        results.push(`❌ [${p.id}] ${p.name}: ${error.message}`)
      } else {
        results.push(`✅ [${p.id}] ${p.name} — stock_status set to in_stock`)
      }
    }

    if (missingPrice.length === 0 && missingStock.length === 0) results.push("All good!")

    return NextResponse.json({ success: true, results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
