"use client"

import type { ImportConfirm } from "./planificador-shared"

interface ConfirmImportModalProps {
  confirmImport: ImportConfirm
  onCancel: () => void
  onConfirm: () => void
}

// Modal: sobrescribir cantidades manuales al importar un platillo del Costeador.
export default function ConfirmImportModal({ confirmImport, onCancel, onConfirm }: ConfirmImportModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-import-title"
      >
        <h4 id="confirm-import-title" className="font-bold text-gray-900 mb-2">Sobrescribir cantidades manuales</h4>
        <p className="text-xs text-gray-500 mb-4">
          Importar <span className="font-semibold text-gray-700">&quot;{confirmImport.dishName}&quot;</span> sobrescribirá estas cantidades que ya escribiste a mano:
        </p>
        <ul className="space-y-1.5 mb-5 bg-amber-50 border border-amber-200 rounded-xl p-3">
          {confirmImport.ingredients.map((o) => (
            <li key={o.name} className="flex items-center justify-between text-xs">
              <span className="text-amber-800 font-medium">{o.name}</span>
              <span className="text-amber-600">{o.existing} → automático</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            Sí, sobrescribir
          </button>
        </div>
      </div>
    </div>
  )
}
