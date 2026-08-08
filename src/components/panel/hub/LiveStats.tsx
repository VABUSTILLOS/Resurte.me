"use client"

import { PieChart, Percent, DollarSign, BarChart3, TrendingUp, ShoppingCart, UtensilsCrossed } from "lucide-react"
import type { PanelConfig } from "@/lib/panel-config"
import type { HubMesa, HubMesasInfo, HubStats } from "./hub-data"

interface LiveStatsProps {
  stats: HubStats
  panelCfg: PanelConfig
  mesasInfo: HubMesasInfo
  mesas: HubMesa[]
}

export default function LiveStats({ stats, panelCfg, mesasInfo, mesas }: LiveStatsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center mx-auto mb-2">
          <PieChart className="w-4 h-4 text-blue-600" />
        </div>
        <p className="text-xl font-extrabold text-gray-900">{stats.dishesCount}</p>
        <p className="text-[11px] text-gray-400">Platillos costeados</p>
        {stats.totalCosteo > 0 && (
          <p className="text-[10px] text-blue-600 font-medium mt-1">Costo: ${stats.totalCosteo.toFixed(0)}</p>
        )}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center mx-auto mb-2">
          <Percent className="w-4 h-4 text-blue-600" />
        </div>
        <p className={`text-xl font-extrabold ${stats.avgFoodCost > panelCfg.foodCostRedAbove ? "text-red-700" : stats.avgFoodCost > panelCfg.foodCostGreenMax ? "text-amber-700" : "text-green-700"}`}>
          {stats.dishesCount > 0 ? `${stats.avgFoodCost.toFixed(1)}%` : "—"}
        </p>
        <p className="text-[11px] text-gray-400">Food cost promedio</p>
        {stats.dishesCount > 0 && (
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full ${stats.avgFoodCost > panelCfg.foodCostRedAbove ? "bg-red-500" : stats.avgFoodCost > panelCfg.foodCostGreenMax ? "bg-amber-500" : "bg-green-500"}`}
              style={{ width: `${Math.min(stats.avgFoodCost, 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center mx-auto mb-2">
          <DollarSign className="w-4 h-4 text-red-600" />
        </div>
        <p className={`text-xl font-extrabold ${stats.totalMerma > 1000 ? "text-red-700" : "text-gray-900"}`}>
          ${stats.totalMerma.toFixed(0)}
        </p>
        <p className="text-[11px] text-gray-400">Pérdida por merma</p>
        {stats.mermaCount > 0 && (
          <p className="text-[10px] text-red-500 font-medium mt-1">{stats.mermaCount} registros</p>
        )}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center mx-auto mb-2">
          <BarChart3 className="w-4 h-4 text-emerald-600" />
        </div>
        <p className={`text-xl font-extrabold ${stats.mermaVsGoal > 100 ? "text-red-700" : "text-emerald-700"}`}>
          {stats.monthlyGoal > 0 ? `${stats.mermaVsGoal.toFixed(0)}%` : "—"}
        </p>
        <p className="text-[11px] text-gray-400">Merma vs meta</p>
        {stats.monthlyGoal > 0 && (
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full ${stats.mermaVsGoal > 100 ? "bg-red-500" : stats.mermaVsGoal > 100 - panelCfg.mermaMaxPct ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${Math.min(stats.mermaVsGoal, 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center mx-auto mb-2">
          <TrendingUp className="w-4 h-4 text-green-600" />
        </div>
        <div className="flex items-center justify-center gap-2">
          <span className="text-xl font-extrabold text-green-700">{stats.green}</span>
          {stats.red > 0 && (
            <span className="text-xl font-extrabold text-red-500">{stats.red}</span>
          )}
        </div>
        <p className="text-[11px] text-gray-400">Semáforo rentabilidad</p>
        <p className="text-[10px] text-gray-400 mt-1">
          <span className="text-green-600">● {stats.green}</span>{" "}
          <span className="text-red-500">● {stats.red}</span>
        </p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center mx-auto mb-2">
          <ShoppingCart className="w-4 h-4 text-purple-600" />
        </div>
        <p className={`text-xl font-extrabold ${stats.seasonalSavings > 0 ? "text-purple-700" : "text-gray-400"}`}>
          {stats.seasonalSavings > 0 ? `$${stats.seasonalSavings.toFixed(0)}` : "—"}
        </p>
        <p className="text-[11px] text-gray-400">Ahorro estacional</p>
        {stats.seasonalSavings > 0 && (
          <p className="text-[10px] text-purple-500 font-medium mt-1">Lista de compras</p>
        )}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center mx-auto mb-2">
          <UtensilsCrossed className="w-4 h-4 text-amber-600" />
        </div>
        <p className={`text-xl font-extrabold ${mesasInfo.occupied > 0 ? "text-amber-700" : "text-gray-400"}`}>
          {mesas.length > 0 ? `${mesasInfo.occupied}/${mesasInfo.total}` : "—"}
        </p>
        <p className="text-[11px] text-gray-400">Mesas ocupadas</p>
        {mesasInfo.longCount > 0 && (
          <p className="text-[10px] text-amber-600 font-medium mt-1">{`${mesasInfo.longCount} > 3 h`}</p>
        )}
      </div>
    </div>
  )
}
