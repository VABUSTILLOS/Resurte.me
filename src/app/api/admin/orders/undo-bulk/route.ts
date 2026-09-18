/**
 * POST /api/admin/orders/undo-bulk
 *
 * Deshace una confirmación masiva de pago.
 *
 * `PATCH /api/orders/[id]/status` solo acepta `payment_status: "paid"`
 * (VALID_PAYMENT_STATUSES), así que no hay forma de volver a `pending` por esa
 * vía: sin esta ruta, confirmar el pago de una selección por error abonaba
 * cashback real y no se podía deshacer. Llama a la RPC
 * `revert_payment_confirmation` (00150), que hace la transición de estado y
 * deja que el trigger `trg_reverse_cashback` (00146) revierta el cashback.
 *
 * Body: { ids: number[] }
 * Authentication: sesión admin (requireAdmin).
 */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction } from "@/lib/audit-log"

/** Tope de pedidos por operación: la reversión es secuencial y cada una dispara un trigger. */
const MAX_UNDO_IDS = 100

export async function POST(request: Request) {
  try {
    const { response: adminDenied, user: adminUser } = await requireAdmin({ permission: "pedidos" })
    if (adminDenied) {
      return adminDenied
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const rawIds = (body as { ids?: unknown } | null)?.ids
    if (!Array.isArray(rawIds)) {
      return NextResponse.json({ error: "Se requiere ids: number[]" }, { status: 400 })
    }

    // Normaliza: solo enteros positivos y sin duplicados, para que un id
    // repetido no cuente dos veces en el resumen.
    const ids = Array.from(
      new Set(
        rawIds.filter(
          (value): value is number =>
            typeof value === "number" && Number.isInteger(value) && value > 0
        )
      )
    )
    if (ids.length === 0) {
      return NextResponse.json({ error: "Sin pedidos válidos" }, { status: 400 })
    }
    if (ids.length > MAX_UNDO_IDS) {
      return NextResponse.json(
        { error: `Máximo ${MAX_UNDO_IDS} pedidos por operación` },
        { status: 400 }
      )
    }

    const supabase = await createServiceClient()
    let ok = 0
    const failedIds: number[] = []

    for (const id of ids) {
      const { data, error } = await supabase.rpc("revert_payment_confirmation", {
        p_order_id: id,
      })

      if (error) {
        failedIds.push(id)
        continue
      }

      // La RPC devuelve false cuando el pedido ya no estaba en `paid`: no es
      // un fallo de la base, pero tampoco un deshacer real.
      if (data === true) {
        ok++
        await logAdminAction(supabase, {
          actorId: adminUser?.id ?? null,
          actorEmail: adminUser?.email ?? null,
          action: "order_payment_revert",
          entity: "orders",
          entityId: id,
          detail: { from: "paid", to: "pending", via: "bulk_undo" },
        })
      } else {
        failedIds.push(id)
      }
    }

    return NextResponse.json({
      ok,
      failed: failedIds.length,
      failedIds,
      total: ids.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
