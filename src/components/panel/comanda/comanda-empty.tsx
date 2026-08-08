import Link from "next/link"
import { ChefHat, Plus } from "lucide-react"

interface ComandaEmptyProps {
  dayEntriesLength: number
  filteredLength: number
}

export default function ComandaEmpty({ dayEntriesLength, filteredLength }: ComandaEmptyProps) {
  if (dayEntriesLength === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
        <ChefHat className="w-12 h-12 text-gray-200 mx-auto mb-4" />
        <p className="text-gray-400 font-medium mb-1">Sin comandas para este día</p>
        <p className="text-xs text-gray-300 mb-4">
          Cada venta que registres se convierte en una comanda para la cocina.
        </p>
        <Link
          id="comanda-nueva-venta"
          href="/panel/ventas"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Registrar venta
        </Link>
      </div>
    )
  }

  if (filteredLength === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-xs text-gray-400">No hay comandas para este filtro.</p>
      </div>
    )
  }

  return null
}
