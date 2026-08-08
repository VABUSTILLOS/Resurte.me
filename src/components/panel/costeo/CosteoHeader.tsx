import Link from "next/link"
import { ArrowLeft, BookOpen, Download } from "lucide-react"
import { t } from "@/lib/i18n/es"

export default function CosteoHeader({
  restaurantName,
  dishCount,
  viewMode,
  onToggleView,
  onOpenShortcuts,
  onExportCsv,
  onOpenRecipes,
}: {
  restaurantName: string
  dishCount: number
  viewMode: string
  onToggleView: () => void
  onOpenShortcuts: () => void
  onExportCsv: () => void
  onOpenRecipes: () => void
}) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <Link href="/panel" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
        <ArrowLeft className="w-5 h-5 text-gray-400" />
      </Link>
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">{t("costeo.title")}</h2>
          <button
            onClick={onOpenShortcuts}
            className="w-6 h-6 rounded-full border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 text-xs font-bold transition-colors"
            title="Atajos de teclado (?)"
            aria-label="Ver atajos de teclado"
          >
            ?
          </button>
          {dishCount > 0 && (
            <button
              onClick={onExportCsv}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
              title="Exportar platillos del filtro activo a CSV"
            >
              <Download className="w-3.5 h-3.5" />
              {t("costeo.exportCsv")}
            </button>
          )}
          <button
            onClick={onOpenRecipes}
            className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-lg transition-colors"
            title="Recetas pregrabadas y guardadas para costear platillos"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Recetas
          </button>
          {dishCount > 0 && (
            <button
              onClick={onToggleView}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                viewMode === "menu"
                  ? "bg-[#0E7A0E] text-white"
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100"
              }`}
              title="Alternar entre lista de costeo y vista de menú digital"
            >
              {viewMode === "menu" ? "📋 Ver costeo" : "🥘 Menú digital"}
            </button>
          )}
        </div>
        <p className="text-sm text-gray-400">{restaurantName}</p>
      </div>
    </div>
  )
}
