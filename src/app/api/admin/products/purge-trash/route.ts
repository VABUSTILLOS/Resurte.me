import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { readJsonBody } from "@/lib/api-body"
import { revalidateCatalogCache } from "@/lib/catalog-cache"
import { resetCatalogCache } from "@/lib/catalog"
import { logAdminAction } from "@/lib/audit-log"
import { PURGE_MAX_PER_RUN, purgeTrashProducts } from "@/lib/trash"

export const runtime = "nodejs"

/**
 * POST /api/admin/products/purge-trash
 *
 * Purga definitivamente la papelera (ronda 7). Body:
 * `{ productIds?: number[] }` para vaciar solo esos productos o
 * `{ all: true }` para vaciar toda la papelera que ya cumplió la retención.
 *
 * Nunca borra productos con pedidos: `order_items.product_id` es ON DELETE
 * CASCADE y borrarlos destruiría el historial de ventas; esos se reportan en
 * `keptWithOrders`. `ignoreRetention: true` purga sin esperar los 30 días
 * (solo lo usa la confirmación explícita del admin). Solo admin.
 */
export async function POST(request: Request) {
  try {
    const { response: adminDenied, user: adminUser } = await requireAdmin()
    if (adminDenied) return adminDenied

    const parsed = await readJsonBody<{
      productIds?: unknown
      all?: unknown
      ignoreRetention?: unknown
    }>(request)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })

    const body = parsed.data

    const productIds = Array.isArray(body.productIds)
      ? [
          ...new Set(
            body.productIds.filter(
              (v): v is number => typeof v === "number" && Number.isInteger(v)
            )
          ),
        ]
      : null
    if (!productIds && body.all !== true) {
      return NextResponse.json({ error: "Se requiere productIds o all: true" }, { status: 400 })
    }
    if (productIds && productIds.length > PURGE_MAX_PER_RUN) {
      return NextResponse.json(
        { error: `Máximo ${PURGE_MAX_PER_RUN} productos por purga` },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()
    const result = await purgeTrashProducts(supabase, {
      productIds: productIds ?? undefined,
      ignoreRetention: body.ignoreRetention === true,
      maxPerRun: PURGE_MAX_PER_RUN,
    })

    if (result.purged > 0) {
      revalidateCatalogCache()
      resetCatalogCache()
      await logAdminAction(supabase, {
        actorId: adminUser?.id ?? null,
        actorEmail: adminUser?.email ?? null,
        action: "product_purge",
        entity: "products",
        entityId: null,
        detail: {
          purged: result.purged,
          keptWithOrders: result.keptWithOrders.length,
          keptNotDue: result.keptNotDue.length,
        },
      })
    }

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
