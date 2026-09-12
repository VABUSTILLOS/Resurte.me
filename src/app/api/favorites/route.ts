import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/**
 * /api/favorites — lista de resurtido del usuario con sesión.
 *
 * GET    → { product_ids: number[] }
 * POST   → body { product_id } — toggle: agrega si no está, quita si está.
 *          Devuelve { product_ids } actualizado.
 *
 * Invitados: el cliente usa localStorage (use-favorites) y fusiona por
 * unión al iniciar sesión (POST por cada id local).
 */

function parseProductId(raw: unknown): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("user_favorites")
      .select("product_id")
      .eq("user_id", user.id)

    if (error) {
      logger.error("[FAVORITES] GET error:", error)
      return NextResponse.json({ error: "No se pudieron cargar los favoritos" }, { status: 500 })
    }

    return NextResponse.json(
      { product_ids: (data ?? []).map((r) => r.product_id as number) },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    logger.error("[FAVORITES] GET unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const productId = parseProductId(body?.product_id)
    if (!productId) {
      return NextResponse.json({ error: "product_id inválido" }, { status: 400 })
    }

    const { data: existing, error: findErr } = await supabase
      .from("user_favorites")
      .select("product_id")
      .eq("user_id", user.id)
      .eq("product_id", productId)
      .maybeSingle()

    if (findErr) {
      logger.error("[FAVORITES] lookup error:", findErr)
      return NextResponse.json({ error: "No se pudo actualizar la lista" }, { status: 500 })
    }

    if (existing) {
      const { error } = await supabase
        .from("user_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("product_id", productId)
      if (error) {
        logger.error("[FAVORITES] delete error:", error)
        return NextResponse.json({ error: "No se pudo quitar de la lista" }, { status: 500 })
      }
    } else {
      const { error } = await supabase
        .from("user_favorites")
        .insert({ user_id: user.id, product_id: productId })
      if (error) {
        logger.error("[FAVORITES] insert error:", error)
        return NextResponse.json({ error: "No se pudo agregar a la lista" }, { status: 500 })
      }
    }

    const { data } = await supabase
      .from("user_favorites")
      .select("product_id")
      .eq("user_id", user.id)

    return NextResponse.json({
      favorited: !existing,
      product_ids: (data ?? []).map((r) => r.product_id as number),
    })
  } catch (err) {
    logger.error("[FAVORITES] POST unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
