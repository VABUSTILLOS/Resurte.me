import { AlertTriangle } from "lucide-react"

interface Props {
  deleteConfirm: string | null
  onCancel: () => void
  onConfirm: (id: string) => void
}

export default function DeleteConfirm({ deleteConfirm, onCancel, onConfirm }: Props) {
  if (!deleteConfirm) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <h3 className="font-bold text-gray-900">¿Eliminar producto?</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">Esta acción no se puede deshacer.</p>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors font-medium">
            Cancelar
          </button>
          <button onClick={() => onConfirm(deleteConfirm)}
            className="flex-1 px-4 py-2 text-sm text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors font-semibold">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}
