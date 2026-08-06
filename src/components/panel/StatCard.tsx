"use client"

import { ReactNode } from "react"
import { LucideIcon } from "lucide-react"

interface StatCardProps {
  label: string
  value: string | number
  icon?: LucideIcon
  hint?: string
  tone?: "default" | "positive" | "warning" | "danger"
  suffix?: string
}

const TONE_STYLES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-gray-900",
  positive: "text-[#108910]",
  warning: "text-amber-600",
  danger: "text-red-600",
}

const ICON_STYLES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-gray-50 text-gray-400",
  positive: "bg-[#F0FDF4] text-[#108910]",
  warning: "bg-amber-50 text-amber-500",
  danger: "bg-red-50 text-red-500",
}

export default function StatCard({ label, value, icon: Icon, hint, tone = "default", suffix }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-400">{label}</p>
        {Icon && (
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${ICON_STYLES[tone]}`}>
            <Icon className="w-4 h-4" />
          </span>
        )}
      </div>
      <p className={`text-2xl font-bold ${TONE_STYLES[tone]}`}>
        {value}
        {suffix && <span className="text-sm font-semibold text-gray-400 ml-1">{suffix}</span>}
      </p>
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}
