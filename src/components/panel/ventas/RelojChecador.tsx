"use client"

import { Check, Clock, Copy, Settings2, Trash2 } from "lucide-react"
import { dateLabel } from "@/lib/panel-utils"
import type { EmpleadosCrud } from "@/hooks/use-ventas-crud"
import type { EmpleadoHoy, FichajesHoy } from "./ventas-shared"

interface RelojChecadorProps {
  crud: EmpleadosCrud
  empleadoCount: number
  empleadosHoy: EmpleadoHoy[]
  fichajesHoy: FichajesHoy
  selectedDate: string
  onCopyHoras: () => void
}

export default function RelojChecador({
  crud,
  empleadoCount,
  empleadosHoy,
  fichajesHoy,
  selectedDate,
  onCopyHoras,
}: RelojChecadorProps) {
  const {
    showReloj,
    empNombre,
    empRol,
    empTarifa,
    empEditId,
    empDeleteId,
    onToggle,
    onNombreChange,
    onRolChange,
    onTarifaChange,
    onSave,
    onCancel,
    onFicharEntrada,
    onFicharSalida,
    onEdit,
    onDeleteClick,
    onCancelDelete,
    onConfirmDelete,
  } = crud
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-[#108910]" />
        <h3 className="text-sm font-semibold text-gray-900">Reloj checador</h3>
        {empleadoCount > 0 && (
          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
            {empleadoCount} empleado{empleadoCount !== 1 ? "s" : ""}
          </span>
        )}
        <button
          onClick={onToggle}
          className="ml-auto flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-lg transition-colors"
          aria-expanded={showReloj}
          aria-label="Mostrar u ocultar reloj checador"
        >
          <Settings2 className="w-3.5 h-3.5" />
          {showReloj ? "Cerrar" : "Gestionar"}
        </button>
      </div>

      {showReloj && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Nombre</label>
              <input
                type="text"
                value={empNombre}
                onChange={(e) => onNombreChange(e.target.value)}
                placeholder={empEditId ? "Editar nombre…" : "Ej. Juan Pérez"}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
                aria-label="Nombre del empleado"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Rol</label>
              <input
                type="text"
                value={empRol}
                onChange={(e) => onRolChange(e.target.value)}
                placeholder="Opcional · Ej. Mesero"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
                aria-label="Rol del empleado"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Tarifa por hora ($)</label>
              <input
                type="number"
                value={empTarifa}
                onChange={(e) => onTarifaChange(e.target.value)}
                min="0"
                placeholder="Ej. 60"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-center focus:outline-none focus:border-[#108910]"
                aria-label="Tarifa por hora del empleado"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onSave}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              {empEditId ? "Guardar cambios" : "Agregar empleado"}
            </button>
            {empEditId && (
              <button onClick={onCancel} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
                Cancelar
              </button>
            )}
          </div>
          {empleadoCount === 0 ? (
            <p className="text-[11px] text-gray-400">Aún no registras empleados. Agrégalos para fichar entradas y salidas.</p>
          ) : (
            <div className="border-t border-gray-100 pt-3">
              <ul className="divide-y divide-gray-50">
                {empleadosHoy.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {e.nombre}
                        {e.abierto && <span className="ml-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">en turno</span>}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {e.rol ? `${e.rol} · ` : ""}hoy {Math.floor(e.minutos / 60)}h {Math.round(e.minutos % 60)}min · ${((e.minutos / 60) * e.tarifa).toFixed(0)}
                      </p>
                    </div>
                    <button
                      onClick={() => onFicharEntrada(e.id)}
                      className="px-2.5 py-1.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                      aria-label={`Fichar entrada de ${e.nombre}`}
                    >
                      ⏱ Entrada
                    </button>
                    <button
                      onClick={() => onFicharSalida(e.id)}
                      disabled={!e.abierto}
                      className="px-2.5 py-1.5 text-[10px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label={`Fichar salida de ${e.nombre}`}
                    >
                      Salida
                    </button>
                    <button
                      onClick={() => onEdit(e)}
                      className="p-1.5 text-gray-400 hover:text-[#108910] rounded-lg hover:bg-emerald-50 transition-colors"
                      title="Editar empleado"
                      aria-label={`Editar a ${e.nombre}`}
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                    {empDeleteId === e.id ? (
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
                        onClick={() => onDeleteClick(e.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                        title="Eliminar empleado"
                        aria-label={`Eliminar a ${e.nombre}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fichajesHoy.rows.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase">Resumen de {dateLabel(selectedDate)}</p>
                <button
                  onClick={onCopyHoras}
                  className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar reporte de horas
                </button>
              </div>
              <ul className="space-y-1.5">
                {fichajesHoy.rows.map((r) => (
                  <li key={r.nombre} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">{r.nombre}{r.rol ? ` · ${r.rol}` : ""}</span>
                    <span className="text-gray-500">
                      {Math.floor(r.minutos / 60)}h {Math.round(r.minutos % 60)}min · ${((r.minutos / 60) * r.tarifa).toFixed(0)}{r.abierto ? " (en curso)" : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                <span className="text-xs font-semibold text-gray-500">Total</span>
                <span className="text-xs font-bold text-gray-800">
                  {Math.floor(fichajesHoy.totalMin / 60)}h {Math.round(fichajesHoy.totalMin % 60)}min · ${fichajesHoy.totalCosto.toFixed(0)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
