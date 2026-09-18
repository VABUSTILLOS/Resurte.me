import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { isMissingColumnError } from "@/lib/sale-window"
import {
  buildSalesRows,
  salesReportCsv,
  salesReportInsights,
  type SalesInput,
} from "@/lib/sales-report"
import { NextResponse, type NextRequest } from "next/server"

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_ROWS = 10_000

interface OrderItemRow {
  product_id: number
  quantity: number
  unit_price: number
}

interface ProductRow {
  id: number
  name: string
  cost?: number | null
}

/**
 * GET /api/admin/products/sales-report?from=YYYY-MM-DD&to=YYYY-MM-DD[&format=json]
 *
 * Reporte de ventas por producto (pedidos no cancelados del rango, fechas
 * inclusivas). Por defecto responde un CSV con unidades, monto, costo, margen
 * ($ y %), clase ABC y participación. Con `format=json` devuelve las mismas
 * filas más la tarjeta de insights que muestra el panel.
 */
export async function GET(request: NextRequest) {
  const { response: adminDenied } = await requireAdmin({ permission: "productos" })
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
      const items = (order.order_items ?? []) as OrderItemRow[]
      for (const item of items) {
        units.set(item.product_id, (units.get(item.product_id) ?? 0) + item.quantity)
        amounts.set(
          item.product_id,
          (amounts.get(item.product_id) ?? 0) + item.quantity * Number(item.unit_price)
        )
      }
    }

    const ids = [...units.keys()]
    // El costo es la base del margen; si la columna aún no existe en este
    // entorno el reporte sigue funcionando y solo omite el margen.
    let products: ProductRow[] | null = null
    if (ids.length) {
      const withCost = await supabase.from("products").select("id,name,cost").in("id", ids)
      if (withCost.error && isMissingColumnError(withCost.error)) {
        const withoutCost = await supabase.from("products").select("id,name").in("id", ids)
        products = (withoutCost.data ?? []) as ProductRow[]
      } else {
        products = (withCost.data ?? []) as ProductRow[]
      }
    }

    const byId = new Map((products ?? []).map((p) => [p.id, p]))
    const items: SalesInput[] = ids.map((productId) => {
      const cost = byId.get(productId)?.cost
      return {
        productId,
        name: byId.get(productId)?.name ?? `#${productId}`,
        units: units.get(productId) ?? 0,
        revenue: amounts.get(productId) ?? 0,
        unitCost: typeof cost === "number" && Number.isFinite(cost) ? cost : null,
      }
    })

    const rows = buildSalesRows(items)

    if (sp.get("format") === "json") {
      return NextResponse.json({ from, to, rows, insights: salesReportInsights(rows) })
    }

    return new NextResponse(salesReportCsv(rows), {
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
