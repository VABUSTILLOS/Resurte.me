import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

/**
 * GET /api/admin/funnel?days=30
 *
 * Funnel de conversión del carrito de alta conversión (métrica clave
 * estilo SamCart): pedidos creados → pagados, take-rate de order bumps
 * y upsells 1-click, emails de recuperación por toque y desglose UTM.
 * Requiere sesión admin. Las secciones que dependen de columnas nuevas
 * (utm_*) degradan a null si la migración aún no se aplicó.
 */
export async function GET(request: Request) {
  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) return adminDenied

    const { searchParams } = new URL(request.url)
    const days = Math.min(90, Math.max(1, Number(searchParams.get("days")) || 30))
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const supabase = await createServiceClient()

    // ── Pedidos del período ──────────────────────────────────────
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("id, status, payment_status, payment_method, utm_source")
      .gte("created_at", since)

    let ordersData: Array<{
      id: number
      status: string
      payment_status: string | null
      payment_method: string | null
      utm_source?: string | null
    }> | null = orders

    // 42703 = columna utm_source aún no migrada → reintentar sin ella
    if (ordersErr?.code === "42703") {
      const retry = await supabase
        .from("orders")
        .select("id, status, payment_status, payment_method")
        .gte("created_at", since)
      if (retry.error) throw retry.error
      ordersData = retry.data
    } else if (ordersErr) {
      throw ordersErr
    }

    const all = ordersData ?? []
    const paid = all.filter((o) => o.payment_status === "paid")
    const pendingAbandoned = all.filter(
      (o) =>
        o.status === "pending" &&
        o.payment_status === "pending" &&
        o.payment_method !== "cash_on_delivery",
    )

    // ── Take-rate de bumps (items tipo bump en pedidos pagados) ──
    let bumpTakeRate: number | null = null
    if (paid.length > 0) {
      const paidIds = paid.map((o) => o.id)
      const { data: bumpItems, error: bumpErr } = await supabase
        .from("order_items")
        .select("order_id")
        .eq("item_type", "bump")
        .in("order_id", paidIds.slice(0, 1000))
      if (bumpErr && bumpErr.code !== "42703") throw bumpErr
      if (!bumpErr) {
        const withBump = new Set((bumpItems ?? []).map((i: { order_id: number }) => i.order_id))
        bumpTakeRate = paid.length > 0 ? withBump.size / paid.length : 0
      }
    }

    // ── Take-rate de upsells 1-click ─────────────────────────────
    let upsellTakeRate: number | null = null
    if (paid.length > 0) {
      const paidIds = paid.map((o) => o.id)
      const { data: upsells, error: upsellErr } = await supabase
        .from("order_upsells")
        .select("order_id")
        .in("order_id", paidIds.slice(0, 1000))
      if (upsellErr && upsellErr.code !== "42P01") throw upsellErr
      if (!upsellErr) {
        const withUpsell = new Set((upsells ?? []).map((u: { order_id: number }) => u.order_id))
        upsellTakeRate = paid.length > 0 ? withUpsell.size / paid.length : 0
      }
    }

    // ── Emails de recuperación por toque ─────────────────────────
    const { data: recoveryLogs, error: logsErr } = await supabase
      .from("email_logs")
      .select("email_type")
      .in("email_type", ["abandoned_cart", "abandoned_cart_24h", "abandoned_cart_48h"])
      .eq("status", "sent")
      .gte("created_at", since)
    if (logsErr) throw logsErr

    const recoveryByTouch: Record<string, number> = {}
    for (const log of recoveryLogs ?? []) {
      const type = (log as { email_type: string }).email_type
      recoveryByTouch[type] = (recoveryByTouch[type] ?? 0) + 1
    }

    // ── Desglose UTM de pedidos pagados ──────────────────────────
    const hasUtm = all.some((o) => "utm_source" in o)
    const utmBreakdown: Array<{ source: string; orders: number }> | null = hasUtm
      ? Object.entries(
          paid.reduce<Record<string, number>>((acc, o) => {
            const src = o.utm_source?.trim() || "(directo)"
            acc[src] = (acc[src] ?? 0) + 1
            return acc
          }, {}),
        )
          .map(([source, count]) => ({ source, orders: count }))
          .sort((a, b) => b.orders - a.orders)
          .slice(0, 10)
      : null

    return NextResponse.json({
      days,
      funnel: {
        ordersCreated: all.length,
        ordersPaid: paid.length,
        pendingAbandoned: pendingAbandoned.length,
        paidRate: all.length > 0 ? paid.length / all.length : 0,
      },
      bumpTakeRate,
      upsellTakeRate,
      recoveryByTouch,
      utmBreakdown,
    })
  } catch (error) {
    logger.error("[ADMIN-FUNNEL] error:", error)
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
