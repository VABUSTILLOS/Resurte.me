import { CHANNELS, STATUS_META, fmtTime } from "./comanda-shared"
import type { ComandaRow } from "./comanda-shared"

interface ComandaListProps {
  filtered: ComandaRow[]
  now: number
  onIniciar: (id: string, name: string) => void
  onListo: (id: string, name: string) => void
  onRevertir: (id: string) => void
  mesaNombre: (id?: string) => string
}

export default function ComandaList({ filtered, now, onIniciar, onListo, onRevertir, mesaNombre }: ComandaListProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Platillo</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Cant.</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Canal</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Captura</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Edad</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-400 text-[10px] uppercase tracking-wider">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const chan = CHANNELS.find((ch) => ch.key === (c.entry.channel || "comedor"))
              const elapsedMin = Math.max(1, Math.round((now - c.time) / 60000))
              return (
                <tr key={c.entry.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">{c.entry.dishName}</p>
                    {c.entry.modificadores && c.entry.modificadores.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {c.entry.modificadores.map((m) => (
                          <span key={m.nombre} className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">
                            +{m.nombre}{m.precio > 0 ? ` $${m.precio.toFixed(0)}` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                    {c.entry.mesaId && mesaNombre(c.entry.mesaId) && (
                      <p className="text-[9px] text-emerald-700 font-semibold mt-0.5">🪑 {mesaNombre(c.entry.mesaId)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800">×{c.entry.quantity}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{chan?.icon} {chan?.label}</td>
                  <td className="px-4 py-3 text-center text-gray-500 whitespace-nowrap">{fmtTime(c.time)}</td>
                  <td className="px-4 py-3 text-center text-gray-500 whitespace-nowrap">hace {elapsedMin} min</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            if (s === "en-cocina") onIniciar(c.entry.id, c.entry.dishName)
                            else if (s === "listo") onListo(c.entry.id, c.entry.dishName)
                            else onRevertir(c.entry.id)
                          }}
                          className={`text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors ${
                            c.status === s
                              ? `${STATUS_META[s].bg} ${STATUS_META[s].color}`
                              : "text-gray-400 bg-gray-50 hover:bg-gray-100"
                          }`}
                          aria-label={`${STATUS_META[s].label}: ${c.entry.dishName}`}
                        >
                          {STATUS_META[s].label.replace(/s$/, "")}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
