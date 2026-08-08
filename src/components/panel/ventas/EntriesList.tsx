"use client"

import { Trash2 } from "lucide-react"
import { t } from "@/lib/i18n/es"
import { dateLabel } from "@/lib/panel-utils"
import { PAYMENT_METHODS, SALE_CHANNELS, entryTotal } from "./ventas-shared"
import type { Cliente, SaleEntry } from "./ventas-shared"

interface EntriesListProps {
  showAll: boolean
  entriesCount: number
  dayEntriesCount: number
  units: number
  selectedDateLabel: string
  visibleEntries: SaleEntry[]
  clientes: Cliente[]
  dishCost: (dishId: string) => number
  onAdjustQty: (id: string, delta: number) => void
  onDeleteClick: (id: string) => void
}

export default function EntriesList({
  showAll,
  entriesCount,
  dayEntriesCount,
  units,
  selectedDateLabel,
  visibleEntries,
  clientes,
  dishCost,
  onAdjustQty,
  onDeleteClick,
}: EntriesListProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">
          {showAll ? `Historial completo (${entriesCount})` : `Ventas de ${selectedDateLabel} (${dayEntriesCount})`}
        </h3>
        {!showAll && units > 0 && (
          <span className="text-xs text-gray-400">{units} platillos vendidos</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" aria-label={t("ventas.title")}>
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th scope="col" className="text-left px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Platillo</th>
              <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Cant.</th>
              <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Precio</th>
              <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Costo</th>
              <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Total</th>
              <th scope="col" className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Margen</th>
              <th scope="col" className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Fecha</th>
              <th scope="col" className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Pago</th>
              <th scope="col" className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Canal</th>
              <th scope="col" className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Acción</th>
            </tr>
          </thead>
          <tbody>
            {visibleEntries
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
              .map((e) => {
                const subtotal = e.quantity * e.unitPrice
                const total = entryTotal(e)
                const cost = e.quantity * e.unitCost
                const margin = total - cost
                const currentCost = dishCost(e.dishId)
                const costStale = e.dishId && currentCost > 0 && Math.abs(currentCost - e.unitCost) > 0.01
                return (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-gray-800">{e.dishName}</p>
                        {e.clienteId && (() => {
                          const c = clientes.find((x) => x.id === e.clienteId)
                          return c ? <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full font-medium">👤 {c.nombre}</span> : null
                        })()}
                      </div>
                      <p className="text-[10px] text-gray-400">${e.unitPrice.toFixed(0)} / ${e.unitCost.toFixed(2)}</p>
                      {e.modificadores && e.modificadores.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {e.modificadores.map((m) => (
                            <span key={m.nombre} className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">
                              +{m.nombre}{m.precio > 0 ? ` $${m.precio.toFixed(0)}` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onAdjustQty(e.id, -1)}
                          disabled={e.quantity <= 1}
                          className="w-5 h-5 rounded bg-red-50 text-red-500 hover:bg-red-100 text-xs font-bold transition-colors disabled:opacity-40"
                          aria-label={`Reducir cantidad de ${e.dishName}`}
                        >−</button>
                        <span className="w-6 text-center font-bold text-gray-800">{e.quantity}</span>
                        <button
                          onClick={() => onAdjustQty(e.id, 1)}
                          className="w-5 h-5 rounded bg-green-50 text-green-600 hover:bg-green-100 text-xs font-bold transition-colors"
                          aria-label={`Aumentar cantidad de ${e.dishName}`}
                        >+</button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 font-medium">${e.unitPrice.toFixed(0)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">${cost.toFixed(0)}
                      {costStale && (
                        <span
                          className="block text-[9px] text-amber-600 font-semibold mt-0.5 cursor-help"
                          title={`El costo registrado fue $${e.unitCost.toFixed(2)}/u; hoy el platillo cuesta $${currentCost.toFixed(2)}/u. El margen usa el costo congelado de la venta.`}
                        >
                          ⚠ costo actualizado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.discount ? (
                        <>
                          <p className="text-[10px] text-gray-400 line-through">${subtotal.toFixed(0)}</p>
                          <p className="font-bold text-red-600">${total.toFixed(0)}</p>
                          <p className="text-[9px] text-red-400 font-semibold">
                            {e.discount.type === "porcentaje" ? `${e.discount.value}%` : `-$${e.discount.value.toFixed(0)}`} desc.
                          </p>
                        </>
                      ) : (
                        <p className="font-bold text-gray-900">${total.toFixed(0)}</p>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                      ${margin.toFixed(0)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500 whitespace-nowrap">{dateLabel(e.date)}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {(() => {
                        const m = PAYMENT_METHODS.find((p) => p.key === (e.paymentMethod || "efectivo"))
                        return (
                          <span className="text-[10px] text-gray-500" title={m?.label}>
                            {m?.icon} {m?.label}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {(() => {
                        const c = SALE_CHANNELS.find((ch) => ch.key === (e.channel || "comedor"))
                        return (
                          <span className="text-[10px] text-gray-500" title={c?.label}>
                            {c?.icon} {c?.label}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => onDeleteClick(e.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar venta"
                          aria-label={`Eliminar venta de ${e.dishName}`}
                        >
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
      {visibleEntries.length === 0 && (
        <div className="text-center py-10">
          <p className="text-xs text-gray-400">No hay ventas para mostrar.</p>
        </div>
      )}
    </div>
  )
}
