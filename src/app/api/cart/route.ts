import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/**
 * GET/PUT /api/cart — carrito persistente del usuario con sesión.
 *
 * Usa el client de sesión (RLS: cada usuario solo ve su fila). El cliente
 * (cart-context) hace merge last-write-wins con localStorage comparando
 * `updated_at` y sube los cambios con PUT debounced.
 *
 * PUT body: { items: CartItem[], coupon?: AppliedCoupon | null }
 *   - replace-all: `items` ES el carrito completo (no un diff).
 *   - Cap de 200 items y validación mínima de forma (product_id, quantity).
 */

interface CartItemInput {
  product_id: number
  quantity: number
  [key: string]: unknown
}

function sanitizeItems(raw: unknown): CartItemInput[] | null {
  if (!Array.isArray(raw)) return null
  if (raw.length > 200) return null
  const items: CartItemInput[] = []
  for (const it of raw) {
    if (
      typeof it !== "object" ||
      it === null ||
      typeof (it as CartItemInput).product_id !== "number" ||
      typeof (it as CartItemInput).quantity !== "number" ||
      (it as CartItemInput).quantity <= 0
    ) {
      return null
    }
    items.push(it as CartItemInput)
  }
  return items
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
      .from("user_carts")
      .select("items, coupon, updated_at")
      .eq("user_id", user.id)
      .maybeSingle()

    if (error) {
      logger.error("[CART] GET error:", error)
      return NextResponse.json({ error: "No se pudo cargar el carrito" }, { status: 500 })
    }

    return NextResponse.json(
      {
        items: data?.items ?? [],
        coupon: data?.coupon ?? null,
        updated_at: data?.updated_at ?? null,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err) {
    logger.error("[CART] GET unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const items = sanitizeItems(body?.items)
    if (!items) {
      return NextResponse.json(
        { error: "items debe ser un arreglo de {product_id, quantity} (máx. 200)" },
        { status: 400 }
      )
    }
    const coupon = body?.coupon && typeof body.coupon === "object" ? body.coupon : null

    const { data, error } = await supabase
      .from("user_carts")
      .upsert(
        { user_id: user.id, items, coupon, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      .select("updated_at")
      .single()

    if (error) {
      logger.error("[CART] PUT error:", error)
      return NextResponse.json({ error: "No se pudo guardar el carrito" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, updated_at: data.updated_at })
  } catch (err) {
    logger.error("[CART] PUT unexpected:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
