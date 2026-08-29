"use client"

// Comparación mostrador vs. app: resume los pedidos reales de FoodOS
// (micrositio /r/[slug]) junto a las ventas de mostrador del día.
// Solo se muestra a usuarios autenticados con restaurante FoodOS.

import { useEffect, useState } from "react"
import Link from "next/link"
import { Smartphone, Store, ChevronRight } from "lucide-react"
import { getOrdersSummary } from "@/app/panel/foodos/actions"

interface OrdersSummary {
  todayCount: number
  todayRevenue: number
  weekCount: number
  weekRevenue: number
  pendingCount: number
}

export default function AppOrdersCard({
  counterCount,
  counterRevenue,
}: {
  counterCount: number
  counterRevenue: number
}) {
  const [summary, setSummary] = useState<OrdersSummary | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    getOrdersSummary()
      .then((s) => {
        if (!cancelled) setSummary(s)
      })
      .catch(() => {
        if (!cancelled) setSummary(null)
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Invitado o sin restaurante FoodOS: no mostrar nada
  if (!loaded || !summary) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900 text-sm">Mostrador vs. app</h3>
        <Link
          href="/panel/foodos/pedidos"
          className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
        >
          Ver pedidos
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 mb-1">
            <Store className="w-3.5 h-3.5" />
            Mostrador (hoy)
          </div>
          <p className="text-lg font-extrabold text-emerald-800">${counterRevenue.toFixed(0)}</p>
          <p className="text-[10px] text-emerald-600">
            {counterCount} venta{counterCount !== 1 ? "s" : ""} registrada{counterCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3">
          <div className="flex items-center gap-1.5 text-xs text-indigo-700 mb-1">
            <Smartphone className="w-3.5 h-3.5" />
            App (hoy)
          </div>
          <p className="text-lg font-extrabold text-indigo-800">${summary.todayRevenue.toFixed(0)}</p>
          <p className="text-[10px] text-indigo-600">
            {summary.todayCount} pedido{summary.todayCount !== 1 ? "s" : ""}
            {summary.pendingCount > 0 && ` · ${summary.pendingCount} pendiente${summary.pendingCount !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>
      <p className="text-[10px] text-gray-400 mt-2">
        Últimos 7 días en la app: {summary.weekCount} pedidos · ${summary.weekRevenue.toFixed(0)}
      </p>
    </div>
  )
}
