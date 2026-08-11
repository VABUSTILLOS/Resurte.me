"use client"

import Link from "next/link"
import { Flame, ArrowRight } from "lucide-react"
import type { HubComandas } from "./hub-data"

interface KitchenMonitorProps {
  comandas: HubComandas
}

export default function KitchenMonitor({ comandas }: KitchenMonitorProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
      <div className="flex items-center justify-between p-3 sm:p-4 pb-2.5 sm:pb-3">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold text-gray-900 text-sm">Monitor de cocina</h3>
          {comandas.active > 0 ? (
            <span className="text-[10px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium">
              {comandas.active} activa{comandas.active !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Sin comandas activas</span>
          )}
        </div>
        <Link href="/panel/comanda" className="text-xs font-semibold text-[#0E7A0E] hover:text-green-800 flex items-center gap-1">
          Abrir monitor
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2 px-3 sm:px-4 pb-3 sm:pb-4">
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-gray-500">Pendientes</p>
          <p className="text-lg font-extrabold text-amber-600">{comandas.pendiente}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-gray-500">En cocina</p>
          <p className="text-lg font-extrabold text-blue-600">{comandas.enCocina}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-gray-500">Listas hoy</p>
          <p className="text-lg font-extrabold text-green-600">{comandas.readyToday}</p>
        </div>
      </div>
    </div>
  )
}
