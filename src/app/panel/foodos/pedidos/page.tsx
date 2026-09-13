"use client"

// ============================================================
// Pedidos — comanda del restaurante: ver pedidos entrantes,
// cambiar estados (pendiente→confirmado→en preparación→en
// camino→entregado) y filtrar por canal / cumplimiento.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  getFoodosPanelData,
  listOrders,
  updateOrderStatus,
  markOrderPaid,
} from "../actions"
import { formatMoney, modifiersSummary } from "@/lib/foodos"
import { createClient } from "@/lib/supabase/client"
import type {
  FoodosRestaurant,
  FoodosBranch,
  FoodosOrder,
  FoodosOrderStatus,
  FoodosOrderChannel,
  FoodosFulfillment,
  FoodosPaymentStatus,
} from "@/types/foodos"
import {
  Loader2,
  Clock,
  CheckCircle2,
  ChefHat,
  Bike,
  PackageCheck,
  XCircle,
  RefreshCw,
  CreditCard,
  Banknote,
  Bell,
  Printer,
} from "lucide-react"
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import { t } from "@/lib/i18n/es"

const STATUS_FLOW: FoodosOrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
]

const STATUS_META: Record<
  FoodosOrderStatus,
  { label: string; badge: string; icon: React.ReactNode }
> = {
  pending: { label: t("foodos.common.statusPending"), badge: "bg-amber-100 text-amber-800", icon: <Clock className="w-3.5 h-3.5" /> },
  confirmed: { label: t("foodos.common.statusConfirmed"), badge: "bg-blue-100 text-blue-700", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  preparing: { label: t("foodos.common.statusPreparing"), badge: "bg-purple-100 text-purple-700", icon: <ChefHat className="w-3.5 h-3.5" /> },
  out_for_delivery: { label: t("foodos.common.statusOutForDelivery"), badge: "bg-orange-100 text-orange-700", icon: <Bike className="w-3.5 h-3.5" /> },
  delivered: { label: t("foodos.common.statusDelivered"), badge: "bg-emerald-100 text-emerald-700", icon: <PackageCheck className="w-3.5 h-3.5" /> },
  cancelled: { label: t("foodos.common.statusCancelled"), badge: "bg-red-100 text-red-700", icon: <XCircle className="w-3.5 h-3.5" /> },
}

const FULFILLMENT_LABEL: Record<FoodosFulfillment, string> = {
  delivery: t("foodos.common.fulfillmentDelivery"),
  pickup: t("foodos.common.fulfillmentPickup"),
  dine_in: t("foodos.common.fulfillmentDineIn"),
}

const PAID: FoodosPaymentStatus = "paid"

const CHANNEL_OPTIONS: { id: FoodosOrderChannel | "all"; label: string }[] = [
  { id: "all", label: t("foodos.common.allChannels") },
  { id: "web", label: "Web" },
  { id: "qr", label: "QR" },
  { id: "whatsapp", label: "WhatsApp" },
]

export default function PedidosPage() {
  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [orders, setOrders] = useState<FoodosOrder[]>([])
  const [branches, setBranches] = useState<FoodosBranch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FoodosOrderStatus | "all">("all")
  const [channelFilter, setChannelFilter] = useState<FoodosOrderChannel | "all">("all")
  const [saving, setSaving] = useState<string | null>(null)
  const [newOrdersCount, setNewOrdersCount] = useState(0)

  const load = useCallback(async () => {
    try {
      const { restaurant: r, orders: os, branches: bs } = await getFoodosPanelData()
      setRestaurant(r)
      setOrders(os)
      setBranches(bs)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("foodos.common.loadError"))
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRetry = () => {
    setLoading(true)
    setError(null)
    load()
  }

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  // Comanda en vivo: refresco cada 120s (antes 30s) y solo con la pestaña
  // visible — el polling 30s por pestaña abierta inflaba las invocaciones de
  // función en Vercel. Al volver a la pestaña se refresca al instante.
  useEffect(() => {
    if (!restaurant) return
    let stopped = false
    const refresh = async () => {
      try {
        const os = await listOrders(restaurant.id)
        if (!stopped) setOrders(os)
      } catch {
        // silencioso: el siguiente ciclo reintenta
      }
    }
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh()
    }, 120_000)
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      stopped = true
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [restaurant])

  // Comanda en vivo: suscripción Realtime a foodos_orders (INSERT = nuevo
  // pedido → beep + badge; UPDATE = cambio de estado). El RLS owner-only
  // filtra los eventos a los restaurantes del usuario autenticado.
  const audioCtxRef = useRef<AudioContext | null>(null)
  useEffect(() => {
    if (!restaurant) return
    const supabase = createClient()
    if (!supabase) return

    const beep = () => {
      try {
        audioCtxRef.current ??= new AudioContext()
        const ctx = audioCtxRef.current
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = "sine"
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.15, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
        osc.connect(gain).connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.6)
      } catch {
        // autoplay bloqueado hasta la primera interacción; se reintenta luego
      }
    }

    const channel = supabase
      .channel(`foodos-orders-${restaurant.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "foodos_orders", filter: `restaurant_id=eq.${restaurant.id}` },
        (payload) => {
          const row = payload.new as FoodosOrder
          setOrders((prev) => (prev.some((o) => o.id === row.id) ? prev : [row, ...prev]))
          setNewOrdersCount((c) => c + 1)
          beep()
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "foodos_orders", filter: `restaurant_id=eq.${restaurant.id}` },
        (payload) => {
          const row = payload.new as FoodosOrder
          setOrders((prev) => prev.map((o) => (o.id === row.id ? row : o)))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurant])

  const branchName = useMemo(() => {
    const map = new Map(branches.map((b) => [b.id, b.name]))
    return (id: string | null) => (id ? map.get(id) ?? "—" : "—")
  }, [branches])

  const filtered = useMemo(() => {
    return orders.filter(
      (o) =>
        (filter === "all" || o.status === filter) &&
        (channelFilter === "all" || o.channel === channelFilter)
    )
  }, [orders, filter, channelFilter])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length }
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1
    return c
  }, [orders])

  async function advance(order: FoodosOrder) {
    setSaving(order.id)
    try {
      if (order.status === "pending") {
        await updateOrderStatus(order.id, "confirmed")
      } else if (order.status === "confirmed") {
        await updateOrderStatus(order.id, "preparing")
      } else if (order.status === "preparing") {
        await updateOrderStatus(
          order.id,
          order.fulfillment === "delivery" ? "out_for_delivery" : "delivered"
        )
      } else if (order.status === "out_for_delivery") {
        await updateOrderStatus(order.id, "delivered")
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t("foodos.common.updateError"))
    } finally {
      setSaving(null)
    }
  }

  async function cancel(order: FoodosOrder) {
    if (!confirm(t("foodos.common.cancelConfirm", { id: order.id.slice(0, 8).toUpperCase() }))) return
    setSaving(order.id)
    try {
      await updateOrderStatus(order.id, "cancelled")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t("foodos.common.cancelError"))
    } finally {
      setSaving(null)
    }
  }

  if (!restaurant) {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-24 text-stone-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> {t("foodos.common.loading")}
        </div>
      )
    }
    return (
      <div className="max-w-2xl mx-auto mt-16 bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
        <h1 className="text-xl font-black text-stone-900">{t("foodos.common.setupTitle")}</h1>
        <p className="text-stone-600 mt-2">{t("foodos.common.setupBody")}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-stone-900">{t("foodos.pedidos.title")}</h1>
          <p className="text-sm text-stone-500">{t("foodos.pedidos.subtitle")}</p>
        </div>
        <button
          onClick={handleRetry}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-stone-200 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> {t("foodos.common.retry")}
        </button>
      </div>

      {newOrdersCount > 0 && (
        <button
          onClick={() => { setNewOrdersCount(0); setFilter("pending") }}
          className="mb-4 w-full flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-xl px-4 py-3 text-sm font-bold animate-pulse"
        >
          <Bell className="w-4 h-4" />
          {newOrdersCount} pedido{newOrdersCount > 1 ? "s" : ""} nuevo{newOrdersCount > 1 ? "s" : ""} — ver pendientes
        </button>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Filtros por estado */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
        {(["all", ...STATUS_FLOW, "cancelled"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              filter === s ? "bg-stone-900 text-white" : "bg-white text-stone-600 border border-stone-200"
            }`}
          >
            {s === "all" ? t("foodos.pedidos.all", { count: counts.all ?? 0 }) : `${STATUS_META[s as FoodosOrderStatus].label} (${counts[s] ?? 0})`}
          </button>
        ))}
      </div>

      {/* Filtro por canal */}
      <div className="flex gap-2 mb-6">
        {CHANNEL_OPTIONS.map((c) => (
          <button
            key={c.id}
            onClick={() => setChannelFilter(c.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              channelFilter === c.id ? "bg-emerald-600 text-white" : "bg-white text-stone-600 border border-stone-200"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-300 rounded-2xl p-12 text-center text-stone-400">
          {filter !== "all" ? t("foodos.pedidos.emptyFiltered") : t("foodos.pedidos.emptyAll")}
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((order) => (
            <div key={order.id} className="bg-white border border-stone-200 rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-stone-900">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${STATUS_META[order.status].badge}`}>
                      {STATUS_META[order.status].icon}
                      {STATUS_META[order.status].label}
                    </span>
                  </div>
                  <p className="text-sm text-stone-500 mt-1">
                    {new Date(order.created_at).toLocaleString("es-MX", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {" · "}{FULFILLMENT_LABEL[order.fulfillment] ?? order.fulfillment}
                    {order.table_number ? ` · Mesa ${order.table_number}` : ""}
                    {" · "}{branchName(order.branch_id)}
                  </p>
                  {(order.customer_name || order.customer_phone) && (
                    <p className="text-sm text-stone-600 mt-1">
                      {order.customer_name ?? t("foodos.common.customer")} · {order.customer_phone}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-stone-900">{formatMoney(order.total)}</p>
                  <p className="flex items-center justify-end gap-1 text-xs text-stone-500 mt-1">
                    {order.payment_method === "card" ? (
                      <><CreditCard className="w-3 h-3" /> {t("foodos.common.card")}</>
                    ) : order.payment_method === "transfer" ? (
                      <><CreditCard className="w-3 h-3" /> Transferencia</>
                    ) : (
                      <><Banknote className="w-3 h-3" /> {t("foodos.common.atBranch")}</>
                    )}
                    {order.payment_status === PAID ? (
                      <span className="ml-1 text-emerald-600 font-bold">· {t("foodos.common.paid")}</span>
                    ) : (
                      <button
                        onClick={async () => {
                          setSaving(order.id)
                          try {
                            await markOrderPaid(order.id)
                            await load()
                          } finally {
                            setSaving(null)
                          }
                        }}
                        disabled={saving === order.id}
                        className="ml-1 text-amber-700 font-bold hover:text-amber-900 underline"
                      >
                        · Marcar pagado
                      </button>
                    )}
                  </p>
                  {(order.tip > 0 || order.discount > 0) && (
                    <p className="text-[11px] text-stone-400 mt-0.5">
                      {order.discount > 0 && `cupón ${order.coupon_code ?? ""} −${formatMoney(order.discount)}`}
                      {order.discount > 0 && order.tip > 0 && " · "}
                      {order.tip > 0 && `propina ${formatMoney(order.tip)}`}
                    </p>
                  )}
                  <p className="text-[11px] text-stone-400 uppercase tracking-wide mt-1">{t("foodos.common.channel", { channel: order.channel })}</p>
                </div>
              </div>

              {/* Items */}
              <div className="bg-stone-50 rounded-xl p-3 space-y-1.5 mb-4">
                {order.items.map((item, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-stone-700">
                        <span className="font-bold text-stone-900">{item.qty}×</span> {item.name}
                      </span>
                      <span className="text-stone-600 font-semibold">{formatMoney(item.price * item.qty)}</span>
                    </div>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <p className="text-xs text-stone-500 pl-6">└ {modifiersSummary(item.modifiers)}</p>
                    )}
                  </div>
                ))}
                {order.note && (
                  <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-2 mt-1">
                    <strong>{t("foodos.common.note")}</strong> {order.note}
                  </p>
                )}
              </div>

              {/* Acciones */}
              {order.status !== "delivered" && order.status !== "cancelled" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => advance(order)}
                    disabled={saving === order.id}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {saving === order.id && <Loader2 className="w-4 h-4 animate-spin" />}
                    {order.status === "pending" && t("foodos.pedidos.confirmOrder")}
                    {order.status === "confirmed" && t("foodos.pedidos.startPreparing")}
                    {order.status === "preparing" && (order.fulfillment === "delivery" ? t("foodos.pedidos.sendDelivery") : t("foodos.pedidos.markDelivered"))}
                    {order.status === "out_for_delivery" && t("foodos.pedidos.markDelivered")}
                  </button>
                  <button
                    onClick={() => cancel(order)}
                    disabled={saving === order.id}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" /> {t("common.cancel")}
                  </button>
                </div>
              )}
              <div className="mt-3 flex justify-end">
                <Link
                  href={`/panel/foodos/pedidos/${order.id}/print`}
                  target="_blank"
                  className="flex items-center gap-1.5 text-xs font-semibold text-stone-400 hover:text-stone-700"
                >
                  <Printer className="w-3.5 h-3.5" /> Imprimir comanda
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
      <ToolGuideHost toolKey="pedidos" pathname="/panel/foodos/pedidos" slug={null} icon="🧋" title={t("foodos.pedidos.guideTitle")} />
    </div>
  )
}
