"use client"

// ============================================================
// Tablero FoodTech — métricas del sistema de pedidos:
// pedidos por día, por canal y sucursal, ticket promedio,
// top platillos, ingresos y efectividad de combos/reglas.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  getMyRestaurant,
  listOrders,
  listBranches,
  listCustomers,
} from "../actions"
import { formatMoney } from "@/lib/foodos"
import type {
  FoodosRestaurant,
  FoodosBranch,
  FoodosOrder,
  FoodosCustomer,
} from "@/types/foodos"
import {
  Loader2,
  TrendingUp,
  ShoppingBag,
  Repeat,
  Users,
  Percent,
  Sparkles,
} from "lucide-react"

const DAY_MS = 86_400_000
const CANAL_LABEL: Record<string, string> = { web: "Web", qr: "QR", whatsapp: "WhatsApp" }

export default function TableroPage() {
  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [orders, setOrders] = useState<FoodosOrder[]>([])
  const [branches, setBranches] = useState<FoodosBranch[]>([])
  const [customers, setCustomers] = useState<FoodosCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNow(Date.now())
    try {
      const r = await getMyRestaurant()
      setRestaurant(r)
      if (r) {
        const [os, bs, cs] = await Promise.all([
          listOrders(r.id),
          listBranches(r.id),
          listCustomers(r.id),
        ])
        setOrders(os)
        setBranches(bs)
        setCustomers(cs)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el tablero")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const metrics = useMemo(() => {
    const cutoff = now - days * DAY_MS
    const recent = orders.filter((o) => {
      const t = new Date(o.created_at).getTime()
      return t >= cutoff && o.status !== "cancelled"
    })

    const paid = recent.filter((o) => o.payment_status !== "failed")
    const revenue = paid.reduce((s, o) => s + o.total, 0)
    const avgTicket = recent.length ? revenue / recent.length : 0
    const deliveryCount = recent.filter((o) => o.fulfillment === "delivery").length
    const pickupCount = recent.filter((o) => o.fulfillment === "pickup").length

    // por día (últimos 7 días)
    const byDay: { label: string; count: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const start = now - i * DAY_MS
      const end = start + DAY_MS
      const count = recent.filter((o) => {
        const t = new Date(o.created_at).getTime()
        return t >= start && t < end
      }).length
      byDay.push({
        label: new Date(start).toLocaleDateString("es-MX", { weekday: "short" }),
        count,
      })
    }

    // por canal
    const byChannel = new Map<string, number>()
    for (const o of recent) byChannel.set(o.channel, (byChannel.get(o.channel) ?? 0) + 1)

    // por sucursal
    const byBranch = new Map<string, number>()
    for (const o of recent) {
      const key = o.branch_id ?? "sin_sucursal"
      byBranch.set(key, (byBranch.get(key) ?? 0) + 1)
    }

    // top platillos
    const itemCount = new Map<string, { name: string; qty: number; revenue: number }>()
    for (const o of recent) {
      for (const i of o.items) {
        const cur = itemCount.get(i.item_id) ?? { name: i.name, qty: 0, revenue: 0 }
        cur.qty += i.qty
        cur.revenue += i.price * i.qty
        itemCount.set(i.item_id, cur)
      }
    }
    const topItems = [...itemCount.values()].sort((a, b) => b.qty - a.qty).slice(0, 5)

    // combos / cross-sell
    const comboRevenue = recent.reduce((s, o) => {
      return s + o.items.filter((i) => i.combo_id).reduce((c, i) => c + i.price * i.qty, 0)
    }, 0)
    const comboShare = revenue ? (comboRevenue / revenue) * 100 : 0

    const repeatCustomers = customers.filter((c) => c.total_orders >= 2).length
    const repeatRate = customers.length ? (repeatCustomers / customers.length) * 100 : 0

    return {
      count: recent.length,
      revenue,
      avgTicket,
      deliveryCount,
      pickupCount,
      byDay,
      byChannel,
      byBranch,
      topItems,
      comboRevenue,
      comboShare,
      repeatRate,
      customers: customers.length,
    }
  }, [orders, customers, days, now])

  const maxDay = useMemo(
    () => Math.max(...metrics.byDay.map((d) => d.count), 1),
    [metrics.byDay]
  )

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
        <p className="text-stone-600 mt-2">Registra tu perfil para ver métricas de tus pedidos.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-stone-900">Tablero FoodTech</h1>
          <p className="text-sm text-stone-500">Rendimiento de tu canal de pedidos directo.</p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                days === d ? "bg-stone-900 text-white" : "bg-white border border-stone-200 text-stone-600"
              }`}
            >
              {d} días
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Kpi icon={<ShoppingBag className="w-5 h-5" />} label="Pedidos" value={String(metrics.count)} accent="bg-emerald-100 text-emerald-600" />
        <Kpi icon={<TrendingUp className="w-5 h-5" />} label="Ingresos" value={formatMoney(metrics.revenue)} accent="bg-blue-100 text-blue-600" />
        <Kpi icon={<Percent className="w-5 h-5" />} label="Ticket promedio" value={formatMoney(metrics.avgTicket)} accent="bg-purple-100 text-purple-600" />
        <Kpi icon={<Repeat className="w-5 h-5" />} label="Recompra" value={`${metrics.repeatRate.toFixed(0)}%`} accent="bg-amber-100 text-amber-600" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pedidos por día */}
        <Card title="Pedidos por día">
          <div className="flex items-end gap-1 h-40">
            {metrics.byDay.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-stone-400 font-semibold">{d.count || ""}</span>
                <div
                  className="w-full rounded-t-lg bg-emerald-500/80 hover:bg-emerald-500 transition-colors"
                  style={{ height: `${Math.max((d.count / maxDay) * 100, d.count ? 8 : 2)}%` }}
                />
                <span className="text-[10px] text-stone-500 capitalize">{d.label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Canales y cumplimiento */}
        <Card title="Canales y entrega">
          <div className="space-y-3">
            {["web", "qr", "whatsapp"].map((ch) => {
              const count = metrics.byChannel.get(ch) ?? 0
              const pct = metrics.count ? (count / metrics.count) * 100 : 0
              return (
                <div key={ch}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-stone-600">{CANAL_LABEL[ch] ?? ch}</span>
                    <span className="font-bold text-stone-900">{count}</span>
                  </div>
                  <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            <div className="pt-2 border-t border-stone-100 flex justify-between text-sm">
              <span className="text-stone-600">A domicilio</span>
              <span className="font-bold text-stone-900">{metrics.deliveryCount}</span>
              <span className="text-stone-600 ml-6">Para llevar</span>
              <span className="font-bold text-stone-900">{metrics.pickupCount}</span>
            </div>
          </div>
        </Card>

        {/* Top platillos */}
        <Card title="Top platillos">
          {metrics.topItems.length === 0 ? (
            <p className="text-sm text-stone-400 py-6 text-center">Sin pedidos en el periodo.</p>
          ) : (
            <div className="space-y-3">
              {metrics.topItems.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                      idx === 0 ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500"
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-900 truncate">{item.name}</p>
                      <p className="text-xs text-stone-500">{item.qty} vendidos</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-stone-900 shrink-0">{formatMoney(item.revenue)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Combos / cross-sell */}
        <Card title="Combos y cross-sell">
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-100 to-amber-100 flex items-center justify-center">
              <div className="text-center">
                <Sparkles className="w-5 h-5 text-emerald-600 mx-auto" />
                <p className="text-lg font-black text-stone-900">{metrics.comboShare.toFixed(0)}%</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-stone-600">
                <strong className="text-stone-900">{formatMoney(metrics.comboRevenue)}</strong> en ventas de combos y sugerencias
              </p>
              <p className="text-xs text-stone-500 mt-1">de {formatMoney(metrics.revenue)} totales</p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center gap-2 text-sm text-stone-600">
            <Users className="w-4 h-4 text-stone-400" />
            {metrics.customers} clientes · {metrics.repeatRate.toFixed(0)}% recurrentes
          </div>
        </Card>
      </div>

      {/* Por sucursal */}
      {branches.length > 1 && (
        <Card title="Por sucursal" className="mt-6">
          <div className="grid gap-3 md:grid-cols-3">
            {branches.map((b) => {
              const count = metrics.byBranch.get(b.id) ?? 0
              return (
                <div key={b.id} className="bg-stone-50 rounded-xl p-4">
                  <p className="text-sm font-bold text-stone-900">{b.name}</p>
                  <p className="text-2xl font-black text-stone-900 mt-1">{count}</p>
                  <p className="text-xs text-stone-500">pedidos</p>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent: string
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${accent}`}>{icon}</div>
      <p className="text-xl font-black text-stone-900 truncate">{value}</p>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  )
}

function Card({
  title,
  children,
  className = "",
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white border border-stone-200 rounded-2xl p-5 ${className}`}>
      <h2 className="font-bold text-stone-900 mb-4">{title}</h2>
      {children}
    </div>
  )
}
