import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

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
      .select("id,name")
      .order("id")

    if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 })

    const { data: stores, error: storeErr } = await supabase
      .from("product_stores")
      .select("product_id")

    if (storeErr) return NextResponse.json({ error: storeErr.message }, { status: 500 })

    const storeIds = new Set(stores.map((s) => s.product_id))
    const missing = products?.filter((p) => !storeIds.has(p.id)) || []

    results.push(`Total: ${products?.length}, In catalog: ${storeIds.size}, Missing: ${missing.length}`)

    for (const p of missing) {
      const { error } = await supabase
        .from("product_stores")
        .insert({ product_id: p.id, store_id: 1 })

      if (error && error.code !== "23505") {
        results.push(`❌ [${p.id}] ${p.name}: ${error.message}`)
      } else {
        results.push(`✅ [${p.id}] ${p.name}`)
      }
    }

    if (missing.length === 0) results.push("All good!")

    return NextResponse.json({ success: true, results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
