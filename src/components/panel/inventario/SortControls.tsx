import type { SortField } from "./inventario-shared"

interface Props {
  itemCount: number
  sortBy: SortField
  onSortChange: (value: SortField) => void
}

export default function SortControls({ itemCount, sortBy, onSortChange }: Props) {
  if (itemCount === 0) return null
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xs text-gray-400">Ordenar:</span>
      <select
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value as SortField)}
        className="text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg px-2 py-1"
      >
        <option value="name">Nombre</option>
        <option value="stock">Stock</option>
        <option value="pricePerUnit">Precio</option>
        <option value="status">Estado</option>
      </select>
    </div>
  )
}
