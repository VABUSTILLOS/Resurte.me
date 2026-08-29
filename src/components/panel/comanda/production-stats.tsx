import { Flame, Check, Clock } from "lucide-react"
import { t } from "@/lib/i18n/es"

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
        <p className="text-[10px] text-gray-400">{t("comanda.statActive")}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <Clock className="w-5 h-5 text-blue-600 mx-auto mb-1" />
        <p className="text-lg font-extrabold text-blue-700">{cookingCount}</p>
        <p className="text-[10px] text-gray-400">{t("comanda.statCooking")}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <Check className="w-5 h-5 text-green-600 mx-auto mb-1" />
        <p className="text-lg font-extrabold text-green-700">{listoCount}</p>
        <p className="text-[10px] text-gray-400">{t("comanda.statReady")}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <Clock className="w-5 h-5 text-[#0E7A0E] mx-auto mb-1" />
        <p className="text-lg font-extrabold text-[#0E7A0E]">
          {hasProd ? `${avgMin.toFixed(0)} min` : "—"}
        </p>
        <p className="text-[10px] text-gray-400">{t("comanda.statAvgTime")}</p>
      </div>
    </div>
  )
}
