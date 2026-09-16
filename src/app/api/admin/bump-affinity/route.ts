import { NextResponse, type NextRequest } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { validateAffinityPairInput } from "@/lib/admin-marketing-validation"

export const runtime = "nodejs"

/** Tope defensivo del listado: los pares curados se cuentan por cientos. */
const MAX_ROWS = 2000

export interface AffinityPairRowWithNames {
  id: number
  source_product_id: number
  target_product_id: number
  kind: string
  weight: number
  is_active: boolean
  source_name: string | null
  target_name: string | null
}

/**
 * GET /api/admin/bump-affinity — lista los pares de afinidad con el nombre
 * de ambos productos resuelto (la tabla solo guarda ids).
 * POST /api/admin/bump-affinity — crea un par "si el carrito trae A → sugiere B".
 * Requiere sesión admin; escribe con service_role.
 */
export async function GET() {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const supabase = await createServiceClient()
    const { data: pairs, error } = await supabase
      .from("bump_affinity")
      .select("id, source_product_id, target_product_id, kind, weight, is_active")
      .order("source_product_id", { ascending: true })
      .order("weight", { ascending: false })
      .limit(MAX_ROWS)
    if (error) throw error

    const rows = pairs ?? []
    const ids = Array.from(
      new Set(rows.flatMap((r) => [r.source_product_id, r.target_product_id])),
    )
    const names = new Map<number, string>()
    if (ids.length > 0) {
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("id, name")
        .in("id", ids)
      if (productsError) throw productsError
      for (const p of products ?? []) names.set(p.id, p.name)
    }

    const result: AffinityPairRowWithNames[] = rows.map((r) => ({
      id: r.id,
      source_product_id: r.source_product_id,
      target_product_id: r.target_product_id,
      kind: r.kind,
      weight: r.weight,
      is_active: r.is_active,
      source_name: names.get(r.source_product_id) ?? null,
      target_name: names.get(r.target_product_id) ?? null,
    }))
    return NextResponse.json({ pairs: result })
  } catch (error) {
    logger.error("[ADMIN-BUMP-AFFINITY] list error:", error)
    return NextResponse.json({ error: "Error al cargar pares de afinidad" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const body = (await request.json()) as Record<string, unknown>
    const parsed = validateAffinityPairInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from("bump_affinity")
      .insert(parsed.value)
      .select("id")
      .single()
    if (error) {
      // 23505 = el par ya existe (índice único source+target). Se reporta
      // como conflicto legible en vez de un 500 opaco.
      if (error.code === "23505") {
        return NextResponse.json({ error: "Ese par de afinidad ya existe" }, { status: 409 })
      }
      throw error
    }
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (error) {
    logger.error("[ADMIN-BUMP-AFFINITY] create error:", error)
    return NextResponse.json({ error: "Error al crear el par de afinidad" }, { status: 500 })
  }
}
