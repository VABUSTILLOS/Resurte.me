import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { NextResponse, type NextRequest } from "next/server"

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_ROWS = 10_000

/**
 * GET /api/admin/products/sales-report?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Reporte de ventas por producto en CSV (pedidos no cancelados del rango,
 * fechas inclusivas). Columnas: producto, unidades, monto.
 */
export async function GET(request: NextRequest) {
  const { response: adminDenied } = await requireAdmin()
  if (adminDenied) return adminDenied

  try {
    const sp = request.nextUrl.searchParams
    const from = sp.get("from") ?? ""
    const to = sp.get("to") ?? ""
    if (!ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to)) {
      return NextResponse.json(
        { error: "Se requieren from y to en formato YYYY-MM-DD" },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()

    // Pedidos del rango (excluye cancelados), con join a order_items.
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, order_items(product_id, quantity, unit_price)")
      .gte("created_at", `${from}T00:00:00Z`)
      .lte("created_at", `${to}T23:59:59Z`)
      .neq("status", "cancelled")
      .limit(MAX_ROWS)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const units = new Map<number, number>()
    const amounts = new Map<number, number>()
    for (const order of orders ?? []) {
      const items = (order.order_items ?? []) as {
        product_id: number
        quantity: number
        unit_price: number
      }[]
      for (const item of items) {
        units.set(item.product_id, (units.get(item.product_id) ?? 0) + item.quantity)
        amounts.set(
          item.product_id,
          (amounts.get(item.product_id) ?? 0) + item.quantity * Number(item.unit_price)
        )
      }
    }

    const ids = [...units.keys()]
    const { data: products } = ids.length
      ? await supabase.from("products").select("id,name").in("id", ids)
      : { data: [] as { id: number; name: string }[] }
    const nameOf = new Map((products ?? []).map((p) => [p.id, p.name as string]))

    const esc = (v: string) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const lines = [...units.entries()]
      .sort((a, b) => (amounts.get(b[0]) ?? 0) - (amounts.get(a[0]) ?? 0))
      .map((row) => {
        const [productId, qty] = row as [number, number]
        return [
          esc(nameOf.get(productId) ?? `#${productId}`),
          String(qty),
          (amounts.get(productId) ?? 0).toFixed(2),
        ].join(",")
      })
    const csv = "﻿" + ["producto,unidades,monto", ...lines].join("\n")

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ventas-${from}_a_${to}.csv"`,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
