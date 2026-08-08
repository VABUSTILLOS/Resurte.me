import { Trash2 } from "lucide-react"

export default function BatchToolbar({
  filteredCount,
  selectedCount,
  onToggleAll,
  onDeleteSelected,
}: {
  filteredCount: number
  selectedCount: number
  onToggleAll: () => void
  onDeleteSelected: () => void
}) {
  if (filteredCount === 0) return null
  return (
    <div className="flex items-center gap-2 mb-3">
      <button
        onClick={onToggleAll}
        className="text-xs font-semibold text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
      >
        {selectedCount > 0 ? `Deseleccionar (${selectedCount})` : "Seleccionar todos"}
      </button>
      {selectedCount > 0 && (
        <button
          onClick={onDeleteSelected}
          className="text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" />
          Eliminar {selectedCount} seleccionado{selectedCount > 1 ? "s" : ""}
        </button>
      )}
    </div>
  )
}
