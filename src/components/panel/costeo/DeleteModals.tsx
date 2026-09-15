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
      <ConfirmDialog
        open={!!recipeConfirmDelete}
        danger
        title="¿Eliminar esta receta guardada?"
        message="Esta acción no se puede deshacer. La receta se quitará de tus guardadas."
        confirmLabel="Sí, eliminar"
        onConfirm={() => recipeConfirmDelete && onConfirmDeleteRecipe(recipeConfirmDelete)}
        onCancel={onCancelDeleteRecipe}
      />

      {/* Delete confirmation modal */}
      <ConfirmDialog
        open={!!deleteConfirmId}
        danger
        title="¿Eliminar este platillo?"
        message="Esta acción no se puede deshacer. Perderás todos los ingredientes y precios de este platillo."
        confirmLabel="Sí, eliminar"
        onConfirm={onConfirmDeleteDish}
        onCancel={onCancelDeleteDish}
      />

      {/* Combo delete confirmation modal */}
      <ConfirmDialog
        open={!!comboDeleteConfirm}
        danger
        title="¿Eliminar este combo?"
        message="Esta acción no se puede deshacer. Se eliminará el combo de tus promociones."
        confirmLabel="Sí, eliminar"
        onConfirm={onConfirmDeleteCombo}
        onCancel={onCancelDeleteCombo}
      />

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
