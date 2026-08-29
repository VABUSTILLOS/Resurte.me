import { CHANNELS } from "./comanda-shared"
import type { ComandaRow } from "./comanda-shared"
import { t } from "@/lib/i18n/es"

interface ChannelFiltersProps {
  channelFilter: string
  onChannelFilterChange: (c: string) => void
  mesaFilter: string
  onMesaFilterChange: (m: string) => void
  comandas: ComandaRow[]
  mesasOcupadas: { id: string; nombre: string }[]
}

export default function ChannelFilters({
  channelFilter, onChannelFilterChange, mesaFilter, onMesaFilterChange, comandas, mesasOcupadas,
}: ChannelFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <button
        onClick={() => onChannelFilterChange("todos")}
        className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
          channelFilter === "todos" ? "bg-gray-900 text-white" : "bg-white text-gray-500 border border-gray-100 hover:bg-gray-50"
        }`}
      >
        {t("comanda.allChannels")}
      </button>
      {CHANNELS.map((c) => {
        const count = comandas.filter((f) => (f.entry.channel || "comedor") === c.key).length
        const active = channelFilter === c.key
        return (
          <button
            key={c.key}
            onClick={() => onChannelFilterChange(active ? "todos" : c.key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              active ? "bg-gray-900 text-white" : "bg-white text-gray-500 border border-gray-100 hover:bg-gray-50"
            }`}
            aria-pressed={active}
          >
            {c.icon} {c.label}
            {count > 0 && <span className={`ml-1.5 ${active ? "text-white/70" : "text-gray-400"}`}>{count}</span>}
          </button>
        )
      })}
      {mesasOcupadas.length > 0 && (
        <select
          value={mesaFilter}
          onChange={(e) => onMesaFilterChange(e.target.value)}
          className="ml-2 text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 bg-white text-gray-600 focus:outline-none focus:border-[#0E7A0E]"
          aria-label={t("comanda.mesaFilterAria")}
        >
          <option value="todas">{t("comanda.allMesas")}</option>
          {mesasOcupadas.map((m) => (
            <option key={m.id} value={m.id}>🪑 {m.nombre}</option>
          ))}
        </select>
      )}
    </div>
  )
}
