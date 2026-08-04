"use client"

import { useState } from "react"
import Link from "next/link"
import {
  generateMockOrders,
  STATUS_LABEL,
  STATUS_COLOR,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  type MockOrder,
} from "@/lib/mock-orders"
import { Search, Filter, ChevronDown } from "lucide-react"
import type { OrderStatus } from "@/types"

const STATUS_FILTERS: { label: string; value: OrderStatus | "all" }[] = [
  { label: "Todos", value: "all" },
  { label: "Pendientes", value: "pending" },
  { label: "Confirmados", value: "confirmed" },
  { label: "Preparando", value: "preparing" },
  { label: "En camino", value: "out_for_delivery" },
  { label: "Entregados", value: "delivered" },
  { label: "Cancelados", value: "cancelled" },
]

export default function AdminOrdersPage() {
  const [orders] = useState<MockOrder[]>(() => generateMockOrders(15))
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all")
  const [search, setSearch] = useState("")

  const filtered = orders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false
    if (search && !o.store_name.toLowerCase().includes(search.toLowerCase()) && !String(o.id).includes(search)) return false
    return true
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-sm text-gray-500">{filtered.length} pedido{filtered.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por tienda o #pedido..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? "bg-brand-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-400 font-medium">
                <th className="px-5 py-3">Pedido</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Pago</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Origen</th>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-gray-500">#{order.id}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">Usuario #{order.id * 7}</td>
                  <td className="px-5 py-3 font-semibold text-gray-900">${order.total.toFixed(2)}</td>
                  <td className="px-5 py-3">
                    <div>
                      <span className="text-xs text-gray-600">{PAYMENT_METHOD_LABEL[order.payment_method]}</span>
                      <span
                        className={`ml-2 text-[10px] font-medium ${
                          order.payment_status === "paid" ? "text-green-600" :
                          order.payment_status === "failed" ? "text-red-600" : "text-amber-600"
                        }`}
                      >
                        {PAYMENT_STATUS_LABEL[order.payment_status]}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <select
                      defaultValue={order.status}
                      className={`text-xs font-medium border rounded-lg px-2 py-1 cursor-pointer ${STATUS_COLOR[order.status]}`}
                      onChange={async (e) => {
                        const newStatus = e.target.value
                        try {
                          const res = await fetch(`/api/orders/${order.id}/status`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: newStatus }),
                          })
                          if (res.ok) {
                            const data = await res.json()
                            if (data.workflow?.length) {
                              console.log(`📲 WhatsApp workflows triggered:`, data.workflow)
                            }
                          } else {
                            alert("Error al actualizar el estado")
                            e.target.value = order.status // Revert
                          }
                        } catch {
                          alert("Error de conexión")
                          e.target.value = order.status
                        }
                      }}
                    >
                      {Object.entries(STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    {order.source === "whatsapp" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full font-medium">
                        WhatsApp
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Web</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400">
                    {new Date(order.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                  </td>
                  <td className="px-5 py-3">
                    <button className="text-brand-600 hover:text-brand-700 text-xs font-medium">
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
