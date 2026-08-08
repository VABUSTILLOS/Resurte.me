import { CAUSAS } from "./mermas-shared"

interface WasteEntryItem {
  amountKg: number
  costPerKg: number
  cause: string
}

interface TopCausesProps {
  entries: WasteEntryItem[]
  totalLoss: number
}

export default function TopCauses({ entries, totalLoss }: TopCausesProps) {
  const byCause = new Map<string, number>()
  entries.forEach((e) => {
    const key = e.cause || "otro"
    byCause.set(key, (byCause.get(key) || 0) + e.amountKg * e.costPerKg)
  })
  const sorted = Array.from(byCause.entries()).sort((a, b) => b[1] - a[1])
  const topCause = sorted[0]
  const topCauseData = CAUSAS.find((c) => c.key === topCause?.[0])

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">🎯</span>
        <h3 className="font-semibold text-gray-900">Causa principal de merma</h3>
      </div>
      {topCause && topCauseData ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{topCauseData.icon}</span>
            <div>
              <p className="text-base font-bold text-gray-800">{topCauseData.label}</p>
              <p className="text-sm text-red-600 font-semibold">${topCause[1].toFixed(2)} ({((topCause[1] / totalLoss) * 100).toFixed(0)}% del total)</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sorted.map(([key, amount]) => {
              const d = CAUSAS.find((c) => c.key === key)
              const pct = totalLoss > 0 ? ((amount / totalLoss) * 100).toFixed(0) : 0
              return (
                <span key={key} className="text-[10px] px-2 py-1 rounded-lg bg-gray-100 text-gray-600">
                  {d?.icon} {d?.label}: {pct}%
                </span>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-400">Sin datos suficientes para determinar la causa principal.</p>
      )}
    </div>
  )
}
