import { Percent } from "lucide-react"
import { t } from "@/lib/i18n/es"

export default function FoodCostTarget({
  targetFoodCost,
  onDecrease,
  onIncrease,
}: {
  targetFoodCost: number
  onDecrease: () => void
  onIncrease: () => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Percent className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">{t("costeo.foodCostTarget")}</h3>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onDecrease}
            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 transition-colors"
            aria-label="Reducir food cost objetivo"
          >
            −
          </button>
          <span className="text-2xl font-bold text-[#108910]">{targetFoodCost}%</span>
          <button
            onClick={onIncrease}
            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold text-gray-600 transition-colors"
            aria-label="Aumentar food cost objetivo"
          >
            +
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Tus platillos se preciarán para alcanzar este % de costo sobre el precio de venta.
        Lo ideal en México está entre 28% y 35%.
      </p>
    </div>
  )
}
