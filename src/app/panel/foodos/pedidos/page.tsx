"use client"

// ============================================================
// Pedidos — comanda del restaurante: ver pedidos entrantes,
// cambiar estados (pendiente→confirmado→en preparación→en
// camino→entregado) y filtrar por canal / cumplimiento.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  getMyRestaurant,
  listOrders,
  updateOrderStatus,
  listBranches,
} from "../actions"
import { formatMoney } from "@/lib/foodos"
import type {
  FoodosRestaurant,
  FoodosBranch,
  FoodosOrder,
  FoodosOrderStatus,
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
} from "lucide-react"

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
  pending: { label: "Pendiente", badge: "bg-amber-100 text-amber-800", icon: <Clock className="w-3.5 h-3.5" /> },
  confirmed: { label: "Confirmado", badge: "bg-blue-100 text-blue-700", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  preparing: { label: "En preparación", badge: "bg-purple-100 text-purple-700", icon: <ChefHat className="w-3.5 h-3.5" /> },
  out_for_delivery: { label: "En camino", badge: "bg-orange-100 text-orange-700", icon: <Bike className="w-3.5 h-3.5" /> },
  delivered: { label: "Entregado", badge: "bg-emerald-100 text-emerald-700", icon: <PackageCheck className="w-3.5 h-3.5" /> },
  cancelled: { label: "Cancelado", badge: "bg-red-100 text-red-700", icon: <XCircle className="w-3.5 h-3.5" /> },
}

const FULFILLMENT_LABEL: Record<string, string> = {
  delivery: "A domicilio",
  pickup: "Para llevar",
  dine_in: "En sucursal",
}

export default function PedidosPage() {
  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [orders, setOrders] = useState<FoodosOrder[]>([])
  const [branches, setBranches] = useState<FoodosBranch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FoodosOrderStatus | "all">("all")
  const [channelFilter, setChannelFilter] = useState<string>("all")
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await getMyRestaurant()
      setRestaurant(r)
      if (r) {
        const [os, bs] = await Promise.all([listOrders(r.id), listBranches(r.id)])
        setOrders(os)
        setBranches(bs)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar pedidos")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Comanda en vivo: refresco automático cada 30s sin bloquear la UI
  useEffect(() => {
    const id = setInterval(async () => {
      if (!restaurant) return
      try {
        const os = await listOrders(restaurant.id)
        setOrders(os)
      } catch {
        // silencioso: el siguiente ciclo reintenta
      }
    }, 30_000)
    return () => clearInterval(id)
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
      setError(e instanceof Error ? e.message : "Error al actualizar el pedido")
    } finally {
      setSaving(null)
    }
  }

  async function cancel(order: FoodosOrder) {
    if (!confirm(`¿Cancelar el pedido #${order.id.slice(0, 8).toUpperCase()}?`)) return
    setSaving(order.id)
    try {
      await updateOrderStatus(order.id, "cancelled")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cancelar")
    } finally {
      setSaving(null)
    }
  }

  if (!restaurant) {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-24 text-stone-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
        </div>
      )
    }
    return (
      <div className="max-w-2xl mx-auto mt-16 bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
        <h1 className="text-xl font-black text-stone-900">Primero configura tu restaurante</h1>
        <p className="text-stone-600 mt-2">Registra tu perfil en el módulo &ldquo;Mi restaurante&rdquo; para recibir pedidos.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-stone-900">Pedidos</h1>
          <p className="text-sm text-stone-500">Comanda en vivo: atiende los pedidos de tu menú digital.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-stone-200 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>

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
            {s === "all" ? `Todos (${counts.all ?? 0})` : `${STATUS_META[s as FoodosOrderStatus].label} (${counts[s] ?? 0})`}
          </button>
        ))}
      </div>

      {/* Filtro por canal */}
      <div className="flex gap-2 mb-6">
        {[
          { id: "all", label: "Todos los canales" },
          { id: "web", label: "Web" },
          { id: "qr", label: "QR" },
          { id: "whatsapp", label: "WhatsApp" },
        ].map((c) => (
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
          No hay pedidos {filter !== "all" ? "en este estado" : "todavía"}.
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
                    {" · "}{branchName(order.branch_id)}
                  </p>
                  {(order.customer_name || order.customer_phone) && (
                    <p className="text-sm text-stone-600 mt-1">
                      {order.customer_name ?? "Cliente"} · {order.customer_phone}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-stone-900">{formatMoney(order.total)}</p>
                  <p className="flex items-center justify-end gap-1 text-xs text-stone-500 mt-1">
                    {order.payment_method === "card" ? (
                      <><CreditCard className="w-3 h-3" /> Tarjeta</>
                    ) : (
                      <><Banknote className="w-3 h-3" /> En sucursal</>
                    )}
                    {order.payment_status === "paid" && (
                      <span className="ml-1 text-emerald-600 font-bold">· Pagado</span>
                    )}
                  </p>
                  <p className="text-[11px] text-stone-400 uppercase tracking-wide mt-1">Canal: {order.channel}</p>
                </div>
              </div>

              {/* Items */}
              <div className="bg-stone-50 rounded-xl p-3 space-y-1.5 mb-4">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="text-stone-700">
                      <span className="font-bold text-stone-900">{item.qty}×</span> {item.name}
                    </span>
                    <span className="text-stone-600 font-semibold">{formatMoney(item.price * item.qty)}</span>
                  </div>
                ))}
                {order.note && (
                  <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-2 mt-1">
                    <strong>Nota:</strong> {order.note}
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
                    {order.status === "pending" && "Confirmar pedido"}
                    {order.status === "confirmed" && "Empezar a preparar"}
                    {order.status === "preparing" && (order.fulfillment === "delivery" ? "Enviar a domicilio" : "Marcar entregado")}
                    {order.status === "out_for_delivery" && "Marcar entregado"}
                  </button>
                  <button
                    onClick={() => cancel(order)}
                    disabled={saving === order.id}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" /> Cancelar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
