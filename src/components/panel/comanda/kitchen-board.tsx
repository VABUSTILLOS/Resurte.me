import { Play, Check, Undo2 } from "lucide-react"
import { STATUS_META, CHANNELS, fmtTime } from "./comanda-shared"
import type { StatusKey, ComandaRow } from "./comanda-shared"

interface KitchenBoardProps {
  byStatus: Record<StatusKey, ComandaRow[]>
  now: number
  onIniciar: (id: string, name: string) => void
  onListo: (id: string, name: string) => void
  onRevertir: (id: string) => void
  mesaNombre: (id?: string) => string
}

export default function KitchenBoard({ byStatus, now, onIniciar, onListo, onRevertir, mesaNombre }: KitchenBoardProps) {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {(Object.keys(STATUS_META) as StatusKey[]).map((status) => {
        const meta = STATUS_META[status]
        const cards = byStatus[status]
        return (
          <div key={status} className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
            <div className={`flex items-center gap-2 px-4 py-3 border-b border-gray-100 ${meta.bg}`}>
              <span className={`text-xs font-bold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
                {cards.length}
              </span>
            </div>
            <div className="flex-1 p-3 space-y-3 min-h-[160px]">
              {cards.length === 0 ? (
                <p className="text-xs text-gray-300 text-center py-8">Sin comandas</p>
              ) : (
                cards.map((c) => {
                  const chan = CHANNELS.find((ch) => ch.key === (c.entry.channel || "comedor"))
                  const elapsedMin = Math.max(1, Math.round((now - c.time) / 60000))
                  const prodMin =
                    c.status === "listo" && c.readyAt
                      ? Math.max(0, Math.round((c.readyAt - (c.startedAt || c.time)) / 60000))
                      : null
                  return (
                    <div
                      key={c.entry.id}
                      className={`bg-white border rounded-xl p-3 shadow-sm ${status === "en-cocina" ? "border-blue-200 ring-1 ring-blue-100" : status === "listo" ? "border-green-200" : "border-amber-200"}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-bold text-gray-900 text-sm leading-tight">{c.entry.dishName}</p>
                        <span className="text-lg font-extrabold text-gray-700 shrink-0">×{c.entry.quantity}</span>
                      </div>
                      {c.entry.modificadores && c.entry.modificadores.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {c.entry.modificadores.map((m) => (
                            <span key={m.nombre} className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">
                              +{m.nombre}{m.precio > 0 ? ` $${m.precio.toFixed(0)}` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                          {chan?.icon} {chan?.label}
                        </span>
                        {c.entry.mesaId && mesaNombre(c.entry.mesaId) && (
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full font-semibold">
                            🪑 {mesaNombre(c.entry.mesaId)}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">🕐 {fmtTime(c.time)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-gray-400 mb-2">
                        <span>
                          {c.status === "listo"
                            ? prodMin != null && `Producción: ${prodMin} min`
                            : `Esperando ${elapsedMin} min`}
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        {c.status === "pendiente" && (
                          <button
                            onClick={() => onIniciar(c.entry.id, c.entry.dishName)}
                            className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 py-1.5 rounded-lg transition-colors"
                            title={`Iniciar ${c.entry.dishName} en cocina`}
                            aria-label={`Iniciar comanda de ${c.entry.dishName}`}
                          >
                            <Play className="w-3.5 h-3.5" />
                            Iniciar
                          </button>
                        )}
                        {c.status === "en-cocina" && (
                          <>
                            <button
                              onClick={() => onListo(c.entry.id, c.entry.dishName)}
                              className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 py-1.5 rounded-lg transition-colors"
                              title={`Marcar ${c.entry.dishName} como lista`}
                              aria-label={`Marcar comanda de ${c.entry.dishName} como lista`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              Listo
                            </button>
                            <button
                              onClick={() => onRevertir(c.entry.id)}
                              className="flex items-center justify-center text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
                              title="Volver a pendiente"
                              aria-label="Volver comanda a pendiente"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {c.status === "listo" && (
                          <button
                            onClick={() => onRevertir(c.entry.id)}
                            className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 py-1.5 rounded-lg transition-colors"
                            title="Volver a pendiente"
                            aria-label={`Volver comanda de ${c.entry.dishName} a pendiente`}
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                            Reabrir
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
