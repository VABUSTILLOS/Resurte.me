"use client"

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts"
import { useState, useMemo } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"

type Period = "daily" | "weekly" | "monthly"

interface ChartDataPoint {
  period: string
  revenue: number
  orders: number
  aov: number
  conversion: number
}

interface MetricsChartsProps {
  data: ChartDataPoint[]
  period: Period
  onPeriodChange: (p: Period) => void
}

const COLORS = {
  revenue: "#16a34a", // green-600
  orders: "#2563eb", // blue-600
  aov: "#9333ea", // purple-600
  conversion: "#ea580c", // orange-600
}

const PERIOD_LABELS: Record<Period, string> = {
  daily: "Diario",
  weekly: "Semanal",
  monthly: "Mensual",
}

function formatValue(value: number, type: keyof Omit<ChartDataPoint, "period">): string {
  switch (type) {
    case "revenue":
      return `$${value.toLocaleString("es-MX", { minimumFractionDigits: 0 })}`
    case "orders":
      return value.toLocaleString("es-MX")
    case "aov":
      return `$${value.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`
    case "conversion":
      return `${value.toFixed(1)}%`
  }
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      <div className="w-full h-1 bg-gray-100 rounded mt-2 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-transparent via-current to-transparent" style={{ backgroundColor: color }} />
      </div>
    </div>
  )
}

function MetricSummary({ data, period }: { data: ChartDataPoint[]; period: Period }) {
  const totals = useMemo(() => {
    if (data.length === 0) return { revenue: 0, orders: 0, aov: 0, conversion: 0 }
    return data.reduce(
      (acc, d) => ({
        revenue: acc.revenue + d.revenue,
        orders: acc.orders + d.orders,
        aov: acc.aov + d.aov,
        conversion: acc.conversion + d.conversion,
      }),
      { revenue: 0, orders: 0, aov: 0, conversion: 0 }
    )
  }, [data])

  const avgAov = data.length ? totals.aov / data.length : 0
  const avgConversion = data.length ? totals.conversion / data.length : 0

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-6">
      <MetricCard
        label={`Ingresos (${PERIOD_LABELS[period]})`}
        value={formatValue(totals.revenue, "revenue")}
        color={COLORS.revenue}
      />
      <MetricCard
        label={`Pedidos (${PERIOD_LABELS[period]})`}
        value={formatValue(totals.orders, "orders")}
        color={COLORS.orders}
      />
      <MetricCard
        label="Ticket promedio"
        value={formatValue(avgAov, "aov")}
        color={COLORS.aov}
      />
      <MetricCard
        label="Conversión prom."
        value={formatValue(avgConversion, "conversion")}
        color={COLORS.conversion}
      />
    </div>
  )
}

function RevenueChart({ data }: { data: ChartDataPoint[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900 mb-4">Ingresos</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.revenue} stopOpacity={0.3} />
                <stop offset="95%" stopColor={COLORS.revenue} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
              }}
              formatter={(value) => {
                const num = Number(value ?? 0)
                return [formatValue(num, "revenue"), "Ingresos"]
              }}
              labelFormatter={(label) => label}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={COLORS.revenue}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#revenueGradient)"
              dot={false}
              activeDot={{ r: 6, fill: COLORS.revenue }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function OrdersChart({ data }: { data: ChartDataPoint[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900 mb-4">Pedidos</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
              }}
              formatter={(value) => {
                const num = Number(value ?? 0)
                return [formatValue(num, "orders"), "Pedidos"]
              }}
            />
            <Bar
              dataKey="orders"
              fill={COLORS.orders}
              radius={[4, 4, 0, 0]}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS.orders} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function AOVConversionChart({ data }: { data: ChartDataPoint[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900 mb-4">Ticket promedio & Conversión</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v}`}
              orientation="left"
            />
            <YAxis
              yAxisId="right"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
              orientation="right"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
              }}
              formatter={(value, name) => {
                const num = Number(value ?? 0)
                const n = String(name)
                if (n === "aov") return [formatValue(num, "aov"), "AOV"]
                if (n === "conversion") return [formatValue(num, "conversion"), "Conversión"]
                return [num, n]
              }}
            />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="aov"
              stroke={COLORS.aov}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6, fill: COLORS.aov }}
              name="aov"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="conversion"
              stroke={COLORS.conversion}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6, fill: COLORS.conversion }}
              name="conversion"
              strokeDasharray="5 5"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function MetricsCharts({ data, period, onPeriodChange }: MetricsChartsProps) {
  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-gray-700">Período:</span>
        <div className="flex bg-gray-100 rounded-lg p-1" role="radiogroup">
          {(["daily", "weekly", "monthly"] as Period[]).map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={period === p}
              onClick={() => onPeriodChange(p)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                period === p
                  ? "bg-white text-brand-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <MetricSummary data={data} period={period} />

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueChart data={data} />
        <OrdersChart data={data} />
      </div>
      <AOVConversionChart data={data} />
    </div>
  )
}