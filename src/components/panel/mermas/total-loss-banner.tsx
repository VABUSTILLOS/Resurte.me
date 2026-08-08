import { DollarSign } from "lucide-react"

interface TotalLossBannerProps {
  totalLoss: number
  entryCount: number
}

export default function TotalLossBanner({ totalLoss, entryCount }: TotalLossBannerProps) {
  const level = totalLoss > 5000 ? "high" : totalLoss > 1000 ? "mid" : "low"
  const styles = {
    high: "bg-red-50 border-red-200",
    mid: "bg-amber-50 border-amber-200",
    low: "bg-green-50 border-green-200",
  }[level]
  const iconStyles = {
    high: "bg-red-100 text-red-600",
    mid: "bg-amber-100 text-amber-600",
    low: "bg-green-100 text-green-600",
  }[level]
  const textStyles = {
    high: "text-red-700",
    mid: "text-amber-700",
    low: "text-green-700",
  }[level]

  return (
    <div className={`rounded-2xl p-6 mb-4 ${styles}`}>
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconStyles}`}>
          <DollarSign className={`w-6 h-6 ${textStyles}`} />
        </div>
        <div>
          <p className="text-sm text-gray-500">Pérdida total por merma</p>
          <p className={`text-3xl font-extrabold ${textStyles}`}>${totalLoss.toFixed(2)}</p>
          <p className="text-xs text-gray-400">
            {entryCount > 0 ? `${entryCount} registros` : "Sin registros aún"}
          </p>
        </div>
      </div>
    </div>
  )
}
