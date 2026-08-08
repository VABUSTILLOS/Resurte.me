"use client"

import { AlertCircle } from "lucide-react"

interface DeleteConfirmModalProps {
  entryId: string | null
  deductStock: boolean
  onCancel: () => void
  onConfirm: (id: string) => void
}

export default function DeleteConfirmModal({ entryId, deductStock, onCancel, onConfirm }: DeleteConfirmModalProps) {
  if (!entryId) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <h3 className="font-bold text-gray-900">¿Eliminar esta venta?</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">Esta acción no se puede deshacer.</p>
        {deductStock && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            El stock que se descontó al registrar esta venta no se repondrá automáticamente.
          </p>
        )}
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors font-medium">
            Cancelar
          </button>
          <button onClick={() => onConfirm(entryId)}
            className="flex-1 px-4 py-2 text-sm text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors font-semibold">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}
