import { PieChart } from "lucide-react"
import type { Dish } from "./costeo-shared"

export default function CosteoSummary({ dishes }: { dishes: Dish[] }) {
  const totalCost = dishes.reduce((s, d) => s + d.ingredients.reduce((si, i) => si + (i.quantity * i.unitPrice), 0), 0)
  const totalPrice = dishes.reduce((s, d) => s + d.sellingPrice, 0)
  return (
    <>
      {dishes.length > 0 && (
      <div className="mt-6 bg-gradient-to-r from-[#F0FDF4] to-white rounded-2xl border border-[#108910]/10 p-5">
        <div className="flex items-center gap-2 mb-3">
          <PieChart className="w-5 h-5 text-[#108910]" />
          <h3 className="font-semibold text-gray-900">Resumen de menú</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-white rounded-xl p-3">
            <p className="text-xs text-gray-400">Platillos</p>
            <p className="text-xl font-bold text-gray-900">{dishes.length}</p>
          </div>
          <div className="bg-white rounded-xl p-3">
            <p className="text-xs text-gray-400">Costo total menú</p>
            <p className="text-xl font-bold text-gray-900">
              ${totalCost.toFixed(0)}
            </p>
          </div>
          <div className="bg-white rounded-xl p-3">
            <p className="text-xs text-gray-400">Ingreso potencial</p>
            <p className="text-xl font-bold text-[#108910]">
              ${totalPrice.toFixed(0)}
            </p>
          </div>
          <div className="bg-white rounded-xl p-3">
            <p className="text-xs text-gray-400">Food cost promedio</p>
            <p className="text-xl font-bold text-gray-900">
              {totalPrice > 0 ? `${((totalCost / totalPrice) * 100).toFixed(1)}%` : "—"}
            </p>
          </div>
        </div>
      </div>
      )}

      {/* Tip */}
      <div className="mt-4 bg-blue-50 rounded-xl p-4 border border-blue-100">
        <p className="text-xs text-blue-700">
          <strong>💡 Tip:</strong> Los precios de ingredientes vienen del catálogo real de Resurte.me cuando está disponible (los locales usan precios de referencia). 
          Si los precios cambian en la plataforma, agrega el ingrediente de nuevo para usar el precio actual.
        </p>
      </div>
    </>
  )
}
