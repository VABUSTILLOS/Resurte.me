import { Flame, Check, Clock } from "lucide-react"

interface ProductionStatsProps {
  activeCount: number
  cookingCount: number
  listoCount: number
  avgMin: number
  hasProd: boolean
}

export default function ProductionStats({ activeCount, cookingCount, listoCount, avgMin, hasProd }: ProductionStatsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <Flame className="w-5 h-5 text-amber-600 mx-auto mb-1" />
        <p className="text-lg font-extrabold text-amber-700">{activeCount}</p>
        <p className="text-[10px] text-gray-400">Comandas activas</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <Clock className="w-5 h-5 text-blue-600 mx-auto mb-1" />
        <p className="text-lg font-extrabold text-blue-700">{cookingCount}</p>
        <p className="text-[10px] text-gray-400">En cocina</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <Check className="w-5 h-5 text-green-600 mx-auto mb-1" />
        <p className="text-lg font-extrabold text-green-700">{listoCount}</p>
        <p className="text-[10px] text-gray-400">Listas hoy</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <Clock className="w-5 h-5 text-[#108910] mx-auto mb-1" />
        <p className="text-lg font-extrabold text-[#108910]">
          {hasProd ? `${avgMin.toFixed(0)} min` : "—"}
        </p>
        <p className="text-[10px] text-gray-400">Tiempo promedio de producción</p>
      </div>
    </div>
  )
}
