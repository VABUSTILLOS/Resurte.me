import Link from "next/link"
import { ArrowLeft, Copy } from "lucide-react"

interface ComandaHeaderProps {
  collectionName: string
  hasComandas: boolean
  onCopyReporte: () => void
}

export default function ComandaHeader({ collectionName, hasComandas, onCopyReporte }: ComandaHeaderProps) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <Link href="/panel" className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
        <ArrowLeft className="w-5 h-5 text-gray-400" />
      </Link>
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">Comanda de cocina</h2>
          {hasComandas && (
            <button
              onClick={onCopyReporte}
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
              title="Copiar reporte de producción del día"
              aria-label="Copiar reporte de comandas"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar reporte
            </button>
          )}
        </div>
        <p className="text-sm text-gray-400">
          {collectionName} — monitor de producción de tu cocina en tiempo real
        </p>
      </div>
    </div>
  )
}
