import { X } from "lucide-react"
import type { Proveedor } from "./inventario-shared"

interface Props {
  showForm: boolean
  editingId: string | null
  formName: string
  setFormName: (v: string) => void
  formStock: string
  setFormStock: (v: string) => void
  formMinStock: string
  setFormMinStock: (v: string) => void
  formUnit: string
  setFormUnit: (v: string) => void
  formPrice: string
  setFormPrice: (v: string) => void
  formCategory: string
  setFormCategory: (v: string) => void
  formProveedorId: string
  setFormProveedorId: (v: string) => void
  proveedores: Proveedor[]
  onCancel: () => void
  onSave: () => void
}

export default function AddEditModal({
  showForm,
  editingId,
  formName,
  setFormName,
  formStock,
  setFormStock,
  formMinStock,
  setFormMinStock,
  formUnit,
  setFormUnit,
  formPrice,
  setFormPrice,
  formCategory,
  setFormCategory,
  formProveedorId,
  setFormProveedorId,
  proveedores,
  onCancel,
  onSave,
}: Props) {
  if (!showForm) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">{editingId ? "Editar producto" : "Agregar producto"}</h3>
          <button
            onClick={onCancel}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
            aria-label="Cerrar formulario"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Nombre</label>
            <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
              placeholder="Ej: Harina de trigo"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Stock actual</label>
              <input type="number" value={formStock} onChange={(e) => setFormStock(e.target.value)} min="0"
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Stock mínimo</label>
              <input type="number" value={formMinStock} onChange={(e) => setFormMinStock(e.target.value)} min="1"
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Unidad</label>
              <select value={formUnit} onChange={(e) => setFormUnit(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]">
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="L">L</option>
                <option value="ml">ml</option>
                <option value="pieza">pieza</option>
                <option value="caja">caja</option>
                <option value="paquete">paquete</option>
                <option value="litro">litro</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Precio por unidad</label>
              <input type="number" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} min="0" step="0.01"
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">
              Categoría <span className="text-gray-300">(opcional)</span>
            </label>
            <input type="text" value={formCategory} onChange={(e) => setFormCategory(e.target.value)}
              placeholder="Ej: Lácteos"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910]" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">
              Proveedor <span className="text-gray-300">(opcional)</span>
            </label>
            <select value={formProveedorId} onChange={(e) => setFormProveedorId(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-[#108910] bg-white"
              aria-label="Proveedor del producto">
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            {proveedores.length === 0 && (
              <p className="text-[10px] text-gray-400 mt-1">
                Agrega proveedores en la sección “Proveedores” de esta página para agrupar tus órdenes de compra.
              </p>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onCancel}
              className="flex-1 px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors font-medium">
              Cancelar
            </button>
            <button onClick={onSave} disabled={!formName.trim()}
              className="flex-1 px-4 py-2 text-sm text-white bg-[#108910] rounded-xl hover:bg-green-800 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
              {editingId ? "Guardar cambios" : "Agregar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
