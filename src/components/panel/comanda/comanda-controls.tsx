import { LayoutGrid, List, Trash2 } from "lucide-react"
import { todayStr } from "@/lib/panel-utils"

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
        <span className="text-xs text-gray-400 shrink-0">Día:</span>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => onDateChange(e.target.value || todayStr())}
          className="text-xs font-semibold text-gray-700 bg-transparent focus:outline-none"
          aria-label="Seleccionar día de comandas"
        />
      </div>
      <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-100 p-1">
        <button
          onClick={() => onViewModeChange("board")}
          className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
            viewMode === "board" ? "bg-[#108910] text-white" : "text-gray-500 hover:bg-gray-50"
          }`}
          title="Vista tablero (ventanas)"
          aria-label="Vista tablero de comandas"
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          Tablero
        </button>
        <button
          onClick={() => onViewModeChange("list")}
          className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
            viewMode === "list" ? "bg-[#108910] text-white" : "text-gray-500 hover:bg-gray-50"
          }`}
          title="Vista listado"
          aria-label="Vista listado de comandas"
        >
          <List className="w-3.5 h-3.5" />
          Listado
        </button>
      </div>
      <button
        onClick={onSortNewestToggle}
        className={`text-xs font-semibold px-3 py-2 rounded-xl transition-colors ${
          sortNewest ? "bg-[#108910] text-white" : "bg-white text-gray-600 border border-gray-100 hover:bg-gray-50"
        }`}
        title={sortNewest ? "Orden: más recientes primero" : "Orden: primeros en llegar primero"}
      >
        {sortNewest ? "Más recientes" : "Por antigüedad"}
      </button>
      {listoCount > 0 && (
        <button
          onClick={onLimpiarListos}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-white border border-gray-100 hover:bg-gray-50 px-3 py-2 rounded-xl transition-colors"
          title="Quitar del tablero las comandas marcadas como listas"
          aria-label="Limpiar comandas listas"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Limpiar listas
        </button>
      )}
    </div>
  )
}
