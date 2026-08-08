import ConfirmDialog from "@/components/panel/ConfirmDialog"

export default function DeleteModals({
  recipeConfirmDelete,
  onConfirmDeleteRecipe,
  onCancelDeleteRecipe,
  deleteConfirmId,
  onConfirmDeleteDish,
  onCancelDeleteDish,
  comboDeleteConfirm,
  onConfirmDeleteCombo,
  onCancelDeleteCombo,
  batchDeleteConfirm,
  selectedCount,
  onConfirmBatchDelete,
  onCancelBatchDelete,
}: {
  recipeConfirmDelete: string | null
  onConfirmDeleteRecipe: (id: string) => void
  onCancelDeleteRecipe: () => void
  deleteConfirmId: string | null
  onConfirmDeleteDish: () => void
  onCancelDeleteDish: () => void
  comboDeleteConfirm: string | null
  onConfirmDeleteCombo: () => void
  onCancelDeleteCombo: () => void
  batchDeleteConfirm: boolean
  selectedCount: number
  onConfirmBatchDelete: () => void
  onCancelBatchDelete: () => void
}) {
  return (
    <>
      {/* Delete saved recipe confirmation modal */}
      {recipeConfirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-xl">
            <h4 className="font-bold text-gray-900 mb-2">¿Eliminar esta receta guardada?</h4>
            <p className="text-sm text-gray-500 mb-4">Esta acción no se puede deshacer. La receta se quitará de tus guardadas.</p>
            <div className="flex gap-3">
              <button onClick={() => onConfirmDeleteRecipe(recipeConfirmDelete)} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-xl hover:bg-red-700 text-sm">
                Sí, eliminar
              </button>
              <button onClick={onCancelDeleteRecipe} className="flex-1 border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-xl">
            <h4 className="font-bold text-gray-900 mb-2">¿Eliminar este platillo?</h4>
            <p className="text-sm text-gray-500 mb-4">Esta acción no se puede deshacer. Perderás todos los ingredientes y precios de este platillo.</p>
            <div className="flex gap-3">
              <button onClick={onConfirmDeleteDish} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-xl hover:bg-red-700 text-sm">
                Sí, eliminar
              </button>
              <button onClick={onCancelDeleteDish} className="flex-1 border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Combo delete confirmation modal */}
      {comboDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-sm mx-4 shadow-xl">
            <h4 className="font-bold text-gray-900 mb-2">¿Eliminar este combo?</h4>
            <p className="text-sm text-gray-500 mb-4">
              Esta acción no se puede deshacer. Se eliminará el combo de tus promociones.
            </p>
            <div className="flex gap-3">
              <button onClick={onConfirmDeleteCombo} className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-xl hover:bg-red-700 text-sm">
                Sí, eliminar
              </button>
              <button onClick={onCancelDeleteCombo} className="flex-1 border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl hover:bg-gray-50 text-sm">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch delete confirmation modal */}
      <ConfirmDialog
        open={batchDeleteConfirm}
        danger
        title={`¿Eliminar ${selectedCount} platillo${selectedCount > 1 ? "s" : ""}?`}
        message="Esta acción no se puede deshacer. Perderás todos los ingredientes y precios de los platillos seleccionados. Puedes deshacer con Ctrl+Z después de eliminar."
        confirmLabel="Sí, eliminar"
        onConfirm={onConfirmBatchDelete}
        onCancel={onCancelBatchDelete}
      />
    </>
  )
}
