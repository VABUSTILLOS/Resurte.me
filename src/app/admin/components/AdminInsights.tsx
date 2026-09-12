"use client"

import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import type { AdminInsights as AdminInsightsData } from "../actions"
import { STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/order-labels"

const STATUS_FILL: Record<string, string> = {
  pending: "#f59e0b",
  confirmed: "#2563eb",
  preparing: "#9333ea",
  out_for_delivery: "#ea580c",
  delivered: "#16a34a",
  cancelled: "#dc2626",
}

const METHOD_COLORS = ["#2563eb", "#16a34a", "#ea580c", "#9333ea", "#0891b2", "#64748b"]

function money(value: number): string {
  return `$${value.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`
}

type TooltipValue = string | number | ReadonlyArray<string | number> | undefined

const revenueTooltip = (value: TooltipValue, name: string | number | undefined) =>
  name === "revenue"
    ? ([money(Number(value ?? 0)), "Ingresos"] as const)
    : ([String(value ?? 0), "Unidades"] as const)

const moneyTooltip = (value: TooltipValue) => money(Number(value ?? 0))

const countTooltip = (value: TooltipValue) => `${Number(value ?? 0)} pedidos`

/** Fase 6 — Top 5 productos por ingresos (30 días). */
export function TopProductsChart({
  data,
}: {
  data: AdminInsightsData["topProducts"]
}) {
  if (data.length === 0) {
    return <EmptyNote text="Aún no hay ventas pagadas en los últimos 30 días." />
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis type="number" tickFormatter={money} tick={{ fontSize: 11 }} stroke="#94a3b8" />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={{ fontSize: 11 }}
          stroke="#94a3b8"
          tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
        />
        <Tooltip formatter={revenueTooltip} />
        <Bar dataKey="revenue" fill="#16a34a" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Fase 6 — Ingresos por método de pago (30 días). */
export function PaymentMethodChart({
  data,
}: {
  data: AdminInsightsData["revenueByMethod"]
}) {
  if (data.length === 0) {
    return <EmptyNote text="Sin pagos registrados en los últimos 30 días." />
  }
  const chartData = data.map((d) => ({
    ...d,
    label: PAYMENT_METHOD_LABEL[d.method] ?? d.method,
  }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="revenue"
          nameKey="label"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={METHOD_COLORS[i % METHOD_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={moneyTooltip} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

/** Fase 6 — Distribución de pedidos por estado (30 días). */
export function OrdersByStatusChart({
  data,
}: {
  data: AdminInsightsData["ordersByStatus"]
}) {
  if (data.length === 0) {
    return <EmptyNote text="Sin pedidos en los últimos 30 días." />
  }
  const chartData = data.map((d) => ({
    ...d,
    label: STATUS_LABEL[d.status] ?? d.status,
  }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="count"
          nameKey="label"
          outerRadius={80}
          paddingAngle={2}
        >
          {chartData.map((d, i) => (
            <Cell key={i} fill={STATUS_FILL[d.status] ?? "#64748b"} />
          ))}
        </Pie>
        <Tooltip formatter={countTooltip} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-gray-400">
      {text}
    </div>
  )
}

/**
 * Fase 6 — Analítica avanzada del dashboard (últimos 30 días):
 * top productos, ingresos por método de pago y pedidos por estado.
 */
export function AdminInsights({ insights }: { insights: AdminInsightsData }) {
  return (
    <section aria-label="Analítica de los últimos 30 días" className="mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Analítica — últimos 30 días</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Top productos por ingresos
          </h3>
          <TopProductsChart data={insights.topProducts} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Ingresos por método de pago
          </h3>
          <PaymentMethodChart data={insights.revenueByMethod} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Pedidos por estado
          </h3>
          <OrdersByStatusChart data={insights.ordersByStatus} />
        </div>
      </div>
    </section>
  )
}
