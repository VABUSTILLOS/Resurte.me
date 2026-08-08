"use client"

import type { SeasonTransfer } from "./planificador-shared"

interface SeasonTransfersProps {
  transfers: SeasonTransfer[]
  onAccept: () => void
  onDismiss: () => void
}

// Banner para productos de temporada pendientes de agregar al pedido.
export default function SeasonTransfers({ transfers, onAccept, onDismiss }: SeasonTransfersProps) {
  return (
    <div className="bg-emerald-50 rounded-2xl border-2 border-emerald-300 p-4 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">🥬</span>
        <h3 className="font-semibold text-emerald-800">Productos de temporada por agregar</h3>
        <span className="text-[10px] bg-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">De temporada</span>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {transfers.map((t, i) => (
          <span key={i} className="text-xs bg-white border border-emerald-200 rounded-lg px-2.5 py-1 text-emerald-700 font-medium">
            {t.icon ? `${t.icon} ` : ""}{t.name}: {t.qty ?? t.qtyKg} {t.unit}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onAccept}
          className="text-xs font-semibold bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 transition-colors"
        >
          Agregar como cantidades manuales
        </button>
        <button
          onClick={onDismiss}
          className="text-xs font-medium text-gray-500 border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
        >
          Descartar
        </button>
      </div>
    </div>
  )
}
