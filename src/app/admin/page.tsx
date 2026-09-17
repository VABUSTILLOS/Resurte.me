"use client"

import { useState, useEffect, useCallback } from "react"
import { Suspense } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import {
  ShoppingBag,
  Store,
  Ban,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  ClipboardList,
  type LucideIcon,
} from "lucide-react"
import {
  getAdminTodayStats,
  getAdminAlerts,
  getAdminInsights,
  getAdminLeadsSummary,
  type AdminOrder,
  type AdminTodayStats,
  type AdminAlert,
  type AdminInsights as AdminInsightsData,
  type AdminLeadsSummary,
} from "./actions"
import { STATUS_LABEL, STATUS_COLOR, PAYMENT_METHOD_LABEL } from "@/lib/order-labels"
import { formatRelativeTime } from "@/lib/relative-time"
import { activeDrivers, driverNameById, type DriverLike } from "@/lib/drivers"
import { canAssignDriver } from "@/lib/order-bulk"
import { ToastProvider, useToast } from "@/components/toast"
import { AdminAlerts } from "./components/AdminAlerts"
import { LeadsCrmWidget } from "./components/LeadsCrmWidget"
import { DashboardSkeleton } from "./components/DashboardSkeleton"

/**
 * Mensaje de error del API admin: usa el `{ error }` que devuelve el servidor
 * (p. ej. el de `getAdminOrders`) en lugar de un texto fijo, para que una
 * futura caída sea diagnosticable desde el propio panel.
 */
async function apiErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown }
    return typeof body?.error === "string" && body.error ? body.error : fallback
  } catch {
    return fallback
  }
}

// recharts is ~100 KB gz; load charts on demand with a skeleton.
const MetricsCharts = dynamic(
  () => import("./components/MetricsCharts").then((m) => m.MetricsCharts),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
    ),
  },
)

// Fase 6 — también usa recharts; se carga bajo demanda igual que MetricsCharts.
const AdminInsights = dynamic(
  () => import("./components/AdminInsights").then((m) => m.AdminInsights),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
    ),
  },
)

// Fase 14 — comparativa por periodo (sin recharts, pero se carga diferida
// para no bloquear el primer render del dashboard).
const PeriodComparisonCard = dynamic(
  () => import("./components/PeriodComparison").then((m) => m.PeriodComparisonCard),
  {
    ssr: false,
    loading: () => (
      <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
    ),
  },
)

/** Fase 1 — Delta porcentual vs ayer con dirección de tendencia. */
function buildDelta(
  today: number,
  yesterday: number
): { change: string | null; trend: "up" | "down" | "neutral" } {
  if (yesterday <= 0) {
    return today > 0
      ? { change: "nuevo hoy", trend: "up" }
      : { change: null, trend: "neutral" }
  }
  const pct = ((today - yesterday) / yesterday) * 100
  const rounded = Math.abs(Math.round(pct))
  return {
    change: `${pct >= 0 ? "+" : "−"}${rounded}% vs ayer`,
    trend: pct > 0 ? "up" : pct < 0 ? "down" : "neutral",
  }
}

export default function AdminDashboardPage() {
  return (
    <ToastProvider>
      <AdminDashboardContent />
    </ToastProvider>
  )
}

