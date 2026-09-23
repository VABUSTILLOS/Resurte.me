import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logger } from "@/lib/logger"
import {
  MAX_META_IDS,
  parseMetaIds,
  parseRowMetaPayload,
  type RowMetaSources,
  type RowMetaSupplierRow,
} from "@/lib/admin-product-row-meta"
import { NextResponse, type NextRequest } from "next/server"

/**
 * GET /api/admin/products/row-meta?ids=1,2,3
 * Metadatos por fila para el panel de productos:
 * - waPending: ids con cambios pendientes en whatsapp_sync_queue.
 * - lastEdit: última edición registrada en admin_audit_log por producto.
 * - sales/salesAmount: unidades y monto vendidos (pedidos no cancelados),
 *   que alimentan la columna "Ventas" del listado.
 * - suppliers: nombre del proveedor, para la insignia de la fila.
 *
 * Las tres fuentes son decorativas: si una falla, degrada a vacío y se declara
 * en `degraded` — nunca tumba la respuesta entera, porque las otras dos siguen
 * llegando. Las ventas se leen de `products_with_sales` (00116), que ya trae el
 * agregado por producto: evita el recorte silencioso al `max-rows` de PostgREST
 * y el escaneo completo de `order_items` en cada página.
 */
export async function GET(request: NextRequest) {
  const { response: adminDenied } = await requireAdmin({ permission: "productos" })
  if (adminDenied) return adminDenied

  try {
    const rawIds = request.nextUrl.searchParams.get("ids") ?? ""
    const ids = parseMetaIds(rawIds)
    if (ids.length === 0) {
      return NextResponse.json(parseRowMetaPayload(emptySources()))
    }
    const requested = new Set(
      rawIds
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
    )
    if (requested.size > MAX_META_IDS) {
      // Silenciarlo dejaría filas sin metadatos y sin rastro de la causa.
      logger.warn("products.row-meta.truncated", {
        requested: requested.size,
        max: MAX_META_IDS,
      })
    }

    const supabase = await createServiceClient()

    const [queueRes, auditRes, salesRes, suppliersRes] = await Promise.all([
      supabase
        .from("whatsapp_sync_queue")
        .select("product_id")
        .in("product_id", ids)
        .is("processed_at", null),
      supabase
        .from("admin_audit_log")
        .select("entity_id,actor_email,created_at")
        .eq("entity", "products")
        .in("entity_id", ids.map(String))
        .order("created_at", { ascending: false })
        .limit(500),
      // Misma semántica que el reporte de ventas y que el orden "más vendidos":
      // la vista descarta los pedidos cancelados, así que la columna Ventas
      // cuadra con el orden por ventas.
      supabase.from("products_with_sales").select("id,sales_units,sales_revenue").in("id", ids),
      // Proveedor por producto para la insignia de la fila. Se piden los dos
      // lados por separado y el join se hace abajo: el embed de PostgREST
      // devuelve la relación como objeto o como arreglo según cómo infiera la
      // clave foránea, y la insignia no puede depender de eso.
      Promise.all([
        supabase
          .from("product_suppliers")
          .select("product_id,supplier_id,is_primary")
          .in("product_id", ids),
        supabase.from("suppliers").select("id,name"),
      ]).then(([links, names]) => ({ links, names })),
    ])

    const sources: RowMetaSources = {
      queue: { ok: !queueRes.error, rows: queueRes.data ?? [] },
      audit: { ok: !auditRes.error, rows: auditRes.data ?? [] },
      sales: { ok: !salesRes.error, rows: salesRes.data ?? [] },
      suppliers: {
        ok: !suppliersRes.links.error && !suppliersRes.names.error,
        rows: joinSupplierNames(suppliersRes.links.data ?? [], suppliersRes.names.data ?? []),
      },
    }
    for (const [source, res] of [
      ["queue", queueRes],
      ["audit", auditRes],
      ["sales", salesRes],
    ] as const) {
      if (res.error) {
        logger.warn("products.row-meta.degraded", { source, error: res.error.message })
      }
    }

    return NextResponse.json(parseRowMetaPayload(sources))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** Aplana el nombre del proveedor sobre cada vínculo. */
function joinSupplierNames(
  links: { product_id: number | null; supplier_id: number | null; is_primary: boolean | null }[],
  suppliers: { id: number; name: string | null }[]
): RowMetaSupplierRow[] {
  const nameById = new Map(suppliers.map((s) => [s.id, s.name]))
  return links.map((link) => ({
    product_id: link.product_id,
    is_primary: link.is_primary,
    supplier_name: link.supplier_id == null ? null : (nameById.get(link.supplier_id) ?? null),
  }))
}

function emptySources(): RowMetaSources {
  return {
    queue: { ok: true, rows: [] },
    audit: { ok: true, rows: [] },
    sales: { ok: true, rows: [] },
    suppliers: { ok: true, rows: [] },
  }
}
