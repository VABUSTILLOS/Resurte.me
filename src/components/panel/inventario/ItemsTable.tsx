import { Edit3, Package, Plus, Trash2 } from "lucide-react"
import { t } from "@/lib/i18n/es"
import type { InventoryItem, ItemStatus } from "./inventario-shared"

interface Props {
  items: InventoryItem[]
  sortedItems: InventoryItem[]
  getStatus: (item: InventoryItem) => ItemStatus
  proveedorName: (id?: string) => string
  onAddFirst: () => void
  onEdit: (item: InventoryItem) => void
  onDelete: (id: string) => void
  onAdjustStock: (id: string, delta: number) => void
}

export default function ItemsTable({
  items,
  sortedItems,
  getStatus,
  proveedorName,
  onAddFirst,
  onEdit,
  onDelete,
  onAdjustStock,
}: Props) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
        <Package className="w-12 h-12 text-gray-200 mx-auto mb-4" />
        <p className="text-gray-400 font-medium mb-1">{t("inventario.emptyTitle")}</p>
        <p className="text-xs text-gray-300 mb-4">
          Agrega productos manualmente o impórtalos desde el planificador
        </p>
        <button
          onClick={onAddFirst}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Agregar primer producto
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs" aria-label={t("inventario.title")}>
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th scope="col" className="text-left px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Estado</th>
              <th scope="col" className="text-left px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Producto</th>
              <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Stock</th>
              <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Mínimo</th>
              <th scope="col" className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Unidad</th>
              <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Precio/Unid</th>
              <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Valor</th>
              <th scope="col" className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Ajuste</th>
              <th scope="col" className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Acción</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => {
              const status = getStatus(item)
              return (
                <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-center">
                    <span title={status.label} className="text-lg">{status.icon}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">{item.name}</p>
                    {item.category && <p className="text-[10px] text-gray-400">{item.category}</p>}
                    {item.proveedorId && (
                      <p className="text-[10px] text-emerald-600 font-medium truncate max-w-[160px]">
                        🚚 {proveedorName(item.proveedorId)}
                      </p>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${
                    item.stock === 0 ? "text-red-600" : item.stock <= item.minStock ? "text-amber-600" : "text-green-700"
                  }`}>
                    {item.stock}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{item.minStock}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{item.unit}</td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">${item.pricePerUnit}</td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">
                    ${(item.stock * item.pricePerUnit).toFixed(0)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => onAdjustStock(item.id, -1)}
                        className="w-6 h-6 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 text-xs font-bold transition-colors"
                        disabled={item.stock <= 0}
                        aria-label={`Disminuir stock de ${item.name}`}
                      >−</button>
                      <button
                        onClick={() => onAdjustStock(item.id, 1)}
                        className="w-6 h-6 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 text-xs font-bold transition-colors"
                        aria-label={`Aumentar stock de ${item.name}`}
                      >+</button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => onEdit(item)} className="p-1.5 text-gray-400 hover:text-[#108910] hover:bg-green-50 rounded-lg transition-colors" title="Editar" aria-label={`Editar ${item.name}`}>
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onDelete(item.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar" aria-label={`Eliminar ${item.name}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
