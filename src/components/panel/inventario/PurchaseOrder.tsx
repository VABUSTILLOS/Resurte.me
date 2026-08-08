import { ChevronDown, ChevronUp, Copy, Layers, MessageCircle, ShoppingCart, Users } from "lucide-react"
import type { InventoryItem, ItemStatus, OrderGroup, OrderItem } from "./inventario-shared"

interface Props {
  orderExpanded: boolean
  onToggleExpanded: () => void
  groupBySupplier: boolean
  onToggleGroupBy: () => void
  projectedOrder: OrderItem[]
  proveedoresCount: number
  groupedOrder: OrderGroup[]
  getStatus: (item: InventoryItem) => ItemStatus
  proveedorName: (id?: string) => string
  onCopyOrder: () => void
  onCopyGroup: (group: OrderGroup) => void
  onSendWhatsApp: (list: OrderItem[], nombreProveedor: string) => void
  onToast: (msg: string, type: "success" | "warning" | "error") => void
}

export default function PurchaseOrder({
  orderExpanded,
  onToggleExpanded,
  groupBySupplier,
  onToggleGroupBy,
  projectedOrder,
  proveedoresCount,
  groupedOrder,
  getStatus,
  proveedorName,
  onCopyOrder,
  onCopyGroup,
  onSendWhatsApp,
  onToast,
}: Props) {
  if (projectedOrder.length === 0) return null
  const totalCost = projectedOrder.reduce((s, i) => s + i.cost, 0)

  return (
    <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-5">
      <button onClick={onToggleExpanded} className="flex items-center justify-between w-full text-left">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-[#108910]" />
          <h3 className="font-bold text-gray-900 text-sm">Orden de compra sugerida ({projectedOrder.length} productos)</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[#108910]">${totalCost.toFixed(0)}</span>
          {orderExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {orderExpanded && (
        <div className="mt-4">
          {proveedoresCount > 0 && groupedOrder.length > 1 && (
            <div className="flex items-center gap-2 mb-4">
              <label className="flex items-center gap-2 text-[11px] text-gray-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={groupBySupplier}
                  onChange={onToggleGroupBy}
                  className="accent-[#108910]"
                />
                <span className="font-semibold text-gray-700">Agrupar por proveedor</span>
              </label>
              <Layers className="w-3.5 h-3.5 text-gray-400" />
            </div>
          )}

          {groupBySupplier && proveedoresCount > 0 ? (
            <div className="space-y-4 mb-4">
              {groupedOrder.map((group) => (
                <div key={group.proveedorId || "sin"} className="rounded-xl border border-gray-100 overflow-hidden">
                  <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-[#108910]" />
                      <span className="text-xs font-bold text-gray-700">{group.nombre}</span>
                      <span className="text-[9px] text-gray-400">{group.items.length} producto{group.items.length > 1 ? "s" : ""}</span>
                    </div>
                    <span className="text-xs font-bold text-[#108910]">
                      ${group.items.reduce((s, i) => s + i.cost, 0).toFixed(0)}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {group.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between px-3 py-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span>{item.id.startsWith("proj-") ? "🔍" : getStatus(item).icon}</span>
                          <span className="font-semibold text-gray-700 truncate">{item.name}</span>
                          {item.id.startsWith("proj-") && (
                            <span className="text-[9px] bg-cyan-50 text-cyan-600 px-1.5 py-0.5 rounded-full font-medium">Proyección</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-gray-500">Comprar {item.toBuy} {item.unit}</span>
                          <span className="font-bold text-[#108910]">${item.cost.toFixed(0)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100">
                    <button
                      onClick={() => {
                        onCopyGroup(group)
                        onToast(`Orden de ${group.nombre} copiada`, "success")
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 text-gray-700 text-[10px] font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                      aria-label={`Copiar orden de ${group.nombre}`}
                    >
                      <Copy className="w-3 h-3" /> Copiar
                    </button>
                    <button
                      onClick={() => onSendWhatsApp(group.items, group.nombre)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 text-green-700 text-[10px] font-semibold rounded-lg hover:bg-green-100 transition-colors"
                      aria-label={`Enviar orden de ${group.nombre} por WhatsApp`}
                    >
                      <MessageCircle className="w-3 h-3" /> WhatsApp
                    </button>
                    <span className="ml-auto text-[10px] text-gray-400">{group.nombre}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {projectedOrder.map((item) => (
                <div key={item.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span>{item.id.startsWith("proj-") ? "🔍" : getStatus(item).icon}</span>
                    <span className="font-semibold text-gray-700 truncate">{item.name}</span>
                    {item.id.startsWith("proj-") && (
                      <span className="text-[9px] bg-cyan-50 text-cyan-600 px-1.5 py-0.5 rounded-full font-medium">Proyección</span>
                    )}
                    {item.proveedorId && (
                      <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium hidden sm:inline">
                        {proveedorName(item.proveedorId)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-gray-500">Comprar {item.toBuy} {item.unit}</span>
                    <span className="font-bold text-[#108910]">${item.cost.toFixed(0)}</span>
                    <a href="https://resurte.me" target="_blank" rel="noopener noreferrer"
                      className="text-[10px] bg-[#108910] text-white px-2 py-0.5 rounded-full font-medium hover:bg-green-800 transition-colors">
                      Comprar
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 pt-3 border-t border-gray-100 flex-wrap">
            <button onClick={onCopyOrder}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-200 transition-colors">
              <Copy className="w-3.5 h-3.5" /> Copiar lista
            </button>
            <button
              onClick={() => onSendWhatsApp(projectedOrder, "general")}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 text-xs font-semibold rounded-xl hover:bg-green-100 transition-colors"
              aria-label="Enviar orden de compra por WhatsApp"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Enviar por WhatsApp
            </button>
            <p className="text-[10px] text-gray-400">Pega en WhatsApp o notas</p>
            <span className="ml-auto text-xs font-bold text-gray-700">Total: ${totalCost.toFixed(0)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
