import { Lightbulb, TrendingDown } from "lucide-react"
import { WASTE_CATEGORIES, TIPS } from "./mermas-shared"

interface TipsPanelProps {
  expandedTip: string | null
  onToggleTip: (key: string) => void
}

export default function TipsPanel({ expandedTip, onToggleTip }: TipsPanelProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-gray-900">Tips para reducir merma</h3>
        </div>
      </div>
      <div className="divide-y divide-gray-50">
        {WASTE_CATEGORIES.map((cat) => {
          const tips = TIPS[cat.key] || ["Usa el sistema PEPS en tu almacén.", "Revisa la calidad al recibir mercancía de Resurte.me."]
          return (
            <div key={cat.key}>
              <button
                onClick={() => onToggleTip(cat.key)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <span>{cat.icon}</span>
                  {cat.label}
                  <span className="text-xs text-gray-400">(~{cat.avgWastePercent}% merma típica)</span>
                </span>
                <TrendingDown className="w-4 h-4 text-gray-400" />
              </button>
              {expandedTip === cat.key && (
                <div className="px-4 pb-4 space-y-2">
                  {tips.map((tip, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm text-gray-500">
                      <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
