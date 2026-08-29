import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { rateLimited, clientIp, rateLimitResponse } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

/**
 * GET /api/panel/dishes?collection=<slug> — platillos del costeo del dueño.
 * PUT /api/panel/dishes { collection_slug?, dishes } — reemplaza la lista
 * del dueño para esa colección (sync desde localStorage del panel).
 *
 * Identidad: sesión autenticada (cookie) o header `x-guest-token` (UUID
 * anónimo del navegador, mismo patrón que las direcciones guest).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_DISHES = 200

interface DishInput {
  id: string
  name: string
  ingredients?: { ingredientName: string; quantity: number; unit: string; unitPrice: number }[]
  foodCostPercent: number
  sellingPrice: number
  modificadores?: { id: string; nombre: string; precio: number }[]
}

function isValidDish(x: unknown): x is DishInput {
  if (!x || typeof x !== "object") return false
  const d = x as Record<string, unknown>
  return (
    typeof d.id === "string" &&
    typeof d.name === "string" &&
    typeof d.foodCostPercent === "number" &&
    typeof d.sellingPrice === "number"
  )
}

interface Owner {
  userId: string | null
  guestToken: string | null
}

/** Sesión autenticada gana; si no hay, se usa el guest_token del navegador. */
async function resolveOwner(req: NextRequest): Promise<Owner | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) return { userId: user.id, guestToken: null }

  const token = (req.headers.get("x-guest-token") || "").trim()
  if (!UUID_RE.test(token)) return null
  return { userId: null, guestToken: token }
}

function ownerColumn(owner: Owner): [string, string] {
  return owner.userId ? ["user_id", owner.userId] : ["guest_token", owner.guestToken!]
}

interface DishRow {
  client_id: string
  name: string
  ingredients: DishInput["ingredients"] | null
  food_cost_percent: number
  selling_price: number
  modificadores: DishInput["modificadores"] | null
}

function rowToDish(row: DishRow): DishInput {
  return {
    id: row.client_id,
    name: row.name,
    ingredients: row.ingredients ?? [],
    foodCostPercent: row.food_cost_percent,
    sellingPrice: row.selling_price,
    ...(row.modificadores ? { modificadores: row.modificadores } : {}),
  }
}

export async function GET(req: NextRequest) {
  try {
    const owner = await resolveOwner(req)
    if (!owner) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const service = await createServiceClient()
    const rate = await rateLimited(
      service,
      `dishes:${owner.userId ?? owner.guestToken ?? clientIp(req)}`,
      60,
      60,
    )
    if (!rate.allowed) return rateLimitResponse(rate)

    const collection = req.nextUrl.searchParams.get("collection")?.trim() || "default"
    const [col, val] = ownerColumn(owner)

    const { data, error } = await service
      .from("panel_dishes")
      .select("client_id, name, ingredients, food_cost_percent, selling_price, modificadores")
      .eq(col, val)
      .eq("collection_slug", collection)
      .order("created_at", { ascending: true })

    if (error) {
      logger.error("Panel dishes load error:", error)
      return NextResponse.json({ error: "Error al cargar los platillos" }, { status: 500 })
    }

    return NextResponse.json({ dishes: ((data || []) as DishRow[]).map(rowToDish) })
  } catch (err) {
    logger.error("Panel dishes GET error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const owner = await resolveOwner(req)
    if (!owner) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const service = await createServiceClient()
    const rate = await rateLimited(
      service,
      `dishes:${owner.userId ?? owner.guestToken ?? clientIp(req)}`,
      30,
      60,
    )
    if (!rate.allowed) return rateLimitResponse(rate)

    const body = (await req.json()) as { collection_slug?: string; dishes?: unknown }
    if (!Array.isArray(body.dishes) || body.dishes.length > MAX_DISHES) {
      return NextResponse.json({ error: "dishes debe ser un arreglo (máx. 200)" }, { status: 400 })
    }
    if (!body.dishes.every(isValidDish)) {
      return NextResponse.json({ error: "Formato de platillo inválido" }, { status: 400 })
    }

    const collection = body.collection_slug?.trim() || "default"
    const dishes = body.dishes as DishInput[]

    // Replace-all por dueño + colección: borra y reinserta la lista completa.
    const [col, val] = ownerColumn(owner)
    const { error: deleteError } = await service
      .from("panel_dishes")
      .delete()
      .eq(col, val)
      .eq("collection_slug", collection)
    if (deleteError) {
      logger.error("Panel dishes delete error:", deleteError)
      return NextResponse.json({ error: "Error al guardar los platillos" }, { status: 500 })
    }

    if (dishes.length > 0) {
      const rows = dishes.map((d) => ({
        client_id: d.id,
        collection_slug: collection,
        user_id: owner.userId,
        guest_token: owner.guestToken,
        name: d.name,
        ingredients: d.ingredients ?? [],
        food_cost_percent: d.foodCostPercent,
        selling_price: d.sellingPrice,
        modificadores: d.modificadores ?? null,
        updated_at: new Date().toISOString(),
      }))
      const { error: insertError } = await service.from("panel_dishes").insert(rows)
      if (insertError) {
        logger.error("Panel dishes insert error:", insertError)
        return NextResponse.json({ error: "Error al guardar los platillos" }, { status: 500 })
      }
    }

    return NextResponse.json({ saved: dishes.length })
  } catch (err) {
    logger.error("Panel dishes PUT error:", err)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
