"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ShoppingBag,
  Store,
  Users,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  type LucideIcon,
} from "lucide-react"
import { getAdminOrders, getActiveStoresCount, type AdminOrder } from "./actions"
import { STATUS_LABEL, STATUS_COLOR, PAYMENT_METHOD_LABEL } from "@/lib/order-labels"

export default function AdminDashboardPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState({
    ordersToday: 0,
    revenueToday: 0,
    activeStores: 0,
    cancellations: 0,
  })

  useEffect(() => {
    let cancelled = false

    async function fetchDashboard() {
      try {
        const [allOrders, activeStores] = await Promise.all([
          getAdminOrders(50),
          getActiveStoresCount(),
        ])
        if (cancelled) return
        const orderList = allOrders.orders
        setOrders(orderList)

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todaysOrders = orderList.filter(
          (o) => new Date(o.created_at) >= today
        )
        const revenueToday = todaysOrders
          .filter((o) => o.payment_status === "paid")
          .reduce((sum, o) => sum + Number(o.total), 0)
        const cancellations = todaysOrders.filter(
          (o) => o.status === "cancelled"
        ).length

        setStats({
          ordersToday: todaysOrders.length,
          revenueToday,
          activeStores,
          cancellations,
        })
        setError(null)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error al cargar el dashboard")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchDashboard()
    return () => {
      cancelled = true
    }
  }, [])

  const recentOrders = orders.slice(0, 5)
  const statCards: {
    label: string
    value: string
    change: string | null
    trend: "up" | "down" | "neutral"
    icon: LucideIcon
    color: string
  }[] = [
    {
      label: "Pedidos hoy",
      value: String(stats.ordersToday),
      change: null,
      trend: "neutral" as const,
      icon: ShoppingBag,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Ingresos hoy",
      value: `$${stats.revenueToday.toLocaleString("es-MX")}`,
      change: null,
      trend: "neutral" as const,
      icon: DollarSign,
      color: "bg-green-50 text-green-600",
    },
    {
      label: "Tiendas activas",
      value: String(stats.activeStores),
      change: null,
      trend: "neutral" as const,
      icon: Store,
      color: "bg-purple-50 text-purple-600",
    },
    {
      label: "Cancelaciones",
      value: String(stats.cancellations),
      change: null,
      trend: "neutral" as const,
      icon: Users,
      color: "bg-red-50 text-red-600",
    },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-red-600 text-sm font-medium">{error}</p>
        <p className="text-gray-400 text-xs mt-1">Verifica que estés autenticado como administrador.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Resumen general de Resurte.me</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
              {card.change !== null && (
                <span
                  className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                    card.trend === "up"
                      ? "text-green-600"
                      : card.trend === "down"
                      ? "text-red-600"
                      : "text-gray-400"
                  }`}
                >
                  {card.trend === "up" && <ArrowUpRight className="w-3 h-3" />}
                  {card.trend === "down" && <ArrowDownRight className="w-3 h-3" />}
                  {card.change}
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-sm text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Pedidos recientes</h2>
          <Link
            href="/admin/pedidos"
            className="text-sm text-brand-600 font-medium hover:text-brand-700 flex items-center gap-1"
          >
            Ver todos
            <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-400 font-medium">
                <th className="px-5 py-2.5">Pedido</th>
                <th className="px-5 py-2.5">Total</th>
                <th className="px-5 py-2.5">Pago</th>
                <th className="px-5 py-2.5">Estado</th>
                <th className="px-5 py-2.5">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">#{order.id}</td>
                  <td className="px-5 py-3 font-semibold text-gray-900">
                    ${order.total.toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {order.payment_method ? PAYMENT_METHOD_LABEL[order.payment_method] ?? order.payment_method : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[order.status]}`}
                    >
                      {STATUS_LABEL[order.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400">
                    {new Date(order.created_at).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                </tr>
              ))}
              {recentOrders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-gray-400 text-sm">
                    No hay pedidos aún.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
