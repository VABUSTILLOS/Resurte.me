import { ChevronDown, ChevronUp, Plus, Trash2, Truck } from "lucide-react"
import type { InventoryItem, Proveedor } from "./inventario-shared"

interface Props {
  proveedores: Proveedor[]
  items: InventoryItem[]
  showSuppliers: boolean
  onToggle: () => void
  supplierForm: { nombre: string; contacto: string; telefono: string }
  onFormChange: (field: "nombre" | "contacto" | "telefono", value: string) => void
  onAdd: () => void
  onDelete: (id: string) => void
}

export default function SuppliersCatalog({
  proveedores,
  items,
  showSuppliers,
  onToggle,
  supplierForm,
  onFormChange,
  onAdd,
  onDelete,
}: Props) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
      <button onClick={onToggle} className="flex items-center justify-between w-full text-left">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-[#108910]" />
          <h3 className="font-bold text-gray-900 text-sm">Proveedores ({proveedores.length})</h3>
          <p className="text-[10px] text-gray-400 hidden sm:block">Asigna un proveedor a cada producto para agrupar tus órdenes</p>
        </div>
        {showSuppliers ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {showSuppliers && (
        <div className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2">
            <input
              type="text"
              value={supplierForm.nombre}
              onChange={(e) => onFormChange("nombre", e.target.value)}
              placeholder="Nombre del proveedor"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]"
              aria-label="Nombre del proveedor"
            />
            <input
              type="text"
              value={supplierForm.contacto}
              onChange={(e) => onFormChange("contacto", e.target.value)}
              placeholder="Contacto (opcional)"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]"
              aria-label="Contacto del proveedor"
            />
            <input
              type="text"
              value={supplierForm.telefono}
              onChange={(e) => onFormChange("telefono", e.target.value)}
              placeholder="Teléfono (opcional)"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]"
              aria-label="Teléfono del proveedor"
            />
            <button
              onClick={onAdd}
              disabled={!supplierForm.nombre.trim()}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar
            </button>
          </div>
          {proveedores.length === 0 && (
            <p className="text-[10px] text-gray-400">
              Agrega tus proveedores (p. ej. “Distribuidora Lácteos” o “Carnicería El Norte”) para después asignarlos a cada producto.
            </p>
          )}
          {proveedores.length > 0 && (
            <div className="space-y-1.5 mt-3">
              {proveedores.map((p) => {
                const assigned = items.filter((i) => i.proveedorId === p.id).length
                return (
                  <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-700 truncate">{p.nombre}</p>
                      <p className="text-[10px] text-gray-400">
                        {[p.contacto, p.telefono].filter(Boolean).join(" · ") || "Sin contacto"}
                        {assigned > 0 && ` · ${assigned} producto${assigned > 1 ? "s" : ""}`}
                      </p>
                    </div>
                    <button
                      onClick={() => onDelete(p.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar proveedor"
                      aria-label={`Eliminar proveedor ${p.nombre}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
