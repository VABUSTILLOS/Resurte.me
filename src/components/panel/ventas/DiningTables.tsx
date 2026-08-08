"use client"

import { Check, Settings2, Trash2, UtensilsCrossed } from "lucide-react"
import type { MesasCrud } from "@/hooks/use-ventas-crud"

interface DiningTablesProps {
  crud: MesasCrud
  mesasOcupadasHoy: Map<string, number>
  now: number
}

export default function DiningTables({ crud, mesasOcupadasHoy, now }: DiningTablesProps) {
  const {
    mesas,
    showMesas,
    mesaName,
    mesaCapacidad,
    mesaZona,
    mesaEditId,
    mesaDeleteId,
    onToggle,
    onNameChange,
    onCapacidadChange,
    onZonaChange,
    onSave,
    onCancel,
    onEdit,
    onDeleteClick,
    onCancelDelete,
    onConfirmDelete,
  } = crud
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <UtensilsCrossed className="w-4 h-4 text-[#0E7A0E]" />
        <h3 className="text-sm font-semibold text-gray-900">Mesas del salón</h3>
        {mesas.length > 0 && (
          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
            {mesasOcupadasHoy.size} ocupada{mesasOcupadasHoy.size !== 1 ? "s" : ""} de {mesas.length}
          </span>
        )}
        <button
          onClick={onToggle}
          className="ml-auto flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-lg transition-colors"
          aria-expanded={showMesas}
          aria-label="Mostrar u ocultar mesas del salón"
        >
          <Settings2 className="w-3.5 h-3.5" />
          {showMesas ? "Cerrar" : "Gestionar"}
        </button>
      </div>

      {showMesas && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Nombre</label>
              <input
                type="text"
                value={mesaName}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder={mesaEditId ? "Editar nombre…" : "Ej. Mesa 3"}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#0E7A0E]"
                aria-label="Nombre de la mesa"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Capacidad</label>
              <input
                type="number"
                value={mesaCapacidad}
                onChange={(e) => onCapacidadChange(e.target.value)}
                min="1"
                placeholder="4"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-center focus:outline-none focus:border-[#0E7A0E]"
                aria-label="Capacidad de la mesa"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Zona</label>
              <input
                type="text"
                value={mesaZona}
                onChange={(e) => onZonaChange(e.target.value)}
                placeholder="Opcional · Ej. Terraza"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#0E7A0E]"
                aria-label="Zona de la mesa"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onSave}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#0E7A0E] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              {mesaEditId ? "Guardar cambios" : "Agregar mesa"}
            </button>
            {mesaEditId && (
              <button onClick={onCancel} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
                Cancelar
              </button>
            )}
          </div>
          {mesas.length === 0 ? (
            <p className="text-[11px] text-gray-400">Aún no registras mesas. Agrégalas para asignarlas a tus ventas y ver la ocupación del día.</p>
          ) : (
            <div className="border-t border-gray-100 pt-3">
              <ul className="divide-y divide-gray-50">
                {mesas.map((m) => {
                  const firstTs = mesasOcupadasHoy.get(m.id)
                  const ocupada = firstTs != null
                  const mins = ocupada ? Math.max(1, Math.round((now - firstTs) / 60000)) : 0
                  return (
                    <li key={m.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">🪑 {m.nombre}</p>
                        <p className="text-[10px] text-gray-400">
                          {m.zona ? `${m.zona} · ` : ""}Cap. {m.capacidad}
                        </p>
                      </div>
                      {ocupada ? (
                        <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full shrink-0">
                          Ocupada · {Math.floor(mins / 60)}h {mins % 60}min
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full shrink-0">
                          Libre
                        </span>
                      )}
                      <button
                        onClick={() => onEdit(m)}
                        className="p-1.5 text-gray-400 hover:text-[#0E7A0E] rounded-lg hover:bg-emerald-50 transition-colors"
                        title="Editar mesa"
                        aria-label={`Editar mesa ${m.nombre}`}
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                      {mesaDeleteId === m.id ? (
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
                          onClick={() => onDeleteClick(m.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          title="Eliminar mesa"
                          aria-label={`Eliminar mesa ${m.nombre}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
