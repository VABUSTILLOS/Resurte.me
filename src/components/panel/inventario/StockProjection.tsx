import { CheckCircle2, ShoppingCart } from "lucide-react"
import type { ProjectionRow } from "./inventario-shared"

interface Props {
  projection: ProjectionRow[]
  covers: number
  missingCount: number
  projectionIncluded: boolean
  onToggleProjection: () => void
  dishCount: number
}

export default function StockProjection({
  projection,
  covers,
  missingCount,
  projectionIncluded,
  onToggleProjection,
  dishCount,
}: Props) {
  if (projection.length === 0) return null
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-[#0E7A0E]" />
          <h3 className="font-bold text-gray-900 text-sm">Tu menú planeado para {covers} comensales</h3>
        </div>
        {missingCount > 0 && (
          <button
            onClick={onToggleProjection}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              projectionIncluded ? "bg-[#0E7A0E] text-white" : "bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
            }`}
            title="Agregar los faltantes calculados a la orden de compra"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            {projectionIncluded ? "En la orden de compra ✓" : "Agregar faltantes a la orden"}
          </button>
        )}
      </div>
      <div className="space-y-1.5 mb-2">
        {projection.map((p) => (
          <div key={p.key} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 text-xs">
            <span className="shrink-0 text-sm">{p.icon}</span>
            <span className="font-semibold text-gray-700 truncate">{p.name}</span>
            <span className={`ml-auto shrink-0 font-medium ${
              p.status === "ok" ? "text-green-600" : p.status === "justo" ? "text-amber-600" : "text-red-600"
            }`}>
              {p.label}
            </span>
            <span className="text-gray-400 shrink-0">
              {p.stockQty === null ? "—" : `${p.stockQty} ${p.stockUnit}`} / {p.neededQty.toFixed(1)} {p.neededUnit}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400">
        Proyección = ingredientes de tus {dishCount} platillos costeados × {covers} comensales (con su unidad).
        Compara contra tu inventario actual para no quedarte corto en el servicio.
      </p>
    </div>
  )
}
