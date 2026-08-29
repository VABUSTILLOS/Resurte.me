"use client"

import Link from "next/link"
import { Calculator, Package, ShoppingCart, TrendingDown, TrendingUp } from "lucide-react"
import type { PlannerProduct } from "./planificador-shared"
import { t } from "@/lib/i18n/es"

interface ShoppingListProps {
  products: PlannerProduct[]
  covers: number
  avgWastePct: number
  totalCost: number
  collectionName: string
  showOrder: boolean
  onToggleOrder: () => void
  onCopy: () => void
  qtyFor: (p: PlannerProduct) => number
  unitFor: (p: PlannerProduct) => string
  priceFor: (p: PlannerProduct) => number
}

// Total card + ahorro por merma + CTA + lista de pedido.
export default function ShoppingList({
  products,
  covers,
  avgWastePct,
  totalCost,
  collectionName,
  showOrder,
  onToggleOrder,
  onCopy,
  qtyFor,
  unitFor,
  priceFor,
}: ShoppingListProps) {
  return (
    <>
      {/* Total card */}
      <div className="bg-gradient-to-r from-emerald-50 to-[#F0FDF4] rounded-2xl border border-emerald-200/50 p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-gray-900">{t("planificador.totalTitle")}</h3>
          </div>
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold">
            {t("planificador.forCovers", { covers })}
          </span>
        </div>
        <p className="text-4xl font-extrabold text-[#0E7A0E] mb-2">
          ${totalCost.toFixed(0)} <span className="text-lg font-medium text-gray-400">MXN</span>
        </p>
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <span className="bg-white rounded-lg px-2.5 py-1">
            ${(totalCost / covers).toFixed(2)} {t("planificador.perCover")}
          </span>
          <span className="bg-white rounded-lg px-2.5 py-1">
            {t("planificador.wasteIncluded", { pct: avgWastePct })}
          </span>
        </div>
      </div>

      {/* Waste savings delta */}
      {avgWastePct > 5 && (
        <div className="mt-4 bg-amber-50 rounded-2xl border border-amber-200 p-5">
          <div className="flex items-start gap-3">
            <TrendingDown className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-semibold text-amber-800 text-sm mb-1">
                {t("planificador.savingsTitle")}
              </h4>
              <p className="text-xs text-amber-700 mb-2">
                {t("planificador.savingsA")} <strong>{avgWastePct}%</strong> {t("planificador.savingsB")} <strong>5%</strong> {t("planificador.savingsC")}
              </p>
              <p className="text-2xl font-extrabold text-amber-700">
                ${(() => {
                  const costNow = products.reduce((sum, p) => {
                    return sum + (p.perPerson * covers * (1 + avgWastePct / 100) * p.price)
                  }, 0)
                  const costIdeal = products.reduce((sum, p) => {
                    return sum + (p.perPerson * covers * (1 + 5 / 100) * p.price)
                  }, 0)
                  return (costNow - costIdeal).toFixed(0)
                })()}
                <span className="text-sm font-medium text-amber-500"> MXN</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="mt-4 space-y-3">
        <button
          onClick={onToggleOrder}
          className="w-full flex items-center justify-center gap-2 bg-[#0E7A0E] hover:bg-green-800 text-white font-bold py-3 rounded-2xl transition-colors"
        >
          <ShoppingCart className="w-5 h-5" />
          {showOrder ? t("planificador.hideOrder") : t("planificador.showOrder")}
        </button>

        {/* Order summary */}
        {showOrder && (
          <div className="bg-white rounded-2xl border-2 border-[#0E7A0E]/20 p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-gray-900">{t("planificador.orderListTitle", { collection: collectionName })}</h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={onCopy}
                  className="text-xs font-semibold text-[#0E7A0E] hover:text-green-800 transition-colors"
                >
                  {t("planificador.copyOrder")}
                </button>
                <Link
                  href="/panel/inventario"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#0E7A0E] text-white px-3 py-1.5 rounded-lg hover:bg-[#0D720D] transition-colors"
                  title={t("planificador.sendToInventoryTitle")}
                >
                  <Package className="w-3.5 h-3.5" />
                  {t("planificador.sendToInventory")}
                </Link>
              </div>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {products.map((p) => {
                const needed = qtyFor(p).toFixed(2)
                const unit = unitFor(p)
                const price = priceFor(p)
                const subtotal = parseFloat(needed) * price
                return (
                  <div key={p.name} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="font-medium text-gray-800">{p.name}</span>
                      <span className="text-gray-400 ml-1">{needed} {unit}</span>
                    </div>
                    <span className="font-semibold text-gray-700 text-xs">${subtotal.toFixed(0)}</span>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
              <span className="font-bold text-gray-900">{t("planificador.totalEstimated")}</span>
              <span className="font-extrabold text-[#0E7A0E] text-lg">${totalCost.toFixed(0)} MXN</span>
            </div>
          </div>
        )}

        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
          <div className="flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800 mb-1">
                {t("planificador.readyTitle")}
              </p>
              <p className="text-xs text-emerald-600">
                {t("planificador.readyDesc")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
