import { LayoutGrid, List, Trash2 } from "lucide-react"
import { todayStr } from "@/lib/panel-utils"
import { t } from "@/lib/i18n/es"

interface ComandaControlsProps {
  selectedDate: string
  onDateChange: (d: string) => void
  viewMode: "board" | "list"
  onViewModeChange: (v: "board" | "list") => void
  sortNewest: boolean
  onSortNewestToggle: () => void
  listoCount: number
  onLimpiarListos: () => void
}

export default function ComandaControls({
  selectedDate, onDateChange, viewMode, onViewModeChange,
  sortNewest, onSortNewestToggle, listoCount, onLimpiarListos,
}: ComandaControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 px-3 py-2">
        <span className="text-xs text-gray-400 shrink-0">{t("comanda.dayLabel")}</span>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => onDateChange(e.target.value || todayStr())}
          className="text-xs font-semibold text-gray-700 bg-transparent focus:outline-none"
          aria-label={t("comanda.dayAria")}
        />
      </div>
      <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 p-1">
        <button
          onClick={() => onViewModeChange("board")}
          className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
            viewMode === "board" ? "bg-[#0E7A0E] text-white" : "text-gray-500 hover:bg-gray-50"
          }`}
          title={t("comanda.boardViewTitle")}
          aria-label={t("comanda.boardViewAria")}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          {t("comanda.boardView")}
        </button>
        <button
          onClick={() => onViewModeChange("list")}
          className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
            viewMode === "list" ? "bg-[#0E7A0E] text-white" : "text-gray-500 hover:bg-gray-50"
          }`}
          title={t("comanda.listViewTitle")}
          aria-label={t("comanda.listViewAria")}
        >
          <List className="w-3.5 h-3.5" />
          {t("comanda.listView")}
        </button>
      </div>
      <button
        onClick={onSortNewestToggle}
        className={`text-xs font-semibold px-3 py-2 rounded-xl transition-colors ${
          sortNewest ? "bg-[#0E7A0E] text-white" : "bg-white text-gray-600 border border-gray-100 hover:bg-gray-50"
        }`}
        title={sortNewest ? t("comanda.sortTitleNewest") : t("comanda.sortTitleOldest")}
      >
        {sortNewest ? t("comanda.sortNewest") : t("comanda.sortOldest")}
      </button>
      {listoCount > 0 && (
        <button
          onClick={onLimpiarListos}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-white border border-gray-100 hover:bg-gray-50 px-3 py-2 rounded-xl transition-colors"
          title={t("comanda.clearReadyTitle")}
          aria-label={t("comanda.clearReadyAria")}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t("comanda.clearReady")}
        </button>
      )}
    </div>
  )
}
