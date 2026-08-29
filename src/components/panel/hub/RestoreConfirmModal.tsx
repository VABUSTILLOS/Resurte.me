"use client"

import { AlertTriangle } from "lucide-react"
import { useEscapeKey } from "@/hooks/use-escape-key"

interface RestoreConfirmModalProps {
  open: boolean
  pendingBackup: Record<string, unknown> | null
  onCancel: () => void
  onConfirm: () => void
}

export default function RestoreConfirmModal({ open, pendingBackup, onCancel, onConfirm }: RestoreConfirmModalProps) {
  useEscapeKey(onCancel, open)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-gray-900">¿Restaurar respaldo?</h3>
        </div>
        <p className="text-sm text-gray-500 mb-2">
          Se reemplazarán los datos actuales de esta colección con los del archivo. Esta acción no se puede deshacer.
        </p>
        <p className="text-xs text-gray-400 mb-4">
          {pendingBackup ? Object.keys(pendingBackup).length : 0} secciones de datos serán restauradas.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="text-xs font-semibold text-white bg-[#0E7A0E] hover:bg-green-800 px-4 py-2 rounded-lg transition-colors"
          >
            Restaurar
          </button>
        </div>
      </div>
    </div>
  )
}
