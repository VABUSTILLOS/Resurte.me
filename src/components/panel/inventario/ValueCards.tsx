import { BarChart3, Clock } from "lucide-react"
import type { InventoryItem } from "./inventario-shared"

interface Props {
  totalValue: number
  weeklyCost: number
  okStock: InventoryItem[]
  lowStock: InventoryItem[]
  outOfStock: InventoryItem[]
}

export default function ValueCards({ totalValue, weeklyCost, okStock, lowStock, outOfStock }: Props) {
  const itemCount = okStock.length + lowStock.length + outOfStock.length
  return (
    <>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-[#108910] shrink-0" />
          <div>
            <p className="text-[10px] text-gray-400">Valor total del inventario</p>
            <p className="font-bold text-lg text-gray-900">${totalValue.toFixed(0)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-indigo-600 shrink-0" />
          <div>
            <p className="text-[10px] text-gray-400">Costo semanal estimado</p>
            <p className="font-bold text-lg text-indigo-700">${weeklyCost.toFixed(0)}</p>
          </div>
        </div>
      </div>
      {itemCount > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
          <p className="text-[10px] text-gray-400 mb-2">Valor por estado</p>
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="bg-green-50 rounded-lg py-2">
              <p className="text-gray-500">🟢 Suficiente</p>
              <p className="font-bold text-green-700">${okStock.reduce((s, i) => s + i.stock * i.pricePerUnit, 0).toFixed(0)}</p>
            </div>
            <div className="bg-amber-50 rounded-lg py-2">
              <p className="text-gray-500">🟡 Bajo</p>
              <p className="font-bold text-amber-700">${lowStock.reduce((s, i) => s + i.stock * i.pricePerUnit, 0).toFixed(0)}</p>
            </div>
            <div className="bg-red-50 rounded-lg py-2">
              <p className="text-gray-500">🔴 Agotado</p>
              <p className="font-bold text-red-700">${outOfStock.reduce((s, i) => s + i.stock * i.pricePerUnit, 0).toFixed(0)}</p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
