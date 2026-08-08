import { ChevronDown, ChevronUp, Clock } from "lucide-react"
import type { StockMovement } from "./inventario-shared"

interface Props {
  movements: StockMovement[]
  showMovements: boolean
  onToggle: () => void
}

export default function MovementHistory({ movements, showMovements, onToggle }: Props) {
  if (movements.length === 0) return null
  return (
    <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-5">
      <button onClick={onToggle} className="flex items-center justify-between w-full text-left">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-gray-900 text-sm">Historial de movimientos ({movements.length})</h3>
        </div>
        {showMovements ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {showMovements && (
        <div className="mt-4 space-y-1.5 max-h-64 overflow-y-auto">
          {movements.slice(0, 20).map((m, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 text-xs">
              <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${
                m.tipo === "entrada" ? "bg-green-100 text-green-700" : m.tipo === "salida" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
              }`}>
                {m.tipo === "entrada" ? "+" : m.tipo === "salida" ? "−" : "±"}
              </span>
              <span className="font-semibold text-gray-700 truncate">{m.itemName}</span>
              <span className="text-gray-400 shrink-0">{m.motivo}</span>
              <span className={`ml-auto shrink-0 font-bold ${m.delta >= 0 ? "text-green-600" : "text-red-600"}`}>
                {m.delta > 0 ? "+" : ""}{m.delta}
              </span>
              <span className="text-[10px] text-gray-300 shrink-0 w-24 text-right">
                {new Date(m.fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })} {new Date(m.fecha).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
