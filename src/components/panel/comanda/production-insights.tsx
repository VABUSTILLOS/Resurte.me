import { Flame, Clock } from "lucide-react"

export interface InProductionGroup {
  dishName: string
  count: number
  avgMin: number
}

export interface DishAvgTime {
  dishName: string
  count: number
  avgMin: number
}

interface ProductionInsightsProps {
  inProduction: InProductionGroup[]
  dishAvgTimes: DishAvgTime[]
}

export default function ProductionInsights({ inProduction, dishAvgTimes }: ProductionInsightsProps) {
  if (inProduction.length === 0 && dishAvgTimes.length === 0) return null

  return (
    <div className="grid md:grid-cols-2 gap-4 mb-6">
      {inProduction.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">En producción ahora</h3>
            <span className="ml-auto text-[10px] text-gray-400">actualiza cada 30s</span>
          </div>
          <ul className="space-y-2">
            {inProduction.map((g) => (
              <li key={g.dishName} className="flex items-center gap-3">
                <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{g.dishName}</span>
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">×{g.count}</span>
                <span className="text-[10px] text-gray-400 w-20 text-right">{g.avgMin.toFixed(0)} min en corte</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {dishAvgTimes.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-[#0E7A0E]" />
            <h3 className="text-sm font-semibold text-gray-900">Tiempos por platillo (listas)</h3>
            <span className="ml-auto text-[10px] text-gray-400">top 5</span>
          </div>
          <ul className="space-y-2">
            {dishAvgTimes.map((g) => (
              <li key={g.dishName} className="flex items-center gap-3">
                <span className="flex-1 text-sm font-semibold text-gray-800 truncate">{g.dishName}</span>
                <span className="text-[10px] text-gray-400">{g.count} pz</span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    g.avgMin > 15 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"
                  }`}
                >
                  {g.avgMin > 15 ? "⚠️ " : ""}{g.avgMin.toFixed(0)} min
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
