import Link from "next/link"
import { ChefHat, Plus } from "lucide-react"
import { t } from "@/lib/i18n/es"

interface ComandaEmptyProps {
  dayEntriesLength: number
  filteredLength: number
}

export default function ComandaEmpty({ dayEntriesLength, filteredLength }: ComandaEmptyProps) {
  if (dayEntriesLength === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
        <ChefHat className="w-12 h-12 text-gray-200 mx-auto mb-4" />
        <p className="text-gray-400 font-medium mb-1">{t("comanda.emptyDay")}</p>
        <p className="text-xs text-gray-300 mb-4">
          {t("comanda.emptyDayDescription")}
        </p>
        <Link
          id="comanda-nueva-venta"
          href="/panel/ventas"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0E7A0E] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {t("comanda.emptyAction")}
        </Link>
      </div>
    )
  }

  if (filteredLength === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-xs text-gray-400">{t("comanda.emptyFilter")}</p>
      </div>
    )
  }

  return null
}