function AdminDashboardContent() {
  const { toast } = useToast()
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily")
  const [metrics, setMetrics] = useState<{
    points: Array<{ period: string; revenue: number; orders: number; aov: number; conversion: number }>
    totalRevenue: number
    totalOrders: number
    avgAov: number
    avgConversion: number
  } | null>(null)

  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [stats, setStats] = useState<AdminTodayStats | null>(null)
  const [alerts, setAlerts] = useState<AdminAlert[]>([])
  const [insights, setInsights] = useState<AdminInsightsData | null>(null)
  const [leads, setLeads] = useState<AdminLeadsSummary | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // A12 — asignación de repartidor directo desde el dashboard.
  const [drivers, setDrivers] = useState<DriverLike[]>([])
  const [assigningId, setAssigningId] = useState<number | null>(null)

  // Bitácora: últimas acciones admin sobre pedidos (C5).
  const [auditEntries, setAuditEntries] = useState<
    { id: number; title: string; body: string | null; created_at: string }[]
  >([])

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [metricsRes, ordersRes, statsData, alertsData, insightsData, leadsData] =
        await Promise.all([
          fetch(`/api/admin/metrics?period=${period}`),
          fetch("/api/admin/orders?limit=10"),
          getAdminTodayStats(),
          getAdminAlerts(),
          getAdminInsights(),
          getAdminLeadsSummary(),
        ])
      if (!metricsRes.ok) {
        throw new Error(await apiErrorMessage(metricsRes, "Error al cargar métricas"))
      }
      if (!ordersRes.ok) {
        throw new Error(await apiErrorMessage(ordersRes, "Error al cargar pedidos"))
      }
      const [metricsData, ordersData] = await Promise.all([
        metricsRes.json(),
        ordersRes.json(),
      ])
      setMetrics(metricsData)
      setOrders(ordersData.orders)
      setStats(statsData)
      setAlerts(alertsData)
      setInsights(insightsData)
      setLeads(leadsData)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el dashboard")
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    // Diferido a microtask: ningún setState corre síncrono en el efecto.
    void Promise.resolve().then(fetchDashboard)
  }, [fetchDashboard])

  // Bitácora admin (best-effort: si falla, el dashboard sigue funcionando)
  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/audit-log", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { entries?: { id: number; title: string; body: string | null; created_at: string }[] } | null) => {
        if (!cancelled && data?.entries) setAuditEntries(data.entries)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Repartidores (best-effort: si falla, la columna muestra el nombre ya
  // asignado o "—" y no se ofrece el selector). Se guardan todos —incluidos los
  // inactivos— para poder etiquetar pedidos ya entregados.
  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/drivers", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { drivers?: DriverLike[] } | null) => {
        if (!cancelled && data?.drivers) setDrivers(data.drivers)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const assignDriver = useCallback(
    async (orderId: number, driverId: number | null) => {
      const previous =
        orders.find((o) => o.id === orderId)?.driver_id ?? null
      setAssigningId(orderId)
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, driver_id: driverId } : o))
      )
      try {
        const res = await fetch(`/api/orders/${orderId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driver_id: driverId }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(data?.error || "Error al asignar el repartidor")
        }
        const name = driverId === null ? null : driverNameById(drivers, driverId)
        toast(
          name
            ? `Repartidor ${name} asignado al pedido #${orderId}`
            : `Pedido #${orderId} sin repartidor`,
          "success"
        )
      } catch (e) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, driver_id: previous } : o))
        )
        toast(
          e instanceof Error ? e.message : "Error de conexión",
          "error"
        )
      } finally {
        setAssigningId(null)
      }
    },
    [drivers, orders, toast]
  )

  const recentOrders = orders.slice(0, 5)
  const assignableDrivers = activeDrivers(drivers)
  const statCards: {
    label: string
    value: string
    change: string | null
    trend: "up" | "down" | "neutral"
    icon: LucideIcon
    color: string
  }[] = stats
    ? [
        {
          label: "Pedidos hoy",
          value: String(stats.ordersToday),
          ...buildDelta(stats.ordersToday, stats.ordersYesterday),
          icon: ShoppingBag,
          color: "bg-blue-50 text-blue-600",
        },
        {
          label: "Ingresos hoy",
          value: `$${stats.revenueToday.toLocaleString("es-MX")}`,
          ...buildDelta(stats.revenueToday, stats.revenueYesterday),
          icon: DollarSign,
          color: "bg-green-50 text-green-600",
        },
        {
          label: "Ticket promedio hoy",
          value: `$${stats.aovToday.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`,
          ...buildDelta(stats.aovToday, stats.aovYesterday),
          icon: Store,
          color: "bg-purple-50 text-purple-600",
        },
        {
          label: "Cancelaciones hoy",
          value: String(stats.cancellationsToday),
          // En cancelaciones, "subir" es malo: invertimos el color de tendencia
          ...(() => {
            const d = buildDelta(stats.cancellationsToday, stats.cancellationsYesterday)
            return {
              change: d.change,
              trend: d.trend === "up" ? ("down" as const) : d.trend === "down" ? ("up" as const) : ("neutral" as const),
            }
          })(),
          icon: Ban,
          color: "bg-red-50 text-red-600",
        },
      ]
    : []

  // Fase 7 — Skeleton completo en lugar de spinner genérico
  if (loading) {
    return <DashboardSkeleton />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-red-600 text-sm font-medium">{error}</p>
        <p className="text-gray-400 text-xs mt-1">
          Verifica que estés autenticado como administrador.
        </p>
        {/* Fase 7 — recuperación ante error sin recargar la página */}
        <button
          onClick={fetchDashboard}
          className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Resumen general de Resurte.me</p>
        </div>
        {stats && stats.pendingCount > 0 && (
          <Link
            href="/admin/pedidos?status=pending"
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            {stats.pendingCount} pendiente{stats.pendingCount === 1 ? "" : "s"} por atender
          </Link>
        )}
      </div>

      {/* Fase 2 — Alertas operativas */}
      <AdminAlerts alerts={alerts} />

      {/* Fase 1 — Stat cards con comparativa vs ayer */}
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

      {/* Metrics Charts */}
      {metrics && (
        <Suspense fallback={<div className="h-64 animate-pulse bg-gray-50 rounded-lg" />}>
          <MetricsCharts
            data={metrics.points}
            period={period}
            onPeriodChange={setPeriod}
          />
        </Suspense>
      )}

      {/* Fase 14 — comparativa 7/30/90 días vs periodo anterior */}
      <div className="mt-8">
        <PeriodComparisonCard />
      </div>

      {/* Fase 6 — Analítica avanzada (carga diferida) */}
      {insights && (
        <div className="mt-8">
          <AdminInsights insights={insights} />
        </div>
      )}

      {/* Fase 8 — Leads y CRM */}
      {leads && <LeadsCrmWidget summary={leads} />}

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
                <th className="px-5 py-2.5">Repartidor</th>
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
                  {/* A12 — asignar repartidor sin salir del dashboard. Solo en
                      pedidos no terminales; el resto muestra el nombre fijo. */}
                  <td className="px-5 py-3">
                    {canAssignDriver(order) ? (
                      <select
                        value={order.driver_id ?? ""}
                        onChange={(e) =>
                          assignDriver(
                            order.id,
                            e.target.value === "" ? null : Number(e.target.value)
                          )
                        }
                        disabled={assigningId === order.id}
                        aria-label={`Repartidor del pedido #${order.id}`}
                        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-brand-500 focus:outline-none disabled:opacity-50"
                      >
                        <option value="">Sin asignar</option>
                        {assignableDrivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-500">
                        {driverNameById(drivers, order.driver_id) ?? "—"}
                      </span>
                    )}
                  </td>
                  {/* Fase 7 — fecha relativa con la absoluta en el tooltip */}
                  <td
                    className="px-5 py-3 text-xs text-gray-400"
                    title={new Date(order.created_at).toLocaleString("es-MX")}
                  >
                    {formatRelativeTime(order.created_at)}
                  </td>
                </tr>
              ))}
              {recentOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">
                    No hay pedidos aún.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bitácora de actividad admin (C5) */}
      {auditEntries.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-8">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <ClipboardList className="w-4 h-4 text-gray-400" />
            <h2 className="font-semibold text-gray-900">Bitácora de actividad</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {auditEntries.map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 font-medium truncate">{entry.title}</p>
                  {entry.body && (
                    <p className="text-xs text-gray-500 truncate">{entry.body}</p>
                  )}
                </div>
                <time className="text-xs text-gray-400 shrink-0">
                  {new Date(entry.created_at).toLocaleString("es-MX", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
