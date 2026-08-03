/**
 * POST /api/admin/update-images
 *
 * Updates product image_url fields in Supabase:
 * - Products found in resurte.me store → real Google Cloud Storage images
 * - Products not in store → category-appropriate Wikimedia Commons fallbacks
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"

const ADMIN_SECRET = process.env.ADMIN_API_SECRET || "resurte-me-migrate-2024"

// Product ID → image URL mapping (generated from resurte.me sitemap crawl)
const IMAGE_UPDATES: Record<number, string> = {
  1: "https://storage.googleapis.com/takeapp/media/cmihojint000k04if2qg48em7.png",
  3: "https://storage.googleapis.com/takeapp/media/cmihon5gm000f04jo8q5f7jdf.png",
  4: "https://storage.googleapis.com/takeapp/media/cmijnpm2z000904lbg1e59xve.png",
  5: "https://storage.googleapis.com/takeapp/media/cmijp7zpj000404l40mtkbyuh.png",
  9: "https://storage.googleapis.com/takeapp/media/cmijostxx001o04jv3tl8b2v9.png",
  11: "https://storage.googleapis.com/takeapp/media/cmijwgf7r000904l738kc1xwb.png",
  12: "https://storage.googleapis.com/takeapp/media/cmijq38em001604l7hja83595.png",
  13: "https://storage.googleapis.com/takeapp/media/cmijy9mol000104jr05q555i9.png",
  14: "https://storage.googleapis.com/takeapp/media/cmijt78vd000304l7gky09s9z.png",
  15: "https://storage.googleapis.com/takeapp/media/cmil8aa8y001b04jodgx5fcbu.png",
  16: "https://storage.googleapis.com/takeapp/media/cmimkbfo9000a04jr6g1d34ed.png",
  17: "https://storage.googleapis.com/takeapp/media/cmikzez7l000004lgdmi10rlc.png",
  18: "https://storage.googleapis.com/takeapp/media/cmikk4nbk000b04jqf4jn0clt.png",
  19: "https://storage.googleapis.com/takeapp/media/cmikltl3d000x04jv8k7o2m98.png",
  20: "https://storage.googleapis.com/takeapp/media/cmikq27gb000104jq3do4elw9.png",
  21: "https://storage.googleapis.com/takeapp/media/cmilh1p0y000104lhe6561n1x.png",
  22: "https://storage.googleapis.com/takeapp/media/cmiktaici000e04ju7ihmb47x.png",
  23: "https://storage.googleapis.com/takeapp/media/cmifgbp3x000xjv04u0ukhmxe.png",
  24: "https://storage.googleapis.com/takeapp/media/cmikwam9r000g04jq5yqbbfzu.png",
  25: "https://storage.googleapis.com/takeapp/media/cmikyxms9000604l509yy1v38.png",
  26: "https://storage.googleapis.com/takeapp/media/cmijr4efg000h04khhz7gw04q.png",
  27: "https://storage.googleapis.com/takeapp/media/cmikmymx7000a04jqc1k2o0rs.png",
  28: "https://storage.googleapis.com/takeapp/media/cmikm58k3000n04jq4vl0dh69.png",
  29: "https://storage.googleapis.com/takeapp/media/cmikln00f000004km2odmgruf.png",
  30: "https://storage.googleapis.com/takeapp/media/cmiklor58000004k25n1cbp5h.png",
  31: "https://storage.googleapis.com/takeapp/media/cmilw6t51000104jq0du3blee.png",
  32: "https://storage.googleapis.com/takeapp/media/cmiggjmyc000604jy5wvrlnlo.png",
  33: "https://storage.googleapis.com/takeapp/media/cmilw4538000sl704fe0ze8eq.png",
  35: "https://storage.googleapis.com/takeapp/media/cmilweno6000a04ikcqshyqjx.png",
  36: "https://storage.googleapis.com/takeapp/media/cmilufrrq000bla04whjtd5gx.png",
  37: "https://storage.googleapis.com/takeapp/media/cmilvnkpw000d04l55e8ihenc.png",
  38: "https://storage.googleapis.com/takeapp/media/cmijtl5ff000004l10k18mcq2.png",
  39: "https://storage.googleapis.com/takeapp/media/cmilvs782000704l5ggxy2vkc.png",
  40: "https://storage.googleapis.com/takeapp/media/cmimjrvkyo000804lb3iv55b5t.png",
  41: "https://storage.googleapis.com/takeapp/media/cmimjvvkr000304l5ajg00ep5.png",
  42: "https://storage.googleapis.com/takeapp/media/cmimk376m000204jy9kz137to.png",
  43: "https://storage.googleapis.com/takeapp/media/cmimkk5ss000004lgg5cdeenu.png",
  44: "https://storage.googleapis.com/takeapp/media/cmimnce64000004jt4iqv90pi.png",
  46: "https://storage.googleapis.com/takeapp/media/cmimlwned000304l50pczfqjx.png",
  47: "https://storage.googleapis.com/takeapp/media/cmimm7hpz000304kt2w48fd92.png",
  139: "https://storage.googleapis.com/takeapp/media/cmij9849300pa04lb5rlq7p7v.png",
  140: "https://storage.googleapis.com/takeapp/media/cmij8mlrm00ol04qy4iubvf2f.png",
  141: "https://storage.googleapis.com/takeapp/media/cmij8iiwc00hr04qhi5d36b3k.png",
  154: "https://storage.googleapis.com/takeapp/media/cmifh33dt000704jy2sqyyoww.png",
}

// Category-based Wikimedia Commons fallbacks
const CATEGORY_FALLBACKS: Record<string, string> = {
  verduras: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Vegetables_Basket.jpg/640px-Vegetables_Basket.jpg",
  abarrotes: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Grocery_store_aisle.jpg/640px-Grocery_store_aisle.jpg",
  lacteos: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Dairy_products.jpg/640px-Dairy_products.jpg",
  carnes: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Butcher_shop_display.jpg/640px-Butcher_shop_display.jpg",
  panaderia: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Bread_assortment.jpg/640px-Bread_assortment.jpg",
  bebidas: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Soft_drinks_assortment.jpg/640px-Soft_drinks_assortment.jpg",
  botanas: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Chips_and_snacks.jpg/640px-Chips_and_snacks.jpg",
  limpieza: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Cleaning_products.jpg/640px-Cleaning_products.jpg",
  congelados: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Frozen_food_section.jpg/640px-Frozen_food_section.jpg",
}

function getCategory(pid: number): string {
  if (pid <= 50) return "verduras"
  if (pid <= 88) return "abarrotes"
  if (pid <= 104) return "lacteos"
  if (pid <= 134) return "carnes"
  if (pid <= 144) return "panaderia"
  if (pid <= 159) return "bebidas"
  if (pid <= 165) return "botanas"
  if (pid <= 179) return "limpieza"
  return "congelados"
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const secret = searchParams.get("secret")

    if (secret !== ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createServiceClient()

    let realCount = 0
    let fallbackCount = 0
    const errors: string[] = []

    for (let pid = 1; pid <= 187; pid++) {
      let imageUrl: string

      if (IMAGE_UPDATES[pid]) {
        imageUrl = IMAGE_UPDATES[pid]
        realCount++
      } else {
        imageUrl = CATEGORY_FALLBACKS[getCategory(pid)]
        fallbackCount++
      }

      const { error } = await supabase
        .from("products")
        .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
        .eq("id", pid)

      if (error) {
        errors.push(`Product ${pid}: ${error.message}`)
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      real_images: realCount,
      fallback_images: fallbackCount,
      total: realCount + fallbackCount,
      errors,
    })
  } catch (err) {
    console.error("[Admin] Image update error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
