"use client"

import { Check, Copy, Gift, Settings2, Trash2, Users } from "lucide-react"
import type { Cliente } from "./ventas-shared"

interface FrequentCustomersProps {
  clientes: Cliente[]
  showClientes: boolean
  clienteName: string
  clientePhone: string
  clientePts: string
  clienteEditId: string | null
  clienteDeleteId: string | null
  puntosTasa: number
  puntosCanje: number
  tipoCambio: number
  onCopy: () => void
  onToggle: () => void
  onNameChange: (v: string) => void
  onPhoneChange: (v: string) => void
  onPtsChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  onEdit: (c: Cliente) => void
  onDeleteClick: (id: string) => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onPuntosTasaChange: (v: number) => void
  onPuntosCanjeChange: (v: number) => void
  onTipoCambioChange: (v: number) => void
}

export default function FrequentCustomers({
  clientes,
  showClientes,
  clienteName,
  clientePhone,
  clientePts,
  clienteEditId,
  clienteDeleteId,
  puntosTasa,
  puntosCanje,
  tipoCambio,
  onCopy,
  onToggle,
  onNameChange,
  onPhoneChange,
  onPtsChange,
  onSave,
  onCancel,
  onEdit,
  onDeleteClick,
  onCancelDelete,
  onConfirmDelete,
  onPuntosTasaChange,
  onPuntosCanjeChange,
  onTipoCambioChange,
}: FrequentCustomersProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-[#108910]" />
        <h3 className="text-sm font-semibold text-gray-900">Clientes frecuentes</h3>
        {clientes.length > 0 && (
          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
            {clientes.length} cliente{clientes.length !== 1 ? "s" : ""}
          </span>
        )}
        <button
          onClick={onCopy}
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
          title="Copiar lista de clientes"
          aria-label="Copiar clientes frecuentes"
        >
          <Copy className="w-3.5 h-3.5" />
          Copiar clientes
        </button>
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-lg transition-colors"
          aria-expanded={showClientes}
          aria-label="Mostrar u ocultar clientes frecuentes"
        >
          <Settings2 className="w-3.5 h-3.5" />
          {showClientes ? "Cerrar" : "Gestionar"}
        </button>
      </div>

      {showClientes && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Nombre</label>
              <input
                type="text"
                value={clienteName}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder={clienteEditId ? "Editar nombre…" : "Ej. María López"}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
                aria-label="Nombre del cliente"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Teléfono</label>
              <input
                type="text"
                value={clientePhone}
                onChange={(e) => onPhoneChange(e.target.value)}
                placeholder="Opcional"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
                aria-label="Teléfono del cliente"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Puntos iniciales</label>
              <input
                type="number"
                value={clientePts}
                onChange={(e) => onPtsChange(e.target.value)}
                min="0"
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-center focus:outline-none focus:border-[#108910]"
                aria-label="Puntos iniciales del cliente"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onSave}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              {clienteEditId ? "Guardar cambios" : "Agregar cliente"}
            </button>
            {clienteEditId && (
              <button onClick={onCancel} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
                Cancelar
              </button>
            )}
            <div className="ml-auto flex flex-wrap gap-3 items-end">
              <label className="block">
                <span className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">$ por punto (tasa)</span>
                <input
                  type="number"
                  value={puntosTasa}
                  onChange={(e) => onPuntosTasaChange(Math.max(1, parseFloat(e.target.value) || 0))}
                  min="1"
                  className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-[#108910]"
                  aria-label="Pesos por punto al ganar"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Valor por punto (canje)</span>
                <input
                  type="number"
                  value={puntosCanje}
                  onChange={(e) => onPuntosCanjeChange(Math.max(0, parseFloat(e.target.value) || 0))}
                  min="0"
                  step="0.5"
                  className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-[#108910]"
                  aria-label="Pesos por punto al canjear"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Tipo de cambio MXN/USD</span>
                <input
                  type="number"
                  value={tipoCambio}
                  onChange={(e) => onTipoCambioChange(Math.max(0, parseFloat(e.target.value) || 0))}
                  min="0"
                  step="0.01"
                  className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:border-[#108910]"
                  aria-label="Tipo de cambio MXN a USD"
                />
              </label>
            </div>
          </div>
          {clientes.length === 0 ? (
            <p className="text-[11px] text-gray-400">Aún no registras clientes frecuentes. Agrega el primero para empezar a acumular puntos por compra.</p>
          ) : (
            <div className="border-t border-gray-100 pt-3">
              <ul className="divide-y divide-gray-50">
                {clientes.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 truncate">{c.nombre}</p>
                      <p className="text-[10px] text-gray-400">
                        {c.telefono ? `${c.telefono} · ` : ""}{c.visitas} visita{c.visitas !== 1 ? "s" : ""} · ${c.totalGastado.toFixed(0)} gastados
                      </p>
                    </div>
                    <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${c.puntos >= 500 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                      <Gift className="w-3.5 h-3.5" />
                      {c.puntos} pts
                    </span>
                    <button
                      onClick={() => onEdit(c)}
                      className="p-1.5 text-gray-400 hover:text-[#108910] rounded-lg hover:bg-emerald-50 transition-colors"
                      title="Editar cliente"
                      aria-label={`Editar a ${c.nombre}`}
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                    {clienteDeleteId === c.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={onConfirmDelete}
                          className="px-2 py-1 text-[10px] font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600"
                        >
                          Sí
                        </button>
                        <button
                          onClick={onCancelDelete}
                          className="px-2 py-1 text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onDeleteClick(c.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                        title="Eliminar cliente"
                        aria-label={`Eliminar a ${c.nombre}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
