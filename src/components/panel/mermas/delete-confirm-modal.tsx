interface DeleteConfirmModalProps {
  onConfirm: () => void
  onCancel: () => void
}

export default function DeleteConfirmModal({ onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-xl">
        <h4 className="font-bold text-gray-900 mb-2">¿Eliminar este registro?</h4>
        <p className="text-sm text-gray-500 mb-4">Esta acción no se puede deshacer. Perderás el registro de merma y su costo asociado.</p>
        <div className="flex gap-3">
          <button onClick={onConfirm} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-xl hover:bg-red-700 text-sm">
            Sí, eliminar
          </button>
          <button onClick={onCancel} className="flex-1 border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
