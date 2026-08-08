import { ArrowDownToLine } from "lucide-react"

interface Props {
  hasPlanQtys: boolean
  onImport: () => void
}

export default function ImportPlanificador({ hasPlanQtys, onImport }: Props) {
  if (!hasPlanQtys) return null
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-white rounded-xl border border-indigo-100 p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowDownToLine className="w-4 h-4 text-indigo-600" />
          <p className="text-xs font-semibold text-indigo-700">
            Importar productos desde el Planificador
          </p>
        </div>
        <button
          onClick={onImport}
          className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
        >
          Importar ahora
        </button>
      </div>
      <p className="text-[10px] text-indigo-400 mt-2">
        Los productos con cantidades manuales del planificador se agregarán al inventario.
        Los que ya existen se actualizarán con stock adicional.
      </p>
    </div>
  )
}
