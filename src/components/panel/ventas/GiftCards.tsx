"use client"

import { Copy, CreditCard, Gift, Settings2 } from "lucide-react"
import type { TarjetasCrud } from "@/hooks/use-ventas-crud"

interface GiftCardsProps {
  crud: TarjetasCrud
}

export default function GiftCards({ crud }: GiftCardsProps) {
  const { tarjetas, showTarjetas, tarjetaMonto, onToggle, onMontoChange, onEmitir, onCopyCodigo } = crud
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <CreditCard className="w-4 h-4 text-[#108910]" />
        <h3 className="text-sm font-semibold text-gray-900">Tarjetas de regalo</h3>
        {tarjetas.length > 0 && (
          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
            {tarjetas.length} tarjeta{tarjetas.length !== 1 ? "s" : ""}
          </span>
        )}
        <button
          onClick={onToggle}
          className="ml-auto flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-lg transition-colors"
          aria-expanded={showTarjetas}
          aria-label="Mostrar u ocultar tarjetas de regalo"
        >
          <Settings2 className="w-3.5 h-3.5" />
          {showTarjetas ? "Cerrar" : "Gestionar"}
        </button>
      </div>

      {showTarjetas && (
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="w-40">
              <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Monto ($)</label>
              <input
                type="number"
                value={tarjetaMonto}
                onChange={(e) => onMontoChange(e.target.value)}
                min="1"
                placeholder="Ej. 500"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-center focus:outline-none focus:border-[#108910]"
                aria-label="Monto de la tarjeta de regalo"
              />
            </div>
            <button
              onClick={onEmitir}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#108910] text-white text-xs font-semibold rounded-xl hover:bg-green-800 transition-colors"
            >
              <Gift className="w-3.5 h-3.5" />
              Emitir tarjeta
            </button>
          </div>
          {tarjetas.length === 0 ? (
            <p className="text-[11px] text-gray-400">Aún no emites tarjetas de regalo. Al emitir una, podrás usarla como método de pago “Regalo” en tus ventas.</p>
          ) : (
            <div className="border-t border-gray-100 pt-3">
              <ul className="divide-y divide-gray-50">
                {tarjetas.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-800 font-mono truncate">{t.codigo}</p>
                      <p className="text-[10px] text-gray-400">Emitida el {new Date(t.creada).toLocaleDateString("es-MX")}</p>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ${t.estado === "activa" ? "text-emerald-700" : "text-gray-400"}`}>
                      ${t.saldo.toFixed(0)} / ${t.monto.toFixed(0)}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${t.estado === "activa" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                      {t.estado === "activa" ? "Activa" : "Agotada"}
                    </span>
                    <button
                      onClick={() => onCopyCodigo(t.codigo)}
                      className="p-1.5 text-gray-400 hover:text-[#108910] rounded-lg hover:bg-emerald-50 transition-colors shrink-0"
                      title="Copiar código"
                      aria-label={`Copiar código de ${t.codigo}`}
                    >
                      <Copy className="w-4 h-4" />
                    </button>
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
