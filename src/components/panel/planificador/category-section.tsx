"use client"

import { ChevronDown, ChevronUp, Package } from "lucide-react"
import { findManualQty } from "@/lib/panel-units"
import type { ManualQtys } from "@/lib/panel-units"
import type { PlannerProduct } from "./planificador-shared"
import { t } from "@/lib/i18n/es"

const UNITS = ["kg", "g", "pza", "L", "ml", "rebanada", "docena"]

interface CategorySectionProps {
  categories: [string, PlannerProduct[]][]
  expandedCategory: string | null
  onToggle: (category: string) => void
  covers: number
  getWastePct: (category: string) => number
  manualQtys: ManualQtys
  onQtyChange: (item: PlannerProduct, val: number, unit: string, price: number) => void
  onUnitChange: (item: PlannerProduct, unit: string, qty: number, price: number) => void
}

// Lista por categoría con cantidades manuales y costos en vivo.
export default function CategorySection({
  categories,
  expandedCategory,
  onToggle,
  covers,
  getWastePct,
  manualQtys,
  onQtyChange,
  onUnitChange,
}: CategorySectionProps) {
  return (
    <div className="space-y-3 mb-6">
      {categories.map(([category, items]) => {
        const expanded = expandedCategory === category
        return (
          <div key={category} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <button
              onClick={() => onToggle(category)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-400" />
                <span className="font-semibold text-gray-700">{category}</span>
                <span className="text-xs text-gray-400">{t("planificador.insumosCount", { count: items.length })}</span>
              </div>
              {expanded
                ? <ChevronUp className="w-4 h-4 text-gray-400" />
                : <ChevronDown className="w-4 h-4 text-gray-400" />
              }
            </button>
            {expanded && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {items.map((item, idx) => {
                  const waste = getWastePct(item.category)
                  const autoNeeded = item.perPerson * covers * (1 + waste / 100)
                  const mq = findManualQty(manualQtys, item.name)
                  const isManual = !!mq
                  const needed = mq ? mq.qty : autoNeeded
                  const unit = mq ? mq.unit : item.unit
                  const price = mq?.price && mq.price > 0 ? mq.price : item.price
                  const cost = needed * price
                  return (
                    <div key={idx} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div className="min-w-0 mr-4 flex-1">
                        <p className="font-medium text-gray-800 truncate">{item.name}</p>
                        <p className="text-xs text-gray-400">${price}/{unit}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="number"
                          value={parseFloat(needed.toFixed(2))}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0
                            onQtyChange(item, val, unit, mq?.price ?? item.price)
                          }}
                          className={`w-20 text-right text-sm font-mono font-bold py-1 px-2 rounded-lg border focus:outline-none ${
                            isManual ? "border-amber-300 bg-amber-50 text-amber-800" : "border-transparent bg-gray-50 text-gray-900 hover:border-gray-200"
                          }`}
                          step={unit === "kg" || unit === "L" ? "0.01" : "1"}
                          min="0"
                          title={isManual ? t("planificador.manualQtyTitle") : t("planificador.clickToAdjust")}
                        />
                        <select
                          value={unit}
                          onChange={(e) => {
                            const newUnit = e.target.value
                            onUnitChange(item, newUnit, parseFloat(needed.toFixed(2)), mq?.price ?? item.price)
                          }}
                          className={`text-xs py-1 px-1 rounded-lg border focus:outline-none w-14 ${
                            isManual ? "border-amber-300 bg-amber-50 text-amber-800" : "border-gray-200 bg-gray-50 text-gray-500"
                          }`}
                          title={t("planificador.unitTitle")}
                          aria-label={t("planificador.unitAria", { name: item.name })}
                        >
                          {UNITS.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                        <p className="text-xs text-emerald-600 font-medium w-16 text-right">
                          ${cost.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
