import { Download, Plus } from "lucide-react"

interface Props {
  restaurantName: string
  itemCount: number
  onExportCsv: () => void
  onAddProduct: () => void
}

export default function InventarioHeader({ restaurantName, itemCount, onExportCsv, onAddProduct }: Props) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-1">📦 Mi inventario</h1>
        <p className="text-sm text-gray-400">
          {restaurantName} — {itemCount} productos registrados
        </p>
      </div>
      <div className="flex items-center gap-2">
        {itemCount > 0 && (
          <button
            onClick={onExportCsv}
            className="p-2 text-gray-400 hover:text-[#108910] hover:bg-green-50 rounded-xl transition-colors"
            title="Exportar CSV"
            aria-label="Exportar inventario a CSV"
          >
            <Download className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onAddProduct}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Agregar producto
        </button>
      </div>
    </div>
  )
}
