import { NextResponse } from "next/server"
import {
  describeRecurringSchedule,
  validateRecurringItems,
  type RecurringOrderRow,
} from "@/lib/recurring-orders"
import { isMissingRelationError } from "@/lib/sale-window"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"

/**
 * GET /api/recurring-orders — las recurrencias del cliente con
 * sesión (Ola 5, 00234), para la sección de «Mis pedidos». Solo
 * las suyas: el filtro por user_id va en la consulta, con el id
 * de la sesión, nunca de un parámetro. Sin sesión, 401; sin la
 * migración, `available: false` y la sección no se pinta.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión para ver tus pedidos recurrentes" }, { status: 401 })
  }

  const service = await createServiceClient()
  const { data, error } = await service
    .from("recurring_orders")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    if (isMissingRelationError(error)) {
      return NextResponse.json({ available: false, templates: [] })
    }
    return NextResponse.json({ error: "No se pudieron leer tus recurrencias" }, { status: 500 })
  }

  const rows = (data ?? []) as RecurringOrderRow[]
  const productIds = [
    ...new Set(rows.flatMap((r) => validateRecurringItems(r.items).map((i) => i.product_id))),
  ]
  const nameByProduct = new Map<number, string>()
  if (productIds.length > 0) {
    const { data: products } = await service
      .from("products")
      .select("id, name")
      .in("id", productIds)
    for (const p of (products ?? []) as Array<{ id: number; name: string }>) {
      nameByProduct.set(p.id, p.name)
    }
  }

  return NextResponse.json({
    available: true,
    templates: rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      frequency: r.frequency,
      schedule_text: describeRecurringSchedule(r),
      next_run_on: r.next_run_on,
      last_run_on: r.last_run_on,
      last_order_id: r.last_order_id,
      last_result: r.last_result,
      items: validateRecurringItems(r.items).map((i) => ({
        ...i,
        product_name: nameByProduct.get(i.product_id) ?? null,
      })),
    })),
  })
}
